import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { ensureResourceOwnerAccessOrReject } from '../../middlewares/resourceAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';
import { sanitizePlainText } from '../../utils/inputSanitization';

type RegisterCareVisitMetadataRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    visitMetadataMaxLength: number;
};

export function registerCareVisitMetadataRoutes(
    router: Router,
    options: RegisterCareVisitMetadataRoutesOptions,
): void {
    const { getDb, visitMetadataMaxLength } = options;
    const getVisitMetadataServices = () => createDomainServiceContainer({ db: getDb() });

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

    // PATCH /v1/care/:patientId/visits/:visitId
    // Update visit metadata
    router.patch('/:patientId/visits/:visitId', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const { patientId, visitId } = req.params;
            const { provider, specialty, location, visitDate } = req.body;
            const { visitService } = getVisitMetadataServices();

            // Validate caregiver has access to this patient
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

            // Build update object - only include fields that are provided
            const updateData: Record<string, unknown> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastEditedBy: caregiverId,
                lastEditedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (typeof provider === 'string') {
                updateData.provider = sanitizePlainText(provider, visitMetadataMaxLength) || null;
            }
            if (typeof specialty === 'string') {
                updateData.specialty = sanitizePlainText(specialty, visitMetadataMaxLength) || null;
            }
            if (typeof location === 'string') {
                updateData.location = sanitizePlainText(location, visitMetadataMaxLength) || null;
            }
            if (visitDate !== undefined) {
                // Accept ISO string or null
                if (visitDate === null) {
                    updateData.visitDate = null;
                } else if (typeof visitDate === 'string') {
                    const parsedDate = new Date(visitDate);
                    if (!isNaN(parsedDate.getTime())) {
                        updateData.visitDate = admin.firestore.Timestamp.fromDate(parsedDate);
                    }
                }
            }

            // Update the visit
            const updated = await visitService.updateRecord(visitId, updateData);
            if (!updated) {
                res.status(404).json({
                    code: 'not_found',
                    message: 'Visit not found',
                });
                return;
            }

            res.json({
                id: visitId,
                provider: updated.provider || null,
                specialty: updated.specialty || null,
                location: updated.location || null,
                visitDate: toISOStringSafe(updated.visitDate),
                updatedAt: toISOStringSafe(updated.updatedAt),
            });
        } catch (error) {
            functions.logger.error('[care] Error updating visit metadata:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to update visit',
            });
        }
    });
}
