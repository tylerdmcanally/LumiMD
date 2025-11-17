/**
 * React Query Hooks
 * Custom hooks for data fetching with caching and optimistic updates
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { api } from './client';

/**
 * Query Keys for cache management
 */
export const queryKeys = {
  visits: ['visits'] as const,
  visit: (id: string) => ['visits', id] as const,
  actions: ['actions'] as const,
  action: (id: string) => ['actions', id] as const,
  medications: ['medications'] as const,
  medication: (id: string) => ['medications', id] as const,
  profile: ['profile'] as const,
};

/**
 * Fetch all visits
 */
export function useVisits(
  options?: Omit<UseQueryOptions<any[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.visits,
    queryFn: () => api.visits.list(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Fetch single visit
 */
export function useVisit(
  id: string,
  options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.visit(id),
    queryFn: () => api.visits.get(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch latest visit (most recent)
 */
export function useLatestVisit(
  options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...queryKeys.visits, 'latest'],
    queryFn: async () => {
      const visits = await api.visits.list();
      if (!visits || visits.length === 0) return null;
      // Sort by date and return most recent
      return visits.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
}

/**
 * Fetch all action items
 */
export function useActionItems(
  options?: Omit<UseQueryOptions<any[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.actions,
    queryFn: () => api.actions.list(),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch pending action items only
 */
export function usePendingActions(
  options?: Omit<UseQueryOptions<any[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...queryKeys.actions, 'pending'],
    queryFn: async () => {
      const actions = await api.actions.list();
      // Filter for pending/incomplete actions
      return actions.filter(action => !action.completed);
    },
    staleTime: 3 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch all medications
 */
export function useMedications(
  options?: Omit<UseQueryOptions<any[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.medications,
    queryFn: () => api.medications.list(),
    staleTime: 10 * 60 * 1000, // 10 minutes (meds change less frequently)
    ...options,
  });
}

/**
 * Fetch active medications only
 */
export function useActiveMedications(
  options?: Omit<UseQueryOptions<any[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...queryKeys.medications, 'active'],
    queryFn: async () => {
      const meds = await api.medications.list();
      // Filter for active medications
      return meds.filter(med => med.active !== false);
    },
    staleTime: 10 * 60 * 1000,
    ...options,
  });
}

/**
 * Fetch user profile
 */
export function useUserProfile(
  options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => api.user.getProfile(),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

