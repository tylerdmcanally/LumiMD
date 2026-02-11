import AsyncStorage from '@react-native-async-storage/async-storage';
import { HEALTHKIT_METRICS } from './types';
import type { HealthKitMetric } from './types';

const V2_PREFIX = 'lumimd:healthkit:v2';

function userPrefix(uid: string): string {
  return `${V2_PREFIX}:${uid}`;
}

function enabledKey(uid: string): string {
  return `${userPrefix(uid)}:enabled`;
}

function lastSyncAtKey(uid: string): string {
  return `${userPrefix(uid)}:lastSyncAt`;
}

function cursorKey(uid: string, metric: HealthKitMetric): string {
  return `${userPrefix(uid)}:cursor:${metric}`;
}

export async function getHealthKitV2SyncEnabled(uid: string): Promise<boolean> {
  if (!uid) return false;
  const value = await AsyncStorage.getItem(enabledKey(uid));
  return value === '1';
}

export async function setHealthKitV2SyncEnabled(uid: string, enabled: boolean): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(enabledKey(uid), enabled ? '1' : '0');
}

export async function getHealthKitV2LastSyncAt(uid: string): Promise<string | null> {
  if (!uid) return null;
  return AsyncStorage.getItem(lastSyncAtKey(uid));
}

export async function setHealthKitV2LastSyncAt(uid: string, isoDate: string): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(lastSyncAtKey(uid), isoDate);
}

export async function getHealthKitV2MetricCursor(uid: string, metric: HealthKitMetric): Promise<string | null> {
  if (!uid) return null;
  return AsyncStorage.getItem(cursorKey(uid, metric));
}

export async function setHealthKitV2MetricCursor(
  uid: string,
  metric: HealthKitMetric,
  cursorIso: string,
): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(cursorKey(uid, metric), cursorIso);
}

export async function clearHealthKitV2MetricCursor(uid: string, metric: HealthKitMetric): Promise<void> {
  if (!uid) return;
  await AsyncStorage.removeItem(cursorKey(uid, metric));
}

export async function getHealthKitV2AllCursors(
  uid: string,
): Promise<Partial<Record<HealthKitMetric, string>>> {
  if (!uid) return {};

  const keys = HEALTHKIT_METRICS.map((metric) => cursorKey(uid, metric));
  const entries = await AsyncStorage.multiGet(keys);
  const cursors: Partial<Record<HealthKitMetric, string>> = {};

  for (const [key, value] of entries) {
    if (!value) continue;
    const parts = key.split(':');
    const metric = parts[parts.length - 1] as HealthKitMetric | undefined;
    if (metric && HEALTHKIT_METRICS.includes(metric)) {
      cursors[metric] = value;
    }
  }

  return cursors;
}

export async function clearHealthKitV2StateForUser(uid: string): Promise<number> {
  if (!uid) return 0;

  const keys = [
    enabledKey(uid),
    lastSyncAtKey(uid),
    ...HEALTHKIT_METRICS.map((metric) => cursorKey(uid, metric)),
  ];

  await AsyncStorage.multiRemove(keys);
  return keys.length;
}

export async function clearAllHealthKitV2State(): Promise<number> {
  const allKeys = await AsyncStorage.getAllKeys();
  const v2Keys = allKeys.filter((key) => key.startsWith(V2_PREFIX));
  if (v2Keys.length === 0) return 0;

  await AsyncStorage.multiRemove(v2Keys);
  return v2Keys.length;
}
