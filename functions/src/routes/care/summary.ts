import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type CareOverviewAlert = {
    type: 'missed_dose' | 'overdue_action';
    priority: 'high' | 'medium' | 'low';
    message: string;
};

type MedicationStatusSummary = {
    total: number;
    taken: number;
    skipped: number;
    pending: number;
    missed: number;
};

type MedicationStatusQueryOptions = {
    timezone?: string;
    medicationsSnapshot?: FirebaseFirestore.QuerySnapshot;
    remindersSnapshot?: FirebaseFirestore.QuerySnapshot;
    logsSnapshot?: FirebaseFirestore.QuerySnapshot;
    now?: Date;
};

type SummaryPerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

type RegisterCareSummaryRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (caregiverId: string, patientId: string) => SummaryPerfTracker;
    getTodaysMedicationStatus: (
        patientId: string,
        options?: MedicationStatusQueryOptions,
    ) => Promise<MedicationStatusSummary>;
    parseActionDueAt: (rawDueAt: unknown) => Date | null;
};

export function registerCareSummaryRoutes(
    router: Router,
    options: RegisterCareSummaryRoutesOptions,
): void {
    const {
        getDb,
        createPerfTracker,
        getTodaysMedicationStatus,
        parseActionDueAt,
    } = options;
    const getSummaryServices = () => createDomainServiceContainer({ db: getDb() });

    // GET /v1/care/:patientId/summary
    // Quick summary for a patient (used in patient detail view)
    router.get(
        '/:patientId/summary',
        requireAuth,
        async (req: AuthRequest, res) => {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const perf = createPerfTracker(caregiverId, patientId);
            let statusCode = 200;

            try {
                if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                    onForbidden: () => {
                        statusCode = 403;
                    },
                }))) {
                    return;
                }

                const { actionService, userService, visitService } = getSummaryServices();

                // Get patient profile
                const profile = await userService.getById(patientId);
                perf.addQueries(1);

                // Try to get name
                let name = profile?.preferredName || profile?.firstName;
                if (!name) {
                    try {
                        const authUser = await admin.auth().getUser(patientId);
                        name = authUser.displayName || authUser.email?.split('@')[0] || 'Unknown';
                    } catch {
                        name = 'Unknown';
                    }
                }

                // Get counts
                const [medsSnapshot, visitRecords, actionRecords] = await Promise.all([
                    getDb()
                        .collection('medications')
                        .where('userId', '==', patientId)
                        .where('active', '==', true)
                        .get(),
                    visitService.listAllForUser(patientId, {
                        sortDirection: 'desc',
                        includeDeleted: true,
                    }),
                    actionService.listAllForUser(patientId, {
                        sortDirection: 'desc',
                        includeDeleted: true,
                    }),
                ]);
                perf.addQueries(3);

                // getTodaysMedicationStatus will read reminders + today's med logs when snapshots are not supplied.
                perf.addQueries(2);
                const medicationsToday = await getTodaysMedicationStatus(patientId, {
                    timezone: typeof profile?.timezone === 'string' ? profile.timezone : undefined,
                    medicationsSnapshot: medsSnapshot,
                });

                const lastVisit = visitRecords
                    .filter((visit) => !visit.deletedAt)
                    .slice(0, 5)[0];
                const openActions = actionRecords.filter(
                    (action) => action.completed === false && !action.deletedAt,
                );
                const alerts: CareOverviewAlert[] = [];

                if (medicationsToday.missed > 0) {
                    alerts.push({
                        type: 'missed_dose',
                        priority: 'high',
                        message: `${medicationsToday.missed} missed dose${medicationsToday.missed > 1 ? 's' : ''} today`,
                    });
                }

                const now = new Date();
                openActions.forEach((data) => {
                    const dueDate = parseActionDueAt(data.dueAt);
                    if (!dueDate || dueDate >= now) {
                        return;
                    }

                    const daysOverdue = Math.floor(
                        (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
                    );
                    alerts.push({
                        type: 'overdue_action',
                        priority: daysOverdue >= 7 ? 'high' : 'medium',
                        message: `Action "${data.description?.substring(0, 50)}..." overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}`,
                    });
                });

                res.set('Cache-Control', 'private, max-age=30');
                res.json({
                    userId: patientId,
                    name,
                    activeMedications: medsSnapshot.size,
                    pendingActions: openActions.length,
                    lastVisit: lastVisit
                        ? {
                            id: lastVisit.id,
                            provider: lastVisit.provider,
                            specialty: lastVisit.specialty,
                            visitDate: lastVisit.visitDate,
                            summary: lastVisit.summary?.substring(0, 200),
                        }
                        : null,
                    medicationsToday,
                    alerts,
                });
            } catch (error) {
                statusCode = 500;
                functions.logger.error('[care] Error fetching patient summary:', error);
                res.status(500).json({
                    code: 'server_error',
                    message: 'Failed to fetch patient summary',
                });
            } finally {
                perf.finalize(statusCode);
            }
        },
    );
}
