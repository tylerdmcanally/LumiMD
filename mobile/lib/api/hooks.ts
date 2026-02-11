/**
 * React Query Hooks for Mobile
 * Uses React Native Firebase for realtime listeners
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { QueryKey, UseQueryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import auth from '@react-native-firebase/auth';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { createApiHooks, queryKeys, sortByTimestampDescending } from '@lumimd/sdk';
import type {
  Visit,
  Medication,
  ActionItem,
  UserProfile,
  Nudge,
  HealthLog,
  HealthLogSummaryResponse,
  Share,
  ShareInvite,
} from '@lumimd/sdk';
import { api } from './client';
import { filterDueNudges } from './nudgeFilters';

// Create hooks using the mobile API client
const hooks = createApiHooks(api);

type ApiHookQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  'queryKey' | 'queryFn'
>;

const getSessionKey = () => auth().currentUser?.uid ?? 'anonymous';

// Session-scoped API hooks (prevents stale cached data across account switches)
export function useVisits(options?: ApiHookQueryOptions<Visit[]>) {
  return hooks.useVisits({
    ...options,
    queryKey: [...queryKeys.visits, getSessionKey()],
  });
}

export function useVisit(
  id: string,
  options?: ApiHookQueryOptions<Visit>,
) {
  return hooks.useVisit(id, {
    ...options,
    queryKey: [...queryKeys.visit(id), getSessionKey()],
  });
}

export function useLatestVisit(options?: ApiHookQueryOptions<Visit | null>) {
  return hooks.useLatestVisit({
    ...options,
    queryKey: [...queryKeys.visits, 'latest', getSessionKey()],
  });
}

export function useActionItems(options?: ApiHookQueryOptions<ActionItem[]>) {
  return hooks.useActionItems({
    ...options,
    queryKey: [...queryKeys.actions, getSessionKey()],
  });
}

export function usePendingActions(options?: ApiHookQueryOptions<ActionItem[]>) {
  return hooks.usePendingActions({
    ...options,
    queryKey: [...queryKeys.actions, getSessionKey()],
  });
}

export function useMedications(options?: ApiHookQueryOptions<Medication[]>) {
  return hooks.useMedications({
    ...options,
    queryKey: [...queryKeys.medications, getSessionKey()],
  });
}

export function useActiveMedications(options?: ApiHookQueryOptions<Medication[]>) {
  return hooks.useActiveMedications({
    ...options,
    queryKey: [...queryKeys.medications, getSessionKey()],
  });
}

export function useUserProfile(options?: ApiHookQueryOptions<UserProfile>) {
  return hooks.useUserProfile({
    ...options,
    queryKey: [...queryKeys.profile, getSessionKey()],
  });
}

export function useNudges(options?: ApiHookQueryOptions<Nudge[]>) {
  return hooks.useNudges({
    ...options,
    queryKey: [...queryKeys.nudges, getSessionKey()],
  });
}

export function useHealthLogs(
  params?: { type?: string; limit?: number },
  options?: ApiHookQueryOptions<HealthLog[]>,
) {
  return hooks.useHealthLogs(params, {
    ...options,
    queryKey: [...queryKeys.healthLogs, params ?? null, getSessionKey()],
  });
}

export function useHealthLogsSummary(
  days?: number,
  options?: ApiHookQueryOptions<HealthLogSummaryResponse>,
) {
  return hooks.useHealthLogsSummary(days, {
    ...options,
    queryKey: [...queryKeys.healthLogsSummary, days ?? null, getSessionKey()],
  });
}

export const useUpdateNudge = hooks.useUpdateNudge;
export const useRespondToNudge = hooks.useRespondToNudge;
export const useCreateHealthLog = hooks.useCreateHealthLog;

// Export query keys for cache management
export { queryKeys };

// Realtime query keys scoped per user/session to prevent stale data on logout
export const realtimeQueryKeys = {
  visits: (userId?: string | null) => ['realtime', 'visits', userId ?? 'anonymous'] as const,
  medications: (userId?: string | null) => ['realtime', 'medications', userId ?? 'anonymous'] as const,
  actions: (userId?: string | null) => ['realtime', 'actions', userId ?? 'anonymous'] as const,
};

type QueryEnabledOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  'queryKey' | 'queryFn'
>;

// Helper to convert Firestore timestamps to ISO strings
function serializeDoc<T extends { id: string }>(
  doc: FirebaseFirestoreTypes.QueryDocumentSnapshot | FirebaseFirestoreTypes.DocumentSnapshot
): T {
  const data = doc.data() ?? {};
  const converted: Record<string, unknown> = { id: doc.id };

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'toDate' in value) {
      // Firestore Timestamp
      converted[key] = (value as FirebaseFirestoreTypes.Timestamp).toDate().toISOString();
    } else if (Array.isArray(value)) {
      converted[key] = value.map(item =>
        item && typeof item === 'object' && 'toDate' in item
          ? (item as FirebaseFirestoreTypes.Timestamp).toDate().toISOString()
          : item
      );
    } else {
      converted[key] = value;
    }
  }

  return converted as T;
}

export function useRealtimeVisits(
  userId?: string | null,
  options?: QueryEnabledOptions<Visit[]>,
) {
  const queryClient = useQueryClient();
  const key = useMemo(() => realtimeQueryKeys.visits(userId), [userId]);
  const enabled = Boolean(userId);

  // Set up realtime listener
  useEffect(() => {
    if (!userId || !enabled) return;

    const unsubscribe = firestore()
      .collection('visits')
      .where('userId', '==', userId)
      .onSnapshot(
        (snapshot) => {
          const docs = snapshot.docs.map(doc => serializeDoc<Visit>(doc));
          const sorted = sortByTimestampDescending(docs);
          queryClient.setQueryData(key, sorted);
        },
        (error) => {
          console.error('[Realtime] Visits listener error', error);
        }
      );

    return () => unsubscribe();
  }, [userId, enabled, key, queryClient]);

  // Initial fetch query
  return useQuery<Visit[]>({
    queryKey: key,
    staleTime: 30_000,
    enabled,
    ...options,
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await firestore()
        .collection('visits')
        .where('userId', '==', userId)
        .get();
      const docs = snapshot.docs.map(doc => serializeDoc<Visit>(doc));
      return sortByTimestampDescending(docs);
    },
  });
}

export function useRealtimeActiveMedications(
  userId?: string | null,
  options?: QueryEnabledOptions<Medication[]>,
) {
  const queryClient = useQueryClient();
  const key = useMemo(() => realtimeQueryKeys.medications(userId), [userId]);
  const enabled = Boolean(userId);

  const filterActiveMeds = useCallback((meds: Medication[]) => {
    return sortByTimestampDescending(
      meds.filter((med) => med.active !== false),
    );
  }, []);

  // Set up realtime listener
  useEffect(() => {
    if (!userId || !enabled) return;

    const unsubscribe = firestore()
      .collection('medications')
      .where('userId', '==', userId)
      .onSnapshot(
        (snapshot) => {
          const docs = snapshot.docs.map(doc => serializeDoc<Medication>(doc));
          queryClient.setQueryData(key, filterActiveMeds(docs));

          // Also invalidate medication schedule and reminders
          // This ensures Today's Schedule updates when meds are synced from a visit
          queryClient.invalidateQueries({ queryKey: ['medicationSchedule'] });
          queryClient.invalidateQueries({ queryKey: ['medicationReminders'] });
        },
        (error) => {
          console.error('[Realtime] Medications listener error', error);
        }
      );

    return () => unsubscribe();
  }, [userId, enabled, key, queryClient, filterActiveMeds]);

  return useQuery<Medication[]>({
    queryKey: key,
    staleTime: 30_000,
    enabled,
    ...options,
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await firestore()
        .collection('medications')
        .where('userId', '==', userId)
        .get();
      const docs = snapshot.docs.map(doc => serializeDoc<Medication>(doc));
      return filterActiveMeds(docs);
    },
  });
}

export function useRealtimePendingActions(
  userId?: string | null,
  options?: QueryEnabledOptions<ActionItem[]>,
) {
  const queryClient = useQueryClient();
  const key = useMemo(() => realtimeQueryKeys.actions(userId), [userId]);
  const enabled = Boolean(userId);

  const filterPendingActions = useCallback((actions: ActionItem[]) => {
    return actions
      .filter((action) => !action.completed)
      .sort((a, b) => {
        const aTime =
          (a.dueAt && Date.parse(a.dueAt)) ||
          (a.createdAt && Date.parse(a.createdAt)) ||
          0;
        const bTime =
          (b.dueAt && Date.parse(b.dueAt)) ||
          (b.createdAt && Date.parse(b.createdAt)) ||
          0;
        return aTime - bTime;
      });
  }, []);

  // Set up realtime listener
  useEffect(() => {
    if (!userId || !enabled) return;

    const unsubscribe = firestore()
      .collection('actions')
      .where('userId', '==', userId)
      .onSnapshot(
        (snapshot) => {
          const docs = snapshot.docs.map(doc => serializeDoc<ActionItem>(doc));
          queryClient.setQueryData(key, filterPendingActions(docs));
        },
        (error) => {
          console.error('[Realtime] Actions listener error', error);
        }
      );

    return () => unsubscribe();
  }, [userId, enabled, key, queryClient, filterPendingActions]);

  return useQuery<ActionItem[]>({
    queryKey: key,
    staleTime: 30_000,
    enabled,
    ...options,
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await firestore()
        .collection('actions')
        .where('userId', '==', userId)
        .get();
      const docs = snapshot.docs.map(doc => serializeDoc<ActionItem>(doc));
      return filterPendingActions(docs);
    },
  });
}

// Add nudges to realtime query keys
export const realtimeNudgesKey = (userId?: string | null) =>
  ['realtime', 'nudges', userId ?? 'anonymous'] as const;

/**
 * Realtime nudges hook - automatically updates when nudges are created/modified
 */
export function useRealtimeNudges(
  userId?: string | null,
  options?: QueryEnabledOptions<Nudge[]>,
) {
  const queryClient = useQueryClient();
  const key = useMemo(() => realtimeNudgesKey(userId), [userId]);
  const rawDocsRef = useRef<Nudge[]>([]); // Store raw docs for periodic re-evaluation
  const enabled = Boolean(userId);

  // Filter for active/pending nudges that are due
  const filterActiveNudges = useCallback((nudges: Nudge[]) => {
    return filterDueNudges(nudges);
  }, []);

  // Set up realtime listener
  useEffect(() => {
    if (!userId || !enabled) return;

    const unsubscribe = firestore()
      .collection('nudges')
      .where('userId', '==', userId)
      .onSnapshot(
        (snapshot) => {
          const docs = snapshot.docs.map(doc => serializeDoc<Nudge>(doc));
          rawDocsRef.current = docs; // Store raw docs for periodic re-evaluation
          queryClient.setQueryData(key, filterActiveNudges(docs));
        },
        (error) => {
          console.error('[Realtime] Nudges listener error', error);
        }
      );

    return () => unsubscribe();
  }, [userId, enabled, key, queryClient, filterActiveNudges]);

  // Periodic check for scheduled nudges becoming active
  useEffect(() => {
    if (!userId || !enabled) return;

    const intervalId = setInterval(() => {
      // Re-run filter on RAW docs to catch any that just became due
      if (rawDocsRef.current.length > 0) {
        queryClient.setQueryData(key, filterActiveNudges(rawDocsRef.current));
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(intervalId);
  }, [userId, enabled, key, queryClient, filterActiveNudges]);

  return useQuery<Nudge[]>({
    queryKey: key,
    staleTime: 10_000, // Short stale time for nudges
    enabled,
    ...options,
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await firestore()
        .collection('nudges')
        .where('userId', '==', userId)
        .get();
      const docs = snapshot.docs.map(doc => serializeDoc<Nudge>(doc));
      return filterActiveNudges(docs);
    },
  });
}

// Export types
export type { Visit, Medication, ActionItem, UserProfile, Nudge };

// =============================================================================
// Medication Reminders Hooks
// =============================================================================

import { useMutation } from '@tanstack/react-query';
import type {
  MedicationReminder,
  CreateMedicationReminderRequest,
  UpdateMedicationReminderRequest,
} from '@lumimd/sdk';

const toSessionKey = (userId?: string | null) => userId ?? 'anonymous';

export const medicationRemindersKey = (userId?: string | null) =>
  ['medicationReminders', toSessionKey(userId)] as const;

export function useMedicationReminders(
  userId?: string | null,
  options?: QueryEnabledOptions<MedicationReminder[]>,
) {
  return useQuery<MedicationReminder[]>({
    queryKey: medicationRemindersKey(userId),
    staleTime: 30_000,
    ...options,
    queryFn: async () => {
      const response = await api.medicationReminders.list();
      return response.reminders;
    },
  });
}

export function useCreateMedicationReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMedicationReminderRequest) =>
      api.medicationReminders.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicationReminders'] });
      queryClient.invalidateQueries({ queryKey: ['medicationSchedule'] });
    },
  });
}

export function useUpdateMedicationReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateMedicationReminderRequest }) =>
      api.medicationReminders.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicationReminders'] });
      queryClient.invalidateQueries({ queryKey: ['medicationSchedule'] });
    },
  });
}

export function useDeleteMedicationReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.medicationReminders.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicationReminders'] });
      queryClient.invalidateQueries({ queryKey: ['medicationSchedule'] });
    },
  });
}

// =============================================================================
// Medication Schedule Hook (Today's Doses)
// =============================================================================

export interface ScheduledDose {
  medicationId: string;
  reminderId: string;
  name: string;
  dose: string;
  scheduledTime: string;
  status: 'taken' | 'skipped' | 'pending' | 'overdue';
  logId: string | null;
}

export interface MedicationScheduleResponse {
  scheduledDoses: ScheduledDose[];
  summary: { taken: number; skipped: number; pending: number; overdue?: number; total: number };
  nextDue: { name: string; time: string } | null;
}

export const medicationScheduleKey = (userId?: string | null) =>
  ['medicationSchedule', toSessionKey(userId)] as const;

// Helper to make API calls directly with auth
async function fetchWithAuth<T>(path: string, options?: RequestInit): Promise<T> {
  const { getIdToken } = await import('../auth');
  const token = await getIdToken();
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api';

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

export function useMedicationSchedule(
  userId?: string | null,
  options?: QueryEnabledOptions<MedicationScheduleResponse>,
) {
  return useQuery<MedicationScheduleResponse>({
    queryKey: medicationScheduleKey(userId),
    staleTime: 30_000,
    ...options,
    queryFn: async () => {
      return fetchWithAuth<MedicationScheduleResponse>('/v1/meds/schedule/today');
    },
  });
}

export function useMarkDose() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { medicationId: string; scheduledTime: string; action: 'taken' | 'skipped' }) =>
      fetchWithAuth('/v1/meds/schedule/mark', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicationSchedule'] });
    },
  });
}

export function useMarkBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      doses: Array<{ medicationId: string; scheduledTime: string }>;
      action: 'taken' | 'skipped';
    }) =>
      fetchWithAuth('/v1/meds/schedule/mark-batch', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicationSchedule'] });
    },
  });
}

export function useSnoozeDose() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      medicationId: string;
      scheduledTime: string;
      snoozeMinutes: '15' | '30' | '60';
    }) =>
      fetchWithAuth('/v1/meds/schedule/snooze', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicationSchedule'] });
    },
  });
}

// =============================================================================
// Silent Orphan Cleanup
// =============================================================================

/**
 * Silently cleans up orphaned medication reminders (ones pointing to deleted meds).
 * Safe to call on every app launch - it's idempotent.
 */
export async function cleanupOrphanedReminders(): Promise<{ deleted: number } | null> {
  try {
    const result = await fetchWithAuth<{ deleted: number; success: boolean }>(
      '/v1/medication-reminders/cleanup-orphans',
      { method: 'POST' }
    );
    if (result.deleted > 0) {
      console.log(`[MedReminders] Cleaned up ${result.deleted} orphaned reminder(s)`);
    }
    return { deleted: result.deleted };
  } catch (error) {
    // Silently fail - this is a best-effort cleanup
    console.warn('[MedReminders] Orphan cleanup failed:', error);
    return null;
  }
}

/**
 * Silently cleans up orphaned nudges (ones referencing discontinued medications).
 * Safe to call on every app launch - it's idempotent.
 */
export async function cleanupOrphanedNudges(): Promise<{ deleted: number } | null> {
  try {
    const result = await fetchWithAuth<{ deleted: number; success: boolean }>(
      '/v1/nudges/cleanup-orphans',
      { method: 'POST' }
    );
    if (result.deleted > 0) {
      console.log(`[Nudges] Cleaned up ${result.deleted} orphaned nudge(s)`);
    }
    return { deleted: result.deleted };
  } catch (error) {
    // Silently fail - this is a best-effort cleanup
    console.warn('[Nudges] Orphan cleanup failed:', error);
    return null;
  }
}

// =============================================================================
// Medication Warning Acknowledgment Hook
// =============================================================================

export function useAcknowledgeMedicationWarnings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (medicationId: string) =>
      api.medications.acknowledgeWarnings(medicationId),
    onSuccess: () => {
      // Invalidate medications to refresh the warningAcknowledgedAt field
      queryClient.invalidateQueries({ queryKey: ['medications'] });
    },
  });
}

// =============================================================================
// Caregiver Sharing Hooks
// =============================================================================

export const sharesKey = (userId?: string | null) =>
  ['shares', toSessionKey(userId)] as const;

export const shareInvitesKey = (userId?: string | null) =>
  ['shareInvites', toSessionKey(userId)] as const;

export function useShares(
  userId?: string | null,
  options?: QueryEnabledOptions<Share[]>,
) {
  return useQuery<Share[]>({
    queryKey: sharesKey(userId),
    staleTime: 30_000,
    enabled: Boolean(userId),
    ...options,
    queryFn: async () => {
      return api.shares.list();
    },
  });
}

export function useMyShareInvites(
  userId?: string | null,
  options?: QueryEnabledOptions<ShareInvite[]>,
) {
  return useQuery<ShareInvite[]>({
    queryKey: shareInvitesKey(userId),
    staleTime: 30_000,
    enabled: Boolean(userId),
    ...options,
    queryFn: async () => {
      return api.shares.myInvites();
    },
  });
}

export function useInviteCaregiver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { caregiverEmail: string; message?: string }) =>
      api.shares.invite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['shareInvites'] });
    },
  });
}

export function useRevokeShareAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareId: string) =>
      api.shares.update(shareId, { status: 'revoked' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['shareInvites'] });
    },
  });
}

export function useRevokeShareInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => api.shares.revokeInvite(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['shareInvites'] });
    },
  });
}
