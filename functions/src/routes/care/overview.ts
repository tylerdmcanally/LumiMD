import { Router } from 'express';
import * as functions from 'firebase-functions';
import { AuthRequest, requireAuth } from '../../middlewares/auth';

type CareOverviewAlert = {
    type: 'missed_dose' | 'overdue_action';
    priority: 'high' | 'medium' | 'low';
    message: string;
};

type MedicationStatusSummary = {
    total: number;
    taken: number;
    skipped: number;
    pending: number;
    missed: number;
};

type CareShareRecord = {
    ownerId: string;
    ownerName?: string | null;
    ownerEmail?: string | null;
};

type RegisterCareOverviewRoutesOptions = {
    getAcceptedSharesForCaregiver: (caregiverId: string) => Promise<CareShareRecord[]>;
    getPatientProfilesById: (
        patientIds: string[],
    ) => Promise<Map<string, Record<string, unknown>>>;
    resolveTimezone: (rawTimezone: unknown) => string;
    getTodaysMedicationStatusForPatients: (
        patientIds: string[],
        timezoneByPatient: Map<string, string>,
    ) => Promise<Map<string, MedicationStatusSummary>>;
    getPendingActionsAndOverdueAlertsForPatients: (patientIds: string[]) => Promise<{
        pendingActionsByPatient: Map<string, number>;
        overdueAlertsByPatient: Map<string, CareOverviewAlert[]>;
    }>;
    getLastActiveByPatient: (
        patientIds: string[],
        profilesById: Map<string, Record<string, unknown>>,
    ) => Promise<Map<string, string | null>>;
    emptyMedicationStatus: () => MedicationStatusSummary;
};

function asStringOrNull(raw: unknown): string | null {
    return typeof raw === 'string' && raw.trim().length > 0 ? raw : null;
}

export function registerCareOverviewRoutes(
    router: Router,
    options: RegisterCareOverviewRoutesOptions,
): void {
    const {
        getAcceptedSharesForCaregiver,
        getPatientProfilesById,
        resolveTimezone,
        getTodaysMedicationStatusForPatients,
        getPendingActionsAndOverdueAlertsForPatients,
        getLastActiveByPatient,
        emptyMedicationStatus,
    } = options;

    // GET /v1/care/overview
    // Aggregated data for all shared patients
    router.get('/overview', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;

            // Get all accepted shares where current user is caregiver
            const shares = await getAcceptedSharesForCaregiver(caregiverId);

            if (shares.length === 0) {
                res.set('Cache-Control', 'private, max-age=60');
                res.json({ patients: [] });
                return;
            }

            const patientIds = Array.from(
                new Set(shares.map((share) => share.ownerId).filter(Boolean)),
            );
            const profilesById = await getPatientProfilesById(patientIds);
            const timezoneByPatient = new Map<string, string>();
            patientIds.forEach((patientId) => {
                const profile = profilesById.get(patientId);
                timezoneByPatient.set(patientId, resolveTimezone(profile?.timezone));
            });

            const [
                medicationsTodayByPatient,
                { pendingActionsByPatient, overdueAlertsByPatient },
                lastActiveByPatient,
            ] = await Promise.all([
                getTodaysMedicationStatusForPatients(patientIds, timezoneByPatient),
                getPendingActionsAndOverdueAlertsForPatients(patientIds),
                getLastActiveByPatient(patientIds, profilesById),
            ]);

            const patientsData = shares.map((share) => {
                const patientId = share.ownerId;
                const profile = profilesById.get(patientId) ?? {};
                const medicationsToday =
                    medicationsTodayByPatient.get(patientId) ?? emptyMedicationStatus();
                const pendingActions = pendingActionsByPatient.get(patientId) ?? 0;

                const alerts: CareOverviewAlert[] = [];
                if (medicationsToday.missed > 0) {
                    alerts.push({
                        type: 'missed_dose',
                        priority: 'high',
                        message: `${medicationsToday.missed} missed dose${medicationsToday.missed > 1 ? 's' : ''} today`,
                    });
                }
                alerts.push(...(overdueAlertsByPatient.get(patientId) ?? []));

                const preferredName = asStringOrNull(profile.preferredName);
                const firstName = asStringOrNull(profile.firstName);
                const profileEmail = asStringOrNull(profile.email);

                return {
                    userId: patientId,
                    name: preferredName || firstName || share.ownerName || 'Unknown',
                    email: share.ownerEmail || profileEmail || null,
                    medicationsToday,
                    pendingActions,
                    alerts,
                    lastActive: lastActiveByPatient.get(patientId) ?? null,
                };
            });

            res.set('Cache-Control', 'private, max-age=60');
            res.json({ patients: patientsData });
        } catch (error) {
            functions.logger.error('[care] Error fetching overview:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch care overview',
            });
        }
    });
}
