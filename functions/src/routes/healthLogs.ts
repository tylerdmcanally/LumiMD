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
import {
    requireAuth,
    AuthRequest,
    hasOperatorAccess,
    ensureOperatorRestoreReasonOrReject,
} from '../middlewares/auth';
import {
    HealthLogResponse,
    HealthLogSummary,
    BloodPressureValue,
    GlucoseValue,
    HealthLogType,
    HealthLogValue,
    HealthLogSource,
} from '../types/lumibot';
import {
    checkHealthValue,
    screenForEmergencySymptoms,
} from '../services/safetyChecker';
import { resolveHealthLogDedupAction } from '../services/healthLogDedupService';
import { createFollowUpNudge, createInsightNudge } from '../services/lumibotAnalyzer';
import { getPrimaryInsight } from '../services/trendAnalyzer';
import { escalatePatientFrequency } from '../triggers/personalRNEvaluation';
import { sanitizePlainText } from '../utils/inputSanitization';
import {
    RESTORE_REASON_MAX_LENGTH,
    recordRestoreAuditEvent,
} from '../services/restoreAuditService';
import { ensureResourceOwnerAccessOrReject } from '../middlewares/resourceAccess';
import { createDomainServiceContainer } from '../services/domain/serviceContainer';
import { NudgeDomainService } from '../services/domain/nudges/NudgeDomainService';
import { FirestoreNudgeRepository } from '../services/repositories/nudges/FirestoreNudgeRepository';


export const healthLogsRouter = Router();

const getDb = () => admin.firestore();
const getHealthLogDomainService = () => createDomainServiceContainer({ db: getDb() }).healthLogService;
const getNudgeDomainService = () => new NudgeDomainService(new FirestoreNudgeRepository(getDb()));
const HEALTH_LOG_TEXT_MAX_LENGTH = 1000;
const HEALTH_LOG_LIST_ITEM_MAX_LENGTH = 120;
const HEALTH_LOG_MAX_LIST_ITEMS = 25;

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
    breathingDifficulty: z.number().min(1).max(5),
    swelling: z.enum(['none', 'mild', 'moderate', 'severe']),
    swellingLocations: z.array(z.string()).optional(),
    energyLevel: z.number().min(1).max(5),
    cough: z.boolean(),
    orthopnea: z.boolean().optional(), // Needed extra pillows / woken up short of breath
    otherSymptoms: z.string().optional(),
});

// New types for HealthKit integration
const stepsValueSchema = z.object({
    count: z.number().min(0).max(200000),
    date: z.string(), // YYYY-MM-DD
});

const heartRateValueSchema = z.object({
    bpm: z.number().min(20).max(300),
    context: z.enum(['resting', 'active', 'workout', 'unknown']).optional(),
});

const oxygenSaturationValueSchema = z.object({
    percentage: z.number().min(50).max(100),
});

const createHealthLogSchema = z.object({
    type: z.enum(['bp', 'glucose', 'weight', 'med_compliance', 'symptom_check', 'steps', 'heart_rate', 'oxygen_saturation']),
    value: z.union([
        bpValueSchema,
        glucoseValueSchema,
        weightValueSchema,
        medComplianceValueSchema,
        symptomCheckValueSchema,
        stepsValueSchema,
        heartRateValueSchema,
        oxygenSaturationValueSchema,
    ]),
    nudgeId: z.string().optional(),
    visitId: z.string().optional(),
    source: z.enum(['manual', 'nudge', 'quick_log', 'healthkit']).default('manual'),
    /** Unique identifier from the source for deduplication (e.g., HealthKit sample ID) */
    sourceId: z.string().optional(),
    /** Original recording time (for HealthKit imports that may be older than createdAt) */
    recordedAt: z.string().optional(),
    symptoms: z.array(z.string()).optional(), // For safety checking
});

const restoreHealthLogSchema = z.object({
    reason: z.string().max(RESTORE_REASON_MAX_LENGTH).optional(),
});

type CreateHealthLogInput = z.infer<typeof createHealthLogSchema>;

function sanitizeStringArray(
    values: unknown,
    maxLength = HEALTH_LOG_LIST_ITEM_MAX_LENGTH,
    maxItems = HEALTH_LOG_MAX_LIST_ITEMS,
): string[] {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .slice(0, maxItems)
        .map((value) => sanitizePlainText(value, maxLength))
        .filter((value) => value.length > 0);
}

function sanitizeCreateHealthLogInput(input: CreateHealthLogInput): CreateHealthLogInput {
    let value = input.value;

    if (input.type === 'med_compliance') {
        const medCompliance = input.value as z.infer<typeof medComplianceValueSchema>;
        const medicationName =
            sanitizePlainText(medCompliance.medicationName, HEALTH_LOG_TEXT_MAX_LENGTH) || 'Medication';
        const note = sanitizePlainText(medCompliance.note, HEALTH_LOG_TEXT_MAX_LENGTH);
        const medicationId = sanitizePlainText(
            medCompliance.medicationId,
            HEALTH_LOG_TEXT_MAX_LENGTH,
        );

        value = {
            medicationName,
            response: medCompliance.response,
            ...(medicationId ? { medicationId } : {}),
            ...(note ? { note } : {}),
        } as CreateHealthLogInput['value'];
    } else if (input.type === 'symptom_check') {
        const symptomCheck = input.value as z.infer<typeof symptomCheckValueSchema>;
        const swellingLocations = sanitizeStringArray(symptomCheck.swellingLocations);
        const otherSymptoms = sanitizePlainText(
            symptomCheck.otherSymptoms,
            HEALTH_LOG_TEXT_MAX_LENGTH,
        );

        value = {
            breathingDifficulty: symptomCheck.breathingDifficulty,
            swelling: symptomCheck.swelling,
            energyLevel: symptomCheck.energyLevel,
            cough: symptomCheck.cough,
            ...(typeof symptomCheck.orthopnea === 'boolean'
                ? { orthopnea: symptomCheck.orthopnea }
                : {}),
            ...(swellingLocations.length > 0 ? { swellingLocations } : {}),
            ...(otherSymptoms ? { otherSymptoms } : {}),
        } as CreateHealthLogInput['value'];
    }

    const symptoms = sanitizeStringArray(input.symptoms);

    return {
        ...input,
        value,
        ...(symptoms.length > 0 ? { symptoms } : {}),
    };
}

// =============================================================================
// Trend Analysis Helper
// =============================================================================

/**
 * Check for trend patterns after a health log is created.
 * If a significant pattern is found, create an insight nudge.
 */
async function checkForTrendInsights(userId: string, logType: string): Promise<void> {
    // Only analyze for types we have trend detection
    if (!['bp', 'glucose', 'weight'].includes(logType)) {
        return;
    }

    // Fetch recent health logs (last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const healthLogService = getHealthLogDomainService();
    const logs = await healthLogService.listForUser(userId, {
        startDate: fourteenDaysAgo,
        sortDirection: 'asc',
    });

    if (logs.length < 3) {
        return; // Not enough data for trend analysis
    }

    // Transform to format expected by trend analyzer
    const trendLogs = logs.map((data) => {
        return {
            type: data.type as string,
            value: data.value as Record<string, unknown>,
            createdAt: (data.createdAt as admin.firestore.Timestamp).toDate(),
        };
    });

    // Run trend analysis
    const insight = getPrimaryInsight(trendLogs);

    if (insight && insight.severity !== 'positive') {
        // Create insight nudge for non-positive patterns
        await createInsightNudge({
            userId,
            type: insight.type,
            pattern: insight.pattern,
            severity: insight.severity,
            title: insight.title,
            message: insight.message,
        });

        functions.logger.info(`[healthLogs] Created trend insight nudge`, {
            userId,
            type: insight.type,
            pattern: insight.pattern,
            severity: insight.severity,
        });
    }
}

// =============================================================================
// POST /v1/health-logs - Create new health log
// =============================================================================

healthLogsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const healthLogService = getHealthLogDomainService();

        // Validate request body
        const parsedData = createHealthLogSchema.parse(req.body);
        const data = sanitizeCreateHealthLogInput(parsedData);

        // Check for duplicate if sourceId is provided (deduplication for HealthKit sync)
        if (data.sourceId) {
            const existingLogs = await healthLogService.findBySourceId(userId, data.sourceId, {
                includeDeleted: true,
                limit: 5,
            });

            const existingLog = existingLogs.find((log) => !log.deletedAt);
            if (existingLog) {
                const existingData = existingLog;

                const dedupAction = resolveHealthLogDedupAction({
                    incomingType: data.type as HealthLogType,
                    incomingValue: data.value,
                    existingValue: existingData.value,
                });

                // For steps imports, keep the daily record current by updating only on higher counts.
                if (dedupAction === 'update_existing') {
                    const newValue = data.value as { count?: number };
                    const oldValue = existingData.value as { count?: number };
                    const updatedLog = await healthLogService.updateRecord(existingData.id, {
                        value: data.value,
                        syncedAt: admin.firestore.Timestamp.now(),
                    });
                    functions.logger.info(`[healthLogs] Updated steps from ${oldValue?.count || 0} to ${newValue?.count || 0}`, {
                        docId: existingData.id,
                        sourceId: data.sourceId,
                    });
                    res.status(200).json({
                        id: existingData.id,
                        userId: existingData.userId,
                        type: existingData.type,
                        value: updatedLog?.value ?? data.value,
                        alertLevel: updatedLog?.alertLevel ?? existingData.alertLevel,
                        createdAt: existingData.createdAt?.toDate?.().toISOString?.(),
                        source: existingData.source,
                        sourceId: existingData.sourceId,
                        updated: true,
                    });
                    return;
                }

                // For other types: Just return existing (true duplicate)
                functions.logger.info(`[healthLogs] Duplicate sourceId ${data.sourceId}, returning existing`, {
                    existingId: existingData.id,
                });
                res.status(200).json({
                    id: existingData.id,
                    userId: existingData.userId,
                    type: existingData.type,
                    value: existingData.value,
                    alertLevel: existingData.alertLevel,
                    createdAt: existingData.createdAt?.toDate?.().toISOString?.(),
                    source: existingData.source,
                    sourceId: existingData.sourceId,
                    duplicate: true,
                });
                return;
            }
        }

        // Run safety check (skip for activity-only types like steps)
        const skipSafetyCheck = ['steps', 'heart_rate', 'oxygen_saturation'].includes(data.type);
        const safetyResult = skipSafetyCheck
            ? { alertLevel: undefined, message: undefined, shouldShowAlert: false }
            : checkHealthValue(
                data.type as HealthLogType,
                data.value as HealthLogValue,
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

        // Use recordedAt if provided (for HealthKit imports), otherwise use now
        const recordedAtTimestamp = data.recordedAt
            ? admin.firestore.Timestamp.fromDate(new Date(data.recordedAt))
            : now;

        // Create health log - filter out undefined values (Firestore doesn't accept undefined)
        const healthLogData: Record<string, unknown> = {
            userId,
            type: data.type as HealthLogType,
            value: data.value,
            alertShown: safetyResult.shouldShowAlert ?? false,
            createdAt: recordedAtTimestamp, // Use original recording time for proper ordering
            syncedAt: now, // When it was actually synced to our system
            source: data.source,
            deletedAt: null,
            deletedBy: null,
        };

        // Only add optional fields if they have values
        if (data.nudgeId) healthLogData.nudgeId = data.nudgeId;
        if (data.visitId) healthLogData.visitId = data.visitId;
        if (data.sourceId) healthLogData.sourceId = data.sourceId;
        if (safetyResult.alertLevel) healthLogData.alertLevel = safetyResult.alertLevel;
        if (safetyResult.message) healthLogData.alertMessage = safetyResult.message;

        const createdLog = await healthLogService.createRecord(healthLogData);


        // If this was triggered by a nudge, complete it
        if (data.nudgeId) {
            const nudgeService = getNudgeDomainService();
            await nudgeService.completeById(data.nudgeId, {
                now,
                responseValue: {
                    logId: createdLog.id,
                    value: data.value,
                },
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

        functions.logger.info(`[healthLogs] Created health log ${createdLog.id}`, {
            userId,
            type: data.type,
            alertLevel: safetyResult.alertLevel,
        });

        // TREND ANALYSIS: Check for patterns after logging
        // Run asynchronously so we don't slow down the response
        checkForTrendInsights(userId, data.type).catch(err => {
            functions.logger.error('[healthLogs] Trend analysis failed:', err);
        });

        // PERSONAL RN: Escalate frequency if concerning reading
        if ((data.type === 'bp' || data.type === 'glucose') &&
            (safetyResult.alertLevel === 'caution' || safetyResult.alertLevel === 'warning')) {
            escalatePatientFrequency(userId).catch(err => {
                functions.logger.error('[healthLogs] Failed to escalate patient frequency:', err);
            });
        }


        const response: HealthLogResponse & { alertMessage?: string; shouldShowAlert?: boolean; duplicate?: boolean } = {
            id: createdLog.id,
            userId,
            type: data.type as HealthLogType,
            value: data.value as HealthLogValue,
            alertLevel: safetyResult.alertLevel,
            alertMessage: safetyResult.message,
            createdAt: recordedAtTimestamp.toDate().toISOString(),
            source: data.source as HealthLogSource,
            sourceId: data.sourceId,
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
        const healthLogService = getHealthLogDomainService();
        const type = req.query.type as string | undefined;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;

        const logs = await healthLogService.listForUser(userId, {
            type,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            sortDirection: 'desc',
            limit,
        });

        const response: HealthLogResponse[] = logs.map((data) => {
            return {
                id: data.id,
                userId: data.userId,
                type: data.type as HealthLogType,
                value: data.value as HealthLogValue,
                alertLevel: data.alertLevel,
                alertMessage: data.alertMessage,
                createdAt: data.createdAt?.toDate?.().toISOString?.(),
                source: data.source as HealthLogSource,
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
        const healthLogService = getHealthLogDomainService();
        const days = Math.min(parseInt(req.query.days as string) || 30, 90);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await healthLogService.listForUser(userId, {
            startDate,
            sortDirection: 'desc',
        });

        // Group by type and calculate summaries
        const summaries: Record<string, HealthLogSummary> = {};

        logs.forEach((data) => {
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
                summaries[type].lastReading = data.value as HealthLogValue;
                summaries[type].lastReadingAt = data.createdAt?.toDate().toISOString();
            }
        });

        // Calculate averages for BP and glucose
        const bpLogs = logs.filter((d) => d.type === 'bp');
        if (bpLogs.length > 0) {
            const avgSystolic = bpLogs.reduce((sum, d) => sum + (d.value as BloodPressureValue).systolic, 0) / bpLogs.length;
            const avgDiastolic = bpLogs.reduce((sum, d) => sum + (d.value as BloodPressureValue).diastolic, 0) / bpLogs.length;

            if (summaries['bp']) {
                summaries['bp'].averages = {
                    systolic: Math.round(avgSystolic),
                    diastolic: Math.round(avgDiastolic),
                };
            }
        }

        const glucoseLogs = logs.filter((d) => d.type === 'glucose');
        if (glucoseLogs.length > 0) {
            const avgGlucose = glucoseLogs.reduce((sum, d) => sum + (d.value as GlucoseValue).reading, 0) / glucoseLogs.length;

            if (summaries['glucose']) {
                summaries['glucose'].averages = {
                    reading: Math.round(avgGlucose),
                };
            }
        }

        functions.logger.info(`[healthLogs] Generated summary for user ${userId}`, {
            types: Object.keys(summaries),
            totalLogs: logs.length,
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
        const healthLogService = getHealthLogDomainService();
        const days = Math.min(parseInt(req.query.days as string) || 30, 90);

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const logs = await healthLogService.listForUser(userId, {
            startDate,
            sortDirection: 'asc',
        });

        // Group by type
        const groupedLogs: Record<string, Array<{ date: string; value: unknown }>> = {};

        logs.forEach((data) => {
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
        const healthLogService = getHealthLogDomainService();

        // Verify the log exists and belongs to the user
        const logData = await healthLogService.getById(logId);
        if (
            !ensureResourceOwnerAccessOrReject(userId, logData, res, {
                resourceName: 'health log',
                notFoundMessage: 'Health log not found',
                message: 'You do not have permission to delete this health log',
            })
        ) {
            return;
        }

        const now = admin.firestore.Timestamp.now();
        await healthLogService.softDeleteRecord(logId, userId, now);

        functions.logger.info(`[healthLogs] Soft deleted health log ${logId} for user ${userId}`);

        res.status(204).send();
    } catch (error) {
        functions.logger.error('[healthLogs] Error deleting health log:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to delete health log',
        });
    }
});

// =============================================================================
// POST /v1/health-logs/:id/restore - Restore a soft-deleted health log
// =============================================================================

healthLogsRouter.post('/:id/restore', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const logId = req.params.id;
        const healthLogService = getHealthLogDomainService();
        const isOperator = hasOperatorAccess(req.user);

        const payload = restoreHealthLogSchema.safeParse(req.body ?? {});
        if (!payload.success) {
            res.status(400).json({
                code: 'validation_failed',
                message: 'Invalid restore request body',
                details: payload.error.errors,
            });
            return;
        }
        const restoreReason =
            sanitizePlainText(payload.data.reason, RESTORE_REASON_MAX_LENGTH) || undefined;

        const logData = await healthLogService.getById(logId);
        const ownerUserId = typeof logData?.userId === 'string' ? logData.userId : '';

        if (
            !ensureResourceOwnerAccessOrReject(userId, logData, res, {
                resourceName: 'health log',
                notFoundMessage: 'Health log not found',
                message: 'You do not have permission to restore this health log',
                allowDeleted: true,
                allowOperator: true,
                isOperator,
            })
        ) {
            return;
        }
        const restoredLogData = logData!;

        if (!ensureOperatorRestoreReasonOrReject({
            actorUserId: userId,
            ownerUserId,
            isOperator,
            reason: restoreReason,
            res,
        })) {
            return;
        }

        if (!restoredLogData.deletedAt) {
            res.status(409).json({
                code: 'not_deleted',
                message: 'Health log is not deleted',
            });
            return;
        }

        const now = admin.firestore.Timestamp.now();
        await healthLogService.restoreRecord(logId, now);

        try {
            await recordRestoreAuditEvent({
                resourceType: 'health_log',
                resourceId: logId,
                ownerUserId,
                actorUserId: userId,
                actorIsOperator: isOperator,
                reason: restoreReason,
                metadata: {
                    route: 'healthLogs.restore',
                },
                createdAt: now,
            });
        } catch (auditError) {
            functions.logger.error('[healthLogs] Failed to record restore audit event', {
                logId,
                actorUserId: userId,
                ownerUserId,
                message: auditError instanceof Error ? auditError.message : String(auditError),
            });
        }

        functions.logger.info(`[healthLogs] Restored health log ${logId} for user ${userId}`);

        res.json({
            success: true,
            id: logId,
            restoredBy: userId,
            restoredFor: ownerUserId || null,
            reason: restoreReason ?? null,
            restoredAt: now.toDate().toISOString(),
        });
    } catch (error) {
        functions.logger.error('[healthLogs] Error restoring health log:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to restore health log',
        });
    }
});

// =============================================================================
// GET /v1/health-logs/provider-report - Generate PDF report for healthcare provider
// =============================================================================

healthLogsRouter.get('/provider-report', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;

        // Import PDF generator dynamically to avoid loading it for every request
        const { generateProviderReport } = await import('../services/pdfGenerator');

        functions.logger.info(`[healthLogs] Generating provider report for user ${userId}`);

        // Generate PDF (30 days fixed)
        const pdfBuffer = await generateProviderReport(userId, 30);

        // Set headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="LumiMD-Health-Report-${new Date().toISOString().slice(0, 10)}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);

        functions.logger.info(`[healthLogs] Provider report generated successfully for user ${userId}`, {
            sizeBytes: pdfBuffer.length,
        });

        res.send(pdfBuffer);
    } catch (error) {
        functions.logger.error('[healthLogs] Error generating provider report:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to generate provider report',
        });
    }
});
