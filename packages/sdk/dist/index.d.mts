import * as _tanstack_react_query from '@tanstack/react-query';
import { UseQueryOptions, QueryKey } from '@tanstack/react-query';
import * as _tanstack_query_core from '@tanstack/query-core';
import * as firebase_firestore from 'firebase/firestore';
import { FirestoreError, QueryDocumentSnapshot, DocumentData, Query, DocumentReference } from 'firebase/firestore';

/**
 * Visit Model
 */
interface Visit {
    id: string;
    userId: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    processedAt?: string | null;
    provider?: string | null;
    location?: string | null;
    specialty?: string | null;
    status?: string;
    processingStatus?: string;
    summary?: string | null;
    transcript?: string | null;
    transcriptText?: string | null;
    notes?: string | null;
    visitDate?: string | null;
    diagnoses?: string[];
    medications?: MedicationChanges;
    nextSteps?: string[];
    imaging?: string[];
    tags?: string[];
    folders?: string[];
    education?: VisitEducation;
    audioUrl?: string | null;
    duration?: number | null;
    [key: string]: unknown;
}
interface MedicationChanges {
    started?: MedicationEntry[];
    stopped?: MedicationEntry[];
    changed?: MedicationEntry[];
}
interface MedicationEntry {
    name: string;
    dose?: string;
    frequency?: string;
    note?: string;
    display?: string;
    original?: string;
    needsConfirmation?: boolean;
    status?: 'matched' | 'fuzzy' | 'unverified';
    warning?: MedicationWarning[];
}
interface MedicationWarning {
    type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
    severity: 'critical' | 'high' | 'moderate' | 'low';
    message: string;
    details: string;
    recommendation: string;
    conflictingMedication?: string;
    allergen?: string;
}
interface VisitEducation {
    diagnoses?: Array<{
        name: string;
        summary?: string;
        watchFor?: string;
    }>;
    medications?: Array<{
        name: string;
        purpose?: string;
        usage?: string;
        sideEffects?: string;
        whenToCallDoctor?: string;
    }>;
}

/**
 * Medication Model
 */
interface Medication {
    id: string;
    userId: string;
    name: string;
    nameLower?: string;
    canonicalName?: string;
    dose?: string | null;
    frequency?: string | null;
    status?: string;
    active?: boolean;
    startedAt?: string | null;
    stoppedAt?: string | null;
    changedAt?: string | null;
    source?: 'manual' | 'visit';
    sourceVisitId?: string | null;
    visitId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    lastSyncedAt?: string | null;
    notes?: string | null;
    display?: string | null;
    originalText?: string | null;
    needsConfirmation?: boolean;
    medicationStatus?: 'matched' | 'fuzzy' | 'unverified' | null;
    medicationWarning?: Array<{
        type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
        severity: 'critical' | 'high' | 'moderate' | 'low';
        message: string;
        details: string;
        recommendation: string;
        conflictingMedication?: string;
        allergen?: string;
    }> | null;
    [key: string]: unknown;
}

/**
 * Action Item Model
 */
interface ActionItem {
    id: string;
    userId: string;
    description: string;
    completed: boolean;
    completedAt?: string | null;
    dueAt?: string | null;
    visitId?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    source?: 'manual' | 'visit';
    notes?: string | null;
    [key: string]: unknown;
}

/**
 * User Profile Model
 */
interface UserProfile {
    id: string;
    email?: string;
    displayName?: string;
    allergies?: string[];
    tags?: string[];
    folders?: string[];
    createdAt?: string | null;
    updatedAt?: string | null;
    trialStartedAt?: string | null;
    trialEndsAt?: string | null;
    subscriptionStatus?: 'trial' | 'active' | 'expired' | 'cancelled';
    subscriptionPlatform?: 'ios' | null;
    subscriptionExpiresAt?: string | null;
    originalTransactionId?: string | null;
    [key: string]: unknown;
}

/**
 * API Error Model
 */
interface ApiError extends Error {
    status?: number;
    code?: string;
    userMessage?: string;
    details?: unknown;
    body?: unknown;
    retriable?: boolean;
}
declare function isApiError(error: unknown): error is ApiError;

/**
 * Share and ShareInvite Models
 */
interface Share {
    id: string;
    ownerId: string;
    caregiverUserId: string;
    caregiverEmail: string;
    role: 'viewer';
    status: 'pending' | 'accepted' | 'revoked';
    message?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    acceptedAt?: string | null;
    type?: 'outgoing' | 'incoming';
}
interface ShareInvite {
    id: string;
    ownerId: string;
    ownerEmail: string;
    ownerName: string;
    inviteeEmail: string;
    role: 'viewer';
    status: 'pending' | 'accepted' | 'expired';
    message?: string | null;
    createdAt?: string | null;
    expiresAt?: string | null;
    acceptedAt?: string | null;
}

/**
 * LumiBot Models
 *
 * Types for nudges, health logs, and health tracking.
 */
type NudgeType = 'condition_tracking' | 'medication_checkin' | 'introduction' | 'insight';
type NudgeStatus = 'pending' | 'active' | 'snoozed' | 'completed' | 'dismissed';
type NudgeActionType = 'log_bp' | 'log_glucose' | 'log_weight' | 'confirm_yes_no' | 'medication_check' | 'symptom_check' | 'acknowledge' | 'view_insight';
interface Nudge {
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
    createdAt: string;
}
type HealthLogType = 'bp' | 'glucose' | 'weight' | 'med_compliance' | 'symptom_check';
type AlertLevel = 'normal' | 'caution' | 'warning' | 'emergency';
interface BloodPressureValue {
    systolic: number;
    diastolic: number;
    pulse?: number;
}
interface GlucoseValue {
    reading: number;
    timing?: 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random';
}
interface WeightValue {
    weight: number;
    unit: 'lbs' | 'kg';
}
interface MedComplianceValue {
    medicationId?: string;
    medicationName: string;
    response: 'yes' | 'no' | 'having_issues';
    note?: string;
}
interface SymptomCheckValue {
    symptoms: string[];
    severity?: 'mild' | 'moderate' | 'severe';
    note?: string;
}
type HealthLogValue = BloodPressureValue | GlucoseValue | WeightValue | MedComplianceValue | SymptomCheckValue;
interface HealthLog {
    id: string;
    userId: string;
    type: HealthLogType;
    value: HealthLogValue;
    alertLevel?: AlertLevel;
    alertMessage?: string;
    createdAt: string;
    source: 'manual' | 'nudge' | 'quick_log';
}
interface HealthLogSummary {
    type: HealthLogType;
    count: number;
    lastReading?: HealthLogValue;
    lastReadingAt?: string;
    averages?: Record<string, number>;
    trend?: 'improving' | 'stable' | 'worsening';
}
interface HealthLogSummaryResponse {
    period: string;
    startDate: string;
    endDate: string;
    summaries: HealthLogSummary[];
}
interface CreateHealthLogRequest {
    type: HealthLogType;
    value: HealthLogValue;
    nudgeId?: string;
    visitId?: string;
    source?: 'manual' | 'nudge' | 'quick_log';
    symptoms?: string[];
}
interface CreateHealthLogResponse extends HealthLog {
    shouldShowAlert?: boolean;
}
interface UpdateNudgeRequest {
    status: 'completed' | 'snoozed' | 'dismissed';
    snoozeDays?: number;
    responseValue?: string | Record<string, unknown>;
}
interface RespondToNudgeRequest {
    response: 'yes' | 'no' | 'good' | 'having_issues';
    note?: string;
    sideEffects?: string[];
}
interface NudgeUpdateResponse {
    id: string;
    status: string;
    message: string;
}
interface MedicationReminder {
    id: string;
    userId: string;
    medicationId: string;
    medicationName: string;
    medicationDose?: string;
    times: string[];
    enabled: boolean;
    lastSentAt?: string;
    createdAt: string;
    updatedAt: string;
}
interface CreateMedicationReminderRequest {
    medicationId: string;
    times: string[];
}
interface UpdateMedicationReminderRequest {
    times?: string[];
    enabled?: boolean;
}
interface MedicationRemindersResponse {
    reminders: MedicationReminder[];
}

/**
 * Shared API Client
 * Unified HTTP client with retry logic, timeout handling, and error mapping
 */

interface ApiClientConfig {
    baseUrl: string;
    getAuthToken: () => Promise<string | null>;
    enableLogging?: boolean;
}
declare function createApiClient(config: ApiClientConfig): {
    health: () => Promise<{
        status: string;
    }>;
    visits: {
        list: (params?: {
            limit?: number;
            sort?: "asc" | "desc";
        }) => Promise<Visit[]>;
        get: (id: string) => Promise<Visit>;
        create: (data: Partial<Visit>) => Promise<Visit>;
        update: (id: string, data: Partial<Visit>) => Promise<Visit>;
        delete: (id: string) => Promise<void>;
        retry: (id: string) => Promise<Visit>;
    };
    actions: {
        list: () => Promise<ActionItem[]>;
        get: (id: string) => Promise<ActionItem>;
        create: (data: Partial<ActionItem>) => Promise<ActionItem>;
        update: (id: string, data: Partial<ActionItem>) => Promise<ActionItem>;
        delete: (id: string) => Promise<void>;
    };
    medications: {
        list: () => Promise<Medication[]>;
        get: (id: string) => Promise<Medication>;
        create: (data: Partial<Medication>) => Promise<Medication>;
        update: (id: string, data: Partial<Medication>) => Promise<Medication>;
        delete: (id: string) => Promise<void>;
    };
    user: {
        getProfile: () => Promise<UserProfile>;
        updateProfile: (data: Partial<UserProfile>) => Promise<UserProfile>;
        registerPushToken: (data: {
            token: string;
            platform: string;
        }) => Promise<void>;
        unregisterPushToken: (data: {
            token: string;
        }) => Promise<void>;
        exportData: () => Promise<any>;
        deleteAccount: () => Promise<void>;
    };
    shares: {
        list: () => Promise<Share[]>;
        get: (id: string) => Promise<Share>;
        create: (data: {
            caregiverEmail: string;
            message?: string;
        }) => Promise<Share | ShareInvite>;
        update: (id: string, data: {
            status: "accepted" | "revoked";
        }) => Promise<Share>;
        acceptInvite: (token: string) => Promise<Share>;
        getInvites: () => Promise<ShareInvite[]>;
        cancelInvite: (inviteId: string) => Promise<ShareInvite>;
    };
    nudges: {
        list: () => Promise<Nudge[]>;
        history: (limit?: number) => Promise<Nudge[]>;
        update: (id: string, data: UpdateNudgeRequest) => Promise<NudgeUpdateResponse>;
        respond: (id: string, data: RespondToNudgeRequest) => Promise<NudgeUpdateResponse>;
    };
    healthLogs: {
        list: (params?: {
            type?: string;
            limit?: number;
            startDate?: string;
            endDate?: string;
        }) => Promise<HealthLog[]>;
        create: (data: CreateHealthLogRequest) => Promise<CreateHealthLogResponse>;
        delete: (id: string) => Promise<void>;
        summary: (days?: number) => Promise<HealthLogSummaryResponse>;
        export: (days?: number) => Promise<any>;
        providerReport: () => Promise<Blob>;
    };
    medicationReminders: {
        list: () => Promise<{
            reminders: MedicationReminder[];
        }>;
        create: (data: CreateMedicationReminderRequest) => Promise<MedicationReminder>;
        update: (id: string, data: UpdateMedicationReminderRequest) => Promise<MedicationReminder>;
        delete: (id: string) => Promise<void>;
    };
};
type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Query Keys for cache management
 */
declare const queryKeys: {
    visits: readonly ["visits"];
    visit: (id: string) => readonly ["visits", string];
    actions: readonly ["actions"];
    action: (id: string) => readonly ["actions", string];
    medications: readonly ["medications"];
    medication: (id: string) => readonly ["medications", string];
    profile: readonly ["profile"];
    nudges: readonly ["nudges"];
    healthLogs: readonly ["healthLogs"];
    healthLogsSummary: readonly ["healthLogs", "summary"];
};
declare function createApiHooks(api: ApiClient): {
    useVisits: (options?: Omit<UseQueryOptions<Visit[], Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<Visit[], Error>;
    useVisit: (id: string, options?: Omit<UseQueryOptions<Visit, Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<Visit, Error>;
    useLatestVisit: (options?: Omit<UseQueryOptions<Visit | null, Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<Visit | null, Error>;
    useActionItems: (options?: Omit<UseQueryOptions<ActionItem[], Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<ActionItem[], Error>;
    usePendingActions: (options?: Omit<UseQueryOptions<ActionItem[], Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<ActionItem[], Error>;
    useMedications: (options?: Omit<UseQueryOptions<Medication[], Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<Medication[], Error>;
    useActiveMedications: (options?: Omit<UseQueryOptions<Medication[], Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<Medication[], Error>;
    useUserProfile: (options?: Omit<UseQueryOptions<UserProfile, Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<UserProfile, Error>;
    useNudges: (options?: Omit<UseQueryOptions<Nudge[], Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<Nudge[], Error>;
    useHealthLogs: (params?: {
        type?: string;
        limit?: number;
    }, options?: Omit<UseQueryOptions<HealthLog[], Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<HealthLog[], Error>;
    useHealthLogsSummary: (days?: number, options?: Omit<UseQueryOptions<HealthLogSummaryResponse, Error>, "queryKey" | "queryFn">) => _tanstack_react_query.UseQueryResult<HealthLogSummaryResponse, Error>;
    useUpdateNudge: () => _tanstack_react_query.UseMutationResult<NudgeUpdateResponse, Error, {
        id: string;
        data: UpdateNudgeRequest;
    }, unknown>;
    useRespondToNudge: () => _tanstack_react_query.UseMutationResult<NudgeUpdateResponse, Error, {
        id: string;
        data: RespondToNudgeRequest;
    }, unknown>;
    useCreateHealthLog: () => _tanstack_react_query.UseMutationResult<CreateHealthLogResponse, Error, CreateHealthLogRequest, unknown>;
};

type FirestoreModule = typeof firebase_firestore;
declare function configureFirestoreRealtime(module: FirestoreModule): void;
type FirestoreCollectionOptions<T> = {
    transform?: (items: T[]) => T[];
    enabled?: boolean;
    staleTimeMs?: number;
    onError?: (error: FirestoreError) => void;
    queryOptions?: Omit<UseQueryOptions<T[], Error, T[], QueryKey>, 'queryKey' | 'queryFn'>;
};
type FirestoreDocumentOptions<T> = {
    enabled?: boolean;
    staleTimeMs?: number;
    onError?: (error: FirestoreError) => void;
    queryOptions?: Omit<UseQueryOptions<T | null, Error, T | null, QueryKey>, 'queryKey' | 'queryFn'>;
};
declare function convertValue(value: unknown): unknown;
declare function serializeDoc<T extends {
    id: string;
}>(snapshot: QueryDocumentSnapshot<DocumentData>): T;
declare function sortByTimestampDescending<T extends {
    updatedAt?: string | null;
    createdAt?: string | null;
}>(items: T[]): T[];
declare function useFirestoreCollection<T extends {
    id: string;
}>(queryRef: Query<DocumentData> | null, key: QueryKey, options?: FirestoreCollectionOptions<T>): _tanstack_react_query.UseQueryResult<T[], Error>;
declare function useFirestoreDocument<T extends {
    id: string;
}>(docRef: DocumentReference<DocumentData> | null, key: QueryKey, options?: FirestoreDocumentOptions<T>): _tanstack_react_query.UseQueryResult<_tanstack_query_core.NoInfer<T | null>, Error>;

export { type ActionItem, type AlertLevel, type ApiClient, type ApiClientConfig, type ApiError, type BloodPressureValue, type CreateHealthLogRequest, type CreateHealthLogResponse, type CreateMedicationReminderRequest, type FirestoreCollectionOptions, type FirestoreDocumentOptions, type GlucoseValue, type HealthLog, type HealthLogSummary, type HealthLogSummaryResponse, type HealthLogType, type HealthLogValue, type MedComplianceValue, type Medication, type MedicationChanges, type MedicationEntry, type MedicationReminder, type MedicationRemindersResponse, type MedicationWarning, type Nudge, type NudgeActionType, type NudgeStatus, type NudgeType, type NudgeUpdateResponse, type RespondToNudgeRequest, type Share, type ShareInvite, type SymptomCheckValue, type UpdateMedicationReminderRequest, type UpdateNudgeRequest, type UserProfile, type Visit, type VisitEducation, type WeightValue, configureFirestoreRealtime, convertValue, createApiClient, createApiHooks, isApiError, queryKeys, serializeDoc, sortByTimestampDescending, useFirestoreCollection, useFirestoreDocument };
