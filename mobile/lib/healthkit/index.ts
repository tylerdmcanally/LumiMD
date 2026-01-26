/**
 * HealthKit Module
 * Apple HealthKit integration for reading health data
 */

// Core hook
export { useHealthKit } from './useHealthKit';
export type { UseHealthKitResult } from './useHealthKit';

// React Query hooks
export {
  useHealthVitals,
  useHealthTodaySummary,
  useHealthWeight,
  useHealthHeartRate,
  useHealthBloodPressure,
  useHealthBloodGlucose,
  useHealthOxygenSaturation,
  useHealthBodyTemperature,
  useHealthSteps,
  useHealthSleep,
  useKeyVitals,  // Clean 5-metric hook
  healthKitQueryKeys,
} from './hooks';

// Relevance engine (smart filtering based on conditions)
export {
  getRelevantMetrics,
  filterToRelevantVitals,
  getRelevanceExplanation,
} from './relevance';
export type { RelevantMetric } from './relevance';

// Sync service (automatic background sync to backend)
export {
  syncHealthKitData,
  initializeHealthKitSync,
  forceHealthKitSync,
  isHealthKitSyncEnabled,
  enableHealthKitSync,
  disableHealthKitSync,
  getLastSyncTime,
} from './sync';
export type { SyncResult } from './sync';

// Clean vitals fetcher (5 key metrics)
export {
  fetchAllVitals,
  fetchLatestBloodPressure,
  fetchLatestGlucose,
  fetchLatestWeight,
  fetchTodaySteps,
  fetchLatestHeartRate,
  hasAnyVitals,
} from './fetchVitals';
export type {
  VitalsSummary,
  BloodPressureReading,
  GlucoseReading,
  WeightReading,
  StepsReading,
  HeartRateReading,
} from './fetchVitals';

// Types
export * from './types';
