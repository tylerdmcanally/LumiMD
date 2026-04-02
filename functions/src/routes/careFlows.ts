/**
 * Care Flows API Routes
 *
 * Endpoints for querying care flow state (read-only for mobile).
 * Care flows are created/advanced by the backend engine, not by the client.
 */

import { Router } from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { FirestoreCareFlowRepository } from '../services/repositories/careFlows/FirestoreCareFlowRepository';

export const careFlowsRouter = Router();

const getDb = () => admin.firestore();

// =============================================================================
// GET /v1/care-flows/active - Get active care flows for user
// =============================================================================

careFlowsRouter.get('/active', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const repo = new FirestoreCareFlowRepository(getDb());

        const flows = await repo.listByUser(userId, ['active']);

        const response = flows.map(flow => {
            const createdAt = flow.createdAt?.toDate?.() || new Date();
            const weekNumber = Math.max(
                1,
                Math.ceil((Date.now() - createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000)),
            );

            return {
                id: flow.id,
                condition: flow.condition,
                phase: flow.phase,
                status: flow.status,
                weekNumber,
                consecutiveNormalCount: flow.cadence?.consecutiveNormalCount || 0,
                medicationName: flow.medicationName || undefined,
                createdAt: createdAt.toISOString(),
            };
        });

        functions.logger.info(
            `[careFlows] Retrieved ${response.length} active care flow(s) for user ${userId}`,
        );
        res.set('Cache-Control', 'private, no-cache');
        res.json(response);
    } catch (error) {
        functions.logger.error('[careFlows] Error fetching active care flows:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch care flows',
        });
    }
});
