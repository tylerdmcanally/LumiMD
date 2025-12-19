/**
 * LumiBot Health Logs API Routes
 * 
 * Endpoints for logging health data (BP, glucose, weight, symptoms)
 * and retrieving log history with summaries.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import {
    HealthLogResponse,
    HealthLogSummary,
    BloodPressureValue,
    GlucoseValue,
    HealthLogType,
} from '../types/lumibot';
import {
    checkHealthValue,
    screenForEmergencySymptoms,
} from '../services/safetyChecker';
import { completeNudge, createFollowUpNudge } from '../services/lumibotAnalyzer';


export const healthLogsRouter = Router();

const getDb = () => admin.firestore();
const getHealthLogsCollection = () => getDb().collection('healthLogs');

// =============================================================================
// Validation Schemas
// =============================================================================

const bpValueSchema = z.object({
    systolic: z.number().min(60).max(300),
    diastolic: z.number().min(30).max(200),
    pulse: z.number().min(30).max(250).optional(),
});

const glucoseValueSchema = z.object({
    reading: z.number().min(20).max(700),
    timing: z.enum(['fasting', 'before_meal', 'after_meal', 'bedtime', 'random']).optional(),
});

const weightValueSchema = z.object({
    weight: z.number().min(20).max(1000),
    unit: z.enum(['lbs', 'kg']),
});

const medComplianceValueSchema = z.object({
    medicationId: z.string().optional(),
    medicationName: z.string(),
    response: z.enum(['yes', 'no', 'having_issues']),
    note: z.string().optional(),
});

const symptomCheckValueSchema = z.object({
    symptoms: z.array(z.string()),
    severity: z.enum(['mild', 'moderate', 'severe']).optional(),
    note: z.string().optional(),
});

const createHealthLogSchema = z.object({
    type: z.enum(['bp', 'glucose', 'weight', 'med_compliance', 'symptom_check']),
    value: z.union([
        bpValueSchema,
        glucoseValueSchema,
        weightValueSchema,
        medComplianceValueSchema,
        symptomCheckValueSchema,
    ]),
    nudgeId: z.string().optional(),
    visitId: z.string().optional(),
    source: z.enum(['manual', 'nudge', 'quick_log']).default('manual'),
    symptoms: z.array(z.string()).optional(), // For safety checking
});

// =============================================================================
// POST /v1/health-logs - Create new health log
// =============================================================================

healthLogsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;

        // Validate request body
        const data = createHealthLogSchema.parse(req.body);

        // Run safety check
        const safetyResult = checkHealthValue(
            data.type as HealthLogType,
            data.value,
            !!data.symptoms?.length,
            data.symptoms || []
        );

        // Check for emergency symptoms if provided
        let emergencyScreening = null;
        if (data.symptoms && data.symptoms.length > 0) {
            emergencyScreening = screenForEmergencySymptoms(data.symptoms);
            if (emergencyScreening.isEmergency) {
                // Override safety result for emergency symptoms
                safetyResult.alertLevel = 'emergency';
                safetyResult.message = emergencyScreening.message;
                safetyResult.shouldShowAlert = true;
            }
        }

        const now = admin.firestore.Timestamp.now();

        // Create health log - filter out undefined values (Firestore doesn't accept undefined)
        const healthLogData: Record<string, unknown> = {
            userId,
            type: data.type as HealthLogType,
            value: data.value,
            alertLevel: safetyResult.alertLevel,
            alertShown: safetyResult.shouldShowAlert,
            createdAt: now,
            source: data.source,
        };

        // Only add optional fields if they have values
        if (data.nudgeId) healthLogData.nudgeId = data.nudgeId;
        if (data.visitId) healthLogData.visitId = data.visitId;
        if (safetyResult.message) healthLogData.alertMessage = safetyResult.message;

        const docRef = await getHealthLogsCollection().add(healthLogData);


        // If this was triggered by a nudge, complete it
        if (data.nudgeId) {
            await completeNudge(data.nudgeId, {
                logId: docRef.id,
                value: data.value,
            });
        }

        // REACTIVE NUDGES: If reading is elevated, create follow-up nudge
        if ((data.type === 'bp' || data.type === 'glucose') &&
            (safetyResult.alertLevel === 'caution' || safetyResult.alertLevel === 'warning')) {
            await createFollowUpNudge({
                userId,
                trackingType: data.type,
                alertLevel: safetyResult.alertLevel,
            });
            functions.logger.info(`[healthLogs] Created reactive follow-up nudge for elevated ${data.type}`);
        }

        functions.logger.info(`[healthLogs] Created health log ${docRef.id}`, {
            userId,
            type: data.type,
            alertLevel: safetyResult.alertLevel,
        });


        const response: HealthLogResponse & { alertMessage?: string; shouldShowAlert?: boolean } = {
            id: docRef.id,
            userId,
            type: data.type as HealthLogType,
            value: data.value,
            alertLevel: safetyResult.alertLevel,
            alertMessage: safetyResult.message,
            createdAt: now.toDate().toISOString(),
            source: data.source,
            shouldShowAlert: safetyResult.shouldShowAlert,
        };

        res.status(201).json(response);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                code: 'validation_failed',
                message: 'Invalid request body',
                details: error.errors,
            });
            return;
        }

        functions.logger.error('[healthLogs] Error creating health log:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to create health log',
        });
    }
});

// =============================================================================
// GET /v1/health-logs - Get health logs with filtering
// =============================================================================

healthLogsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const type = req.query.type as string | undefined;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;

        let query = getHealthLogsCollection()
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc');

        if (type) {
            query = query.where('type', '==', type);
        }

        if (startDate) {
            query = query.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(new Date(startDate)));
        }

        if (endDate) {
            query = query.where('createdAt', '<=', admin.firestore.Timestamp.fromDate(new Date(endDate)));
        }

        const snapshot = await query.limit(limit).get();

        const response: HealthLogResponse[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                type: data.type,
                value: data.value,
                alertLevel: data.alertLevel,
                alertMessage: data.alertMessage,
                createdAt: data.createdAt?.toDate().toISOString(),
                source: data.source,
            };
        });

        functions.logger.info(`[healthLogs] Retrieved ${response.length} logs for user ${userId}`);
        res.json(response);
    } catch (error) {
        functions.logger.error('[healthLogs] Error fetching health logs:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch health logs',
        });
    }
});

// =============================================================================
// GET /v1/health-logs/summary - Get aggregated summary
// =============================================================================

healthLogsRouter.get('/summary', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const days = Math.min(parseInt(req.query.days as string) || 30, 90);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const snapshot = await getHealthLogsCollection()
            .where('userId', '==', userId)
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .orderBy('createdAt', 'desc')
            .get();

        // Group by type and calculate summaries
        const summaries: Record<string, HealthLogSummary> = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const type = data.type as HealthLogType;

            if (!summaries[type]) {
                summaries[type] = {
                    type,
                    count: 0,
                };
            }

            summaries[type].count++;

            // Set last reading if this is the first (most recent) of this type
            if (!summaries[type].lastReading) {
                summaries[type].lastReading = data.value;
                summaries[type].lastReadingAt = data.createdAt?.toDate().toISOString();
            }
        });

        // Calculate averages for BP and glucose
        const bpLogs = snapshot.docs.filter(d => d.data().type === 'bp');
        if (bpLogs.length > 0) {
            const avgSystolic = bpLogs.reduce((sum, d) => sum + (d.data().value as BloodPressureValue).systolic, 0) / bpLogs.length;
            const avgDiastolic = bpLogs.reduce((sum, d) => sum + (d.data().value as BloodPressureValue).diastolic, 0) / bpLogs.length;

            if (summaries['bp']) {
                summaries['bp'].averages = {
                    systolic: Math.round(avgSystolic),
                    diastolic: Math.round(avgDiastolic),
                };
            }
        }

        const glucoseLogs = snapshot.docs.filter(d => d.data().type === 'glucose');
        if (glucoseLogs.length > 0) {
            const avgGlucose = glucoseLogs.reduce((sum, d) => sum + (d.data().value as GlucoseValue).reading, 0) / glucoseLogs.length;

            if (summaries['glucose']) {
                summaries['glucose'].averages = {
                    reading: Math.round(avgGlucose),
                };
            }
        }

        functions.logger.info(`[healthLogs] Generated summary for user ${userId}`, {
            types: Object.keys(summaries),
            totalLogs: snapshot.docs.length,
        });

        res.json({
            period: `${days} days`,
            startDate: startDate.toISOString(),
            endDate: new Date().toISOString(),
            summaries: Object.values(summaries),
        });
    } catch (error) {
        functions.logger.error('[healthLogs] Error generating summary:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to generate health log summary',
        });
    }
});

// =============================================================================
// GET /v1/health-logs/export - Export data for provider report
// =============================================================================

healthLogsRouter.get('/export', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const days = Math.min(parseInt(req.query.days as string) || 30, 90);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const snapshot = await getHealthLogsCollection()
            .where('userId', '==', userId)
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .orderBy('createdAt', 'asc')
            .get();

        // Group by type
        const groupedLogs: Record<string, Array<{ date: string; value: unknown }>> = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const type = data.type as string;

            if (!groupedLogs[type]) {
                groupedLogs[type] = [];
            }

            groupedLogs[type].push({
                date: data.createdAt?.toDate().toISOString(),
                value: data.value,
            });
        });

        res.json({
            userId,
            exportDate: new Date().toISOString(),
            period: {
                start: startDate.toISOString(),
                end: new Date().toISOString(),
                days,
            },
            data: groupedLogs,
        });
    } catch (error) {
        functions.logger.error('[healthLogs] Error exporting health logs:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to export health logs',
        });
    }
});

// =============================================================================
// DELETE /v1/health-logs/:id - Delete a health log
// =============================================================================

healthLogsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const logId = req.params.id;

        // Verify the log exists and belongs to the user
        const logDoc = await getHealthLogsCollection().doc(logId).get();

        if (!logDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Health log not found',
            });
            return;
        }

        const logData = logDoc.data();
        if (logData?.userId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have permission to delete this health log',
            });
            return;
        }

        // Delete the log
        await getHealthLogsCollection().doc(logId).delete();

        functions.logger.info(`[healthLogs] Deleted health log ${logId} for user ${userId}`);

        res.status(204).send();
    } catch (error) {
        functions.logger.error('[healthLogs] Error deleting health log:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to delete health log',
        });
    }
});
