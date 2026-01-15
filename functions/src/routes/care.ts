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
// =============================================================================

// =============================================================================
// HELPER: Get accepted incoming shares for caregiver
// =============================================================================

async function getAcceptedSharesForCaregiver(caregiverId: string) {
    // Query ALL shares for this caregiver first to debug potential status issues
    const sharesSnapshot = await getDb()
        .collection('shares')
        .where('caregiverUserId', '==', caregiverId)
        .get();

    const allShares = sharesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));

    // Log what we found for debugging
    functions.logger.info(`[care] Found ${allShares.length} total shares for caregiver ${caregiverId}`);
    allShares.forEach(s => {
        functions.logger.info(`[care] Share ${s.id}: status=${(s as any).status}, owner=${(s as any).ownerId}`);
    });

    // Filter for accepted ones
    const acceptedShares = sharesSnapshot.docs
        .filter((doc) => doc.data().status === 'accepted')
        .map((doc) => ({
            id: doc.id,
            ownerId: doc.data().ownerId,
            ownerName: doc.data().ownerName,
            ownerEmail: doc.data().ownerEmail,
        }));

    functions.logger.info(`[care] Returning ${acceptedShares.length} accepted shares`);
    return acceptedShares;
}

// =============================================================================
// HELPER: Validate caregiver has access to patient
// =============================================================================

async function validateCaregiverAccess(
    caregiverId: string,
    patientId: string
): Promise<boolean> {
    // Check direct share ID first (preferred)
    const shareId = `${patientId}_${caregiverId}`;
    const shareDoc = await getDb().collection('shares').doc(shareId).get();

    if (shareDoc.exists) {
        const share = shareDoc.data();
        if (share?.status === 'accepted') return true;
        functions.logger.warn(`[care] Access denied. Share ${shareId} exists but status is ${share?.status}`);
    } else {
        // Fallback: check query in case ID format is different
        const querySnapshot = await getDb()
            .collection('shares')
            .where('ownerId', '==', patientId)
            .where('caregiverUserId', '==', caregiverId)
            .where('status', '==', 'accepted')
            .limit(1)
            .get();

        if (!querySnapshot.empty) return true;
        functions.logger.warn(`[care] Access denied. No accepted share found for owner ${patientId} and caregiver ${caregiverId}`);
    }

    return false;
}

// =============================================================================
// HELPER: Get today's medication schedule for a user
// =============================================================================

async function getTodaysMedicationStatus(patientId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

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
        .where('date', '==', todayStr)
        .get();

    const logs = logsSnapshot.docs.map((doc) => doc.data());

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

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

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
                // Not logged - check if missed (past time by 1+ hour)
                const scheduledMins = scheduledHour * 60 + scheduledMin;
                const currentMins = currentHour * 60 + currentMinute;

                if (currentMins > scheduledMins + 60) {
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

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];

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
                .where('date', '==', todayStr)
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

            const logs = logsSnapshot.docs.map((doc) => doc.data());

            // Build schedule
            const now = new Date();
            const schedule = medications.flatMap((med) => {
                const times = reminderMap.get(med.id) || [];
                return times.map((time) => {
                    const log = logs.find(
                        (l) => l.medicationId === med.id && l.scheduledTime === time
                    );

                    let status: 'taken' | 'skipped' | 'pending' | 'missed' = 'pending';
                    let actionAt: string | undefined;

                    if (log) {
                        status = log.action;
                        actionAt = log.createdAt;
                    } else {
                        // Check if missed
                        const [hourStr, minStr] = time.split(':');
                        const scheduledMins =
                            parseInt(hourStr, 10) * 60 + parseInt(minStr, 10);
                        const currentMins =
                            now.getHours() * 60 + now.getMinutes();

                        if (currentMins > scheduledMins + 60) {
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
