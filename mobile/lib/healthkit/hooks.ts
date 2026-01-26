/**
 * React Query Hooks for HealthKit Data
 * 
 * These hooks integrate HealthKit data fetching with React Query
 * for caching, background updates, and consistent data management.
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useHealthKit } from './useHealthKit';
import { fetchAllVitals, VitalsSummary } from './fetchVitals';
import type {
  HealthSample,
  BloodPressureSample,
  SleepSample,
  HealthDataSummary,
  HealthQueryOptions,
} from './types';

// Query keys for cache management
export const healthKitQueryKeys = {
  all: ['healthKit'] as const,
  vitals: () => [...healthKitQueryKeys.all, 'vitals'] as const,
  todaySummary: () => [...healthKitQueryKeys.all, 'todaySummary'] as const,
  weight: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'weight', options] as const,
  heartRate: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'heartRate', options] as const,
  bloodPressure: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'bloodPressure', options] as const,
  bloodGlucose: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'bloodGlucose', options] as const,
  oxygenSaturation: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'oxygenSaturation', options] as const,
  bodyTemperature: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'bodyTemperature', options] as const,
  steps: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'steps', options] as const,
  sleep: (options?: Partial<HealthQueryOptions>) =>
    [...healthKitQueryKeys.all, 'sleep', options] as const,
};

type QueryOptions<T> = Omit<UseQueryOptions<T, Error>, 'queryKey' | 'queryFn'>;

/**
 * Hook to fetch latest vitals from HealthKit
 * Includes: weight, heart rate, blood pressure, blood glucose, oxygen saturation, temperature
 */
export function useHealthVitals(options?: QueryOptions<HealthDataSummary>) {
  const healthKit = useHealthKit();
  const isAuthorized = healthKit.permissionStatus === 'authorized';

  return useQuery<HealthDataSummary>({
    queryKey: healthKitQueryKeys.vitals(),
    queryFn: () => healthKit.fetchLatestVitals(),
    enabled: isAuthorized,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Refetch when authorization status changes (e.g., on app restart)
    refetchOnMount: 'always',
    ...options,
  });
}

/**
 * Hook to fetch today's health summary
 * Includes vitals + activity data (steps, heart rate stats, sleep)
 */
export function useHealthTodaySummary(options?: QueryOptions<HealthDataSummary>) {
  const healthKit = useHealthKit();
  const isAuthorized = healthKit.permissionStatus === 'authorized';

  return useQuery<HealthDataSummary>({
    queryKey: healthKitQueryKeys.todaySummary(),
    queryFn: () => healthKit.fetchTodaySummary(),
    enabled: isAuthorized,
    staleTime: 2 * 60 * 1000, // 2 minutes (activity changes more frequently)
    // Refetch when authorization status changes (e.g., on app restart)
    refetchOnMount: 'always',
    ...options,
  });
}

/**
 * Hook to fetch weight samples
 */
export function useHealthWeight(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<HealthSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<HealthSample[]>({
    queryKey: healthKitQueryKeys.weight(queryOptions),
    queryFn: () => healthKit.fetchWeight(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

/**
 * Hook to fetch heart rate samples
 */
export function useHealthHeartRate(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<HealthSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<HealthSample[]>({
    queryKey: healthKitQueryKeys.heartRate(queryOptions),
    queryFn: () => healthKit.fetchHeartRate(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
}

/**
 * Hook to fetch blood pressure samples
 */
export function useHealthBloodPressure(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<BloodPressureSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<BloodPressureSample[]>({
    queryKey: healthKitQueryKeys.bloodPressure(queryOptions),
    queryFn: () => healthKit.fetchBloodPressure(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

/**
 * Hook to fetch blood glucose samples
 */
export function useHealthBloodGlucose(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<HealthSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<HealthSample[]>({
    queryKey: healthKitQueryKeys.bloodGlucose(queryOptions),
    queryFn: () => healthKit.fetchBloodGlucose(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

/**
 * Hook to fetch oxygen saturation samples
 */
export function useHealthOxygenSaturation(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<HealthSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<HealthSample[]>({
    queryKey: healthKitQueryKeys.oxygenSaturation(queryOptions),
    queryFn: () => healthKit.fetchOxygenSaturation(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Hook to fetch body temperature samples
 */
export function useHealthBodyTemperature(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<HealthSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<HealthSample[]>({
    queryKey: healthKitQueryKeys.bodyTemperature(queryOptions),
    queryFn: () => healthKit.fetchBodyTemperature(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 10 * 60 * 1000, // 10 minutes
    ...options,
  });
}

/**
 * Hook to fetch step count samples
 */
export function useHealthSteps(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<HealthSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<HealthSample[]>({
    queryKey: healthKitQueryKeys.steps(queryOptions),
    queryFn: () => healthKit.fetchSteps(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 1 * 60 * 1000, // 1 minute (steps change frequently)
    ...options,
  });
}

/**
 * Hook to fetch sleep analysis samples
 */
export function useHealthSleep(
  queryOptions?: Partial<HealthQueryOptions>,
  options?: QueryOptions<SleepSample[]>
) {
  const healthKit = useHealthKit();

  return useQuery<SleepSample[]>({
    queryKey: healthKitQueryKeys.sleep(queryOptions),
    queryFn: () => healthKit.fetchSleep(queryOptions),
    enabled: healthKit.permissionStatus === 'authorized',
    staleTime: 30 * 60 * 1000, // 30 minutes (sleep doesn't change frequently)
    ...options,
  });
}

// ============================================================================
// NEW: Clean Vitals Hook (5 Key Metrics)
// ============================================================================

/**
 * Hook to fetch the 5 key vitals: BP, Glucose, Weight, Steps, Heart Rate
 * Uses the clean fetchVitals implementation with proper API calls.
 */
export function useKeyVitals(options?: QueryOptions<VitalsSummary>) {
  const healthKit = useHealthKit();
  const isAuthorized = healthKit.permissionStatus === 'authorized';

  return useQuery<VitalsSummary>({
    queryKey: [...healthKitQueryKeys.all, 'keyVitals'],
    queryFn: fetchAllVitals,
    enabled: isAuthorized,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnMount: 'always',
    ...options,
  });
}
