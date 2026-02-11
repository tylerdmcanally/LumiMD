import { getHealthKitV2Module } from './permissions';
import type { HealthKitMetric, HealthKitSyncWindow } from './types';

const QUERY_LIMIT = 200;
const QUERY_TIMEOUT_MS = 30_000;

const METRIC_QUERY_LIMITS: Record<HealthKitMetric, number> = {
  bp: 120,
  glucose: 120,
  weight: 120,
  heart_rate: 90,
  oxygen_saturation: 90,
  steps: 45,
};

interface QueryOptions {
  startDate: string;
  endDate: string;
  ascending?: boolean;
  limit?: number;
  includeManuallyAdded?: boolean;
  unit?: string;
}

type HealthKitCallback<T> = (error: unknown, results: T) => void;
type HealthKitMethod<T = unknown[]> = (options: QueryOptions, callback: HealthKitCallback<T>) => void;

export interface HealthKitQueryResult {
  metric: HealthKitMetric;
  samples: unknown[];
  error?: string;
}

function errorToMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? 'unknown');
}

function invokeQueryMethod(
  method: HealthKitMethod<unknown[]> | undefined,
  options: QueryOptions,
  methodName: string,
): Promise<{ samples: unknown[]; error?: string }> {
  if (typeof method !== 'function') {
    return Promise.resolve({
      samples: [],
      error: `HealthKit method unavailable: ${methodName}`,
    });
  }

  return new Promise((resolve) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        samples: [],
        error: `HealthKit query timeout: ${methodName}`,
      });
    }, QUERY_TIMEOUT_MS);

    method(options, (error, results) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (error) {
        resolve({ samples: [], error: errorToMessage(error) });
        return;
      }

      resolve({ samples: Array.isArray(results) ? results : [] });
    });
  });
}

function buildBaseOptions(metric: HealthKitMetric, window: HealthKitSyncWindow): QueryOptions {
  return {
    startDate: window.startIso,
    endDate: window.endIso,
    ascending: false,
    limit: METRIC_QUERY_LIMITS[metric] ?? QUERY_LIMIT,
  };
}

export async function queryHealthKitV2Samples(
  metric: HealthKitMetric,
  window: HealthKitSyncWindow,
): Promise<HealthKitQueryResult> {
  const module = getHealthKitV2Module();

  if (!module) {
    return {
      metric,
      samples: [],
      error: 'Native HealthKit module unavailable in this build.',
    };
  }

  const base = buildBaseOptions(metric, window);

  if (metric === 'bp') {
    const result = await invokeQueryMethod(
      (module as { getBloodPressureSamples?: HealthKitMethod }).getBloodPressureSamples,
      base,
      'getBloodPressureSamples',
    );
    return { metric, ...result };
  }

  if (metric === 'glucose') {
    const result = await invokeQueryMethod(
      (module as { getBloodGlucoseSamples?: HealthKitMethod }).getBloodGlucoseSamples,
      { ...base, unit: 'mgPerdL' },
      'getBloodGlucoseSamples',
    );
    return { metric, ...result };
  }

  if (metric === 'weight') {
    const result = await invokeQueryMethod(
      (module as { getWeightSamples?: HealthKitMethod }).getWeightSamples,
      { ...base, unit: 'pound' },
      'getWeightSamples',
    );
    return { metric, ...result };
  }

  if (metric === 'heart_rate') {
    const result = await invokeQueryMethod(
      (module as { getHeartRateSamples?: HealthKitMethod }).getHeartRateSamples,
      { ...base, unit: 'bpm' },
      'getHeartRateSamples',
    );
    return { metric, ...result };
  }

  if (metric === 'oxygen_saturation') {
    const result = await invokeQueryMethod(
      (module as { getOxygenSaturationSamples?: HealthKitMethod }).getOxygenSaturationSamples,
      base,
      'getOxygenSaturationSamples',
    );
    return { metric, ...result };
  }

  if (metric === 'steps') {
    const result = await invokeQueryMethod(
      (module as { getDailyStepCountSamples?: HealthKitMethod }).getDailyStepCountSamples,
      {
        ...base,
        includeManuallyAdded: true,
      },
      'getDailyStepCountSamples',
    );
    return { metric, ...result };
  }

  return {
    metric,
    samples: [],
    error: `Unsupported metric: ${metric}`,
  };
}
