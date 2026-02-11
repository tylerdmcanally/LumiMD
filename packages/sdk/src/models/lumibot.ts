/**
 * LumiBot Models
 *
 * Types for nudges, health logs, and health tracking.
 */

export type NudgeType = 'condition_tracking' | 'medication_checkin' | 'introduction' | 'insight' | 'followup';
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
    | 'view_insight';

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

export interface UpdateNudgeRequest {
    status: 'completed' | 'snoozed' | 'dismissed';
    snoozeDays?: number;
    responseValue?: string | Record<string, unknown>;
}

export interface RespondToNudgeRequest {
    response: 'got_it' | 'not_yet' | 'taking_it' | 'having_trouble' | 'good' | 'okay' | 'issues' | 'none' | 'mild' | 'concerning';
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

export interface MedicationReminder {
    id: string;
    userId: string;
    medicationId: string;
    medicationName: string;
    medicationDose?: string;
    times: string[];  // HH:MM format in 24-hour
    enabled: boolean;
    lastSentAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateMedicationReminderRequest {
    medicationId: string;
    times: string[];  // HH:MM format
}

export interface UpdateMedicationReminderRequest {
    times?: string[];
    enabled?: boolean;
}

export interface MedicationRemindersResponse {
    reminders: MedicationReminder[];
}
