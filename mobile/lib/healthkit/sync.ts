/**
 * HealthKit Sync Service
 * 
 * Automatically syncs HealthKit data to the LumiMD backend.
 * Runs when app opens and comes to foreground.
 * 
 * Synced Data Types:
 * - Blood Pressure (all readings)
 * - Blood Glucose (all readings)
 * - Weight (all readings)
 * - Heart Rate (all readings)
 * - Oxygen Saturation (all readings)
 * - Steps (daily totals)
 * 
 * Deduplication: Uses sourceId based on timestamp + value hash
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api } from '../api/client';
import { getCurrentUser } from '../auth';

type MetricType = 'bp' | 'glucose' | 'weight' | 'steps' | 'heart_rate' | 'oxygen_saturation';
type SyncEnabledSetting = 'true' | 'false' | null;
type SyncWriteResult = 'created' | 'updated' | 'duplicate' | 'error';

// Storage keys
const HEALTHKIT_ENABLED_KEY = 'lumimd:healthkit:enabled';
const HEALTHKIT_LAST_SYNC_KEY = 'lumimd:healthkit:lastSync';
const HEALTHKIT_CURSOR_KEY = 'lumimd:healthkit:cursor';

const INITIAL_LOOKBACK_DAYS: Record<MetricType, number> = {
  bp: 30,
  glucose: 30,
  weight: 30,
  heart_rate: 14,
  oxygen_saturation: 14,
  steps: 14,
};

// Minimum time between syncs (1 minute)
const MIN_SYNC_INTERVAL_MS = 1 * 60 * 1000;

// How many samples to fetch per data type
const SAMPLES_LIMIT = 200;
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;

const HEALTHKIT_READ_PERMISSIONS = [
  'Weight',
  'HeartRate',
  'BloodPressureSystolic',
  'BloodPressureDiastolic',
  'BloodGlucose',
  'OxygenSaturation',
  'StepCount',
];

let healthKitInitialized = false;

function getScopedStorageKey(baseKey: string): string {
  const userId = getCurrentUser()?.uid;
  return userId ? `${baseKey}:${userId}` : baseKey;
}

async function getSyncEnabledSetting(): Promise<SyncEnabledSetting> {
  const scopedKey = getScopedStorageKey(HEALTHKIT_ENABLED_KEY);
  const scopedValue = await AsyncStorage.getItem(scopedKey);
  if (scopedValue === 'true' || scopedValue === 'false') {
    return scopedValue;
  }

  // Migration fallback from legacy shared key.
  const legacyValue = await AsyncStorage.getItem(HEALTHKIT_ENABLED_KEY);
  if (legacyValue === 'true') {
    await AsyncStorage.setItem(scopedKey, legacyValue);
    return legacyValue;
  }

  return null;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  skipped: number;
  errors: number;
  message?: string;
}

/**
 * Check if HealthKit sync is enabled for this user
 */
export async function isHealthKitSyncEnabled(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  
  try {
    return (await getSyncEnabledSetting()) === 'true';
  } catch {
    return false;
  }
}

/**
 * Enable HealthKit sync (called after user grants permission)
 */
export async function enableHealthKitSync(): Promise<void> {
  const key = getScopedStorageKey(HEALTHKIT_ENABLED_KEY);
  await AsyncStorage.setItem(key, 'true');
}

/**
 * Disable HealthKit sync
 */
export async function disableHealthKitSync(): Promise<void> {
  const key = getScopedStorageKey(HEALTHKIT_ENABLED_KEY);
  await AsyncStorage.setItem(key, 'false');
}

/**
 * Get the storage key for a metric cursor, scoped to current user.
 */
function getCursorStorageKey(metric: MetricType): string {
  return getScopedStorageKey(`${HEALTHKIT_CURSOR_KEY}:${metric}`);
}

/**
 * Get the latest synced cursor for a metric.
 */
async function getMetricCursor(metric: MetricType): Promise<Date | null> {
  try {
    const value = await AsyncStorage.getItem(getCursorStorageKey(metric));
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist a metric cursor only if it moves forward.
 */
async function setMetricCursor(metric: MetricType, cursor: Date): Promise<void> {
  const nextTime = cursor.getTime();
  if (Number.isNaN(nextTime)) return;

  try {
    const existing = await getMetricCursor(metric);
    if (existing && existing.getTime() >= nextTime) {
      return;
    }
    await AsyncStorage.setItem(getCursorStorageKey(metric), cursor.toISOString());
  } catch (error) {
    console.warn(`[HealthKit Sync] Failed to save ${metric} cursor:`, error);
  }
}

/**
 * Determine metric query start using cursor with overlap fallback.
 */
async function getMetricQueryStart(metric: MetricType): Promise<Date> {
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - INITIAL_LOOKBACK_DAYS[metric]);

  const cursor = await getMetricCursor(metric);
  if (!cursor) return fallback;

  const cursorWithOverlap = new Date(cursor.getTime() - CURSOR_OVERLAP_MS);
  return cursorWithOverlap > fallback ? cursorWithOverlap : fallback;
}

/**
 * Generate a unique source ID for a health reading
 * Format: hk_{type}_{timestamp}_{valueHash}
 */
function generateSourceId(
  type: string,
  timestamp: string,
  value: Record<string, unknown>
): string {
  // Create a simple hash of the value
  const valueStr = JSON.stringify(value);
  let hash = 0;
  for (let i = 0; i < valueStr.length; i++) {
    const char = valueStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Use timestamp without milliseconds for consistency
  const normalizedTimestamp = new Date(timestamp).toISOString().slice(0, 19);
  
  return `hk_${type}_${normalizedTimestamp}_${Math.abs(hash)}`;
}

/**
 * Check if enough time has passed since last sync
 */
async function shouldSync(): Promise<boolean> {
  try {
    const key = getScopedStorageKey(HEALTHKIT_LAST_SYNC_KEY);
    const lastSync = await AsyncStorage.getItem(key);
    if (!lastSync) return true;
    
    const lastSyncTime = parseInt(lastSync, 10);
    const now = Date.now();
    
    return (now - lastSyncTime) >= MIN_SYNC_INTERVAL_MS;
  } catch {
    return true;
  }
}

/**
 * Update last sync timestamp
 */
async function updateLastSyncTime(): Promise<void> {
  const key = getScopedStorageKey(HEALTHKIT_LAST_SYNC_KEY);
  await AsyncStorage.setItem(key, String(Date.now()));
}

async function ensureHealthKitInitialized(appleHealthKit: any): Promise<boolean> {
  if (healthKitInitialized) return true;
  if (typeof appleHealthKit?.initHealthKit !== 'function') return true;

  return new Promise((resolve) => {
    appleHealthKit.initHealthKit(
      {
        permissions: {
          read: HEALTHKIT_READ_PERMISSIONS,
          write: [],
        },
      },
      (err: string | null) => {
        if (err) {
          console.warn('[HealthKit Sync] initHealthKit failed:', err);
          resolve(false);
          return;
        }
        healthKitInitialized = true;
        resolve(true);
      }
    );
  });
}

/**
 * Sync a single health log to the backend
 */
async function syncHealthLog(
  type: MetricType,
  value: Record<string, unknown>,
  sourceId: string,
  recordedAt: string
): Promise<SyncWriteResult> {
  try {
    const response = await api.healthLogs.create({
      type,
      value: value as any,
      source: 'healthkit',
      sourceId,
      recordedAt,
    } as any) as Record<string, unknown>;

    if (response?.duplicate === true) {
      return 'duplicate';
    }
    if (response?.updated === true) {
      return 'updated';
    }
    return 'created';
  } catch (error: any) {
    // If it's a duplicate error, that's okay - already synced
    if (error?.status === 409 || error?.message?.includes('duplicate')) {
      return 'duplicate';
    }
    console.warn(`[HealthKit Sync] Failed to sync ${type}:`, error?.message || error);
    return 'error';
  }
}

/**
 * Main sync function - syncs all HealthKit data to backend
 */
export async function syncHealthKitData(): Promise<SyncResult> {
  // Platform check
  if (Platform.OS !== 'ios') {
    return { success: true, synced: 0, skipped: 0, errors: 0, message: 'Not iOS' };
  }

  // Check if enough time has passed
  if (!(await shouldSync())) {
    return { success: true, synced: 0, skipped: 0, errors: 0, message: 'Too soon since last sync' };
  }

  console.log('[HealthKit Sync] Starting sync...');

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Load HealthKit module
    let AppleHealthKit: any = null;
    try {
      const healthModule = require('react-native-health');
      AppleHealthKit = healthModule.default || healthModule.AppleHealthKit || healthModule;
      if (!AppleHealthKit?.getBloodPressureSamples) {
        console.error('[HealthKit Sync] Invalid HealthKit module');
        return { success: false, synced: 0, skipped: 0, errors: 1, message: 'Invalid HealthKit module' };
      }
    } catch (e) {
      console.error('[HealthKit Sync] Failed to load HealthKit:', e);
      return { success: false, synced: 0, skipped: 0, errors: 1, message: 'HealthKit not available' };
    }

    // HealthKit queries require initialization per app launch.
    const isInitialized = await ensureHealthKitInitialized(AppleHealthKit);
    if (!isInitialized) {
      return { success: false, synced: 0, skipped: 0, errors: 1, message: 'HealthKit not authorized' };
    }

    const syncEnabled = await getSyncEnabledSetting();
    if (syncEnabled === 'false') {
      return { success: true, synced: 0, skipped: 0, errors: 0, message: 'Sync disabled' };
    }
    if (syncEnabled === null) {
      // Auto-enable sync when iOS permissions are already granted (e.g. reinstall/TestFlight updates).
      await enableHealthKitSync();
      console.log('[HealthKit Sync] Auto-enabled sync after detecting authorized HealthKit access');
    }

    // Date range end
    const endDate = new Date();
    const metricStarts: Record<MetricType, Date> = {
      bp: await getMetricQueryStart('bp'),
      glucose: await getMetricQueryStart('glucose'),
      weight: await getMetricQueryStart('weight'),
      heart_rate: await getMetricQueryStart('heart_rate'),
      oxygen_saturation: await getMetricQueryStart('oxygen_saturation'),
      steps: await getMetricQueryStart('steps'),
    };

    const buildMetricQueryOptions = (
      metric: MetricType,
      extra: Record<string, unknown> = {}
    ): Record<string, unknown> => ({
      startDate: metricStarts[metric].toISOString(),
      endDate: endDate.toISOString(),
      ascending: false,
      ...extra,
    });

    // Helper to process and sync samples
    const processSamples = async <T extends { startDate: string }>(
      samples: T[],
      type: MetricType,
      valueExtractor: (sample: T) => Record<string, unknown>
    ) => {
      console.log(`[HealthKit Sync] Processing ${samples.length} ${type} samples`);
      let latestHandledAt: Date | null = null;
      let hadErrors = false;

      for (const sample of samples) {
        if (!sample?.startDate) {
          skipped++;
          continue;
        }

        const sampleDate = new Date(sample.startDate);
        if (Number.isNaN(sampleDate.getTime())) {
          skipped++;
          continue;
        }

        const value = valueExtractor(sample);
        const sourceId = generateSourceId(type, sample.startDate, value);
        const writeResult = await syncHealthLog(type, value, sourceId, sample.startDate);
        if (writeResult === 'error') {
          errors++;
          hadErrors = true;
          continue;
        }
        if (writeResult === 'duplicate') {
          skipped++;
        } else {
          synced++;
        }
        if (!latestHandledAt || sampleDate > latestHandledAt) {
          latestHandledAt = sampleDate;
        }
      }

      if (!hadErrors && latestHandledAt) {
        await setMetricCursor(type, latestHandledAt);
      }
    };

    // =========================================================================
    // SYNC BLOOD PRESSURE
    // =========================================================================
    await new Promise<void>((resolve) => {
      AppleHealthKit.getBloodPressureSamples(
        buildMetricQueryOptions('bp', { limit: SAMPLES_LIMIT }),
        async (err: any, results: any[]) => {
          if (err) {
            console.warn('[HealthKit Sync] BP fetch error:', err);
          } else if (results && results.length > 0) {
            await processSamples(results, 'bp', (sample) => ({
              systolic: Math.round(sample.bloodPressureSystolicValue),
              diastolic: Math.round(sample.bloodPressureDiastolicValue),
            }));
          } else {
            console.log('[HealthKit Sync] No BP samples found');
          }
          resolve();
        }
      );
    });

    // =========================================================================
    // SYNC WEIGHT
    // =========================================================================
    await new Promise<void>((resolve) => {
      AppleHealthKit.getWeightSamples(
        buildMetricQueryOptions('weight', { limit: SAMPLES_LIMIT, unit: 'pound' }),
        async (err: any, results: any[]) => {
          if (err) {
            console.warn('[HealthKit Sync] Weight fetch error:', err);
          } else if (results && results.length > 0) {
            await processSamples(results, 'weight', (sample) => ({
              weight: Math.round(sample.value * 10) / 10,
              unit: 'lbs',
            }));
          } else {
            console.log('[HealthKit Sync] No weight samples found');
          }
          resolve();
        }
      );
    });

    // =========================================================================
    // SYNC BLOOD GLUCOSE
    // =========================================================================
    await new Promise<void>((resolve) => {
      AppleHealthKit.getBloodGlucoseSamples(
        buildMetricQueryOptions('glucose', { limit: SAMPLES_LIMIT, unit: 'mgPerdL' }),
        async (err: any, results: any[]) => {
          if (err) {
            console.warn('[HealthKit Sync] Glucose fetch error:', err);
          } else if (results && results.length > 0) {
            await processSamples(results, 'glucose', (sample) => ({
              reading: Math.round(sample.value),
              timing: sample.metadata?.HKBloodGlucoseMealTime === 1 ? 'before_meal' : 
                      sample.metadata?.HKBloodGlucoseMealTime === 2 ? 'after_meal' : undefined,
            }));
          } else {
            console.log('[HealthKit Sync] No glucose samples found');
          }
          resolve();
        }
      );
    });

    // =========================================================================
    // SYNC HEART RATE - All readings
    // =========================================================================
    await new Promise<void>((resolve) => {
      AppleHealthKit.getHeartRateSamples(
        buildMetricQueryOptions('heart_rate', { limit: SAMPLES_LIMIT, unit: 'bpm' }),
        async (err: any, results: any[]) => {
          if (err) {
            console.warn('[HealthKit Sync] Heart rate fetch error:', err);
          } else if (results && results.length > 0) {
            await processSamples(results, 'heart_rate', (sample) => ({
              bpm: Math.round(sample.value),
              context: 'resting',
            }));
          } else {
            console.log('[HealthKit Sync] No heart rate samples found');
          }
          resolve();
        }
      );
    });

    // =========================================================================
    // SYNC OXYGEN SATURATION
    // =========================================================================
    await new Promise<void>((resolve) => {
      AppleHealthKit.getOxygenSaturationSamples(
        buildMetricQueryOptions('oxygen_saturation', { limit: SAMPLES_LIMIT }),
        async (err: any, results: any[]) => {
          if (err) {
            console.warn('[HealthKit Sync] SpO2 fetch error:', err);
          } else if (results && results.length > 0) {
            await processSamples(results, 'oxygen_saturation', (sample) => ({
              percentage: Math.round(sample.value * 100),
            }));
          } else {
            console.log('[HealthKit Sync] No SpO2 samples found');
          }
          resolve();
        }
      );
    });

    // =========================================================================
    // SYNC STEPS - Daily totals (uses getStepCount for accurate daily total)
    // =========================================================================
    let latestStepsHandledAt: Date | null = null;
    let stepMetricHadErrors = false;

    // Get today's steps using the aggregated method
    await new Promise<void>((resolve) => {
      const today = new Date().toISOString().slice(0, 10);
      
      AppleHealthKit.getStepCount(
        {
          date: new Date().toISOString(),
          includeManuallyAdded: true,
        },
        async (err: any, result: { value: number }) => {
          if (err) {
            console.warn('[HealthKit Sync] Steps fetch error:', err);
          } else if (result && result.value !== undefined) {
            const stepCount = Math.round(result.value || 0);
            console.log(`[HealthKit Sync] Today's steps: ${stepCount}`);
            
            const value = { count: stepCount, date: today };
            // Use date-only sourceId - will be deduplicated by backend
            const sourceId = `hk_steps_${today}`;

            // Always sync today's steps (even 0) so we have an entry for today
            // Backend handles dedup/update
            const writeResult = await syncHealthLog('steps', value, sourceId, `${today}T12:00:00.000Z`);
            if (writeResult === 'error') {
              errors++;
              stepMetricHadErrors = true;
            } else if (writeResult === 'duplicate') {
              skipped++;
              latestStepsHandledAt = latestStepsHandledAt || new Date(`${today}T12:00:00.000Z`);
            } else {
              synced++;
              latestStepsHandledAt = new Date(`${today}T12:00:00.000Z`);
            }
          } else {
            console.log('[HealthKit Sync] No steps data available');
          }
          resolve();
        }
      );
    });

    // Also get historical daily steps for the past week
    await new Promise<void>((resolve) => {
      AppleHealthKit.getDailyStepCountSamples(
        {
          startDate: metricStarts.steps.toISOString(),
          endDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday and before
          includeManuallyAdded: true,
        },
        async (err: any, results: any[]) => {
          if (err) {
            console.warn('[HealthKit Sync] Historical steps fetch error:', err);
          } else if (results && results.length > 0) {
            console.log(`[HealthKit Sync] Processing ${results.length} historical steps samples`);
            
            // Aggregate steps by day
            const stepsByDay = new Map<string, number>();
            for (const sample of results) {
              const day = sample.startDate.slice(0, 10);
              const current = stepsByDay.get(day) || 0;
              stepsByDay.set(day, current + Math.round(sample.value));
            }

            // Sync each day's total (historical days are final, use date-only sourceId)
            for (const [day, totalSteps] of stepsByDay) {
              const value = { count: totalSteps, date: day };
              const sourceId = `hk_steps_${day}`;
              const recordedAt = `${day}T23:59:59.000Z`;
              const recordedAtDate = new Date(recordedAt);

              const writeResult = await syncHealthLog('steps', value, sourceId, recordedAt);
              if (writeResult === 'error') {
                errors++;
                stepMetricHadErrors = true;
              } else if (writeResult === 'duplicate') {
                skipped++;
                if (!latestStepsHandledAt || recordedAtDate > latestStepsHandledAt) {
                  latestStepsHandledAt = recordedAtDate;
                }
              } else {
                synced++;
                if (!latestStepsHandledAt || recordedAtDate > latestStepsHandledAt) {
                  latestStepsHandledAt = recordedAtDate;
                }
              }
            }
          } else {
            console.log('[HealthKit Sync] No historical steps samples found');
          }
          resolve();
        }
      );
    });
    if (!stepMetricHadErrors && latestStepsHandledAt) {
      await setMetricCursor('steps', latestStepsHandledAt);
    }

    // Update last sync time
    await updateLastSyncTime();

    console.log(`[HealthKit Sync] Complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);

    return {
      success: true,
      synced,
      skipped,
      errors,
    };
  } catch (error) {
    console.error('[HealthKit Sync] Error:', error);
    return {
      success: false,
      synced,
      skipped,
      errors: errors + 1,
      message: String(error),
    };
  }
}

/**
 * Initialize HealthKit sync after user grants permission
 */
export async function initializeHealthKitSync(): Promise<SyncResult> {
  await enableHealthKitSync();
  const key = getScopedStorageKey(HEALTHKIT_LAST_SYNC_KEY);
  await AsyncStorage.removeItem(key);
  return syncHealthKitData();
}

/**
 * Force a sync regardless of time interval (for manual refresh)
 */
export async function forceHealthKitSync(): Promise<SyncResult> {
  // Clear the last sync time to force immediate sync
  const key = getScopedStorageKey(HEALTHKIT_LAST_SYNC_KEY);
  await AsyncStorage.removeItem(key);
  return syncHealthKitData();
}

/**
 * Get last sync time for display
 */
export async function getLastSyncTime(): Promise<Date | null> {
  try {
    const key = getScopedStorageKey(HEALTHKIT_LAST_SYNC_KEY);
    const lastSync = await AsyncStorage.getItem(key);
    if (!lastSync) return null;
    return new Date(parseInt(lastSync, 10));
  } catch {
    return null;
  }
}
