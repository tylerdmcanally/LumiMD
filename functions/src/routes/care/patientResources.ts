import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { ensureResourceOwnerAccessOrReject } from '../../middlewares/resourceAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';
import { RepositoryValidationError } from '../../services/repositories/common/errors';

type RegisterCarePatientResourceRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    pageSizeDefault: number;
    pageSizeMax: number;
};

function toISOStringSafe(value: unknown): string | null {
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
}

export function registerCarePatientResourceRoutes(
    router: Router,
    options: RegisterCarePatientResourceRoutesOptions,
): void {
    const { getDb, pageSizeDefault, pageSizeMax } = options;
    const getCarePatientResourceServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/medications
    // List medications for a shared patient
    router.get('/:patientId/medications', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const { medicationService } = getCarePatientResourceServices();
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

            let medications:
                | Array<FirebaseFirestore.DocumentData & { id: string }>
                | Array<Record<string, unknown>> = [];
            let hasMore = false;
            let nextCursor: string | null = null;

            if (paginationRequested) {
                const page = await medicationService.listForUser(patientId, {
                    limit,
                    cursor,
                    sortDirection: 'asc',
                    sortField: 'name',
                });
                medications = page.items;
                hasMore = page.hasMore;
                nextCursor = page.nextCursor;

                res.set('X-Has-More', hasMore ? 'true' : 'false');
                res.set('X-Next-Cursor', nextCursor || '');
            } else {
                medications = await medicationService.listAllForUser(patientId, {
                    sortDirection: 'asc',
                    sortField: 'name',
                });
            }

            const responsePayload = medications.map((data) => {
                return {
                    ...data,
                    createdAt: toISOStringSafe(data.createdAt),
                    updatedAt: toISOStringSafe(data.updatedAt),
                    startedAt: toISOStringSafe(data.startedAt),
                    stoppedAt: toISOStringSafe(data.stoppedAt),
                    changedAt: toISOStringSafe(data.changedAt),
                    lastSyncedAt: toISOStringSafe(data.lastSyncedAt),
                    medicationWarning: data.medicationWarning || null,
                    needsConfirmation: data.needsConfirmation || false,
                    medicationStatus: data.medicationStatus || null,
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

            functions.logger.error('[care] Error fetching patient medications:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch medications',
            });
        }
    });

    // GET /v1/care/:patientId/actions
    // List action items for a shared patient
    router.get('/:patientId/actions', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const { actionService } = getCarePatientResourceServices();
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

            let actions:
                | Array<FirebaseFirestore.DocumentData & { id: string }>
                | Array<Record<string, unknown>> = [];
            let hasMore = false;
            let nextCursor: string | null = null;

            if (paginationRequested) {
                const page = await actionService.listForUser(patientId, {
                    limit,
                    cursor,
                    sortDirection: 'desc',
                });
                actions = page.items;
                hasMore = page.hasMore;
                nextCursor = page.nextCursor;

                res.set('X-Has-More', hasMore ? 'true' : 'false');
                res.set('X-Next-Cursor', nextCursor || '');
            } else {
                actions = await actionService.listAllForUser(patientId, {
                    sortDirection: 'desc',
                });
            }

            const responsePayload = actions.map((data) => {
                return {
                    ...data,
                    createdAt: toISOStringSafe(data.createdAt),
                    updatedAt: toISOStringSafe(data.updatedAt),
                    completedAt: toISOStringSafe(data.completedAt),
                    dueAt: toISOStringSafe(data.dueAt),
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

            functions.logger.error('[care] Error fetching patient actions:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch action items',
            });
        }
    });

    // GET /v1/care/:patientId/visits
    // List visits for a shared patient
    router.get('/:patientId/visits', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const { visitService } = getCarePatientResourceServices();
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

            let visits:
                | Array<FirebaseFirestore.DocumentData & { id: string }>
                | Array<Record<string, unknown>> = [];
            let hasMore = false;
            let nextCursor: string | null = null;

            if (paginationRequested) {
                const page = await visitService.listForUser(patientId, {
                    limit,
                    cursor,
                    sortDirection: 'desc',
                });
                visits = page.items;
                hasMore = page.hasMore;
                nextCursor = page.nextCursor;

                res.set('X-Has-More', hasMore ? 'true' : 'false');
                res.set('X-Next-Cursor', nextCursor || '');
            } else {
                visits = await visitService.listAllForUser(patientId, {
                    sortDirection: 'desc',
                });
            }

            const responsePayload = visits.map((data) => {
                const diagnosesDetailed = Array.isArray(data.diagnosesDetailed)
                    ? data.diagnosesDetailed
                    : [];
                const diagnosesFromDetailed = diagnosesDetailed
                    .map((item) => {
                        if (!item || typeof item !== 'object') return null;
                        const name = (item as Record<string, unknown>).name;
                        return typeof name === 'string' && name.trim().length > 0
                            ? name.trim()
                            : null;
                    })
                    .filter((value): value is string => Boolean(value));
                const diagnoses = Array.isArray(data.diagnoses) && data.diagnoses.length > 0
                    ? (data.diagnoses as unknown[])
                        .map((item) => (typeof item === 'string' ? item.trim() : ''))
                        .filter((value): value is string => value.length > 0)
                    : diagnosesFromDetailed;

                return {
                    ...data,
                    diagnoses,
                    diagnosesDetailed,
                    createdAt: toISOStringSafe(data.createdAt),
                    updatedAt: toISOStringSafe(data.updatedAt),
                    processedAt: toISOStringSafe(data.processedAt),
                    visitDate: toISOStringSafe(data.visitDate) ?? data.visitDate ?? null,
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

            functions.logger.error('[care] Error fetching patient visits:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch visits',
            });
        }
    });

    // GET /v1/care/:patientId/visits/:visitId
    // Get a single visit summary for a shared patient
    router.get('/:patientId/visits/:visitId', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const { patientId, visitId } = req.params;
            const { userService, visitService } = getCarePatientResourceServices();

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            const visit = await visitService.getById(visitId);
            if (
                !ensureResourceOwnerAccessOrReject(patientId, visit, res, {
                    resourceName: 'visit',
                    notFoundCode: 'not_found',
                    forbiddenCode: 'not_found',
                    notFoundMessage: 'Visit not found',
                    message: 'Visit not found',
                })
            ) {
                return;
            }
            const visitData = visit;
            if (!visitData) {
                return;
            }

            const userData = (await userService.getById(patientId)) as Record<string, unknown> | null;
            const preferredName =
                typeof userData?.preferredName === 'string' && userData.preferredName.trim().length > 0
                    ? userData.preferredName.trim()
                    : null;
            const firstName =
                typeof userData?.firstName === 'string' && userData.firstName.trim().length > 0
                    ? userData.firstName.trim()
                    : null;
            const lastName =
                typeof userData?.lastName === 'string' && userData.lastName.trim().length > 0
                    ? userData.lastName.trim()
                    : null;
            const patientName = preferredName || (firstName ? `${firstName}${lastName ? ` ${lastName}` : ''}` : undefined);

            res.set('Cache-Control', 'private, max-age=30');
            res.json({
                id: visitId,
                status: visitData.status || undefined,
                processingStatus: visitData.processingStatus || undefined,
                createdAt: visitData.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: visitData.updatedAt?.toDate?.()?.toISOString() || null,
                processedAt: visitData.processedAt?.toDate?.()?.toISOString() || null,
                visitDate: visitData.visitDate?.toDate?.()?.toISOString() ||
                    visitData.createdAt?.toDate?.()?.toISOString() ||
                    null,
                provider: visitData.provider || undefined,
                specialty: visitData.specialty || undefined,
                location: visitData.location || undefined,
                summary: visitData.summary || undefined,
                diagnoses: Array.isArray(visitData.diagnoses) ? visitData.diagnoses : [],
                diagnosesDetailed: Array.isArray(visitData.diagnosesDetailed)
                    ? visitData.diagnosesDetailed
                    : [],
                medications: visitData.medications || {},
                nextSteps: Array.isArray(visitData.nextSteps) ? visitData.nextSteps : [],
                followUps: Array.isArray(visitData.followUps) ? visitData.followUps : [],
                imaging: Array.isArray(visitData.imaging) ? visitData.imaging : [],
                testsOrdered: Array.isArray(visitData.testsOrdered) ? visitData.testsOrdered : [],
                medicationReview:
                    visitData.medicationReview && typeof visitData.medicationReview === 'object'
                        ? visitData.medicationReview
                        : null,
                education:
                    visitData.education && typeof visitData.education === 'object'
                        ? visitData.education
                        : null,
                extractionVersion: visitData.extractionVersion || undefined,
                promptMeta:
                    visitData.promptMeta && typeof visitData.promptMeta === 'object'
                        ? visitData.promptMeta
                        : null,
                patientName,
            });
        } catch (error) {
            functions.logger.error('[care] Error fetching patient visit summary:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch visit summary',
            });
        }
    });
}
