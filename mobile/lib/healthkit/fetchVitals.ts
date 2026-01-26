/**
 * HealthKit Vitals Fetcher
 * 
 * Clean, documented functions to fetch the 5 key health metrics:
 * - Blood Pressure
 * - Blood Glucose  
 * - Weight
 * - Daily Steps
 * - Heart Rate
 * 
 * Based on react-native-health documentation:
 * https://github.com/agencyenterprise/react-native-health
 */

// Import the HealthKit library
let AppleHealthKit: any = null;
try {
  AppleHealthKit = require('react-native-health');
} catch (e) {
  console.log('[HealthKit] Library not available');
}

// ============================================================================
// Types
// ============================================================================

export interface BloodPressureReading {
  systolic: number;
  diastolic: number;
  date: string;
}

export interface GlucoseReading {
  value: number;        // in mg/dL
  date: string;
  mealTime?: 'fasting' | 'before_meal' | 'after_meal';
}

export interface WeightReading {
  value: number;        // in lbs
  date: string;
}

export interface StepsReading {
  value: number;        // total count
  date: string;
}

export interface HeartRateReading {
  value: number;        // in bpm
  date: string;
}

export interface VitalsSummary {
  bloodPressure?: BloodPressureReading;
  glucose?: GlucoseReading;
  weight?: WeightReading;
  steps?: StepsReading;
  heartRate?: HeartRateReading;
  fetchedAt: string;
}

// ============================================================================
// Individual Fetch Functions
// ============================================================================

/**
 * Get the most recent blood pressure reading
 * Uses: getBloodPressureSamples with limit: 1
 */
export async function fetchLatestBloodPressure(): Promise<BloodPressureReading | null> {
  if (!AppleHealthKit) return null;

  return new Promise((resolve) => {
    const options = {
      unit: 'mmhg',
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Last 30 days
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1,
    };

    AppleHealthKit.getBloodPressureSamples(options, (err: string | null, results: any[]) => {
      if (err || !results || results.length === 0) {
        console.log('[HealthKit] No blood pressure data:', err);
        resolve(null);
        return;
      }

      const latest = results[0];
      resolve({
        systolic: latest.bloodPressureSystolicValue,
        diastolic: latest.bloodPressureDiastolicValue,
        date: latest.startDate,
      });
    });
  });
}

/**
 * Get the most recent blood glucose reading
 * Uses: getBloodGlucoseSamples with limit: 1
 */
export async function fetchLatestGlucose(): Promise<GlucoseReading | null> {
  if (!AppleHealthKit) return null;

  return new Promise((resolve) => {
    const options = {
      unit: 'mgPerdL', // Use mg/dL for US users
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1,
    };

    AppleHealthKit.getBloodGlucoseSamples(options, (err: string | null, results: any[]) => {
      if (err || !results || results.length === 0) {
        console.log('[HealthKit] No glucose data:', err);
        resolve(null);
        return;
      }

      const latest = results[0];
      // Map HKBloodGlucoseMealTime: 1 = Preprandial (before), 2 = Postprandial (after)
      let mealTime: GlucoseReading['mealTime'] = undefined;
      if (latest.metadata?.HKBloodGlucoseMealTime === 1) mealTime = 'before_meal';
      if (latest.metadata?.HKBloodGlucoseMealTime === 2) mealTime = 'after_meal';

      resolve({
        value: latest.value,
        date: latest.startDate,
        mealTime,
      });
    });
  });
}

/**
 * Get the most recent weight reading
 * Uses: getLatestWeight (returns single most recent)
 */
export async function fetchLatestWeight(): Promise<WeightReading | null> {
  if (!AppleHealthKit) return null;

  return new Promise((resolve) => {
    const options = {
      unit: 'pound',
    };

    AppleHealthKit.getLatestWeight(options, (err: string | null, result: any) => {
      if (err || !result) {
        console.log('[HealthKit] No weight data:', err);
        resolve(null);
        return;
      }

      resolve({
        value: Math.round(result.value * 10) / 10, // Round to 1 decimal
        date: result.startDate,
      });
    });
  });
}

/**
 * Get today's total step count
 * Uses: getStepCount (returns aggregated total for the day)
 */
export async function fetchTodaySteps(): Promise<StepsReading | null> {
  if (!AppleHealthKit) return null;

  return new Promise((resolve) => {
    const options = {
      date: new Date().toISOString(),
      includeManuallyAdded: true,
    };

    AppleHealthKit.getStepCount(options, (err: string | null, result: any) => {
      if (err || !result || result.value === undefined) {
        console.log('[HealthKit] No steps data:', err);
        resolve(null);
        return;
      }

      resolve({
        value: Math.round(result.value),
        date: new Date().toISOString().split('T')[0], // Today's date
      });
    });
  });
}

/**
 * Get the most recent heart rate reading
 * Uses: getHeartRateSamples with limit: 1
 */
export async function fetchLatestHeartRate(): Promise<HeartRateReading | null> {
  if (!AppleHealthKit) return null;

  return new Promise((resolve) => {
    const options = {
      unit: 'bpm',
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
      endDate: new Date().toISOString(),
      ascending: false,
      limit: 1,
    };

    AppleHealthKit.getHeartRateSamples(options, (err: string | null, results: any[]) => {
      if (err || !results || results.length === 0) {
        console.log('[HealthKit] No heart rate data:', err);
        resolve(null);
        return;
      }

      const latest = results[0];
      resolve({
        value: Math.round(latest.value),
        date: latest.startDate,
      });
    });
  });
}

// ============================================================================
// Combined Fetch Function
// ============================================================================

/**
 * Fetch all 5 key vitals in parallel
 * Returns whatever data is available - doesn't fail if some metrics are missing
 */
export async function fetchAllVitals(): Promise<VitalsSummary> {
  console.log('[HealthKit] Fetching all vitals...');

  const [bloodPressure, glucose, weight, steps, heartRate] = await Promise.all([
    fetchLatestBloodPressure(),
    fetchLatestGlucose(),
    fetchLatestWeight(),
    fetchTodaySteps(),
    fetchLatestHeartRate(),
  ]);

  const summary: VitalsSummary = {
    fetchedAt: new Date().toISOString(),
  };

  if (bloodPressure) {
    summary.bloodPressure = bloodPressure;
    console.log('[HealthKit] BP:', bloodPressure.systolic, '/', bloodPressure.diastolic);
  }
  if (glucose) {
    summary.glucose = glucose;
    console.log('[HealthKit] Glucose:', glucose.value, 'mg/dL');
  }
  if (weight) {
    summary.weight = weight;
    console.log('[HealthKit] Weight:', weight.value, 'lbs');
  }
  if (steps) {
    summary.steps = steps;
    console.log('[HealthKit] Steps:', steps.value);
  }
  if (heartRate) {
    summary.heartRate = heartRate;
    console.log('[HealthKit] Heart Rate:', heartRate.value, 'bpm');
  }

  console.log('[HealthKit] Vitals fetch complete');
  return summary;
}

/**
 * Check if any vitals data is available
 */
export function hasAnyVitals(summary: VitalsSummary): boolean {
  return !!(
    summary.bloodPressure ||
    summary.glucose ||
    summary.weight ||
    summary.steps ||
    summary.heartRate
  );
}
