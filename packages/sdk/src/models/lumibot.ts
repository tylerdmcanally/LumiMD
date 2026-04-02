/**
 * LumiBot Models
 *
 * Types for nudges, health logs, and health tracking.
 */

export type NudgeType = 'condition_tracking' | 'medication_checkin' | 'introduction' | 'insight' | 'followup' | 'action_reminder';
export type NudgeStatus = 'pending' | 'active' | 'snoozed' | 'completed' | 'dismissed';
export type NudgeActionType =
    | 'log_bp'
    | 'log_glucose'
    | 'log_weight'
    | 'pickup_check'      // Got it / Not yet
    | 'started_check'     // Taking it / Not yet / Trouble
    | 'feeling_check'     // Good / Okay / Issues
    | 'side_effects'      // None / Mild / Concerning
    | 'symptom_check'
    | 'acknowledge'
    | 'view_insight'
    | 'action_followup_response';  // Done / Remind later / Not yet

export interface NudgeContext {
    visitId?: string;
    visitDate?: string;
    providerName?: string;
    diagnosisName?: string;
    medicationName?: string;
    medicationDose?: string;
    medicationStartDate?: string;
    daysSinceMedStart?: number;
    lastReading?: {
        value: string;
        date: string;
        alertLevel?: AlertLevel;
    };
    readingCount?: number;
    trackingReason?: string;
    // Action item follow-through context
    actionId?: string;
    actionDescription?: string;
    actionType?: string; // FollowUpCategory value
}

export interface Nudge {
    id: string;
    userId: string;
    visitId: string;
    type: NudgeType;
    conditionId?: string;
    medicationId?: string;
    medicationName?: string;
    title: string;
    message: string;
    actionType: NudgeActionType;
    scheduledFor: string;
    sequenceDay: number;
    status: NudgeStatus;
    snoozedUntil?: string;
    completedAt?: string;
    dismissedAt?: string;
    createdAt: string;
    context?: NudgeContext;
    /** Set when this nudge was created by the care flow engine */
    careFlowId?: string;
}

export type HealthLogType = 'bp' | 'glucose' | 'weight' | 'med_compliance' | 'symptom_check' | 'steps' | 'heart_rate' | 'oxygen_saturation';
export type HealthLogSource = 'manual' | 'nudge' | 'quick_log' | 'healthkit';
export type AlertLevel = 'normal' | 'caution' | 'warning' | 'emergency';

export interface BloodPressureValue {
    systolic: number;
    diastolic: number;
    pulse?: number;
}

export interface GlucoseValue {
    reading: number;
    timing?: 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random';
}

export interface WeightValue {
    weight: number;
    unit: 'lbs' | 'kg';
}

export interface StepsValue {
    count: number;
    date: string; // YYYY-MM-DD - the day this step count is for
}

export interface HeartRateValue {
    bpm: number;
    context?: 'resting' | 'active' | 'workout' | 'unknown';
}

export interface OxygenSaturationValue {
    percentage: number; // 0-100
}

export interface MedComplianceValue {
    medicationId?: string;
    medicationName: string;
    response: 'yes' | 'no' | 'having_issues';
    note?: string;
}

export interface SymptomCheckValue {
    breathingDifficulty: number;  // 1-5 scale
    swelling: 'none' | 'mild' | 'moderate' | 'severe';
    swellingLocations?: string[];
    energyLevel: number;  // 1-5 scale
    cough: boolean;
    orthopnea?: boolean;  // Needed extra pillows / woken up short of breath
    otherSymptoms?: string;
}

export type HealthLogValue =
    | BloodPressureValue
    | GlucoseValue
    | WeightValue
    | MedComplianceValue
    | SymptomCheckValue
    | StepsValue
    | HeartRateValue
    | OxygenSaturationValue;

export interface HealthLog {
    id: string;
    userId: string;
    type: HealthLogType;
    value: HealthLogValue;
    alertLevel?: AlertLevel;
    alertMessage?: string;
    createdAt: string;
    source: HealthLogSource;
    /** Unique identifier from the source (e.g., HealthKit sample ID) for deduplication */
    sourceId?: string;
}

export interface HealthLogSummary {
    type: HealthLogType;
    count: number;
    lastReading?: HealthLogValue;
    lastReadingAt?: string;
    averages?: Record<string, number>;
    trend?: 'improving' | 'stable' | 'worsening';
}

export interface HealthLogSummaryResponse {
    period: string;
    startDate: string;
    endDate: string;
    summaries: HealthLogSummary[];
}

// API Request Types
export interface CreateHealthLogRequest {
    type: HealthLogType;
    value: HealthLogValue;
    nudgeId?: string;
    visitId?: string;
    source?: HealthLogSource;
    /** Unique identifier from the source (e.g., HealthKit sample ID) for deduplication */
    sourceId?: string;
    /** Timestamp of original reading (for HealthKit imports) */
    recordedAt?: string;
    symptoms?: string[];
}

export interface CreateHealthLogResponse extends HealthLog {
    shouldShowAlert?: boolean;
}

export interface TrendInsight {
    type: 'weight' | 'bp' | 'glucose';
    pattern: string;
    severity: 'positive' | 'info' | 'attention' | 'concern';
    title: string;
    message: string;
    data: {
        currentValue?: number;
        previousValue?: number;
        changeAmount?: number;
        changePercent?: number;
        daysAnalyzed: number;
        trend?: 'up' | 'down' | 'stable';
    };
}

export interface HealthInsightsResponse {
    insights: TrendInsight[];
    period: string;
    logCount: number;
    message?: string;
}

export interface UpdateNudgeRequest {
    status: 'completed' | 'snoozed' | 'dismissed';
    snoozeDays?: number;
    responseValue?: string | Record<string, unknown>;
}

export interface RespondToNudgeRequest {
    response:
        | 'got_it' | 'not_yet' | 'taking_it' | 'having_trouble'
        | 'good' | 'okay' | 'issues'
        | 'none' | 'mild' | 'concerning'
        | 'took_it' | 'skipped_it'
        | 'done' | 'remind_later'
        | 'too_frequent' | 'already_talked_to_doctor';
    note?: string;
    sideEffects?: string[]; // Side effect IDs when reporting issues
}

export interface NudgeUpdateResponse {
    id: string;
    status: string;
    message: string;
}

// =============================================================================
// Medication Reminder Types
// =============================================================================

export type ReminderTimingMode = 'local' | 'anchor';
export type ReminderCriticality = 'standard' | 'time_sensitive';

export interface MedicationReminder {
    id: string;
    userId: string;
    medicationId: string;
    medicationName: string;
    medicationDose?: string;
    times: string[];  // HH:MM format in 24-hour
    enabled: boolean;
    timingMode?: ReminderTimingMode;
    anchorTimezone?: string | null;
    criticality?: ReminderCriticality;
    lastSentAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateMedicationReminderRequest {
    medicationId: string;
    times: string[];  // HH:MM format
    timingMode?: ReminderTimingMode;
    anchorTimezone?: string | null;
}

export interface UpdateMedicationReminderRequest {
    times?: string[];
    enabled?: boolean;
    timingMode?: ReminderTimingMode;
    anchorTimezone?: string | null;
}

export interface MedicationRemindersResponse {
    reminders: MedicationReminder[];
}

// =============================================================================
// Visit Walkthrough Types (Phase 2)
// =============================================================================

export interface WalkthroughDiagnosis {
    name: string;
    isNew: boolean;
    plainEnglish: string;
}

export interface WalkthroughMedicationStarted {
    name: string;
    dose: string;
    frequency: string;
    plainEnglish: string;
    disclaimer: string;
}

export interface WalkthroughMedicationStopped {
    name: string;
    plainEnglish: string;
}

export interface WalkthroughMedicationChanged {
    name: string;
    change: string;
    plainEnglish: string;
}

export interface WalkthroughActionItem {
    description: string;
    dueDate?: string;
    type?: string;
}

export interface WalkthroughTrackingPlan {
    what: string;
    why: string;
    when: string;
}

export interface WalkthroughFollowUp {
    description: string;
    dueBy?: string;
}

export interface WalkthroughSuggestedQuestion {
    question: string;
    answer: string;
    source: 'visit_education' | 'general';
}

export interface VisitWalkthrough {
    generatedAt: string;
    steps: {
        whatHappened: {
            title: string;
            diagnoses: WalkthroughDiagnosis[];
            keyTopics: string[];
            flagPrompt: string;
        };
        whatChanged: {
            title: string;
            medicationsStarted: WalkthroughMedicationStarted[];
            medicationsStopped: WalkthroughMedicationStopped[];
            medicationsChanged: WalkthroughMedicationChanged[];
            newActionItems: WalkthroughActionItem[];
        };
        whatsNext: {
            title: string;
            trackingPlans: WalkthroughTrackingPlan[];
            followUps: WalkthroughFollowUp[];
            closingMessage: string;
        };
    };
    suggestedQuestions: WalkthroughSuggestedQuestion[];
}

// =============================================================================
// Care Flow Types
// =============================================================================

export type CareFlowCondition = 'htn' | 'dm' | 'copd' | 'asthma' | 'heart_failure';
export type CareFlowPhase = 'understand' | 'establish' | 'maintain' | 'coast';
export type CareFlowStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface CareFlowSummary {
    id: string;
    condition: CareFlowCondition;
    phase: CareFlowPhase;
    status: CareFlowStatus;
    weekNumber: number;
    consecutiveNormalCount: number;
    medicationName?: string;
    createdAt: string;
}

export interface VisitAskRequest {
    question: string;
}

export interface VisitAskResponse {
    answer: string;
    source: 'visit_education' | 'visit_summary' | 'ai_generated';
    disclaimer: string;
}
