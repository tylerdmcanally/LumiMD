/**
 * Care Dashboard API Routes
 *
 * Endpoints for caregiver dashboard to view aggregated data
 * for all patients who have shared their health info.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAuth, AuthRequest } from '../middlewares/auth';

export const careRouter = Router();

const getDb = () => admin.firestore();

// =============================================================================
// HELPER: Get accepted incoming shares for caregiver
// Canonical access source is the shares collection
// =============================================================================

async function getAcceptedSharesForCaregiver(caregiverId: string) {
    const sharesSnapshot = await getDb()
        .collection('shares')
        .where('caregiverUserId', '==', caregiverId)
        .where('status', '==', 'accepted')
        .get();

    const acceptedShares = sharesSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id,
            ownerId: data.ownerId,
            ownerName: data.ownerName,
            ownerEmail: data.ownerEmail,
        };
    });

    functions.logger.info(
        `[care] Found ${acceptedShares.length} accepted shares for caregiver ${caregiverId}`
    );
    return acceptedShares;
}

// =============================================================================
// HELPER: Validate caregiver has access to patient
// =============================================================================

async function validateCaregiverAccess(
    caregiverId: string,
    patientId: string
): Promise<boolean> {
    functions.logger.info(`[care] validateCaregiverAccess: caregiverId=${caregiverId}, patientId=${patientId}`);

    // Method 1: Query by ownerId + caregiverUserId + status
    const sharesSnapshot = await getDb()
        .collection('shares')
        .where('ownerId', '==', patientId)
        .where('caregiverUserId', '==', caregiverId)
        .where('status', '==', 'accepted')
        .limit(1)
        .get();

    if (!sharesSnapshot.empty) {
        functions.logger.info(`[care] Access granted via ownerId+caregiverUserId query`);
        return true;
    }
    functions.logger.info(`[care] Method 1 failed: no match for ownerId+caregiverUserId query`);

    // Method 2: Check canonical share doc id
    const shareDocId = `${patientId}_${caregiverId}`;
    functions.logger.info(`[care] Trying doc id: ${shareDocId}`);
    const shareDoc = await getDb().collection('shares').doc(shareDocId).get();
    if (shareDoc.exists) {
        const data = shareDoc.data();
        functions.logger.info(`[care] Found doc ${shareDocId}: status=${data?.status}, ownerId=${data?.ownerId}, caregiverUserId=${data?.caregiverUserId}`);
        if (data?.status === 'accepted') {
            functions.logger.info(`[care] Access granted via doc id lookup`);
            return true;
        }
    } else {
        functions.logger.info(`[care] Doc ${shareDocId} does not exist`);
    }

    // Method 3: Find any shares for this caregiver and log them
    const allCaregiverShares = await getDb()
        .collection('shares')
        .where('caregiverUserId', '==', caregiverId)
        .get();
    functions.logger.info(`[care] All shares for caregiver ${caregiverId}: ${allCaregiverShares.size} found`);
    allCaregiverShares.docs.forEach((doc) => {
        const d = doc.data();
        functions.logger.info(`[care]   Share ${doc.id}: ownerId=${d.ownerId}, status=${d.status}`);
    });

    // Method 4: Match on caregiver email if userId missing
    try {
        const caregiverAuth = await admin.auth().getUser(caregiverId);
        const caregiverEmail = caregiverAuth.email?.toLowerCase().trim();
        functions.logger.info(`[care] Trying email fallback: ${caregiverEmail}`);
        if (caregiverEmail) {
            const emailMatchSnapshot = await getDb()
                .collection('shares')
                .where('ownerId', '==', patientId)
                .where('caregiverEmail', '==', caregiverEmail)
                .where('status', '==', 'accepted')
                .limit(1)
                .get();

            if (!emailMatchSnapshot.empty) {
                const matchDoc = emailMatchSnapshot.docs[0];
                const data = matchDoc.data();
                functions.logger.info(`[care] Found email match: ${matchDoc.id}`);
                if (!data.caregiverUserId) {
                    await matchDoc.ref.update({
                        caregiverUserId: caregiverId,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    functions.logger.info(`[care] Backfilled caregiverUserId`);
                }
                return true;
            }
        }
    } catch (error) {
        functions.logger.warn('[care] Unable to validate caregiver email fallback', error);
    }

    functions.logger.warn(
        `[care] Access denied. No accepted share found for owner ${patientId} and caregiver ${caregiverId}`
    );
    return false;
}

// =============================================================================
// HELPER: Get today's medication schedule for a user
// =============================================================================

async function getTodaysMedicationStatus(patientId: string) {
    const overdueGraceMinutes = 120;

    const userDoc = await getDb().collection('users').doc(patientId).get();
    const userTimezone =
        typeof userDoc.data()?.timezone === 'string'
            ? (userDoc.data()?.timezone as string)
            : 'America/Chicago';

    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD

    const dayBoundaries = (() => {
        const dateStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone });
        const [year, month, day] = dateStr.split('-').map(Number);
        const testUTC = new Date(
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`
        );
        const tzFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });
        const tzParts = tzFormatter.formatToParts(testUTC);
        const tzHour = parseInt(tzParts.find((p) => p.type === 'hour')!.value, 10);
        const tzMinute = parseInt(tzParts.find((p) => p.type === 'minute')!.value, 10);
        const offsetMinutes = (tzHour - 12) * 60 + tzMinute;
        const midnightUTC = new Date(
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`
        );
        const startOfDayUTC = new Date(midnightUTC.getTime() - offsetMinutes * 60 * 1000);
        const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
        return { startOfDayUTC, endOfDayUTC };
    })();

    // Get active medications with reminders
    const medsSnapshot = await getDb()
        .collection('medications')
        .where('userId', '==', patientId)
        .where('active', '==', true)
        .get();

    const remindersSnapshot = await getDb()
        .collection('medicationReminders')
        .where('userId', '==', patientId)
        .where('enabled', '==', true)
        .get();

    // Get today's dose logs
    const logsSnapshot = await getDb()
        .collection('medicationLogs')
        .where('userId', '==', patientId)
        .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(dayBoundaries.startOfDayUTC))
        .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(dayBoundaries.endOfDayUTC))
        .get();

    const logs = logsSnapshot.docs
        .map((doc) => doc.data())
        .filter((log) => {
            const logDateStr =
                log.scheduledDate ||
                (log.loggedAt?.toDate
                    ? log.loggedAt.toDate().toLocaleDateString('en-CA', { timeZone: userTimezone })
                    : null);
            return logDateStr === todayStr;
        });

    // Build reminder map: medicationId -> times
    const reminderMap = new Map<string, string[]>();
    remindersSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        reminderMap.set(data.medicationId, data.times || []);
    });

    // Calculate expected doses and status
    let total = 0;
    let taken = 0;
    let skipped = 0;
    let pending = 0;
    let missed = 0;

    const currentTimeStr = now.toLocaleTimeString('en-US', {
        timeZone: userTimezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    });
    const currentHour = parseInt(currentTimeStr.slice(0, 2), 10);
    const currentMinute = parseInt(currentTimeStr.slice(3, 5), 10);

    medsSnapshot.docs.forEach((doc) => {
        const medId = doc.id;
        const times = reminderMap.get(medId) || [];

        times.forEach((time) => {
            total++;
            const [hourStr, minStr] = time.split(':');
            const scheduledHour = parseInt(hourStr, 10);
            const scheduledMin = parseInt(minStr, 10);

            // Check if dose was logged
            const log = logs.find(
                (l) => l.medicationId === medId && l.scheduledTime === time
            );

            if (log) {
                if (log.action === 'taken') taken++;
                else if (log.action === 'skipped') skipped++;
            } else {
                // Not logged - check if missed (past time by grace window)
                const scheduledMins = scheduledHour * 60 + scheduledMin;
                const currentMins = currentHour * 60 + currentMinute;

                if (currentMins > scheduledMins + overdueGraceMinutes) {
                    missed++;
                } else {
                    pending++;
                }
            }
        });
    });

    return { total, taken, skipped, pending, missed };
}

// =============================================================================
// HELPER: Get pending actions count for a user
// =============================================================================

async function getPendingActionsCount(patientId: string): Promise<number> {
    const actionsSnapshot = await getDb()
        .collection('actions')
        .where('userId', '==', patientId)
        .where('completed', '==', false)
        .get();

    return actionsSnapshot.size;
}

// =============================================================================
// HELPER: Get alerts for a patient (missed doses, overdue actions)
// =============================================================================

async function getPatientAlerts(patientId: string) {
    const alerts: Array<{
        type: 'missed_dose' | 'overdue_action';
        priority: 'high' | 'medium' | 'low';
        message: string;
    }> = [];

    // Check for missed doses today
    const medStatus = await getTodaysMedicationStatus(patientId);
    if (medStatus.missed > 0) {
        alerts.push({
            type: 'missed_dose',
            priority: 'high',
            message: `${medStatus.missed} missed dose${medStatus.missed > 1 ? 's' : ''} today`,
        });
    }

    // Check for overdue actions (past due date)
    const now = new Date();
    const actionsSnapshot = await getDb()
        .collection('actions')
        .where('userId', '==', patientId)
        .where('completed', '==', false)
        .get();

    actionsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.dueAt) {
            const dueDate = new Date(data.dueAt);
            if (dueDate < now) {
                const daysOverdue = Math.floor(
                    (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                alerts.push({
                    type: 'overdue_action',
                    priority: daysOverdue >= 7 ? 'high' : 'medium',
                    message: `Action "${data.description?.substring(0, 50)}..." overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}`,
                });
            }
        }
    });

    return alerts;
}

// =============================================================================
// GET /v1/care/debug
// Debug endpoint to inspect share data (remove after debugging)
// =============================================================================

careRouter.get('/debug', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        
        // Get caregiver auth info
        const caregiverAuth = await admin.auth().getUser(caregiverId);
        
        // Get all shares where user is caregiver (by userId)
        const sharesByUserId = await getDb()
            .collection('shares')
            .where('caregiverUserId', '==', caregiverId)
            .get();
        
        // Get all shares where user is caregiver (by email)
        const sharesByEmail = await getDb()
            .collection('shares')
            .where('caregiverEmail', '==', caregiverAuth.email?.toLowerCase())
            .get();
        
        // Get all shareInvites for this caregiver
        const invitesByEmail = await getDb()
            .collection('shareInvites')
            .where('caregiverEmail', '==', caregiverAuth.email?.toLowerCase())
            .get();
        
        res.json({
            caregiverId,
            caregiverEmail: caregiverAuth.email,
            sharesByUserId: sharesByUserId.docs.map(d => ({ id: d.id, ...d.data() })),
            sharesByEmail: sharesByEmail.docs.map(d => ({ id: d.id, ...d.data() })),
            invitesByEmail: invitesByEmail.docs.map(d => ({ id: d.id, ...d.data() })),
        });
    } catch (error) {
        functions.logger.error('[care] Debug error:', error);
        res.status(500).json({ error: 'Debug failed' });
    }
});

// =============================================================================
// GET /v1/care/overview
// Aggregated data for all shared patients
// =============================================================================

careRouter.get('/overview', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;

        // Get all accepted shares where current user is caregiver
        const shares = await getAcceptedSharesForCaregiver(caregiverId);

        if (shares.length === 0) {
            res.json({ patients: [] });
            return;
        }

        // Fetch data for each patient in parallel
        const patientsData = await Promise.all(
            shares.map(async (share) => {
                const patientId = share.ownerId;

                // Get patient profile
                const profileDoc = await getDb().collection('users').doc(patientId).get();
                const profile = profileDoc.data();

                // Get aggregated data
                const [medicationsToday, pendingActions, alerts] = await Promise.all([
                    getTodaysMedicationStatus(patientId),
                    getPendingActionsCount(patientId),
                    getPatientAlerts(patientId),
                ]);

                // Get owner auth info for name/email
                let name = profile?.preferredName || profile?.firstName;
                let email = share.ownerEmail;

                if (!name) {
                    try {
                        const ownerAuth = await admin.auth().getUser(patientId);
                        name = ownerAuth.displayName || ownerAuth.email?.split('@')[0] || 'Unknown';
                        email = email || ownerAuth.email;
                    } catch {
                        name = 'Unknown';
                    }
                }

                return {
                    userId: patientId,
                    name,
                    email,
                    medicationsToday,
                    pendingActions,
                    alerts,
                };
            })
        );

        res.json({ patients: patientsData });

    } catch (error) {
        functions.logger.error('[care] Error fetching overview:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch care overview',
        });
    }
});

// =============================================================================
// GET /v1/care/:patientId/medications
// List medications for a shared patient
// =============================================================================

careRouter.get('/:patientId/medications', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;

        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        const medsSnapshot = await getDb()
            .collection('medications')
            .where('userId', '==', patientId)
            .orderBy('name', 'asc')
            .get();

        const medications = medsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate().toISOString(),
                updatedAt: data.updatedAt?.toDate().toISOString(),
                startedAt: data.startedAt?.toDate()?.toISOString() || null,
                stoppedAt: data.stoppedAt?.toDate()?.toISOString() || null,
                changedAt: data.changedAt?.toDate()?.toISOString() || null,
                lastSyncedAt: data.lastSyncedAt?.toDate()?.toISOString() || null,
                medicationWarning: data.medicationWarning || null,
                needsConfirmation: data.needsConfirmation || false,
                medicationStatus: data.medicationStatus || null,
            };
        });

        res.json(medications);
    } catch (error) {
        functions.logger.error('[care] Error fetching patient medications:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch medications',
        });
    }
});

// =============================================================================
// GET /v1/care/:patientId/actions
// List action items for a shared patient
// =============================================================================

careRouter.get('/:patientId/actions', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;

        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        const actionsSnapshot = await getDb()
            .collection('actions')
            .where('userId', '==', patientId)
            .get();

        const actions = actionsSnapshot.docs.map((doc) => {
            const data = doc.data();
            
            // Safe date conversion helper
            const toISOStringSafe = (val: any): string | null => {
                if (!val) return null;
                try {
                    // Handle Firestore Timestamp
                    if (val?.toDate) {
                        return val.toDate().toISOString();
                    }
                    // Handle string or number
                    const date = new Date(val);
                    if (isNaN(date.getTime())) return null;
                    return date.toISOString();
                } catch {
                    return null;
                }
            };

            return {
                id: doc.id,
                ...data,
                createdAt: toISOStringSafe(data.createdAt),
                updatedAt: toISOStringSafe(data.updatedAt),
                completedAt: toISOStringSafe(data.completedAt),
                dueAt: toISOStringSafe(data.dueAt),
            };
        });

        res.json(actions);
    } catch (error) {
        functions.logger.error('[care] Error fetching patient actions:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch action items',
        });
    }
});

// =============================================================================
// GET /v1/care/:patientId/visits
// List visits for a shared patient
// =============================================================================

careRouter.get('/:patientId/visits', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;

        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        const visitsSnapshot = await getDb()
            .collection('visits')
            .where('userId', '==', patientId)
            .orderBy('createdAt', 'desc')
            .get();

        const visits = visitsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
                updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
                processedAt: data.processedAt?.toDate?.().toISOString() ?? null,
                visitDate: data.visitDate?.toDate?.()
                    ? data.visitDate.toDate().toISOString()
                    : data.visitDate ?? null,
            };
        });

        res.json(visits);
    } catch (error) {
        functions.logger.error('[care] Error fetching patient visits:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch visits',
        });
    }
});

// =============================================================================
// GET /v1/care/:patientId/medication-status
// Today's medication doses for a specific patient
// =============================================================================

careRouter.get(
    '/:patientId/medication-status',
    requireAuth,
    async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;

            // Validate caregiver has access
            const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
            if (!hasAccess) {
                res.status(403).json({
                    code: 'forbidden',
                    message: 'You do not have access to this patient\'s data',
                });
                return;
            }

            const overdueGraceMinutes = 120;

            const userDoc = await getDb().collection('users').doc(patientId).get();
            const userTimezone =
                typeof userDoc.data()?.timezone === 'string'
                    ? (userDoc.data()?.timezone as string)
                    : 'America/Chicago';

            const now = new Date();
            const todayStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone });

            const dayBoundaries = (() => {
                const dateStr = now.toLocaleDateString('en-CA', { timeZone: userTimezone });
                const [year, month, day] = dateStr.split('-').map(Number);
                const testUTC = new Date(
                    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`
                );
                const tzFormatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: userTimezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                });
                const tzParts = tzFormatter.formatToParts(testUTC);
                const tzHour = parseInt(tzParts.find((p) => p.type === 'hour')!.value, 10);
                const tzMinute = parseInt(tzParts.find((p) => p.type === 'minute')!.value, 10);
                const offsetMinutes = (tzHour - 12) * 60 + tzMinute;
                const midnightUTC = new Date(
                    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`
                );
                const startOfDayUTC = new Date(midnightUTC.getTime() - offsetMinutes * 60 * 1000);
                const endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000 - 1);
                return { startOfDayUTC, endOfDayUTC };
            })();

            // Get active medications
            const medsSnapshot = await getDb()
                .collection('medications')
                .where('userId', '==', patientId)
                .where('active', '==', true)
                .get();

            // Get reminders
            const remindersSnapshot = await getDb()
                .collection('medicationReminders')
                .where('userId', '==', patientId)
                .where('enabled', '==', true)
                .get();

            // Get today's logs
            const logsSnapshot = await getDb()
                .collection('medicationLogs')
                .where('userId', '==', patientId)
                .where('loggedAt', '>=', admin.firestore.Timestamp.fromDate(dayBoundaries.startOfDayUTC))
                .where('loggedAt', '<=', admin.firestore.Timestamp.fromDate(dayBoundaries.endOfDayUTC))
                .get();

            const medications = medsSnapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name as string,
                    dose: data.dose as string | undefined,
                    ...data,
                };
            });

            const reminderMap = new Map<string, string[]>();
            remindersSnapshot.docs.forEach((doc) => {
                const data = doc.data();
                reminderMap.set(data.medicationId, data.times || []);
            });

            // Build schedule
            const logs = logsSnapshot.docs
                .map((doc) => doc.data())
                .filter((log) => {
                    const logDateStr =
                        log.scheduledDate ||
                        (log.loggedAt?.toDate
                            ? log.loggedAt.toDate().toLocaleDateString('en-CA', { timeZone: userTimezone })
                            : null);
                    return logDateStr === todayStr;
                });

            const schedule = medications.flatMap((med) => {
                const times = reminderMap.get(med.id) || [];
                return times.map((time) => {
                    const log = logs.find(
                        (l) => l.medicationId === med.id && l.scheduledTime === time
                    );

                    let status: 'taken' | 'skipped' | 'pending' | 'missed' = 'pending';
                    let actionAt: string | undefined;

                    if (log) {
                        if (log.action === 'taken' || log.action === 'skipped') {
                            status = log.action;
                        } else {
                            status = 'pending';
                        }
                        actionAt = log.loggedAt?.toDate?.().toISOString();
                    } else {
                        // Check if missed
                        const [hourStr, minStr] = time.split(':');
                        const scheduledMins =
                            parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
                        const currentTimeStr = now.toLocaleTimeString('en-US', {
                            timeZone: userTimezone,
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                        });
                        const currentMins =
                            parseInt(currentTimeStr.slice(0, 2), 10) * 60 +
                            parseInt(currentTimeStr.slice(3, 5), 10);

                        if (currentMins > scheduledMins + overdueGraceMinutes) {
                            status = 'missed';
                        }
                    }

                    return {
                        medicationId: med.id,
                        medicationName: med.name,
                        dose: med.dose,
                        scheduledTime: time,
                        status,
                        actionAt,
                    };
                });
            });

            // Sort by time
            schedule.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

            res.json({
                date: todayStr,
                schedule,
                summary: await getTodaysMedicationStatus(patientId),
            });
        } catch (error) {
            functions.logger.error('[care] Error fetching medication status:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch medication status',
            });
        }
    }
);

// =============================================================================
// GET /v1/care/:patientId/summary
// Quick summary for a patient (used in patient detail view)
// =============================================================================

careRouter.get(
    '/:patientId/summary',
    requireAuth,
    async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;

            // Validate caregiver has access
            const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
            if (!hasAccess) {
                res.status(403).json({
                    code: 'forbidden',
                    message: 'You do not have access to this patient\'s data',
                });
                return;
            }

            // Get patient profile
            const profileDoc = await getDb().collection('users').doc(patientId).get();
            const profile = profileDoc.data();

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
            const [medsSnapshot, visitsSnapshot, actionsSnapshot] = await Promise.all([
                getDb()
                    .collection('medications')
                    .where('userId', '==', patientId)
                    .where('active', '==', true)
                    .get(),
                getDb()
                    .collection('visits')
                    .where('userId', '==', patientId)
                    .orderBy('createdAt', 'desc')
                    .limit(1)
                    .get(),
                getDb()
                    .collection('actions')
                    .where('userId', '==', patientId)
                    .where('completed', '==', false)
                    .get(),
            ]);

            const lastVisit = visitsSnapshot.docs[0]?.data();

            res.json({
                userId: patientId,
                name,
                activeMedications: medsSnapshot.size,
                pendingActions: actionsSnapshot.size,
                lastVisit: lastVisit
                    ? {
                        id: visitsSnapshot.docs[0].id,
                        provider: lastVisit.provider,
                        specialty: lastVisit.specialty,
                        visitDate: lastVisit.visitDate,
                        summary: lastVisit.summary?.substring(0, 200),
                    }
                    : null,
                medicationsToday: await getTodaysMedicationStatus(patientId),
                alerts: await getPatientAlerts(patientId),
            });
        } catch (error) {
            functions.logger.error('[care] Error fetching patient summary:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch patient summary',
            });
        }
    }
);

// =============================================================================
// CAREGIVER NOTES API
// Private notes that caregivers can add to visits
// =============================================================================

// GET /v1/care/:patientId/notes
// List all caregiver notes for a patient
careRouter.get('/:patientId/notes', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;

        // Validate caregiver has access to this patient
        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        // Fetch all notes for this caregiver + patient combination
        const notesSnapshot = await getDb()
            .collection('caregiverNotes')
            .where('caregiverId', '==', caregiverId)
            .where('patientId', '==', patientId)
            .orderBy('updatedAt', 'desc')
            .get();

        const notes = notesSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                visitId: data.visitId,
                note: data.note || null,
                pinned: data.pinned || false,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
            };
        });

        res.json(notes);
    } catch (error) {
        functions.logger.error('[care] Error fetching caregiver notes:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch notes',
        });
    }
});

// PUT /v1/care/:patientId/visits/:visitId/note
// Create or update a caregiver note for a specific visit
careRouter.put('/:patientId/visits/:visitId/note', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const { patientId, visitId } = req.params;
        const { note, pinned } = req.body;

        // Validate caregiver has access to this patient
        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        // Verify the visit exists and belongs to the patient
        const visitDoc = await getDb().collection('visits').doc(visitId).get();
        if (!visitDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Visit not found',
            });
            return;
        }

        const visitData = visitDoc.data();
        if (visitData?.userId !== patientId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'Visit does not belong to this patient',
            });
            return;
        }

        // Use a deterministic document ID for upsert behavior
        const noteDocId = `${caregiverId}_${patientId}_${visitId}`;
        const now = admin.firestore.FieldValue.serverTimestamp();

        // Check if note already exists
        const existingDoc = await getDb().collection('caregiverNotes').doc(noteDocId).get();

        const noteData: Record<string, any> = {
            caregiverId,
            patientId,
            visitId,
            updatedAt: now,
        };

        // Only update fields that are provided
        if (typeof note === 'string') {
            noteData.note = note.trim();
        }
        if (typeof pinned === 'boolean') {
            noteData.pinned = pinned;
        }

        if (!existingDoc.exists) {
            // Create new note
            noteData.createdAt = now;
            noteData.pinned = noteData.pinned ?? false;
            noteData.note = noteData.note ?? '';
        }

        await getDb().collection('caregiverNotes').doc(noteDocId).set(noteData, { merge: true });

        // Fetch the updated document to return
        const updatedDoc = await getDb().collection('caregiverNotes').doc(noteDocId).get();
        const updatedData = updatedDoc.data();

        res.json({
            id: noteDocId,
            visitId,
            note: updatedData?.note || null,
            pinned: updatedData?.pinned || false,
            createdAt: updatedData?.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: updatedData?.updatedAt?.toDate?.()?.toISOString() || null,
        });
    } catch (error) {
        functions.logger.error('[care] Error saving caregiver note:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to save note',
        });
    }
});

// DELETE /v1/care/:patientId/visits/:visitId/note
// Delete a caregiver note for a specific visit
careRouter.delete('/:patientId/visits/:visitId/note', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const { patientId, visitId } = req.params;

        // Validate caregiver has access to this patient
        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        const noteDocId = `${caregiverId}_${patientId}_${visitId}`;
        const noteDoc = await getDb().collection('caregiverNotes').doc(noteDocId).get();

        if (!noteDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Note not found',
            });
            return;
        }

        await getDb().collection('caregiverNotes').doc(noteDocId).delete();

        res.json({ success: true });
    } catch (error) {
        functions.logger.error('[care] Error deleting caregiver note:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to delete note',
        });
    }
});

// =============================================================================
// CARE SUMMARY EXPORT
// Generate a text/JSON summary of patient care for export
// =============================================================================

// GET /v1/care/:patientId/export/summary
// Generate a care summary for a patient
careRouter.get('/:patientId/export/summary', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const patientId = req.params.patientId;

        // Validate caregiver has access
        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        // Get patient profile
        let patientName = 'Unknown Patient';
        try {
            const profileDoc = await getDb().collection('users').doc(patientId).get();
            const profile = profileDoc.data();
            patientName = profile?.preferredName || profile?.firstName || 'Unknown';
            if (!patientName || patientName === 'Unknown') {
                const authUser = await admin.auth().getUser(patientId);
                patientName = authUser.displayName || authUser.email?.split('@')[0] || 'Unknown';
            }
        } catch {
            // Keep default name
        }

        // Fetch all visits
        const visitsSnapshot = await getDb()
            .collection('visits')
            .where('userId', '==', patientId)
            .orderBy('createdAt', 'desc')
            .get();

        const visits = visitsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                visitDate: data.visitDate?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || null,
                provider: data.provider || null,
                specialty: data.specialty || null,
                location: data.location || null,
                summary: data.summary || null,
                diagnoses: Array.isArray(data.diagnoses) ? data.diagnoses.filter(Boolean) : [],
                nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps.filter(Boolean) : [],
                medications: data.medications || null,
            };
        });

        // Fetch active medications
        const medsSnapshot = await getDb()
            .collection('medications')
            .where('userId', '==', patientId)
            .where('active', '==', true)
            .get();

        const medications = medsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                name: data.name || 'Unknown',
                dosage: data.dosage || data.dose || null,
                frequency: data.frequency || null,
                instructions: data.instructions || null,
            };
        });

        // Fetch pending actions
        const actionsSnapshot = await getDb()
            .collection('actions')
            .where('userId', '==', patientId)
            .where('completed', '==', false)
            .get();

        const pendingActions = actionsSnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                title: data.title || data.text || 'Unknown',
                dueDate: data.dueDate?.toDate?.()?.toISOString() || null,
                priority: data.priority || 'normal',
            };
        });

        // Extract unique conditions from all visits
        const conditionSet = new Set<string>();
        visits.forEach((visit) => {
            visit.diagnoses.forEach((dx: string) => {
                if (dx?.trim()) conditionSet.add(dx.trim());
            });
        });
        const conditions = Array.from(conditionSet).sort();

        // Extract unique providers
        const providerSet = new Set<string>();
        visits.forEach((visit) => {
            if (visit.provider?.trim()) {
                providerSet.add(visit.provider.trim());
            }
        });
        const providers = Array.from(providerSet).sort();

        // Build summary
        const summary = {
            generatedAt: new Date().toISOString(),
            patient: {
                name: patientName,
                id: patientId,
            },
            overview: {
                totalVisits: visits.length,
                totalConditions: conditions.length,
                totalProviders: providers.length,
                activeMedications: medications.length,
                pendingActions: pendingActions.length,
            },
            conditions,
            providers,
            currentMedications: medications,
            pendingActions,
            recentVisits: visits.slice(0, 10).map((v) => ({
                date: v.visitDate,
                provider: v.provider,
                specialty: v.specialty,
                summary: v.summary?.substring(0, 300),
                diagnoses: v.diagnoses,
            })),
        };

        res.json(summary);
    } catch (error) {
        functions.logger.error('[care] Error generating care summary:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to generate care summary',
        });
    }
});

// =============================================================================
// VISIT METADATA EDITING
// Allow caregivers to update visit metadata (provider, specialty, location, date)
// =============================================================================

// PATCH /v1/care/:patientId/visits/:visitId
// Update visit metadata
careRouter.patch('/:patientId/visits/:visitId', requireAuth, async (req: AuthRequest, res) => {
    try {
        const caregiverId = req.user!.uid;
        const { patientId, visitId } = req.params;
        const { provider, specialty, location, visitDate } = req.body;

        // Validate caregiver has access to this patient
        const hasAccess = await validateCaregiverAccess(caregiverId, patientId);
        if (!hasAccess) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this patient\'s data',
            });
            return;
        }

        // Verify the visit exists and belongs to the patient
        const visitRef = getDb().collection('visits').doc(visitId);
        const visitDoc = await visitRef.get();
        
        if (!visitDoc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Visit not found',
            });
            return;
        }

        const visitData = visitDoc.data();
        if (visitData?.userId !== patientId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'Visit does not belong to this patient',
            });
            return;
        }

        // Build update object - only include fields that are provided
        const updateData: Record<string, any> = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastEditedBy: caregiverId,
            lastEditedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (typeof provider === 'string') {
            updateData.provider = provider.trim() || null;
        }
        if (typeof specialty === 'string') {
            updateData.specialty = specialty.trim() || null;
        }
        if (typeof location === 'string') {
            updateData.location = location.trim() || null;
        }
        if (visitDate !== undefined) {
            // Accept ISO string or null
            if (visitDate === null) {
                updateData.visitDate = null;
            } else if (typeof visitDate === 'string') {
                const parsedDate = new Date(visitDate);
                if (!isNaN(parsedDate.getTime())) {
                    updateData.visitDate = admin.firestore.Timestamp.fromDate(parsedDate);
                }
            }
        }

        // Update the visit
        await visitRef.update(updateData);

        // Fetch the updated document
        const updatedDoc = await visitRef.get();
        const updated = updatedDoc.data();

        res.json({
            id: visitId,
            provider: updated?.provider || null,
            specialty: updated?.specialty || null,
            location: updated?.location || null,
            visitDate: updated?.visitDate?.toDate?.()?.toISOString() || null,
            updatedAt: updated?.updatedAt?.toDate?.()?.toISOString() || null,
        });
    } catch (error) {
        functions.logger.error('[care] Error updating visit metadata:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to update visit',
        });
    }
});
