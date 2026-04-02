/**
 * Care Flow Type Definitions
 *
 * Types for the unified care flow system that replaces legacy nudge schedulers.
 * Care flows manage per-patient, per-condition lifecycles from diagnosis/medication
 * change through stabilization. They PRODUCE nudges — nudges/{id} collection,
 * nudgeNotificationService, and mobile UI all stay unchanged.
 */

import { Timestamp } from 'firebase-admin/firestore';

// =============================================================================
// Core Types
// =============================================================================

export type CareFlowCondition = 'htn' | 'dm' | 'copd' | 'asthma' | 'heart_failure';

export type CareFlowTrigger = 'new_medication' | 'new_diagnosis' | 'med_change' | 'med_restart';

export type CareFlowStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type CareFlowPhase = 'understand' | 'establish' | 'maintain' | 'coast';

export type TouchpointType =
    | 'educate'
    | 'side_effect_check'
    | 'log_prompt'
    | 'trend_summary'
    | 'celebration'
    | 'escalation'
    | 'combined';

export type TouchpointOutcome = 'pending' | 'positive' | 'neutral' | 'concerning' | 'no_response';

// =============================================================================
// Care Flow Touchpoint
// =============================================================================

export interface CareFlowTouchpoint {
    type: TouchpointType;
    scheduledAt: Timestamp;
    deliveredAt?: Timestamp;
    nudgeId?: string;
    responseReceived?: boolean;
    responseValue?: string;
    responseSummary?: string;
    outcome: TouchpointOutcome;
    phaseAtTime: CareFlowPhase;
}

// =============================================================================
// Care Flow Document (Firestore: careFlows/{id})
// =============================================================================

export interface CareFlow {
    id: string;
    userId: string;
    visitId: string;

    // Trigger
    trigger: CareFlowTrigger;
    condition: CareFlowCondition;

    // Clinical links
    medicationId?: string;
    medicationName?: string;
    diagnosisName?: string;

    // State
    status: CareFlowStatus;
    phase: CareFlowPhase;

    // Adaptive cadence
    cadence: CareFlowCadence;

    // Audit trail (append-only)
    touchpoints: CareFlowTouchpoint[];

    // Scheduling (indexed for flow engine query)
    nextTouchpointAt: Timestamp | null;
    nextTouchpointType: TouchpointType;

    // AI personalization context
    context: CareFlowContext;

    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface CareFlowCadence {
    currentIntervalDays: number;
    consecutiveNormalCount: number;
    lastEscalationReason?: string;
    patientRequestedSlowdown?: boolean;
}

export interface CareFlowContext {
    visitDate: string;
    providerName?: string;
    medicationDose?: string;
    medicationStartDate?: string;
    knownSideEffects?: string[];
    patientHistory?: string;
    reportedIssues: string[];
    /** All medications associated with this care flow (tracks additions over time) */
    medications?: string[];
    /** Skip next side-effect check (set when patient says "already talked to doctor") */
    skipNextSideEffectCheck?: boolean;
}

// =============================================================================
// Care Flow Template Types
// =============================================================================

export interface TemplateTouchpoint {
    day: number;
    type: TouchpointType;
    topic?: string;
    subtypes?: string[];
    /** Conditional: only include if this condition is met */
    condition?: 'has_new_med' | 'has_side_effects';
}

export interface TemplatePhaseConfig {
    duration?: { days: number };
    touchpoints?: TemplateTouchpoint[];
    defaultInterval?: number;
    monthlySummary?: boolean;
}

export interface CareFlowCadenceRules {
    /** Number of consecutive normal readings before decaying interval */
    decayAfterNormal: number;
    /** Multiplier applied to currentIntervalDays on decay */
    decayMultiplier: number;
    /** Maximum interval in days */
    maxInterval: number;
    /** Minimum interval in days */
    minInterval: number;
    /** Days of no response before escalation */
    escalateAfterNoResponse: number;
    /** BP systolic threshold for escalation (HTN-specific) */
    escalateBPSystolic?: number;
    /** BP diastolic threshold for escalation (HTN-specific) */
    escalateBPDiastolic?: number;
}

export interface CareFlowTemplate {
    condition: CareFlowCondition;
    /** Health log type used for skip-if-logged checks */
    metric: string;

    phases: {
        understand: TemplatePhaseConfig;
        establish: TemplatePhaseConfig;
        maintain: TemplatePhaseConfig;
        coast: TemplatePhaseConfig;
    };

    cadenceRules: CareFlowCadenceRules;
}

// =============================================================================
// Create Input (used by careFlowCreator)
// =============================================================================

export interface CareFlowCreateInput {
    userId: string;
    visitId: string;
    trigger: CareFlowTrigger;
    condition: CareFlowCondition;
    medicationId?: string;
    medicationName?: string;
    diagnosisName?: string;
    context: CareFlowContext;
}

// =============================================================================
// Engine Types
// =============================================================================

export interface AdvanceCareFlowsResult {
    flowsProcessed: number;
    touchpointsCreated: number;
    skippedAlreadyLogged: number;
    skippedPendingNudge: number;
    phaseTransitions: number;
    errors: number;
}

export interface CareFlowResponseUpdate {
    careFlowId: string;
    nudgeId: string;
    response: string;
    note?: string;
    sideEffects?: string[];
}
