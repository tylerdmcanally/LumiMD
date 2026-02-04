/**
 * Shared React Query Hooks
 * Platform-agnostic data fetching hooks with caching and optimistic updates
 */

import { useQuery, useMutation, UseQueryOptions, useQueryClient } from '@tanstack/react-query';
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
  nudgesHistory: ['nudges', 'history'] as const,
  healthLogs: ['healthLogs'] as const,
  healthLogsSummary: ['healthLogs', 'summary'] as const,
};

export function createApiHooks(api: ApiClient) {
  /**
   * Fetch all visits
   */
  function useVisits(
    options?: Omit<UseQueryOptions<Visit[], Error>, 'queryKey' | 'queryFn'>
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
  function useVisit(
    id: string,
    options?: Omit<UseQueryOptions<Visit, Error>, 'queryKey' | 'queryFn'>
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
   * Uses backend query parameter for efficiency
   */
  function useLatestVisit(
    options?: Omit<UseQueryOptions<Visit | null, Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: [...queryKeys.visits, 'latest'],
      queryFn: async () => {
        const visits = await api.visits.list({ limit: 1, sort: 'desc' });
        return visits.length > 0 ? visits[0] : null;
      },
      staleTime: 2 * 60 * 1000, // 2 minutes
      ...options,
    });
  }

  /**
   * Fetch all action items
   */
  function useActionItems(
    options?: Omit<UseQueryOptions<ActionItem[], Error>, 'queryKey' | 'queryFn'>
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
   * Uses select to derive from cached data
   */
  function usePendingActions(
    options?: Omit<UseQueryOptions<ActionItem[], Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: queryKeys.actions,
      queryFn: () => api.actions.list(),
      select: (actions) => actions.filter((action) => !action.completed),
      staleTime: 30 * 1000, // 30 seconds
      ...options,
    });
  }

  /**
   * Fetch all medications
   */
  function useMedications(
    options?: Omit<UseQueryOptions<Medication[], Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: queryKeys.medications,
      queryFn: () => api.medications.list(),
      staleTime: 60 * 1000, // 1 minute
      ...options,
    });
  }

  /**
   * Fetch active medications only
   * Uses select to derive from cached data
   */
  function useActiveMedications(
    options?: Omit<UseQueryOptions<Medication[], Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: queryKeys.medications,
      queryFn: () => api.medications.list(),
      select: (meds) => meds.filter((med) => med.active !== false),
      staleTime: 60 * 1000, // 1 minute
      ...options,
    });
  }

  /**
   * Fetch user profile
   */
  function useUserProfile(
    options?: Omit<UseQueryOptions<UserProfile, Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: queryKeys.profile,
      queryFn: () => api.user.getProfile(),
      staleTime: 5 * 60 * 1000,
      ...options,
    });
  }

  // ==========================================================================
  // LumiBot Hooks
  // ==========================================================================

  /**
   * Fetch active nudges
   */
  function useNudges(
    options?: Omit<UseQueryOptions<Nudge[], Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: queryKeys.nudges,
      queryFn: () => api.nudges.list(),
      staleTime: 30 * 1000, // 30 seconds
      ...options,
    });
  }

  /**
   * Fetch nudge history
   */
  function useNudgeHistory(
    limit?: number,
    options?: Omit<UseQueryOptions<Nudge[], Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: [...queryKeys.nudgesHistory, limit],
      queryFn: () => api.nudges.history(limit),
      staleTime: 60 * 1000, // 1 minute
      ...options,
    });
  }

  /**
   * Fetch health logs
   */
  function useHealthLogs(
    params?: { type?: string; limit?: number },
    options?: Omit<UseQueryOptions<HealthLog[], Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: [...queryKeys.healthLogs, params],
      queryFn: () => api.healthLogs.list(params),
      staleTime: 60 * 1000, // 1 minute
      ...options,
    });
  }

  /**
   * Fetch health logs summary
   */
  function useHealthLogsSummary(
    days?: number,
    options?: Omit<UseQueryOptions<HealthLogSummaryResponse, Error>, 'queryKey' | 'queryFn'>
  ) {
    return useQuery({
      queryKey: [...queryKeys.healthLogsSummary, days],
      queryFn: () => api.healthLogs.summary(days),
      staleTime: 5 * 60 * 1000, // 5 minutes
      ...options,
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
   * Mutation for sending nudge feedback
   */
  function useSendNudgeFeedback() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: { helpful: boolean; note?: string } }) =>
        api.nudges.feedback(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.nudges });
        queryClient.invalidateQueries({ queryKey: queryKeys.nudgesHistory });
      },
    });
  }

  /**
   * Mutation for tracking nudge analytics events
   */
  function useTrackNudgeEvent() {
    return useMutation({
      mutationFn: ({ id, data }: { id: string; data: { type: 'view' | 'action' | 'feedback'; metadata?: Record<string, unknown> } }) =>
        api.nudges.trackEvent(id, data),
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
    useNudgeHistory,
    useHealthLogs,
    useHealthLogsSummary,
    useUpdateNudge,
    useRespondToNudge,
    useSendNudgeFeedback,
    useTrackNudgeEvent,
    useCreateHealthLog,
  };
}

