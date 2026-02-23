import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { ensureResourceOwnerAccessOrReject } from '../../middlewares/resourceAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';
import { RepositoryValidationError } from '../../services/repositories/common/errors';
import { sanitizePlainText } from '../../utils/inputSanitization';

type RegisterCareNotesRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    noteMaxLength: number;
    pageSizeDefault: number;
    pageSizeMax: number;
};

export function registerCareNotesRoutes(
    router: Router,
    options: RegisterCareNotesRoutesOptions,
): void {
    const { getDb, noteMaxLength, pageSizeDefault, pageSizeMax } = options;
    const getCareNotesServices = () => createDomainServiceContainer({ db: getDb() });

    const toISOStringSafe = (value: unknown): string | null => {
        if (!value) return null;
        try {
            if (
                typeof value === 'object' &&
                value !== null &&
                typeof (value as { toDate?: unknown }).toDate === 'function'
            ) {
                return (value as { toDate: () => Date }).toDate().toISOString();
            }

            const date = new Date(value as string | number | Date);
            if (Number.isNaN(date.getTime())) return null;
            return date.toISOString();
        } catch {
            return null;
        }
    };

    // GET /v1/care/:patientId/notes
    // List all caregiver notes for a patient
    router.get('/:patientId/notes', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const { caregiverNoteService } = getCareNotesServices();
            const rawLimit = req.query.limit;
            const cursor =
                typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
                    ? req.query.cursor.trim()
                    : null;
            const paginationRequested = rawLimit !== undefined || cursor !== null;

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            let limit = pageSizeDefault;
            if (rawLimit !== undefined) {
                const parsedLimit = parseInt(String(rawLimit), 10);
                if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
                    res.status(400).json({
                        code: 'validation_failed',
                        message: 'limit must be a positive integer',
                    });
                    return;
                }
                limit = Math.min(parsedLimit, pageSizeMax);
            }

            let notes:
                | Array<FirebaseFirestore.DocumentData & { id: string }>
                | Array<Record<string, unknown>> = [];
            let hasMore = false;
            let nextCursor: string | null = null;

            if (paginationRequested) {
                const page = await caregiverNoteService.listForCaregiverPatient(
                    caregiverId,
                    patientId,
                    {
                        limit,
                        cursor,
                    },
                );
                notes = page.items;
                hasMore = page.hasMore;
                nextCursor = page.nextCursor;
            } else {
                notes = await caregiverNoteService.listAllForCaregiverPatient(
                    caregiverId,
                    patientId,
                );
            }

            if (paginationRequested) {
                res.set('X-Has-More', hasMore ? 'true' : 'false');
                res.set('X-Next-Cursor', nextCursor || '');
            }

            const responsePayload = notes.map((data) => {
                return {
                    id: data.id,
                    visitId: data.visitId,
                    note: data.note || null,
                    pinned: data.pinned || false,
                    createdAt: toISOStringSafe(data.createdAt),
                    updatedAt: toISOStringSafe(data.updatedAt),
                };
            });

            res.set('Cache-Control', 'private, max-age=30');
            res.json(responsePayload);
        } catch (error) {
            if (error instanceof RepositoryValidationError) {
                res.status(400).json({
                    code: 'validation_failed',
                    message: 'Invalid cursor',
                });
                return;
            }

            functions.logger.error('[care] Error fetching caregiver notes:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch notes',
            });
        }
    });

    // PUT /v1/care/:patientId/visits/:visitId/note
    // Create or update a caregiver note for a specific visit
    router.put('/:patientId/visits/:visitId/note', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const { patientId, visitId } = req.params;
            const { note, pinned } = req.body;
            const { caregiverNoteService, visitService } = getCareNotesServices();

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            // Verify the visit exists and belongs to the patient
            const visitData = await visitService.getById(visitId);
            if (
                !ensureResourceOwnerAccessOrReject(patientId, visitData, res, {
                    resourceName: 'visit',
                    notFoundMessage: 'Visit not found',
                    message: 'Visit does not belong to this patient',
                })
            ) {
                return;
            }

            // Use a deterministic document ID for upsert behavior
            const noteDocId = `${caregiverId}_${patientId}_${visitId}`;
            const now = admin.firestore.FieldValue.serverTimestamp();

            // Check if note already exists
            const existingNote = await caregiverNoteService.getById(noteDocId);

            const noteData: Record<string, unknown> = {
                caregiverId,
                patientId,
                visitId,
                updatedAt: now,
            };

            // Only update fields that are provided
            if (typeof note === 'string') {
                noteData.note = sanitizePlainText(note, noteMaxLength);
            }
            if (typeof pinned === 'boolean') {
                noteData.pinned = pinned;
            }

            if (!existingNote) {
                // Create new note
                noteData.createdAt = now;
                noteData.pinned = noteData.pinned ?? false;
                noteData.note = noteData.note ?? '';
            }

            await caregiverNoteService.upsertRecord(noteDocId, noteData);
            const updatedNote = await caregiverNoteService.getById(noteDocId);

            if (!updatedNote) {
                res.status(500).json({
                    code: 'server_error',
                    message: 'Failed to save note',
                });
                return;
            }

            res.json({
                id: noteDocId,
                visitId,
                note: updatedNote.note || null,
                pinned: updatedNote.pinned || false,
                createdAt: toISOStringSafe(updatedNote.createdAt),
                updatedAt: toISOStringSafe(updatedNote.updatedAt),
            });
        } catch (error) {
            functions.logger.error('[care] Error saving caregiver note:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to save note',
            });
        }
    });

    // DELETE /v1/care/:patientId/visits/:visitId/note
    // Delete a caregiver note for a specific visit
    router.delete('/:patientId/visits/:visitId/note', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const { patientId, visitId } = req.params;
            const { caregiverNoteService } = getCareNotesServices();

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            const noteDocId = `${caregiverId}_${patientId}_${visitId}`;
            const note = await caregiverNoteService.getById(noteDocId);

            if (
                !note ||
                note.caregiverId !== caregiverId ||
                note.patientId !== patientId ||
                note.visitId !== visitId
            ) {
                res.status(404).json({
                    code: 'not_found',
                    message: 'Note not found',
                });
                return;
            }

            await caregiverNoteService.deleteRecord(noteDocId);

            res.json({ success: true });
        } catch (error) {
            functions.logger.error('[care] Error deleting caregiver note:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to delete note',
            });
        }
    });
}
