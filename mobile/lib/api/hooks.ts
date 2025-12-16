/**
 * React Query Hooks for Mobile
 * Re-exports shared SDK hooks
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { QueryKey, UseQueryOptions, useQueryClient } from '@tanstack/react-query';

import {
  createApiHooks,
  queryKeys,
  sortByTimestampDescending,
} from '@lumimd/sdk';
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

// Generic hook to subscribe to Firestore query
function useFirestoreSubscription<T>(
  queryKey: QueryKey,
  queryFactory: () => FirebaseFirestoreTypes.Query | null,
  options?: {
    enabled?: boolean;
    transform?: (data: T[]) => T[];
  }
) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (options?.enabled === false) return;

    const query = queryFactory();
    if (!query) return;

    const unsubscribe = query.onSnapshot(
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as unknown as T[];

        const transformedData = options?.transform ? options.transform(data) : data;

        queryClient.setQueryData(queryKey, transformedData);
        setError(null);
      },
      (err) => {
        console.error('[Realtime] Firestore listener error', err);
        setError(err);
      }
    );

    return () => unsubscribe();
  }, [queryKey, queryFactory, options?.enabled, options?.transform, queryClient]);

  // Return data from cache to mimic useQuery
  const data = queryClient.getQueryData<T[]>(queryKey);

  return { data, error, isLoading: !data && !error };
}


export function useRealtimeVisits(
  userId?: string | null,
  options?: QueryEnabledOptions<Visit[]>,
) {
  const key = useMemo(() => realtimeQueryKeys.visits(userId), [userId]);

  const queryFactory = useCallback(() => {
    if (!userId) return null;
    return firestore().collection('visits').where('userId', '==', userId);
  }, [userId]);

  return useFirestoreSubscription<Visit>(key, queryFactory, {
    enabled: !!userId,
    transform: sortByTimestampDescending,
  });
}

export function useRealtimeActiveMedications(
  userId?: string | null,
  options?: QueryEnabledOptions<Medication[]>,
) {
  const key = useMemo(() => realtimeQueryKeys.medications(userId), [userId]);

  const queryFactory = useCallback(() => {
    if (!userId) return null;
    return firestore().collection('medications').where('userId', '==', userId);
  }, [userId]);

  const filterActiveMeds = useCallback((meds: Medication[]) => {
    return sortByTimestampDescending(
      meds.filter((med) => med.active !== false),
    );
  }, []);

  return useFirestoreSubscription<Medication>(key, queryFactory, {
    enabled: !!userId,
    transform: filterActiveMeds,
  });
}

export function useRealtimePendingActions(
  userId?: string | null,
  options?: QueryEnabledOptions<ActionItem[]>,
) {
  const key = useMemo(() => realtimeQueryKeys.actions(userId), [userId]);

  const queryFactory = useCallback(() => {
    if (!userId) return null;
    return firestore().collection('actions').where('userId', '==', userId);
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

  return useFirestoreSubscription<ActionItem>(key, queryFactory, {
    enabled: !!userId,
    transform: filterPendingActions,
  });
}

// Export types
export type { Visit, Medication, ActionItem, UserProfile };
