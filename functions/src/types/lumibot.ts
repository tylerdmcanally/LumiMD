/**
 * LumiBot Type Definitions
 * 
 * Types for nudges, health logs, and related data structures.
 */

import { Timestamp } from 'firebase-admin/firestore';

// =============================================================================
// Nudge Types
// =============================================================================

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
    id?: string;
    userId: string;
    visitId: string;

    // Type & Context
    type: NudgeType;
    conditionId?: string;
    medicationId?: string;
    medicationName?: string;

    // Content
    title: string;
    message: string;
    actionType: NudgeActionType;

    // AI-Generated Content
    aiGenerated?: boolean;
    diagnosisExplanation?: string;  // Brief explanation of diagnosis for intro nudges
    personalizedContext?: string;   // Additional AI context for the message

    // Scheduling
    scheduledFor: Timestamp;
    sequenceDay: number;
    sequenceId: string;

    // State
    status: NudgeStatus;
    snoozedUntil?: Timestamp;
    completedAt?: Timestamp;
    dismissedAt?: Timestamp;
    responseValue?: string | Record<string, unknown>;
    feedback?: {
        helpful: boolean;
        note?: string;
        createdAt: Timestamp;
    };

    // Metadata
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface NudgeCreateInput {
    userId: string;
    visitId: string;
    type: NudgeType;
    conditionId?: string;
    medicationId?: string;
    medicationName?: string;
    title: string;
    message: string;
    actionType: NudgeActionType;
    scheduledFor: Date;
    sequenceDay: number;
    sequenceId: string;
    // AI-Generated Content
    aiGenerated?: boolean;
    diagnosisExplanation?: string;
    personalizedContext?: string;
}

// =============================================================================
// Health Log Types
// =============================================================================

export type HealthLogType = 'bp' | 'glucose' | 'weight' | 'med_compliance' | 'symptom_check' | 'steps' | 'heart_rate' | 'oxygen_saturation';

export type AlertLevel = 'normal' | 'caution' | 'warning' | 'emergency';

export type HealthLogSource = 'manual' | 'nudge' | 'quick_log' | 'healthkit';

// Value types for different log types
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

// HealthKit-sourced value types
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
    id?: string;
    userId: string;
    nudgeId?: string;
    visitId?: string;

    type: HealthLogType;
    value: HealthLogValue;

    // Safety
    alertLevel?: AlertLevel;
    alertShown?: boolean;
    alertMessage?: string;

    // Metadata
    createdAt: Timestamp;
    syncedAt?: Timestamp; // When the log was synced to our system (for HealthKit imports)
    source: HealthLogSource;
    sourceId?: string; // Unique identifier from the source for deduplication
}

export interface HealthLogCreateInput {
    userId: string;
    nudgeId?: string;
    visitId?: string;
    type: HealthLogType;
    value: HealthLogValue;
    source: HealthLogSource;
    sourceId?: string; // Unique identifier from the source for deduplication
    recordedAt?: string; // Original recording time (for HealthKit imports)
}

// =============================================================================
// API Response Types
// =============================================================================

export interface NudgeResponse {
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
    scheduledFor: string; // ISO date string
    sequenceDay: number;
    status: NudgeStatus;
    createdAt: string;
    feedback?: {
        helpful: boolean;
        note?: string;
        createdAt: string;
    };
}

export interface HealthLogResponse {
    id: string;
    userId: string;
    type: HealthLogType;
    value: HealthLogValue;
    alertLevel?: AlertLevel;
    alertMessage?: string;
    createdAt: string;
    source: HealthLogSource;
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

// =============================================================================
// Safety Response Types
// =============================================================================

export interface SafetyCheckResult {
    alertLevel?: AlertLevel;  // undefined for types with no universal threshold (e.g., weight)
    message: string;
    shouldShowAlert: boolean;
    emergencySymptoms?: string[];
}
