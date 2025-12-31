/**
 * Patient Medical Context API Routes
 * 
 * Endpoints for managing patient conditions (AI-detected from visits)
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import {
    getPatientMedicalContext,
    ConditionStatus,
} from '../services/patientMedicalContext';
import * as admin from 'firebase-admin';

export const medicalContextRouter = Router();

// =============================================================================
// GET /v1/medical-context/conditions - Get user's conditions
// =============================================================================

medicalContextRouter.get('/conditions', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const context = await getPatientMedicalContext(userId);

        if (!context || !context.conditions) {
            res.json({ conditions: [] });
            return;
        }

        // Transform for API response
        const conditions = context.conditions.map(c => ({
            id: c.id,
            name: c.name,
            status: c.status,
            diagnosedAt: c.diagnosedAt?.toDate?.()?.toISOString() || null,
            sourceVisitId: c.sourceVisitId,
            notes: c.notes,
        }));

        res.json({ conditions });
    } catch (error) {
        functions.logger.error('[medicalContext] Error fetching conditions:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch conditions',
        });
    }
});

// =============================================================================
// PATCH /v1/medical-context/conditions/:id - Update condition status
// =============================================================================

const validStatuses: ConditionStatus[] = ['active', 'resolved', 'monitoring'];

medicalContextRouter.patch('/conditions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const conditionId = req.params.id;
        const { status } = req.body as { status?: ConditionStatus };

        if (!status || !validStatuses.includes(status)) {
            res.status(400).json({
                code: 'invalid_request',
                message: `Status must be one of: ${validStatuses.join(', ')}`,
            });
            return;
        }

        // Get current context
        const contextRef = admin.firestore().collection('patientContexts').doc(userId);
        const contextDoc = await contextRef.get();

        if (!contextDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Patient context not found',
            });
            return;
        }

        const context = contextDoc.data();
        const conditions = context?.conditions || [];
        const conditionIndex = conditions.findIndex((c: { id: string }) => c.id === conditionId);

        if (conditionIndex === -1) {
            res.status(404).json({
                code: 'not_found',
                message: 'Condition not found',
            });
            return;
        }

        // Update the condition status
        conditions[conditionIndex].status = status;

        await contextRef.update({
            conditions,
            updatedAt: new Date(),
        });

        functions.logger.info(`[medicalContext] Updated condition ${conditionId} to ${status}`, { userId });

        res.json({
            success: true,
            condition: {
                id: conditionId,
                status,
            },
        });
    } catch (error) {
        functions.logger.error('[medicalContext] Error updating condition:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to update condition',
        });
    }
});
