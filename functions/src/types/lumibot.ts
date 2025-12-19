/**
 * LumiBot Type Definitions
 * 
 * Types for nudges, health logs, and related data structures.
 */

import { Timestamp } from 'firebase-admin/firestore';

// =============================================================================
// Nudge Types
// =============================================================================

export type NudgeType = 'condition_tracking' | 'medication_checkin' | 'introduction' | 'insight';

export type NudgeStatus = 'pending' | 'active' | 'snoozed' | 'completed' | 'dismissed';

export type NudgeActionType =
    | 'log_bp'
    | 'log_glucose'
    | 'log_weight'
    | 'log_symptom_check'
    | 'confirm_yes_no'
    | 'medication_check'
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
}

// =============================================================================
// Health Log Types
// =============================================================================

export type HealthLogType = 'bp' | 'glucose' | 'weight' | 'med_compliance' | 'symptom_check';

export type AlertLevel = 'normal' | 'caution' | 'warning' | 'emergency';

export type HealthLogSource = 'manual' | 'nudge' | 'quick_log';

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
    otherSymptoms?: string;
}

export type HealthLogValue =
    | BloodPressureValue
    | GlucoseValue
    | WeightValue
    | MedComplianceValue
    | SymptomCheckValue;

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
    source: HealthLogSource;
}

export interface HealthLogCreateInput {
    userId: string;
    nudgeId?: string;
    visitId?: string;
    type: HealthLogType;
    value: HealthLogValue;
    source: HealthLogSource;
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
