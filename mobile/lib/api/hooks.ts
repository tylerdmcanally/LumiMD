/**
 * React Query Hooks for Mobile
 * Re-exports shared SDK hooks
 */

import { useCallback, useMemo } from 'react';
import { collection, query, where, type FirestoreError } from 'firebase/firestore';
import { QueryKey, UseQueryOptions } from '@tanstack/react-query';

import {
  createApiHooks,
  queryKeys,
  sortByTimestampDescending,
  useFirestoreCollection,
} from '@lumimd/sdk';
import type { Visit, Medication, ActionItem, UserProfile } from '@lumimd/sdk';
import { api } from './client';
import { db } from '../firebase';

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

const useRealtimeErrorHandler = () =>
  useCallback((error: FirestoreError) => {
    console.error('[Realtime] Firestore listener error', error);
  }, []);

export function useRealtimeVisits(
  userId?: string | null,
  options?: QueryEnabledOptions<Visit[]>,
) {
  const key = useMemo(() => realtimeQueryKeys.visits(userId), [userId]);
  const enabled = Boolean(userId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const visitsQueryRef = useMemo(() => {
    if (!userId) return null;
    return query(collection(db, 'visits'), where('userId', '==', userId));
  }, [userId]);

  return useFirestoreCollection<Visit>(visitsQueryRef, key, {
    transform: sortByTimestampDescending,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

export function useRealtimeActiveMedications(
  userId?: string | null,
  options?: QueryEnabledOptions<Medication[]>,
) {
  const key = useMemo(() => realtimeQueryKeys.medications(userId), [userId]);
  const enabled = Boolean(userId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const medicationsQueryRef = useMemo(() => {
    if (!userId) return null;
    return query(collection(db, 'medications'), where('userId', '==', userId));
  }, [userId]);

  const filterActiveMeds = useCallback((meds: Medication[]) => {
    return sortByTimestampDescending(
      meds.filter((med) => med.active !== false),
    );
  }, []);

  return useFirestoreCollection<Medication>(medicationsQueryRef, key, {
    transform: filterActiveMeds,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

export function useRealtimePendingActions(
  userId?: string | null,
  options?: QueryEnabledOptions<ActionItem[]>,
) {
  const key = useMemo(() => realtimeQueryKeys.actions(userId), [userId]);
  const enabled = Boolean(userId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const actionsQueryRef = useMemo(() => {
    if (!userId) return null;
    return query(collection(db, 'actions'), where('userId', '==', userId));
  }, [userId]);

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

  return useFirestoreCollection<ActionItem>(actionsQueryRef, key, {
    transform: filterPendingActions,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

// Export types
export type { Visit, Medication, ActionItem, UserProfile };
