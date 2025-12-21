/**
 * Medication Logs Routes
 * 
 * API endpoints for logging medication compliance events (taken, skipped, snoozed)
 * and retrieving compliance data for dashboard and reports.
 */

import express from 'express';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';

const router = express.Router();
const getDb = () => admin.firestore();
const getLogsCollection = () => getDb().collection('medicationLogs');

// Validation schemas
const logActionSchema = z.object({
    medicationId: z.string(),
    medicationName: z.string(),
    reminderId: z.string().optional(),
    action: z.enum(['taken', 'skipped', 'snoozed']),
    scheduledTime: z.string().regex(/^\d{2}:\d{2}$/), // HH:MM format
});

const getLogsQuerySchema = z.object({
    medicationId: z.string().optional(),
    startDate: z.string().optional(), // ISO date
    endDate: z.string().optional(),
    limit: z.string().transform(Number).optional(),
});

/**
 * POST /v1/medication-logs
 * Log a medication compliance event
 */
router.post('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const data = logActionSchema.parse(req.body);

        const logEntry = {
            userId,
            medicationId: data.medicationId,
            medicationName: data.medicationName,
            reminderId: data.reminderId || null,
            action: data.action,
            scheduledTime: data.scheduledTime,
            loggedAt: admin.firestore.Timestamp.now(),
        };

        const docRef = await getLogsCollection().add(logEntry);

        functions.logger.info('[MedLogs] Logged medication action', {
            userId,
            action: data.action,
            medication: data.medicationName,
        });

        res.status(201).json({
            id: docRef.id,
            ...logEntry,
            loggedAt: logEntry.loggedAt.toDate().toISOString(),
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Invalid request', details: error.errors });
            return;
        }
        functions.logger.error('[MedLogs] Error logging action:', error);
        res.status(500).json({ error: 'Failed to log medication action' });
    }
});

/**
 * GET /v1/medication-logs
 * Get user's medication logs
 */
router.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const query = getLogsQuerySchema.parse(req.query);

        let logsQuery = getLogsCollection()
            .where('userId', '==', userId)
            .orderBy('loggedAt', 'desc');

        if (query.medicationId) {
            logsQuery = logsQuery.where('medicationId', '==', query.medicationId);
        }

        if (query.startDate) {
            const startTimestamp = admin.firestore.Timestamp.fromDate(new Date(query.startDate));
            logsQuery = logsQuery.where('loggedAt', '>=', startTimestamp);
        }

        if (query.endDate) {
            const endTimestamp = admin.firestore.Timestamp.fromDate(new Date(query.endDate));
            logsQuery = logsQuery.where('loggedAt', '<=', endTimestamp);
        }

        const limit = query.limit || 100;
        logsQuery = logsQuery.limit(limit);

        const snapshot = await logsQuery.get();
        const logs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            loggedAt: doc.data().loggedAt?.toDate?.()?.toISOString() || null,
        }));

        res.json({ logs });
    } catch (error) {
        functions.logger.error('[MedLogs] Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch medication logs' });
    }
});

/**
 * GET /v1/medication-logs/summary
 * Get compliance summary for dashboard/reports
 */
router.get('/summary', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const { days = '30' } = req.query;
        const daysNum = parseInt(days as string, 10) || 30;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysNum);

        const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);

        const snapshot = await getLogsCollection()
            .where('userId', '==', userId)
            .where('loggedAt', '>=', startTimestamp)
            .get();

        // Aggregate by medication and action
        const byMedication: Record<string, {
            medicationName: string;
            taken: number;
            skipped: number;
            snoozed: number;
            total: number;
            complianceRate: number;
        }> = {};

        let totalTaken = 0;
        let totalSkipped = 0;
        let totalSnoozed = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const medId = data.medicationId;

            if (!byMedication[medId]) {
                byMedication[medId] = {
                    medicationName: data.medicationName,
                    taken: 0,
                    skipped: 0,
                    snoozed: 0,
                    total: 0,
                    complianceRate: 0,
                };
            }

            byMedication[medId][data.action as 'taken' | 'skipped' | 'snoozed']++;
            byMedication[medId].total++;

            if (data.action === 'taken') totalTaken++;
            else if (data.action === 'skipped') totalSkipped++;
            else if (data.action === 'snoozed') totalSnoozed++;
        });

        // Calculate compliance rates
        Object.values(byMedication).forEach(med => {
            // Compliance = taken / (taken + skipped). Snoozed doesn't count against.
            const relevant = med.taken + med.skipped;
            med.complianceRate = relevant > 0 ? Math.round((med.taken / relevant) * 100) : 100;
        });

        const totalRelevant = totalTaken + totalSkipped;
        const overallComplianceRate = totalRelevant > 0
            ? Math.round((totalTaken / totalRelevant) * 100)
            : 100;

        res.json({
            period: {
                days: daysNum,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            },
            overall: {
                taken: totalTaken,
                skipped: totalSkipped,
                snoozed: totalSnoozed,
                total: snapshot.size,
                complianceRate: overallComplianceRate,
            },
            byMedication: Object.entries(byMedication).map(([id, data]) => ({
                medicationId: id,
                ...data,
            })),
        });
    } catch (error) {
        functions.logger.error('[MedLogs] Error generating summary:', error);
        res.status(500).json({ error: 'Failed to generate compliance summary' });
    }
});

export default router;
