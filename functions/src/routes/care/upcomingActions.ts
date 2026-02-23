import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

type UpcomingActionsPerfTracker = {
    addQueries: (count?: number) => void;
    finalize: (statusCode: number, extra?: Record<string, unknown>) => void;
};

type RegisterCareUpcomingActionsRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
    createPerfTracker: (caregiverId: string, patientId: string) => UpcomingActionsPerfTracker;
};

export function registerCareUpcomingActionsRoutes(
    router: Router,
    options: RegisterCareUpcomingActionsRoutesOptions,
): void {
    const { getDb, createPerfTracker } = options;
    const getActionDomainService = () => createDomainServiceContainer({ db: getDb() }).actionService;

    // GET /v1/care/:patientId/upcoming-actions
    router.get('/:patientId/upcoming-actions', requireAuth, async (req: AuthRequest, res) => {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;
        const perf = createPerfTracker(caregiverId, patientId);
        let statusCode = 200;

        try {
            const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5, 1), 20);

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res, {
                message: 'Access denied',
                onForbidden: () => {
                    statusCode = 403;
                },
            }))) {
                return;
            }

            const now = new Date();
            const actionService = getActionDomainService();
            const actionRecords = await actionService.listAllForUser(patientId, {
                sortDirection: 'desc',
                includeDeleted: true,
            });
            perf.addQueries(1);

            const actions = actionRecords.map((data) => {
                if (data.completed !== false || data.deletedAt) {
                    return null;
                }
                let dueAt: Date | null = null;
                if (data.dueAt) {
                    dueAt = typeof data.dueAt === 'string' ? new Date(data.dueAt) : data.dueAt.toDate?.() ?? null;
                }

                const isOverdue = dueAt ? dueAt < now : false;
                const daysUntilDue = dueAt ? Math.ceil((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

                return {
                    id: data.id,
                    description: data.description || data.text || 'Unknown task',
                    dueAt: dueAt?.toISOString() || null,
                    isOverdue,
                    daysUntilDue,
                    visitId: data.visitId || null,
                    source: data.source || 'manual',
                };
            }).filter((action): action is {
                id: string;
                description: string;
                dueAt: string | null;
                isOverdue: boolean;
                daysUntilDue: number | null;
                visitId: string | null;
                source: string;
            } => !!action);

            // Sort: overdue first (by how overdue), then upcoming (by soonest)
            actions.sort((a, b) => {
                if (a.isOverdue && !b.isOverdue) return -1;
                if (!a.isOverdue && b.isOverdue) return 1;
                if (a.daysUntilDue === null && b.daysUntilDue !== null) return 1;
                if (a.daysUntilDue !== null && b.daysUntilDue === null) return -1;
                return (a.daysUntilDue || 0) - (b.daysUntilDue || 0);
            });

            // Calculate summary
            const summary = {
                overdue: actions.filter((a) => a.isOverdue).length,
                dueToday: actions.filter((a) => !a.isOverdue && a.daysUntilDue !== null && a.daysUntilDue <= 0).length,
                dueThisWeek: actions.filter((a) => !a.isOverdue && a.daysUntilDue !== null && a.daysUntilDue > 0 && a.daysUntilDue <= 7).length,
                dueLater: actions.filter((a) => !a.isOverdue && (a.daysUntilDue === null || a.daysUntilDue > 7)).length,
            };

            res.set('Cache-Control', 'private, max-age=30');
            res.json({
                actions: actions.slice(0, limit),
                summary,
            });
        } catch (error) {
            statusCode = 500;
            functions.logger.error('[care] Error fetching upcoming actions:', error);
            res.status(500).json({ code: 'server_error', message: 'Failed to fetch upcoming actions' });
        } finally {
            perf.finalize(statusCode);
        }
    });
}
