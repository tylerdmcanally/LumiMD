import { cfg } from '../config';
import { api } from '../api/client';
import { normalizeHealthKitV2Sample } from './normalizers';
import { ensureHealthKitV2Initialized, probeHealthKitV2PermissionState } from './permissions';
import { queryHealthKitV2Samples } from './queries';
import {
  getHealthKitV2LastSyncAt,
  getHealthKitV2MetricCursor,
  getHealthKitV2SyncEnabled,
  setHealthKitV2LastSyncAt,
  setHealthKitV2MetricCursor,
  setHealthKitV2SyncEnabled,
} from './syncStateStore';
import { HEALTHKIT_METRICS } from './types';
import type { HealthKitMetric, HealthKitSyncResult, RunHealthKitSyncOptions } from './types';

const inFlightByUid = new Map<string, Promise<HealthKitSyncResult>>();
const foregroundTimersByUid = new Map<string, ReturnType<typeof setTimeout>>();
const FOREGROUND_DEBOUNCE_MS = 2500;
const MIN_SYNC_INTERVAL_MS = 60_000;
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;
const STEPS_CURSOR_OVERLAP_MS = 24 * 60 * 60 * 1000;
const QUERY_MAX_ATTEMPTS = 2;
const UPLOAD_MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;
const UPLOAD_CONCURRENCY = 3;

const INITIAL_LOOKBACK_DAYS: Record<HealthKitMetric, number> = {
  bp: 30,
  glucose: 30,
  weight: 30,
  heart_rate: 3,
  oxygen_saturation: 3,
  steps: 7,
};

function createResult(
  status: HealthKitSyncResult['status'],
  startedAt: Date,
  message?: string,
  partial?: Partial<HealthKitSyncResult>,
): HealthKitSyncResult {
  return {
    success: status === 'synced' || status === 'partial' || status === 'no_data' || status === 'skipped',
    status,
    synced: 0,
    skipped: 0,
    errors: 0,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    message,
    ...partial,
  };
}

function isPermissionLikeErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('denied') ||
    normalized.includes('not authorized') ||
    normalized.includes('authorization') ||
    normalized.includes('not determined')
  );
}

function isExpectedMetricQueryError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('method unavailable') ||
    normalized.includes('unsupported metric') ||
    normalized.includes('no data available') ||
    normalized.includes('no samples found')
  );
}

function isSyncSuccessStatus(status: HealthKitSyncResult['status']): boolean {
  return status === 'synced' || status === 'partial' || status === 'no_data' || status === 'skipped';
}

function buildPartialSyncMessage(synced: number, errors: number): string {
  if (synced > 0) {
    return `Synced ${synced} samples. Some metrics could not be read (${errors}).`;
  }
  return `Some Health metrics could not be read (${errors}). Pull to retry.`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableUploadError(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === 'number' && (status === 429 || status >= 500)) {
    return true;
  }

  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('temporarily') ||
    message.includes('fetch')
  );
}

async function queryWithRetry(metric: HealthKitMetric, startIso: string, endIso: string) {
  let lastResult = await queryHealthKitV2Samples(metric, { startIso, endIso });
  let attempt = 1;

  while (
    lastResult.error &&
    !isPermissionLikeErrorMessage(lastResult.error) &&
    !isExpectedMetricQueryError(lastResult.error) &&
    attempt < QUERY_MAX_ATTEMPTS
  ) {
    attempt += 1;
    await delay(RETRY_DELAY_MS);
    lastResult = await queryHealthKitV2Samples(metric, { startIso, endIso });
  }

  return { result: lastResult, attempts: attempt };
}

async function uploadWithRetry(payload: Record<string, unknown>) {
  let attempt = 1;

  while (true) {
    try {
      const result = await api.healthLogs.create(payload as any);
      return { result: result as unknown as Record<string, unknown>, attempts: attempt };
    } catch (error) {
      if (attempt >= UPLOAD_MAX_ATTEMPTS || !isRetryableUploadError(error)) {
        throw error;
      }
      attempt += 1;
      await delay(RETRY_DELAY_MS);
    }
  }
}

async function shouldSkipSyncWindow(uid: string, reason: RunHealthKitSyncOptions['reason'], now: Date): Promise<boolean> {
  if (reason === 'manual') return false;

  const lastSyncAt = await getHealthKitV2LastSyncAt(uid);
  if (!lastSyncAt) return false;

  const lastSyncMs = new Date(lastSyncAt).getTime();
  if (Number.isNaN(lastSyncMs)) return false;

  return now.getTime() - lastSyncMs < MIN_SYNC_INTERVAL_MS;
}

async function getMetricWindowStart(metric: HealthKitMetric, uid: string, now: Date): Promise<string> {
  const cursor = await getHealthKitV2MetricCursor(uid, metric);
  const lookbackDays = INITIAL_LOOKBACK_DAYS[metric];
  const fallbackStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  if (!cursor) {
    return fallbackStart.toISOString();
  }

  const cursorTime = new Date(cursor).getTime();
  if (Number.isNaN(cursorTime)) {
    return fallbackStart.toISOString();
  }

  const overlap = metric === 'steps' ? STEPS_CURSOR_OVERLAP_MS : CURSOR_OVERLAP_MS;
  const overlapStart = new Date(cursorTime - overlap);

  return overlapStart > fallbackStart ? overlapStart.toISOString() : fallbackStart.toISOString();
}

async function runSyncInternal(options: RunHealthKitSyncOptions): Promise<HealthKitSyncResult> {
  const startedAt = options.now ?? new Date();
  const { uid } = options;

  if (!uid) {
    return createResult('error', startedAt, 'Missing user id for HealthKit sync.', {
      success: false,
      errors: 1,
    });
  }

  if (!cfg.flags.healthkitV2) {
    return createResult('disabled', startedAt, 'HealthKit v2 flag is disabled.', {
      success: false,
    });
  }

  const enabled = await getHealthKitV2SyncEnabled(uid);
  if (!enabled) {
    return createResult('disabled', startedAt, 'HealthKit sync is disabled for this user.', {
      success: false,
    });
  }

  if (await shouldSkipSyncWindow(uid, options.reason, startedAt)) {
    return createResult('skipped', startedAt, 'Skipping sync because a recent sync already ran.');
  }

  const permission = await probeHealthKitV2PermissionState();
  if (permission.state === 'unavailable') {
    return createResult('unavailable', startedAt, permission.reason, { success: false });
  }

  if (permission.state !== 'authorized') {
    if (permission.state === 'denied') {
      await setHealthKitV2SyncEnabled(uid, false);
    }
    return createResult('not_authorized', startedAt, permission.reason, { success: false });
  }

  const initialized = await ensureHealthKitV2Initialized();
  if (initialized.state !== 'authorized') {
    if (initialized.state === 'denied') {
      await setHealthKitV2SyncEnabled(uid, false);
    }
    return createResult('not_authorized', startedAt, initialized.reason, { success: false });
  }

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  const metrics: HealthKitSyncResult['metrics'] = {};

  const nowIso = startedAt.toISOString();
  console.log('[HealthKitV2] Sync start', { uid, reason: options.reason, startedAt: nowIso });

  for (const metric of HEALTHKIT_METRICS) {
    const metricStartedAt = Date.now();
    const startIso = await getMetricWindowStart(metric, uid, startedAt);
    const metricStats = { queried: 0, synced: 0, skipped: 0, errors: 0 };

    const { result: queryResult, attempts: queryAttempts } = await queryWithRetry(metric, startIso, nowIso);
    if (queryResult.error) {
      if (isPermissionLikeErrorMessage(queryResult.error)) {
        await setHealthKitV2SyncEnabled(uid, false);
        return createResult('not_authorized', startedAt, queryResult.error, {
          success: false,
          synced,
          skipped,
          errors: errors + 1,
          metrics: {
            ...metrics,
            [metric]: { ...metricStats, errors: metricStats.errors + 1 },
          },
        });
      }

      if (isExpectedMetricQueryError(queryResult.error)) {
        metrics[metric] = metricStats;
        console.log('[HealthKitV2] Metric query unavailable', {
          uid,
          metric,
          attempts: queryAttempts,
          message: queryResult.error,
        });
        continue;
      }

      errors += 1;
      metricStats.errors += 1;
      metrics[metric] = metricStats;
      console.warn('[HealthKitV2] Metric query failed', {
        uid,
        metric,
        attempts: queryAttempts,
        error: queryResult.error,
      });
      continue;
    }

    metricStats.queried = queryResult.samples.length;
    const normalizedSamples = queryResult.samples
      .map((raw) => normalizeHealthKitV2Sample(metric, raw))
      .filter((sample): sample is NonNullable<typeof sample> => sample !== null);

    const droppedSamples = queryResult.samples.length - normalizedSamples.length;
    if (droppedSamples > 0) {
      skipped += droppedSamples;
      metricStats.skipped += droppedSamples;
    }

    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, normalizedSamples.length) }, () =>
      (async () => {
        while (nextIndex < normalizedSamples.length) {
          const current = normalizedSamples[nextIndex++];
          if (!current) break;

          try {
            const { result, attempts: uploadAttempts } = await uploadWithRetry({
              type: metric,
              value: current.value,
              source: 'healthkit',
              sourceId: current.sourceId,
              recordedAt: current.recordedAt,
            });

            if (result?.duplicate === true) {
              skipped += 1;
              metricStats.skipped += 1;
              continue;
            }

            if (uploadAttempts > 1) {
              console.log('[HealthKitV2] Upload retried', { uid, metric, uploadAttempts });
            }

            synced += 1;
            metricStats.synced += 1;
          } catch (error) {
            errors += 1;
            metricStats.errors += 1;
            console.warn('[HealthKitV2] Upload failed', { uid, metric, error });
          }
        }
      })(),
    );

    await Promise.all(workers);

    // Cursor advances only for windows that completed without upload/query failures.
    if (metricStats.errors === 0) {
      await setHealthKitV2MetricCursor(uid, metric, nowIso);
    }

    metrics[metric] = metricStats;
    console.log('[HealthKitV2] Metric complete', {
      uid,
      metric,
      queryAttempts,
      queried: metricStats.queried,
      synced: metricStats.synced,
      skipped: metricStats.skipped,
      errors: metricStats.errors,
      durationMs: Date.now() - metricStartedAt,
    });
  }

  await setHealthKitV2LastSyncAt(uid, nowIso);

  if (errors > 0) {
    if (synced > 0 || skipped > 0) {
      console.log('[HealthKitV2] Sync finished with partial success', {
        uid,
        synced,
        skipped,
        errors,
        durationMs: Date.now() - startedAt.getTime(),
      });
      return createResult('partial', startedAt, buildPartialSyncMessage(synced, errors), {
        synced,
        skipped,
        errors,
        metrics,
      });
    }

    console.log('[HealthKitV2] Sync finished with errors', {
      uid,
      synced,
      skipped,
      errors,
      durationMs: Date.now() - startedAt.getTime(),
    });
    return createResult('error', startedAt, 'HealthKit sync failed.', {
      success: false,
      synced,
      skipped,
      errors,
      metrics,
    });
  }

  if (synced === 0) {
    console.log('[HealthKitV2] Sync finished with no data', {
      uid,
      skipped,
      durationMs: Date.now() - startedAt.getTime(),
    });
    return createResult('no_data', startedAt, 'No new HealthKit samples found.', {
      synced,
      skipped,
      errors,
      metrics,
    });
  }

  console.log('[HealthKitV2] Sync finished', {
    uid,
    synced,
    skipped,
    errors,
    durationMs: Date.now() - startedAt.getTime(),
  });
  return createResult('synced', startedAt, undefined, {
    synced,
    skipped,
    errors,
    metrics,
  });
}

export async function runHealthKitV2Sync(options: RunHealthKitSyncOptions): Promise<HealthKitSyncResult> {
  const { uid } = options;
  if (!uid) {
    return createResult('error', options.now ?? new Date(), 'Missing user id for HealthKit sync.', {
      success: false,
      errors: 1,
    });
  }

  const existing = inFlightByUid.get(uid);
  if (existing) {
    return existing;
  }

  const startedAt = options.now ?? new Date();
  const promise = (async () => {
    try {
      return await runSyncInternal(options);
    } catch (error) {
      console.warn('[HealthKitV2] Unexpected sync failure', { uid, error });
      return createResult('error', startedAt, 'HealthKit sync failed unexpectedly.', {
        success: false,
        errors: 1,
      });
    }
  })().finally(() => {
    inFlightByUid.delete(uid);
  });

  inFlightByUid.set(uid, promise);
  return promise;
}

export function triggerHealthKitV2ForegroundSync(uid: string): void {
  if (!uid) return;

  const previousTimer = foregroundTimersByUid.get(uid);
  if (previousTimer) {
    clearTimeout(previousTimer);
  }

  const timer = setTimeout(() => {
    foregroundTimersByUid.delete(uid);
    runHealthKitV2Sync({ uid, reason: 'foreground' })
      .then((result) => {
        if (!isSyncSuccessStatus(result.status)) {
          console.warn('[HealthKitV2] Foreground sync status', { uid, status: result.status, message: result.message });
        }
      })
      .catch((error) => {
        console.warn('[HealthKitV2] Foreground sync failed', { uid, error });
      });
  }, FOREGROUND_DEBOUNCE_MS);

  foregroundTimersByUid.set(uid, timer);
}

export function cancelHealthKitV2SyncForUser(uid: string): void {
  if (!uid) return;
  const timer = foregroundTimersByUid.get(uid);
  if (timer) {
    clearTimeout(timer);
    foregroundTimersByUid.delete(uid);
  }
}

export function cancelAllHealthKitV2Sync(): void {
  for (const [uid, timer] of foregroundTimersByUid.entries()) {
    clearTimeout(timer);
    foregroundTimersByUid.delete(uid);
  }
}

export async function getMetricCursorDebug(uid: string, metric: HealthKitMetric): Promise<string | null> {
  return getHealthKitV2MetricCursor(uid, metric);
}
