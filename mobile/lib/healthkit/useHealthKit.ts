/**
 * useHealthKit Hook
 * Manages Apple HealthKit authorization and data fetching for iOS
 * 
 * This hook provides a unified interface to:
 * - Request HealthKit permissions
 * - Read health data (weight, heart rate, blood pressure, etc.)
 * - Get summarized health data for display
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import type {
  HealthKitPermissionStatus,
  HealthSample,
  BloodPressureSample,
  SleepSample,
  HealthDataSummary,
  HealthQueryOptions,
} from './types';

// We'll use react-native-health for HealthKit access
// 
// NOTE: Defensive import pattern used intentionally.
// react-native-health's export structure may vary by version:
//   - v1.x uses: module.exports = HealthKit (direct)
//   - Some versions may use: export default or named exports
// This pattern handles all cases to prevent breakage on library updates.
// If this fails, check the library's index.js for current export pattern.
let AppleHealthKit: any = null;

try {
  const healthModule = require('react-native-health');
  // Defensive: handle default export, named export, or direct module.exports
  AppleHealthKit = healthModule.default || healthModule.AppleHealthKit || healthModule;
  
  // Validate the import worked
  if (!AppleHealthKit?.isAvailable) {
    console.error('[HealthKit] Library loaded but isAvailable method missing - check export structure');
  } else {
    console.log('[HealthKit] Library loaded successfully');
  }
} catch (e) {
  console.log('[HealthKit] react-native-health not available:', e);
}

export interface UseHealthKitResult {
  // Availability & Permissions
  isAvailable: boolean;
  permissionStatus: HealthKitPermissionStatus;
  isLoading: boolean;
  error: string | null;

  // Actions
  requestPermissions: () => Promise<boolean>;
  checkPermissionStatus: () => Promise<HealthKitPermissionStatus>;

  // Data Fetching
  fetchWeight: (options?: Partial<HealthQueryOptions>) => Promise<HealthSample[]>;
  fetchHeartRate: (options?: Partial<HealthQueryOptions>) => Promise<HealthSample[]>;
  fetchBloodPressure: (options?: Partial<HealthQueryOptions>) => Promise<BloodPressureSample[]>;
  fetchBloodGlucose: (options?: Partial<HealthQueryOptions>) => Promise<HealthSample[]>;
  fetchOxygenSaturation: (options?: Partial<HealthQueryOptions>) => Promise<HealthSample[]>;
  fetchBodyTemperature: (options?: Partial<HealthQueryOptions>) => Promise<HealthSample[]>;
  fetchSteps: (options?: Partial<HealthQueryOptions>) => Promise<HealthSample[]>;
  fetchSleep: (options?: Partial<HealthQueryOptions>) => Promise<SleepSample[]>;

  // Convenience Methods
  fetchLatestVitals: () => Promise<HealthDataSummary>;
  fetchTodaySummary: () => Promise<HealthDataSummary>;
}

// Default query options
const getDefaultQueryOptions = (): HealthQueryOptions => ({
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  endDate: new Date(),
  limit: 100,
  ascending: false,
});

// Permissions we want to request
const READ_PERMISSIONS = [
  'Weight',
  'HeartRate',
  'BloodPressureSystolic',
  'BloodPressureDiastolic',
  'BloodGlucose',
  'OxygenSaturation',
  'BodyTemperature',
  'RespiratoryRate',
  'StepCount',
  'DistanceWalkingRunning',
  'ActiveEnergyBurned',
  'SleepAnalysis',
  'RestingHeartRate',
];

export function useHealthKit(): UseHealthKitResult {
  const [isAvailable, setIsAvailable] = useState(Platform.OS === 'ios');
  const [permissionStatus, setPermissionStatus] = useState<HealthKitPermissionStatus>('unknown');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Check if HealthKit is available and try to restore previous authorization
  useEffect(() => {
    const checkAvailabilityAndAuth = async () => {
      console.log('[HealthKit] Checking availability, Platform:', Platform.OS);
      
      if (Platform.OS !== 'ios') {
        console.log('[HealthKit] Not iOS, marking unavailable');
        setIsAvailable(false);
        setPermissionStatus('unavailable');
        return;
      }

      if (!AppleHealthKit) {
        console.log('[HealthKit] Library not loaded, marking unavailable');
        setIsAvailable(false);
        setPermissionStatus('unavailable');
        return;
      }

      // Check if isAvailable method exists
      if (typeof AppleHealthKit.isAvailable !== 'function') {
        console.log('[HealthKit] isAvailable method not found, assuming available on iOS');
        setIsAvailable(true);
        // Try to initialize to check existing authorization
        tryRestoreAuthorization();
        return;
      }

      AppleHealthKit.isAvailable((err: string | null, available: boolean) => {
        if (err) {
          console.error('[HealthKit] Availability check error:', err);
          setIsAvailable(true);
          tryRestoreAuthorization();
          return;
        }
        console.log('[HealthKit] Availability check result:', available);
        setIsAvailable(available);
        if (!available) {
          setPermissionStatus('unavailable');
        } else {
          // Try to restore previous authorization
          tryRestoreAuthorization();
        }
      });
    };

    // Try to initialize HealthKit to detect if we already have authorization
    const tryRestoreAuthorization = () => {
      if (!AppleHealthKit || initializedRef.current) return;
      
      console.log('[HealthKit] Attempting to restore previous authorization...');
      
      const permissions = {
        permissions: {
          read: READ_PERMISSIONS,
          write: [],
        },
      };

      AppleHealthKit.initHealthKit(permissions, (err: string | null) => {
        if (err) {
          console.log('[HealthKit] Not previously authorized or permission denied');
          setPermissionStatus('unknown');
          return;
        }
        
        console.log('[HealthKit] Successfully restored previous authorization');
        setPermissionStatus('authorized');
        initializedRef.current = true;
      });
    };

    checkAvailabilityAndAuth();
  }, []);

  // Request HealthKit permissions
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!isAvailable || !AppleHealthKit) {
      setError('HealthKit is not available on this device');
      return false;
    }

    setIsLoading(true);
    setError(null);

    return new Promise((resolve) => {
      const permissions = {
        permissions: {
          read: READ_PERMISSIONS,
          write: [], // We're only reading data
        },
      };

      AppleHealthKit!.initHealthKit(permissions, (err) => {
        setIsLoading(false);

        if (err) {
          console.error('[HealthKit] Permission request error:', err);
          setError('Failed to authorize HealthKit access');
          setPermissionStatus('denied');
          resolve(false);
          return;
        }

        console.log('[HealthKit] Successfully authorized');
        setPermissionStatus('authorized');
        initializedRef.current = true;
        resolve(true);
      });
    });
  }, [isAvailable]);

  // Check current permission status
  const checkPermissionStatus = useCallback(async (): Promise<HealthKitPermissionStatus> => {
    if (!isAvailable || !AppleHealthKit) {
      return 'unavailable';
    }

    // HealthKit doesn't have a direct "check permission" API
    // We need to try to initialize and see if it works
    return new Promise((resolve) => {
      AppleHealthKit!.getAuthStatus(
        { permissions: { read: ['HeartRate'], write: [] } },
        (err, result) => {
          if (err) {
            resolve('unknown');
            return;
          }
          // Result indicates the authorization status
          const status = initializedRef.current ? 'authorized' : 'unknown';
          setPermissionStatus(status);
          resolve(status);
        }
      );
    });
  }, [isAvailable]);

  // Helper to ensure HealthKit is initialized before data access
  const ensureInitialized = async (): Promise<boolean> => {
    if (initializedRef.current) return true;

    if (permissionStatus === 'authorized') {
      // Re-initialize if we think we have permission
      return requestPermissions();
    }

    return false;
  };

  // Fetch weight samples
  const fetchWeight = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<HealthSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getWeightSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          limit: opts.limit,
          ascending: opts.ascending,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching weight:', err);
            resolve([]);
            return;
          }

          const samples: HealthSample[] = (results || []).map((r: any) => ({
            id: r.id || `weight-${r.startDate}`,
            value: r.value,
            unit: 'lb',
            startDate: r.startDate,
            endDate: r.endDate,
            sourceName: r.sourceName,
            sourceId: r.sourceId,
          }));

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Fetch heart rate samples
  const fetchHeartRate = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<HealthSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getHeartRateSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          limit: opts.limit,
          ascending: opts.ascending,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching heart rate:', err);
            resolve([]);
            return;
          }

          const samples: HealthSample[] = (results || []).map((r: any) => ({
            id: r.id || `hr-${r.startDate}`,
            value: r.value,
            unit: 'bpm',
            startDate: r.startDate,
            endDate: r.endDate,
            sourceName: r.sourceName,
            sourceId: r.sourceId,
          }));

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Fetch blood pressure samples
  const fetchBloodPressure = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<BloodPressureSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getBloodPressureSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          limit: opts.limit,
          ascending: opts.ascending,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching blood pressure:', err);
            resolve([]);
            return;
          }

          const samples: BloodPressureSample[] = (results || []).map((r: any) => ({
            id: r.id || `bp-${r.startDate}`,
            systolic: r.bloodPressureSystolicValue,
            diastolic: r.bloodPressureDiastolicValue,
            unit: 'mmHg',
            startDate: r.startDate,
            endDate: r.endDate,
            sourceName: r.sourceName,
            sourceId: r.sourceId,
          }));

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Fetch blood glucose samples
  const fetchBloodGlucose = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<HealthSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getBloodGlucoseSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          limit: opts.limit,
          ascending: opts.ascending,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching blood glucose:', err);
            resolve([]);
            return;
          }

          const samples: HealthSample[] = (results || []).map((r: any) => ({
            id: r.id || `glucose-${r.startDate}`,
            value: r.value,
            unit: 'mg/dL',
            startDate: r.startDate,
            endDate: r.endDate,
            sourceName: r.sourceName,
            sourceId: r.sourceId,
          }));

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Fetch oxygen saturation samples
  const fetchOxygenSaturation = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<HealthSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getOxygenSaturationSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          limit: opts.limit,
          ascending: opts.ascending,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching oxygen saturation:', err);
            resolve([]);
            return;
          }

          const samples: HealthSample[] = (results || []).map((r: any) => ({
            id: r.id || `spo2-${r.startDate}`,
            value: Math.round(r.value * 100), // Convert to percentage
            unit: '%',
            startDate: r.startDate,
            endDate: r.endDate,
            sourceName: r.sourceName,
            sourceId: r.sourceId,
          }));

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Fetch body temperature samples
  const fetchBodyTemperature = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<HealthSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getBodyTemperatureSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          limit: opts.limit,
          ascending: opts.ascending,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching body temperature:', err);
            resolve([]);
            return;
          }

          const samples: HealthSample[] = (results || []).map((r: any) => ({
            id: r.id || `temp-${r.startDate}`,
            value: r.value,
            unit: '°F',
            startDate: r.startDate,
            endDate: r.endDate,
            sourceName: r.sourceName,
            sourceId: r.sourceId,
          }));

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Fetch step count
  const fetchSteps = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<HealthSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getDailyStepCountSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          includeManuallyAdded: true,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching steps:', err);
            resolve([]);
            return;
          }

          const samples: HealthSample[] = (results || []).map((r: any) => ({
            id: r.id || `steps-${r.startDate}`,
            value: r.value,
            unit: 'steps',
            startDate: r.startDate,
            endDate: r.endDate,
            sourceName: r.sourceName,
            sourceId: r.sourceId,
          }));

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Fetch sleep samples
  const fetchSleep = useCallback(async (options?: Partial<HealthQueryOptions>): Promise<SleepSample[]> => {
    if (!AppleHealthKit || !(await ensureInitialized())) {
      return [];
    }

    const opts = { ...getDefaultQueryOptions(), ...options };

    return new Promise((resolve) => {
      AppleHealthKit!.getSleepSamples(
        {
          startDate: opts.startDate.toISOString(),
          endDate: opts.endDate.toISOString(),
          limit: opts.limit,
        },
        (err, results) => {
          if (err) {
            console.error('[HealthKit] Error fetching sleep:', err);
            resolve([]);
            return;
          }

          const samples: SleepSample[] = (results || []).map((r: any) => {
            const start = new Date(r.startDate);
            const end = new Date(r.endDate);
            const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);

            // Map HealthKit sleep values to our categories
            let category: SleepSample['category'] = 'inBed';
            if (r.value === 'ASLEEP' || r.value === 'CORE') {
              category = 'asleepCore';
            } else if (r.value === 'DEEP') {
              category = 'asleepDeep';
            } else if (r.value === 'REM') {
              category = 'asleepREM';
            } else if (r.value === 'AWAKE') {
              category = 'awake';
            }

            return {
              id: r.id || `sleep-${r.startDate}`,
              category,
              startDate: r.startDate,
              endDate: r.endDate,
              durationMinutes,
              sourceName: r.sourceName,
              sourceId: r.sourceId,
            };
          });

          resolve(samples);
        }
      );
    });
  }, [permissionStatus]);

  // Convenience: Fetch latest vitals (most recent reading for each type)
  const fetchLatestVitals = useCallback(async (): Promise<HealthDataSummary> => {
    const summary: HealthDataSummary = {};

    const [weight, heartRate, bloodPressure, glucose, spo2, temp] = await Promise.all([
      fetchWeight({ limit: 1 }),
      fetchHeartRate({ limit: 1 }),
      fetchBloodPressure({ limit: 1 }),
      fetchBloodGlucose({ limit: 1 }),
      fetchOxygenSaturation({ limit: 1 }),
      fetchBodyTemperature({ limit: 1 }),
    ]);

    if (weight.length > 0) {
      summary.latestWeight = {
        value: weight[0].value,
        unit: weight[0].unit,
        date: weight[0].startDate,
      };
    }

    if (heartRate.length > 0) {
      summary.latestHeartRate = {
        value: Math.round(heartRate[0].value),
        unit: heartRate[0].unit,
        date: heartRate[0].startDate,
      };
    }

    if (bloodPressure.length > 0) {
      summary.latestBloodPressure = {
        systolic: bloodPressure[0].systolic,
        diastolic: bloodPressure[0].diastolic,
        unit: bloodPressure[0].unit,
        date: bloodPressure[0].startDate,
      };
    }

    if (glucose.length > 0) {
      summary.latestBloodGlucose = {
        value: glucose[0].value,
        unit: glucose[0].unit,
        date: glucose[0].startDate,
      };
    }

    if (spo2.length > 0) {
      summary.latestOxygenSaturation = {
        value: spo2[0].value,
        unit: spo2[0].unit,
        date: spo2[0].startDate,
      };
    }

    if (temp.length > 0) {
      summary.latestBodyTemperature = {
        value: temp[0].value,
        unit: temp[0].unit,
        date: temp[0].startDate,
      };
    }

    return summary;
  }, [fetchWeight, fetchHeartRate, fetchBloodPressure, fetchBloodGlucose, fetchOxygenSaturation, fetchBodyTemperature]);

  // Convenience: Fetch today's activity summary
  const fetchTodaySummary = useCallback(async (): Promise<HealthDataSummary> => {
    const summary = await fetchLatestVitals();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();

    // Get today's steps using getStepCount (aggregated total for the day)
    try {
      const todaySteps = await new Promise<number>((resolve) => {
        AppleHealthKit!.getStepCount(
          {
            date: new Date().toISOString(),
            includeManuallyAdded: true,
          },
          (err: string | null, result: { value: number }) => {
            if (err) {
              console.error('[HealthKit] Error fetching step count:', err);
              resolve(0);
              return;
            }
            console.log('[HealthKit] Today step count:', result?.value);
            resolve(result?.value || 0);
          }
        );
      });
      
      if (todaySteps > 0) {
        summary.todaySteps = todaySteps;
      }
    } catch (e) {
      console.error('[HealthKit] getStepCount failed:', e);
    }

    // Get today's heart rate stats
    const heartRates = await fetchHeartRate({
      startDate: startOfToday,
      endDate: endOfToday,
      limit: 1000,
    });

    if (heartRates.length > 0) {
      const values = heartRates.map((hr) => hr.value);
      summary.heartRateStats = {
        min: Math.round(Math.min(...values)),
        max: Math.round(Math.max(...values)),
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        period: 'today',
      };
    }

    // Get last night's sleep
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0); // Start from 6pm yesterday

    const sleepSamples = await fetchSleep({
      startDate: yesterday,
      endDate: endOfToday,
    });

    if (sleepSamples.length > 0) {
      const totalMinutes = sleepSamples.reduce((total, s) => total + s.durationMinutes, 0);
      const inBedMinutes = sleepSamples
        .filter((s) => s.category === 'inBed')
        .reduce((total, s) => total + s.durationMinutes, 0);
      const asleepMinutes = sleepSamples
        .filter((s) => s.category !== 'inBed' && s.category !== 'awake')
        .reduce((total, s) => total + s.durationMinutes, 0);
      const deepSleepMinutes = sleepSamples
        .filter((s) => s.category === 'asleepDeep')
        .reduce((total, s) => total + s.durationMinutes, 0);
      const remSleepMinutes = sleepSamples
        .filter((s) => s.category === 'asleepREM')
        .reduce((total, s) => total + s.durationMinutes, 0);

      summary.lastNightSleep = {
        totalMinutes,
        inBedMinutes: inBedMinutes || totalMinutes,
        asleepMinutes: asleepMinutes || totalMinutes,
        deepSleepMinutes: deepSleepMinutes || undefined,
        remSleepMinutes: remSleepMinutes || undefined,
      };
    }

    return summary;
  }, [fetchLatestVitals, fetchSteps, fetchHeartRate, fetchSleep]);

  return {
    isAvailable,
    permissionStatus,
    isLoading,
    error,
    requestPermissions,
    checkPermissionStatus,
    fetchWeight,
    fetchHeartRate,
    fetchBloodPressure,
    fetchBloodGlucose,
    fetchOxygenSaturation,
    fetchBodyTemperature,
    fetchSteps,
    fetchSleep,
    fetchLatestVitals,
    fetchTodaySummary,
  };
}
