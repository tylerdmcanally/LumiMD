import { Platform } from 'react-native';
import type { HealthKitPermissionResult } from './types';

type HealthKitReadPermissionName =
  | 'Weight'
  | 'HeartRate'
  | 'BloodPressureSystolic'
  | 'BloodPressureDiastolic'
  | 'BloodGlucose'
  | 'OxygenSaturation'
  | 'StepCount';

interface NativeHealthKitPermissionOptions {
  permissions: {
    read: HealthKitReadPermissionName[];
    write: string[];
  };
}

interface NativeHealthKitModule {
  isAvailable?: (callback: (error: unknown, available: boolean) => void) => void;
  initHealthKit?: (options: NativeHealthKitPermissionOptions, callback: (error: unknown) => void) => void;
  getAuthStatus?: (
    options: NativeHealthKitPermissionOptions,
    callback: (error: unknown, result: unknown) => void,
  ) => void;
  getHeartRateSamples?: (
    options: { startDate: string; endDate: string; limit?: number; ascending?: boolean },
    callback: (error: unknown, results: unknown[]) => void,
  ) => void;
  getWeightSamples?: (
    options: { startDate: string; endDate: string; limit?: number; ascending?: boolean; unit?: string },
    callback: (error: unknown, results: unknown[]) => void,
  ) => void;
}

const HEALTHKIT_V2_READ_PERMISSIONS: HealthKitReadPermissionName[] = [
  'Weight',
  'HeartRate',
  'BloodPressureSystolic',
  'BloodPressureDiastolic',
  'BloodGlucose',
  'OxygenSaturation',
  'StepCount',
];

const HEALTHKIT_PERMISSION_OPTIONS: NativeHealthKitPermissionOptions = {
  permissions: {
    read: HEALTHKIT_V2_READ_PERMISSIONS,
    write: [],
  },
};

let initializedThisLaunch = false;

export function getHealthKitV2PermissionOptions(): NativeHealthKitPermissionOptions {
  return HEALTHKIT_PERMISSION_OPTIONS;
}

export function getHealthKitV2Module(): NativeHealthKitModule | null {
  try {
    const mod = require('react-native-health');
    return (mod?.default || mod?.AppleHealthKit || mod) as NativeHealthKitModule;
  } catch {
    return null;
  }
}

function errorToMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? 'unknown');
}

function looksDeniedError(error: unknown): boolean {
  const message = errorToMessage(error).toLowerCase();
  return (
    message.includes('denied') ||
    message.includes('not authorized') ||
    message.includes('authorization denied') ||
    message.includes('authorization was denied') ||
    message.includes('hkerrorauthorizationdenied')
  );
}

function looksNotDeterminedError(error: unknown): boolean {
  const message = errorToMessage(error).toLowerCase();
  return (
    message.includes('not determined') ||
    message.includes('authorization not determined') ||
    message.includes('hkerrorauthorizationnotdetermined') ||
    message.includes('not yet requested')
  );
}

function parseAuthStatusPayload(result: unknown): HealthKitPermissionResult | null {
  if (result == null) return null;

  const normalized = JSON.stringify(result).toLowerCase();
  if (
    normalized.includes('denied') ||
    normalized.includes('authorizationdenied') ||
    normalized.includes('status":1')
  ) {
    return { state: 'denied', reason: 'Health permissions are denied.' };
  }
  if (
    normalized.includes('authorized') ||
    normalized.includes('sharingauthorized') ||
    normalized.includes('status":2')
  ) {
    return { state: 'authorized' };
  }
  if (
    normalized.includes('notdetermined') ||
    normalized.includes('not_determined') ||
    normalized.includes('status":0')
  ) {
    return { state: 'notDetermined' };
  }

  return null;
}

async function checkAvailability(module: NativeHealthKitModule): Promise<HealthKitPermissionResult> {
  if (typeof module.isAvailable !== 'function') {
    return { state: 'unavailable', reason: 'HealthKit availability API missing.' };
  }

  return new Promise<HealthKitPermissionResult>((resolve) => {
    module.isAvailable?.((error, available) => {
      if (error) {
        resolve({ state: 'unavailable', reason: errorToMessage(error) });
        return;
      }
      if (!available) {
        resolve({ state: 'unavailable', reason: 'HealthKit is unavailable on this device.' });
        return;
      }
      resolve({ state: 'notDetermined' });
    });
  });
}

async function probeAuthStatus(module: NativeHealthKitModule): Promise<HealthKitPermissionResult | null> {
  if (typeof module.getAuthStatus !== 'function') {
    return null;
  }

  return new Promise<HealthKitPermissionResult | null>((resolve) => {
    module.getAuthStatus?.(HEALTHKIT_PERMISSION_OPTIONS, (error, result) => {
      if (error) {
        if (looksDeniedError(error)) {
          resolve({ state: 'denied', reason: errorToMessage(error) });
          return;
        }
        if (looksNotDeterminedError(error)) {
          resolve({ state: 'notDetermined', reason: errorToMessage(error) });
          return;
        }
        resolve(null);
        return;
      }

      resolve(parseAuthStatusPayload(result));
    });
  });
}

async function probeReadAccess(module: NativeHealthKitModule): Promise<HealthKitPermissionResult> {
  const now = new Date();
  const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endDate = now.toISOString();

  const probeOptions = {
    startDate,
    endDate,
    limit: 1,
    ascending: false,
  };

  const probeMethods: Array<
    ((callback: (error: unknown, results: unknown[]) => void) => void) | null
  > = [
    typeof module.getHeartRateSamples === 'function'
      ? (callback) => module.getHeartRateSamples?.(probeOptions, callback)
      : null,
    typeof module.getWeightSamples === 'function'
      ? (callback) => module.getWeightSamples?.({ ...probeOptions, unit: 'pound' }, callback)
      : null,
  ];

  const availableProbe = probeMethods.find(Boolean);
  if (!availableProbe) {
    return {
      state: 'notDetermined',
      reason: 'Unable to probe Health permissions from this build.',
    };
  }

  return new Promise<HealthKitPermissionResult>((resolve) => {
    availableProbe((error) => {
      if (!error) {
        resolve({ state: 'authorized' });
        return;
      }

      if (looksDeniedError(error)) {
        resolve({ state: 'denied', reason: errorToMessage(error) });
        return;
      }

      if (looksNotDeterminedError(error)) {
        resolve({ state: 'notDetermined', reason: errorToMessage(error) });
        return;
      }

      resolve({
        state: 'notDetermined',
        reason: `Unable to verify Health permissions: ${errorToMessage(error)}`,
      });
    });
  });
}

export async function probeHealthKitV2PermissionState(): Promise<HealthKitPermissionResult> {
  if (Platform.OS !== 'ios') {
    return { state: 'unavailable', reason: 'HealthKit is only available on iOS.' };
  }

  const module = getHealthKitV2Module();
  if (!module) {
    return {
      state: 'unavailable',
      reason: 'Native HealthKit module is not installed in this build.',
    };
  }

  const availability = await checkAvailability(module);
  if (availability.state === 'unavailable') {
    return availability;
  }

  const authStatus = await probeAuthStatus(module);
  if (authStatus?.state === 'authorized' || authStatus?.state === 'denied') {
    return authStatus;
  }
  if (authStatus?.state === 'notDetermined' && authStatus.reason) {
    return authStatus;
  }

  return probeReadAccess(module);
}

export async function requestHealthKitV2Permissions(): Promise<HealthKitPermissionResult> {
  if (Platform.OS !== 'ios') {
    return { state: 'unavailable', reason: 'HealthKit is only available on iOS.' };
  }

  const module = getHealthKitV2Module();
  if (!module) {
    return {
      state: 'unavailable',
      reason: 'Native HealthKit module is not installed in this build.',
    };
  }

  const availability = await checkAvailability(module);
  if (availability.state === 'unavailable') {
    return availability;
  }

  if (typeof module.initHealthKit !== 'function') {
    return {
      state: 'unavailable',
      reason: 'HealthKit initialization API is not available.',
    };
  }

  const initResult = await new Promise<HealthKitPermissionResult>((resolve) => {
    module.initHealthKit?.(HEALTHKIT_PERMISSION_OPTIONS, (error) => {
      if (!error) {
        initializedThisLaunch = true;
        resolve({ state: 'authorized' });
        return;
      }

      if (looksDeniedError(error)) {
        resolve({ state: 'denied', reason: errorToMessage(error) });
        return;
      }

      if (looksNotDeterminedError(error)) {
        resolve({ state: 'notDetermined', reason: errorToMessage(error) });
        return;
      }

      resolve({ state: 'denied', reason: errorToMessage(error) });
    });
  });

  if (initResult.state !== 'authorized') {
    return initResult;
  }

  return probeHealthKitV2PermissionState();
}

export async function ensureHealthKitV2Initialized(): Promise<HealthKitPermissionResult> {
  if (initializedThisLaunch) {
    return { state: 'authorized' };
  }

  const permission = await probeHealthKitV2PermissionState();
  if (permission.state !== 'authorized') {
    return permission;
  }

  const module = getHealthKitV2Module();
  if (!module || typeof module.initHealthKit !== 'function') {
    return {
      state: 'unavailable',
      reason: 'HealthKit initialization API is not available.',
    };
  }

  return new Promise<HealthKitPermissionResult>((resolve) => {
    module.initHealthKit?.(HEALTHKIT_PERMISSION_OPTIONS, (error) => {
      if (!error) {
        initializedThisLaunch = true;
        resolve({ state: 'authorized' });
        return;
      }

      if (looksDeniedError(error)) {
        resolve({ state: 'denied', reason: errorToMessage(error) });
        return;
      }

      if (looksNotDeterminedError(error)) {
        resolve({ state: 'notDetermined', reason: errorToMessage(error) });
        return;
      }

      resolve({ state: 'notDetermined', reason: errorToMessage(error) });
    });
  });
}
