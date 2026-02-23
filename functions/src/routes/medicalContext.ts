/**
 * Patient Medical Context API Routes
 * 
 * Endpoints for managing patient conditions (AI-detected from visits)
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import * as admin from 'firebase-admin';
import { createDomainServiceContainer } from '../services/domain/serviceContainer';
import type { PatientContextConditionStatus } from '../services/repositories/patientContexts/PatientContextRepository';

export const medicalContextRouter = Router();
const getDb = () => admin.firestore();
const getPatientContextDomainService = () =>
    createDomainServiceContainer({ db: getDb() }).patientContextService;

// =============================================================================
// GET /v1/medical-context/conditions - Get user's conditions
// =============================================================================

medicalContextRouter.get('/conditions', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const patientContextService = getPatientContextDomainService();
        const context = await patientContextService.getForUser(userId);

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

const validStatuses: PatientContextConditionStatus[] = ['active', 'resolved', 'monitoring'];

medicalContextRouter.patch('/conditions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const conditionId = req.params.id;
        const { status } = req.body as { status?: PatientContextConditionStatus };

        if (!status || !validStatuses.includes(status)) {
            res.status(400).json({
                code: 'invalid_request',
                message: `Status must be one of: ${validStatuses.join(', ')}`,
            });
            return;
        }
        const patientContextService = getPatientContextDomainService();
        const result = await patientContextService.updateConditionStatusForUser(
            userId,
            conditionId,
            status,
        );

        if (result.outcome === 'context_not_found') {
            res.status(404).json({
                code: 'not_found',
                message: 'Patient context not found',
            });
            return;
        }

        if (result.outcome === 'condition_not_found') {
            res.status(404).json({
                code: 'not_found',
                message: 'Condition not found',
            });
            return;
        }

        functions.logger.info(`[medicalContext] Updated condition ${conditionId} to ${status}`, { userId });

        res.json({
            success: true,
            condition: result.condition,
        });
    } catch (error) {
        functions.logger.error('[medicalContext] Error updating condition:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to update condition',
        });
    }
});
