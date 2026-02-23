import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type MedChangesPerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

type RegisterCareMedicationChangeRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (caregiverId: string, patientId: string) => MedChangesPerfTracker;
};

export function registerCareMedicationChangeRoutes(
    router: Router,
    options: RegisterCareMedicationChangeRoutesOptions,
): void {
    const { getDb, createPerfTracker } = options;
    const getMedicationService = () => createDomainServiceContainer({ db: getDb() }).medicationService;

    // GET /v1/care/:patientId/med-changes
    router.get('/:patientId/med-changes', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;
        const perf = createPerfTracker(caregiverId, patientId);
        let statusCode = 200;

        try {
            const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 90);

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                message: 'Access denied',
                onForbidden: () => {
                    statusCode = 403;
                },
            }))) {
                return;
            }

            const now = new Date();
            const startDate = new Date(now);
            startDate.setDate(startDate.getDate() - days);

            const medicationService = getMedicationService();
            const medications = await medicationService.listAllForUser(patientId, {
                includeDeleted: true,
                sortDirection: 'asc',
                sortField: 'name',
            });
            perf.addQueries(1);

            const changes: Array<{
                id: string;
                name: string;
                changeType: 'started' | 'stopped' | 'modified';
                changeDate: string;
                dose?: string | null;
                previousDose?: string | null;
            }> = [];

            medications.forEach((data) => {
                if (data.deletedAt) {
                    return;
                }
                const startedAt = data.startedAt?.toDate?.() ?? null;
                const stoppedAt = data.stoppedAt?.toDate?.() ?? null;
                const changedAt = data.changedAt?.toDate?.() ?? null;

                if (startedAt && startedAt >= startDate) {
                    changes.push({
                        id: data.id,
                        name: data.name || 'Unknown',
                        changeType: 'started',
                        changeDate: startedAt.toISOString(),
                        dose: data.dose || null,
                    });
                }

                if (stoppedAt && stoppedAt >= startDate) {
                    changes.push({
                        id: data.id,
                        name: data.name || 'Unknown',
                        changeType: 'stopped',
                        changeDate: stoppedAt.toISOString(),
                        dose: data.dose || null,
                    });
                }

                if (changedAt && changedAt >= startDate && !startedAt?.getTime?.() && !stoppedAt?.getTime?.()) {
                    changes.push({
                        id: data.id,
                        name: data.name || 'Unknown',
                        changeType: 'modified',
                        changeDate: changedAt.toISOString(),
                        dose: data.dose || null,
                        previousDose: data.previousDose || null,
                    });
                }
            });

            // Sort by date (most recent first)
            changes.sort((a, b) => new Date(b.changeDate).getTime() - new Date(a.changeDate).getTime());

            res.set('Cache-Control', 'private, max-age=60');
            res.json({
                changes,
                period: {
                    days,
                    from: startDate.toISOString(),
                    to: now.toISOString(),
                },
            });
        } catch (error) {
            statusCode = 500;
            functions.logger.error('[care] Error fetching med changes:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to fetch medication changes' });
        } finally {
            perf.finalize(statusCode);
        }
    });
}
