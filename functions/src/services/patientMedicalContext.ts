/**
 * Patient Medical Context
 * 
 * Stores accumulated medical history for each patient, enabling AI-powered
 * delta analysis to determine what's new or changed at each visit.
 * 
 * This context is NOT surfaced directly to patients - it's used internally
 * to power intelligent nudge generation.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { PatientContextDomainService } from './domain/patientContexts/PatientContextDomainService';
import { FirestorePatientContextRepository } from './repositories/patientContexts/FirestorePatientContextRepository';

// =============================================================================
// Type Definitions
// =============================================================================

export type ConditionStatus = 'active' | 'resolved' | 'monitoring';

export interface PatientCondition {
    id: string;                  // Normalized condition ID (e.g., 'hypertension')
    name: string;                // Patient-friendly name
    diagnosedAt: admin.firestore.Timestamp;
    sourceVisitId: string;       // Visit ID where first identified
    status: ConditionStatus;
    notes?: string;              // Any relevant context
}

export interface PatientMedication {
    id: string;                  // Firestore doc ID from medications collection
    name: string;                // Medication name
    dose?: string;
    frequency?: string;
    startedAt: admin.firestore.Timestamp;
    forCondition?: string;       // Links to condition ID
    active: boolean;
}

export type TrackingType = 'bp' | 'glucose' | 'weight' | 'symptoms';

export interface ActiveTracking {
    type: TrackingType;
    enabledAt: admin.firestore.Timestamp;
    sourceConditionId?: string;  // Why tracking was enabled
    lastLoggedAt?: admin.firestore.Timestamp;
}

export interface PatientMedicalContext {
    userId: string;

    // Accumulated conditions from all visits
    conditions: PatientCondition[];

    // Current medications (synced with meds collection)
    medications: PatientMedication[];

    // What the patient is actively tracking
    activeTracking: ActiveTracking[];

    // Visit history (for delta analysis)
    visitHistory: {
        visitId: string;
        visitDate: admin.firestore.Timestamp;
        diagnosesDiscussed: string[];
        medicationsStarted: string[];
        medicationsChanged: string[];
        medicationsStopped: string[];
    }[];

    // Metadata
    createdAt: admin.firestore.Timestamp;
    updatedAt: admin.firestore.Timestamp;
}

type PatientMedicalContextDependencies = {
    patientContextService?: Pick<
        PatientContextDomainService,
        'getForUser' | 'setForUser' | 'updateForUser'
    >;
};

function buildDefaultDependencies(): Required<PatientMedicalContextDependencies> {
    return {
        patientContextService: new PatientContextDomainService(
            new FirestorePatientContextRepository(admin.firestore()),
        ),
    };
}

function resolveDependencies(
    overrides: PatientMedicalContextDependencies,
): Required<PatientMedicalContextDependencies> {
    const defaults = buildDefaultDependencies();
    return {
        patientContextService: overrides.patientContextService ?? defaults.patientContextService,
    };
}

// =============================================================================
// Context Operations
// =============================================================================

/**
 * Get or create patient medical context
 */
export async function getPatientMedicalContext(
    userId: string,
    dependencyOverrides: PatientMedicalContextDependencies = {},
): Promise<PatientMedicalContext | null> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const context = await dependencies.patientContextService.getForUser(userId);
    return context as PatientMedicalContext | null;
}

/**
 * Create initial patient context (called when first visit is processed)
 */
export async function createPatientMedicalContext(
    userId: string,
    dependencyOverrides: PatientMedicalContextDependencies = {},
): Promise<PatientMedicalContext> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const now = admin.firestore.Timestamp.now();

    const context: PatientMedicalContext = {
        userId,
        conditions: [],
        medications: [],
        activeTracking: [],
        visitHistory: [],
        createdAt: now,
        updatedAt: now,
    };

    await dependencies.patientContextService.setForUser(userId, context);

    functions.logger.info(`[PatientContext] Created context for user ${userId}`);

    return context;
}

/**
 * Update patient context after a visit is processed
 */
export interface VisitContextUpdate {
    visitId: string;
    visitDate: Date;
    diagnoses: string[];
    medicationsStarted: { name: string; dose?: string; frequency?: string }[];
    medicationsChanged: { name: string; change?: string }[];
    medicationsStopped: string[];
}

export async function updatePatientContextFromVisit(
    userId: string,
    update: VisitContextUpdate,
    dependencyOverrides: PatientMedicalContextDependencies = {},
): Promise<PatientMedicalContext> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const now = admin.firestore.Timestamp.now();
    const visitTimestamp = admin.firestore.Timestamp.fromDate(update.visitDate);

    // Get or create context
    let context = await getPatientMedicalContext(userId, dependencyOverrides);
    if (!context) {
        context = await createPatientMedicalContext(userId, dependencyOverrides);
    }

    // Add new conditions (deduplicate by ID)
    const existingConditionIds = new Set(context.conditions.map(c => c.id));
    for (const diagnosis of update.diagnoses) {
        const conditionId = normalizeConditionId(diagnosis);
        if (!existingConditionIds.has(conditionId)) {
            context.conditions.push({
                id: conditionId,
                name: diagnosis,
                diagnosedAt: visitTimestamp,
                sourceVisitId: update.visitId,
                status: 'active',
            });
            existingConditionIds.add(conditionId);
        }
    }

    // Add new medications
    for (const med of update.medicationsStarted) {
        context.medications.push({
            id: `${update.visitId}_${med.name}`,
            name: med.name,
            dose: med.dose,
            frequency: med.frequency,
            startedAt: visitTimestamp,
            active: true,
        });
    }

    // Mark stopped medications as inactive
    for (const medName of update.medicationsStopped) {
        const med = context.medications.find(
            m => m.name.toLowerCase() === medName.toLowerCase() && m.active
        );
        if (med) {
            med.active = false;
        }
    }

    // Add to visit history
    context.visitHistory.push({
        visitId: update.visitId,
        visitDate: visitTimestamp,
        diagnosesDiscussed: update.diagnoses,
        medicationsStarted: update.medicationsStarted.map(m => m.name),
        medicationsChanged: update.medicationsChanged.map(m => m.name),
        medicationsStopped: update.medicationsStopped,
    });

    // Keep only last 10 visits in history
    if (context.visitHistory.length > 10) {
        context.visitHistory = context.visitHistory.slice(-10);
    }

    context.updatedAt = now;

    // Save
    await dependencies.patientContextService.setForUser(userId, context, { merge: true });

    functions.logger.info(`[PatientContext] Updated context for user ${userId}`, {
        newConditions: update.diagnoses.length,
        newMeds: update.medicationsStarted.length,
    });

    return context;
}

/**
 * Enable tracking for a patient
 */
export async function enableTracking(
    userId: string,
    trackingType: TrackingType,
    sourceConditionId?: string,
    dependencyOverrides: PatientMedicalContextDependencies = {},
): Promise<void> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const now = admin.firestore.Timestamp.now();

    await dependencies.patientContextService.updateForUser(userId, {
        activeTracking: admin.firestore.FieldValue.arrayUnion({
            type: trackingType,
            enabledAt: now,
            sourceConditionId,
        }),
        updatedAt: now,
    });

    functions.logger.info(`[PatientContext] Enabled ${trackingType} tracking for user ${userId}`);
}

/**
 * Record that a log entry was made
 */
export async function recordTrackingLog(
    userId: string,
    trackingType: TrackingType,
    dependencyOverrides: PatientMedicalContextDependencies = {},
): Promise<void> {
    const dependencies = resolveDependencies(dependencyOverrides);
    const context = await getPatientMedicalContext(userId, dependencyOverrides);
    if (!context) return;

    const now = admin.firestore.Timestamp.now();

    // Find and update the tracking entry
    const tracking = context.activeTracking.find(t => t.type === trackingType);
    if (tracking) {
        tracking.lastLoggedAt = now;
        await dependencies.patientContextService.updateForUser(userId, {
            activeTracking: context.activeTracking,
            updatedAt: now,
        });
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Normalize a diagnosis string to a condition ID
 */
function normalizeConditionId(diagnosis: string): string {
    const lower = diagnosis.toLowerCase().trim();

    // Map common diagnoses to standard IDs
    const mappings: Record<string, string> = {
        'hypertension': 'hypertension',
        'htn': 'hypertension',
        'high blood pressure': 'hypertension',
        'elevated blood pressure': 'hypertension',

        'diabetes': 'diabetes',
        'type 2 diabetes': 'diabetes',
        'type 1 diabetes': 'diabetes',
        'dm': 'diabetes',
        't2dm': 'diabetes',

        'heart failure': 'heart_failure',
        'chf': 'heart_failure',
        'congestive heart failure': 'heart_failure',

        'atrial fibrillation': 'afib',
        'afib': 'afib',
        'a-fib': 'afib',

        'copd': 'copd',
        'emphysema': 'copd',
        'chronic bronchitis': 'copd',
    };

    // Check for exact match first
    if (mappings[lower]) {
        return mappings[lower];
    }

    // Check for partial matches
    for (const [key, value] of Object.entries(mappings)) {
        if (lower.includes(key) || key.includes(lower)) {
            return value;
        }
    }

    // Return slugified version of the diagnosis
    return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/**
 * Get a summary for AI delta analysis
 */
export function getContextSummaryForAI(context: PatientMedicalContext): {
    existingConditions: string[];
    currentMedications: string[];
    activeTracking: string[];
    recentlyLogged: string[];  // Tracking types logged in last 24h
    conditionDiagnosedDates: Record<string, string>; // conditionId -> "X days ago"
} {
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

    // Find tracking types that were logged within last 24 hours
    const recentlyLogged = context.activeTracking
        .filter(t => {
            if (!t.lastLoggedAt) return false;
            return t.lastLoggedAt.toMillis() > twentyFourHoursAgo;
        })
        .map(t => t.type);

    // Calculate how long ago each condition was diagnosed
    const conditionDiagnosedDates: Record<string, string> = {};
    for (const condition of context.conditions) {
        if (condition.status !== 'active') continue;
        const diagnosedMs = condition.diagnosedAt.toMillis();
        const daysAgo = Math.floor((now - diagnosedMs) / (24 * 60 * 60 * 1000));
        if (daysAgo === 0) {
            conditionDiagnosedDates[condition.id] = 'today';
        } else if (daysAgo === 1) {
            conditionDiagnosedDates[condition.id] = '1 day ago';
        } else if (daysAgo < 7) {
            conditionDiagnosedDates[condition.id] = `${daysAgo} days ago`;
        } else if (daysAgo < 30) {
            conditionDiagnosedDates[condition.id] = `${Math.floor(daysAgo / 7)} weeks ago`;
        } else {
            conditionDiagnosedDates[condition.id] = `${Math.floor(daysAgo / 30)} months ago`;
        }
    }

    return {
        existingConditions: context.conditions
            .filter(c => c.status === 'active')
            .map(c => c.name),
        currentMedications: context.medications
            .filter(m => m.active)
            .map(m => [m.name, m.dose, m.frequency].filter(Boolean).join(' ')),
        activeTracking: context.activeTracking.map(t => t.type),
        recentlyLogged,
        conditionDiagnosedDates,
    };
}
