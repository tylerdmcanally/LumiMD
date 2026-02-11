import { cfg } from '../config';
import { probeHealthKitV2PermissionState, requestHealthKitV2Permissions } from './permissions';
import { runHealthKitV2Sync, triggerHealthKitV2ForegroundSync, cancelHealthKitV2SyncForUser } from './syncEngine';
import {
  clearHealthKitV2StateForUser,
  getHealthKitV2LastSyncAt,
  getHealthKitV2SyncEnabled,
  setHealthKitV2SyncEnabled,
} from './syncStateStore';

export * from './types';
export {
  runHealthKitV2Sync,
  triggerHealthKitV2ForegroundSync,
  cancelHealthKitV2SyncForUser,
  probeHealthKitV2PermissionState,
  requestHealthKitV2Permissions,
  getHealthKitV2SyncEnabled,
  setHealthKitV2SyncEnabled,
  getHealthKitV2LastSyncAt,
};

export interface HealthKitV2Status {
  featureEnabled: boolean;
  userEnabled: boolean;
  permissionState: Awaited<ReturnType<typeof probeHealthKitV2PermissionState>>['state'];
  permissionReason?: string;
  lastSyncAt: string | null;
}

export interface HealthKitV2ConnectResult {
  connected: boolean;
  permissionState: Awaited<ReturnType<typeof probeHealthKitV2PermissionState>>['state'];
  message?: string;
  sync?: Awaited<ReturnType<typeof runHealthKitV2Sync>>;
}

export async function getHealthKitV2Status(uid: string): Promise<HealthKitV2Status> {
  try {
    const [permission, userEnabled, lastSyncAt] = await Promise.all([
      probeHealthKitV2PermissionState(),
      getHealthKitV2SyncEnabled(uid),
      getHealthKitV2LastSyncAt(uid),
    ]);

    return {
      featureEnabled: cfg.flags.healthkitV2,
      userEnabled,
      permissionState: permission.state,
      permissionReason: permission.reason,
      lastSyncAt,
    };
  } catch (error) {
    console.warn('[HealthKitV2] Failed to fetch status', { uid, error });
    return {
      featureEnabled: cfg.flags.healthkitV2,
      userEnabled: false,
      permissionState: 'unavailable',
      permissionReason: 'Unable to read HealthKit status right now.',
      lastSyncAt: null,
    };
  }
}

export async function connectHealthKitV2(
  uid: string,
  options?: { runInitialSync?: boolean },
): Promise<HealthKitV2ConnectResult> {
  if (!uid) {
    return {
      connected: false,
      permissionState: 'notDetermined',
      message: 'Missing user id.',
    };
  }

  if (!cfg.flags.healthkitV2) {
    return {
      connected: false,
      permissionState: 'notDetermined',
      message: 'HealthKit v2 is disabled by feature flag.',
    };
  }

  try {
    const permission = await requestHealthKitV2Permissions();
    if (permission.state !== 'authorized') {
      await setHealthKitV2SyncEnabled(uid, false);
      return {
        connected: false,
        permissionState: permission.state,
        message: permission.reason,
      };
    }

    await setHealthKitV2SyncEnabled(uid, true);

    if (options?.runInitialSync === false) {
      return {
        connected: true,
        permissionState: 'authorized',
      };
    }

    const sync = await runHealthKitV2Sync({ uid, reason: 'manual' });

    return {
      connected: sync.success || sync.status === 'no_data' || sync.status === 'skipped',
      permissionState: 'authorized',
      message: sync.message,
      sync,
    };
  } catch (error) {
    console.warn('[HealthKitV2] Connect failed', { uid, error });
    return {
      connected: false,
      permissionState: 'notDetermined',
      message: 'Unable to connect Apple Health right now. Please try again.',
    };
  }
}

export async function disconnectHealthKitV2(uid: string): Promise<void> {
  if (!uid) return;
  cancelHealthKitV2SyncForUser(uid);
  await setHealthKitV2SyncEnabled(uid, false);
}

export async function refreshHealthKitV2Permission(uid: string): Promise<HealthKitV2Status> {
  try {
    const permission = await probeHealthKitV2PermissionState();
    if (uid && permission.state === 'denied') {
      await setHealthKitV2SyncEnabled(uid, false);
    }
  } catch (error) {
    console.warn('[HealthKitV2] Permission refresh failed', { uid, error });
  }

  return getHealthKitV2Status(uid);
}

export async function handleHealthKitV2SignOut(uid: string): Promise<number> {
  cancelHealthKitV2SyncForUser(uid);
  return clearHealthKitV2StateForUser(uid);
}
