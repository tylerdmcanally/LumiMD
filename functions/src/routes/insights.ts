/**
 * Health Insights API Routes
 * 
 * Endpoints for fetching and generating health insights.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { getInsightGeneratorService } from '../services/insightGenerator';

export const insightsRouter = Router();

// =============================================================================
// GET /v1/insights - Get cached insights for user
// =============================================================================

insightsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const service = getInsightGeneratorService();

        // Get cached insights
        let insights = await service.getCachedInsights(userId);

        // If no cached insights, generate new ones (lazy generation)
        if (insights.length === 0) {
            const needsGeneration = await service.needsInsightGeneration(userId);
            if (needsGeneration) {
                insights = await service.generateInsightsForUser(userId);
            }
        }

        // Transform timestamps for JSON response
        const response = insights.map(insight => ({
            id: insight.id,
            text: insight.text,
            type: insight.type,
            category: insight.category,
            generatedAt: insight.generatedAt?.toDate?.()?.toISOString() || null,
            expiresAt: insight.expiresAt?.toDate?.()?.toISOString() || null,
        }));

        res.json({
            insights: response,
            count: response.length,
        });
    } catch (error) {
        functions.logger.error('[insights] Error fetching insights:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch insights',
        });
    }
});

// =============================================================================
// POST /v1/insights/generate - Force regenerate insights (for testing/admin)
// =============================================================================

insightsRouter.post('/generate', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const service = getInsightGeneratorService();

        const insights = await service.generateInsightsForUser(userId);

        // Transform timestamps for JSON response
        const response = insights.map(insight => ({
            id: insight.id,
            text: insight.text,
            type: insight.type,
            category: insight.category,
            generatedAt: insight.generatedAt?.toDate?.()?.toISOString() || null,
            expiresAt: insight.expiresAt?.toDate?.()?.toISOString() || null,
        }));

        functions.logger.info(`[insights] Generated ${insights.length} insights for user ${userId}`);

        res.json({
            insights: response,
            count: response.length,
            message: 'Insights regenerated successfully',
        });
    } catch (error) {
        functions.logger.error('[insights] Error generating insights:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to generate insights',
        });
    }
});
