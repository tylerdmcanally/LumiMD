/**
 * React Query Hooks for Mobile
 * Uses React Native Firebase for realtime listeners
 */

import { useCallback, useEffect, useMemo } from 'react';
import { QueryKey, UseQueryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { createApiHooks, queryKeys, sortByTimestampDescending } from '@lumimd/sdk';
import type { Visit, Medication, ActionItem, UserProfile } from '@lumimd/sdk';
import { api } from './client';

// Create hooks using the mobile API client
const hooks = createApiHooks(api);

// Export all hooks
export const {
  useVisits,
  useVisit,
  useLatestVisit,
  useActionItems,
  usePendingActions,
  useMedications,
  useActiveMedications,
  useUserProfile,
} = hooks;

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

// Export types
export type { Visit, Medication, ActionItem, UserProfile };
