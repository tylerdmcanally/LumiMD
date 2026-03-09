import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';

type RegisterCareNudgeHistoryRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
};

type NudgeHistoryItem = {
    id: string;
    type: string;
    title: string;
    message: string;
    actionType: string;
    status: string;
    responseValue?: string | Record<string, unknown>;
    context?: Record<string, unknown>;
    createdAt: string;
    completedAt?: string;
    dismissedAt?: string;
};

type NudgeHistoryStats = {
    total: number;
    responded: number;
    dismissed: number;
    pending: number;
    responseRate: number;
};

export function registerCareNudgeHistoryRoutes(
    router: Router,
    options: RegisterCareNudgeHistoryRoutesOptions,
): void {
    const { getDb } = options;

    // GET /v1/care/:patientId/nudge-history
    router.get('/:patientId/nudge-history', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 90);
            const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const db = getDb();

            // Query all nudges for this patient within the date window
            const nudgesSnapshot = await db
                .collection('nudges')
                .where('userId', '==', patientId)
                .where('createdAt', '>=', startDate)
                .orderBy('createdAt', 'desc')
                .limit(limit)
                .get();

            const nudges: NudgeHistoryItem[] = [];
            let responded = 0;
            let dismissed = 0;
            let pending = 0;

            nudgesSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                if (data.deletedAt) return;

                const status = data.status || 'pending';
                if (status === 'completed') responded++;
                else if (status === 'dismissed') dismissed++;
                else pending++;

                const createdAt = data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString();
                const completedAt = data.completedAt?.toDate?.()?.toISOString() || undefined;
                const dismissedAt = data.dismissedAt?.toDate?.()?.toISOString() || undefined;

                nudges.push({
                    id: doc.id,
                    type: data.type || 'unknown',
                    title: data.title || '',
                    message: data.message || '',
                    actionType: data.actionType || '',
                    status,
                    responseValue: data.responseValue || undefined,
                    context: data.context || undefined,
                    createdAt,
                    completedAt,
                    dismissedAt,
                });
            });

            const total = responded + dismissed + pending;
            const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

            const stats: NudgeHistoryStats = {
                total,
                responded,
                dismissed,
                pending,
                responseRate,
            };

            res.set('Cache-Control', 'private, no-cache');
            res.json({
                nudges,
                stats,
                period: {
                    days,
                    from: startDate.toISOString(),
                    to: new Date().toISOString(),
                },
            });
        } catch (error) {
            functions.logger.error('[care] Error fetching nudge history:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch nudge history',
            });
        }
    });
}
