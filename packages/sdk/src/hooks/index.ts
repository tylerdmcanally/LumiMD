/**
 * Shared React Query Hooks
 * Platform-agnostic data fetching hooks with caching and optimistic updates
 */

import {
  QueryKey,
  useQuery,
  useMutation,
  UseQueryOptions,
  useQueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api-client';
import type { Visit, Medication, ActionItem, UserProfile } from '../models';
import type {
  Nudge,
  HealthLog,
  HealthLogSummaryResponse,
  CreateHealthLogRequest,
  UpdateNudgeRequest,
  RespondToNudgeRequest,
} from '../models/lumibot';

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
  nudges: ['nudges'] as const,
  healthLogs: ['healthLogs'] as const,
  healthLogsSummary: ['healthLogs', 'summary'] as const,
};

type ApiQueryOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  'queryFn' | 'queryKey'
> & {
  queryKey?: QueryKey;
};

export function createApiHooks(api: ApiClient) {
  /**
   * Fetch all visits
   */
  function useVisits(options?: ApiQueryOptions<Visit[]>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.visits,
      queryFn: () => api.visits.list(),
      staleTime: 5 * 60 * 1000, // 5 minutes
      ...queryOptions,
    });
  }

  /**
   * Fetch single visit
   */
  function useVisit(id: string, options?: ApiQueryOptions<Visit>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.visit(id),
      queryFn: () => api.visits.get(id),
      enabled: !!id,
      staleTime: 5 * 60 * 1000,
      ...queryOptions,
    });
  }

  /**
   * Fetch latest visit (most recent)
   * Uses backend query parameter for efficiency
   */
  function useLatestVisit(options?: ApiQueryOptions<Visit | null>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? [...queryKeys.visits, 'latest'],
      queryFn: async () => {
        const visits = await api.visits.list({ limit: 1, sort: 'desc' });
        return visits.length > 0 ? visits[0] : null;
      },
      staleTime: 2 * 60 * 1000, // 2 minutes
      ...queryOptions,
    });
  }

  /**
   * Fetch all action items
   */
  function useActionItems(options?: ApiQueryOptions<ActionItem[]>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.actions,
      queryFn: () => api.actions.list(),
      staleTime: 5 * 60 * 1000,
      ...queryOptions,
    });
  }

  /**
   * Fetch pending action items only
   * Uses select to derive from cached data
   */
  function usePendingActions(options?: ApiQueryOptions<ActionItem[]>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.actions,
      queryFn: () => api.actions.list(),
      select: (actions) => actions.filter((action) => !action.completed),
      staleTime: 30 * 1000, // 30 seconds
      ...queryOptions,
    });
  }

  /**
   * Fetch all medications
   */
  function useMedications(options?: ApiQueryOptions<Medication[]>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.medications,
      queryFn: () => api.medications.list(),
      staleTime: 60 * 1000, // 1 minute
      ...queryOptions,
    });
  }

  /**
   * Fetch active medications only
   * Uses select to derive from cached data
   */
  function useActiveMedications(options?: ApiQueryOptions<Medication[]>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.medications,
      queryFn: () => api.medications.list(),
      select: (meds) => meds.filter((med) => med.active !== false),
      staleTime: 60 * 1000, // 1 minute
      ...queryOptions,
    });
  }

  /**
   * Fetch user profile
   */
  function useUserProfile(options?: ApiQueryOptions<UserProfile>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.profile,
      queryFn: () => api.user.getProfile(),
      staleTime: 5 * 60 * 1000,
      ...queryOptions,
    });
  }

  // ==========================================================================
  // LumiBot Hooks
  // ==========================================================================

  /**
   * Fetch active nudges
   */
  function useNudges(options?: ApiQueryOptions<Nudge[]>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? queryKeys.nudges,
      queryFn: () => api.nudges.list(),
      staleTime: 30 * 1000, // 30 seconds
      ...queryOptions,
    });
  }

  /**
   * Fetch health logs
   */
  function useHealthLogs(params?: { type?: string; limit?: number }, options?: ApiQueryOptions<HealthLog[]>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? [...queryKeys.healthLogs, params],
      queryFn: () => api.healthLogs.list(params),
      staleTime: 60 * 1000, // 1 minute
      ...queryOptions,
    });
  }

  /**
   * Fetch health logs summary
   */
  function useHealthLogsSummary(days?: number, options?: ApiQueryOptions<HealthLogSummaryResponse>) {
    const { queryKey, ...queryOptions } = options ?? {};
    return useQuery({
      queryKey: queryKey ?? [...queryKeys.healthLogsSummary, days],
      queryFn: () => api.healthLogs.summary(days),
      staleTime: 5 * 60 * 1000, // 5 minutes
      ...queryOptions,
    });
  }

  /**
   * Mutation for updating nudge status
   */
  function useUpdateNudge() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: UpdateNudgeRequest }) =>
        api.nudges.update(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.nudges });
      },
    });
  }

  /**
   * Mutation for responding to nudge
   */
  function useRespondToNudge() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: RespondToNudgeRequest }) =>
        api.nudges.respond(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.nudges });
      },
    });
  }

  /**
   * Mutation for creating health log
   */
  function useCreateHealthLog() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: CreateHealthLogRequest) =>
        api.healthLogs.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.healthLogs });
        queryClient.invalidateQueries({ queryKey: queryKeys.nudges });
      },
    });
  }

  return {
    useVisits,
    useVisit,
    useLatestVisit,
    useActionItems,
    usePendingActions,
    useMedications,
    useActiveMedications,
    useUserProfile,
    // LumiBot
    useNudges,
    useHealthLogs,
    useHealthLogsSummary,
    useUpdateNudge,
    useRespondToNudge,
    useCreateHealthLog,
  };
}
