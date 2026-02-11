import type { CreateHealthLogRequest, HealthLogType } from '@lumimd/sdk';

export type HealthKitPermissionState = 'unavailable' | 'notDetermined' | 'authorized' | 'denied';

export type HealthKitMetric = Extract<HealthLogType, 'bp' | 'glucose' | 'weight' | 'heart_rate' | 'oxygen_saturation' | 'steps'>;

export const HEALTHKIT_METRICS: HealthKitMetric[] = [
  'bp',
  'glucose',
  'weight',
  'heart_rate',
  'oxygen_saturation',
  'steps',
];

export interface HealthKitPermissionResult {
  state: HealthKitPermissionState;
  reason?: string;
}

export interface HealthKitSyncSample {
  metric: HealthKitMetric;
  sourceId: string;
  recordedAt: string;
  value: CreateHealthLogRequest['value'];
}

export interface HealthKitSyncResult {
  success: boolean;
  status:
    | 'disabled'
    | 'skipped'
    | 'unavailable'
    | 'not_authorized'
    | 'no_data'
    | 'synced'
    | 'partial'
    | 'error';
  synced: number;
  skipped: number;
  errors: number;
  startedAt: string;
  finishedAt: string;
  message?: string;
  metrics?: Partial<Record<HealthKitMetric, { queried: number; synced: number; skipped: number; errors: number }>>;
}

export interface RunHealthKitSyncOptions {
  uid: string;
  reason: 'manual' | 'foreground' | 'startup' | 'background';
  now?: Date;
}

export interface HealthKitSyncCursor {
  metric: HealthKitMetric;
  cursorIso: string;
}

export interface HealthKitSyncWindow {
  startIso: string;
  endIso: string;
}
