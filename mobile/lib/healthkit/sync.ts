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

// Storage keys
const HEALTHKIT_ENABLED_KEY = 'lumimd:healthkit:enabled';
const HEALTHKIT_LAST_SYNC_KEY = 'lumimd:healthkit:lastSync';
const HEALTHKIT_SYNCED_IDS_KEY = 'lumimd:healthkit:syncedIds';

// Maximum synced IDs to keep in cache (rolling window)
const MAX_CACHED_IDS = 1000;

// Sync window: 7 days
const SYNC_DAYS = 7;

// Minimum time between syncs (1 minute)
const MIN_SYNC_INTERVAL_MS = 1 * 60 * 1000;

// How many samples to fetch per data type
const SAMPLES_LIMIT = 200;

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
    const enabled = await AsyncStorage.getItem(HEALTHKIT_ENABLED_KEY);
    return enabled === 'true';
  } catch {
    return false;
  }
}

/**
 * Enable HealthKit sync (called after user grants permission)
 */
export async function enableHealthKitSync(): Promise<void> {
  await AsyncStorage.setItem(HEALTHKIT_ENABLED_KEY, 'true');
}

/**
 * Disable HealthKit sync
 */
export async function disableHealthKitSync(): Promise<void> {
  await AsyncStorage.setItem(HEALTHKIT_ENABLED_KEY, 'false');
}

/**
 * Get set of already-synced source IDs from local cache
 */
async function getSyncedIds(): Promise<Set<string>> {
  try {
    const data = await AsyncStorage.getItem(HEALTHKIT_SYNCED_IDS_KEY);
    if (!data) return new Set();
    return new Set(JSON.parse(data));
  } catch {
    return new Set();
  }
}

/**
 * Add synced IDs to local cache
 */
async function addSyncedIds(ids: string[]): Promise<void> {
  try {
    const existing = await getSyncedIds();
    ids.forEach(id => existing.add(id));
    
    // Keep only the most recent IDs (rolling window)
    const allIds = Array.from(existing);
    const trimmedIds = allIds.slice(-MAX_CACHED_IDS);
    
    await AsyncStorage.setItem(HEALTHKIT_SYNCED_IDS_KEY, JSON.stringify(trimmedIds));
  } catch (error) {
    console.warn('[HealthKit Sync] Failed to save synced IDs:', error);
  }
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
    const lastSync = await AsyncStorage.getItem(HEALTHKIT_LAST_SYNC_KEY);
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
  await AsyncStorage.setItem(HEALTHKIT_LAST_SYNC_KEY, String(Date.now()));
}

/**
 * Sync a single health log to the backend
 */
async function syncHealthLog(
  type: 'bp' | 'glucose' | 'weight' | 'steps' | 'heart_rate' | 'oxygen_saturation',
  value: Record<string, unknown>,
  sourceId: string,
  recordedAt: string
): Promise<boolean> {
  try {
    await api.healthLogs.create({
      type,
      value: value as any,
      source: 'healthkit',
      sourceId,
      recordedAt,
    });
    return true;
  } catch (error: any) {
    // If it's a duplicate error, that's okay - already synced
    if (error?.status === 409 || error?.message?.includes('duplicate')) {
      return true;
    }
    console.warn(`[HealthKit Sync] Failed to sync ${type}:`, error?.message || error);
    return false;
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

  // Check if sync is enabled
  const enabled = await isHealthKitSyncEnabled();
  if (!enabled) {
    return { success: true, synced: 0, skipped: 0, errors: 0, message: 'Sync not enabled' };
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

    // Get already-synced IDs
    const syncedIds = await getSyncedIds();
    const newSyncedIds: string[] = [];

    // Date range: last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - SYNC_DAYS);

    const baseQueryOptions = {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      ascending: false,
    };

    // Helper to process and sync samples
    const processSamples = async <T extends { startDate: string }>(
      samples: T[],
      type: 'bp' | 'glucose' | 'weight' | 'steps' | 'heart_rate' | 'oxygen_saturation',
      valueExtractor: (sample: T) => Record<string, unknown>
    ) => {
      console.log(`[HealthKit Sync] Processing ${samples.length} ${type} samples`);
      
      for (const sample of samples) {
        const value = valueExtractor(sample);
        const sourceId = generateSourceId(type, sample.startDate, value);

        if (syncedIds.has(sourceId)) {
          skipped++;
          continue;
        }

        const success = await syncHealthLog(type, value, sourceId, sample.startDate);
        if (success) {
          synced++;
          newSyncedIds.push(sourceId);
        } else {
          errors++;
        }
      }
    };

    // =========================================================================
    // SYNC BLOOD PRESSURE
    // =========================================================================
    await new Promise<void>((resolve) => {
      AppleHealthKit.getBloodPressureSamples(
        { ...baseQueryOptions, limit: SAMPLES_LIMIT },
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
        { ...baseQueryOptions, limit: SAMPLES_LIMIT, unit: 'pound' },
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
        { ...baseQueryOptions, limit: SAMPLES_LIMIT, unit: 'mgPerdL' },
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
        { ...baseQueryOptions, limit: SAMPLES_LIMIT, unit: 'bpm' },
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
        { ...baseQueryOptions, limit: SAMPLES_LIMIT },
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
            const success = await syncHealthLog('steps', value, sourceId, `${today}T12:00:00.000Z`);
            if (success) {
              synced++;
              // Don't cache today's steps sourceId - we want to update it throughout the day
            } else {
              errors++;
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
          startDate: startDate.toISOString(),
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

              if (syncedIds.has(sourceId)) {
                skipped++;
                continue;
              }

              const success = await syncHealthLog('steps', value, sourceId, `${day}T23:59:59.000Z`);
              if (success) {
                synced++;
                newSyncedIds.push(sourceId);
              } else {
                errors++;
              }
            }
          } else {
            console.log('[HealthKit Sync] No historical steps samples found');
          }
          resolve();
        }
      );
    });

    // Save newly synced IDs
    if (newSyncedIds.length > 0) {
      await addSyncedIds(newSyncedIds);
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
  return syncHealthKitData();
}

/**
 * Force a sync regardless of time interval (for manual refresh)
 */
export async function forceHealthKitSync(): Promise<SyncResult> {
  // Clear the last sync time to force immediate sync
  await AsyncStorage.removeItem(HEALTHKIT_LAST_SYNC_KEY);
  return syncHealthKitData();
}

/**
 * Get last sync time for display
 */
export async function getLastSyncTime(): Promise<Date | null> {
  try {
    const lastSync = await AsyncStorage.getItem(HEALTHKIT_LAST_SYNC_KEY);
    if (!lastSync) return null;
    return new Date(parseInt(lastSync, 10));
  } catch {
    return null;
  }
}
