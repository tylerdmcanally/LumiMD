import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type RegisterCareExportSummaryRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    parseActionDueAt: (rawDueAt: unknown) => Date | null;
    createPerfTracker: (caregiverId: string, patientId: string) => {
        addQueries: (count?: number) => void;
        finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
    };
};

export function registerCareExportSummaryRoutes(
    router: Router,
    options: RegisterCareExportSummaryRoutesOptions,
): void {
    const { getDb, parseActionDueAt, createPerfTracker } = options;
    const getExportSummaryServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/export/summary
    // Generate a care summary for a patient
    router.get('/:patientId/export/summary', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;
        const perf = createPerfTracker(caregiverId, patientId);
        let statusCode = 200;

        try {
            // Validate caregiver has access
            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                onForbidden: () => {
                    statusCode = 403;
                },
            }))) {
                return;
            }

            // Get patient profile
            let patientName = 'Unknown Patient';
            const { actionService, medicationService, userService, visitService } = getExportSummaryServices();
            try {
                const profile = await userService.getById(patientId);
                perf.addQueries(1);
                patientName = profile?.preferredName || profile?.firstName || 'Unknown';
                if (!patientName || patientName === 'Unknown') {
                    const authUser = await admin.auth().getUser(patientId);
                    patientName =
                        authUser.displayName || authUser.email?.split('@')[0] || 'Unknown';
                }
            } catch {
                // Keep default name
            }

            // Fetch care resources via domain/repository boundaries.
            const [visitRecords, medicationRecords, actionRecords] = await Promise.all([
                visitService.listAllForUser(patientId, {
                    sortDirection: 'desc',
                    includeDeleted: true,
                }),
                medicationService.listAllForUser(patientId, {
                    includeDeleted: true,
                }),
                actionService.listAllForUser(patientId, {
                    sortDirection: 'desc',
                    includeDeleted: true,
                }),
            ]);
            perf.addQueries(3);

            const visits = visitRecords
                .filter((visit) => !visit.deletedAt)
                .map((data) => {
                const diagnoses = Array.isArray(data.diagnoses)
                    ? data.diagnoses.filter(Boolean)
                    : Array.isArray(data.diagnosesDetailed)
                        ? data.diagnosesDetailed
                            .map((entry: any) =>
                                typeof entry?.name === 'string' ? entry.name.trim() : '',
                            )
                            .filter(Boolean)
                        : [];
                return {
                    id: data.id,
                    visitDate:
                        data.visitDate?.toDate?.()?.toISOString() ||
                        data.createdAt?.toDate?.()?.toISOString() ||
                        null,
                    provider: data.provider || null,
                    specialty: data.specialty || null,
                    location: data.location || null,
                    summary: data.summary || null,
                    diagnoses,
                    nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps.filter(Boolean) : [],
                    medications: data.medications || null,
                };
            });

            const medications = medicationRecords
                .filter((medication) => medication.active === true && !medication.deletedAt)
                .map((data) => {
                return {
                    name: data.name || 'Unknown',
                    dosage: data.dosage || data.dose || null,
                    frequency: data.frequency || null,
                    instructions: data.instructions || null,
                };
            });

            const pendingActions = actionRecords
                .filter((action) => action.completed === false && !action.deletedAt)
                .map((data) => {
                const dueDate = parseActionDueAt(data.dueAt);
                return {
                    title: data.description || data.title || data.text || 'Unknown',
                    dueDate: dueDate?.toISOString() || null,
                    priority: data.priority || 'normal',
                };
            });

            // Extract unique conditions from all visits
            const conditionSet = new Set<string>();
            visits.forEach((visit) => {
                visit.diagnoses.forEach((dx: string) => {
                    if (dx?.trim()) conditionSet.add(dx.trim());
                });
            });
            const conditions = Array.from(conditionSet).sort();

            // Extract unique providers
            const providerSet = new Set<string>();
            visits.forEach((visit) => {
                if (visit.provider?.trim()) {
                    providerSet.add(visit.provider.trim());
                }
            });
            const providers = Array.from(providerSet).sort();

            // Build summary
            const summary = {
                generatedAt: new Date().toISOString(),
                patient: {
                    name: patientName,
                    id: patientId,
                },
                overview: {
                    totalVisits: visits.length,
                    totalConditions: conditions.length,
                    totalProviders: providers.length,
                    activeMedications: medications.length,
                    pendingActions: pendingActions.length,
                },
                conditions,
                providers,
                currentMedications: medications,
                pendingActions,
                recentVisits: visits.slice(0, 10).map((v) => ({
                    date: v.visitDate,
                    provider: v.provider,
                    specialty: v.specialty,
                    summary: v.summary?.substring(0, 300),
                    diagnoses: v.diagnoses,
                })),
            };

            res.set('Cache-Control', 'private, max-age=30');
            res.json(summary);
        } catch (error) {
            statusCode = 500;
            functions.logger.error('[care] Error generating care summary:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to generate care summary',
            });
        } finally {
            perf.finalize(statusCode);
        }
    });
}
