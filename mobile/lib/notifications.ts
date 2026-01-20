/**
 * Push Notification Service
 * Handles notification permissions, token registration, and badge management
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api/client';

// Configure notification handler behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});


export interface PushTokenData {
  token: string;
  platform: 'ios' | 'android';
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('[Notifications] Error requesting permissions:', error);
    return false;
  }
}

/**
 * Get current notification permissions status
 */
export async function getNotificationPermissions(): Promise<Notifications.PermissionStatus> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status;
  } catch (error) {
    console.error('[Notifications] Error getting permissions:', error);
    return Notifications.PermissionStatus.UNDETERMINED;
  }
}


/**
 * Get Expo push token for the current device
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      console.warn('[Notifications] Permission not granted, cannot get push token');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'e496534e-6396-4109-9051-6569d134e1f7',
    });

    return tokenData.data;
  } catch (error) {
    console.error('[Notifications] Error getting Expo push token:', error);
    return null;
  }
}

/**
 * Register push token with backend (includes device timezone for quiet hours)
 */
export async function registerPushToken(token: string): Promise<void> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    // Get device's current timezone (e.g., 'America/New_York')
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    await api.user.registerPushToken({ token, platform, timezone });
    console.log('[Notifications] Push token registered with timezone:', timezone);
  } catch (error) {
    console.error('[Notifications] Error registering push token:', error);
    throw error;
  }
}

/**
 * Unregister push token from backend
 */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await api.user.unregisterPushToken({ token });
    console.log('[Notifications] Push token unregistered successfully');
  } catch (error) {
    console.error('[Notifications] Error unregistering push token:', error);
    throw error;
  }
}

/**
 * Unregister ALL push tokens for the current user from backend
 * Used during logout to ensure no stale tokens remain
 */
export async function unregisterAllPushTokens(): Promise<void> {
  try {
    await api.user.unregisterAllPushTokens();
    console.log('[Notifications] All push tokens unregistered successfully');
  } catch (error) {
    console.error('[Notifications] Error unregistering all push tokens:', error);
    // Don't throw - we still want to complete logout even if this fails
  }
}

/**
 * Update app badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      await Notifications.setBadgeCountAsync(count);
    }
  } catch (error) {
    console.error('[Notifications] Error setting badge count:', error);
  }
}

/**
 * Clear app badge
 */
export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}

export interface ScheduleReminderOptions {
  medicationId: string;
  medicationName: string;
  medicationDose?: string;
  reminderId?: string;
  delayMinutes: number;
}

/**
 * Schedule a local notification for medication reminder snooze
 */
export async function scheduleLocalMedicationReminder(
  options: ScheduleReminderOptions
): Promise<string> {
  try {
    const doseText = options.medicationDose ? ` (${options.medicationDose})` : '';

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Medication Reminder',
        body: `Time to take your ${options.medicationName}${doseText}`,
        data: {
          type: 'medication_reminder',
          medicationId: options.medicationId,
          medicationName: options.medicationName,
          medicationDose: options.medicationDose,
          reminderId: options.reminderId,
        },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: options.delayMinutes * 60,
      },
    });

    console.log(`[Notifications] Scheduled local reminder in ${options.delayMinutes} min:`, notificationId);
    return notificationId;
  } catch (error) {
    console.error('[Notifications] Error scheduling local notification:', error);
    throw error;
  }
}

/**
 * Cancel a scheduled notification
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log('[Notifications] Cancelled scheduled notification:', notificationId);
  } catch (error) {
    console.error('[Notifications] Error cancelling notification:', error);
  }
}

/**
 * Cancel ALL scheduled notifications
 * Used during logout to prevent snoozed reminders from firing for wrong user
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Notifications] Cancelled all scheduled notifications');
  } catch (error) {
    console.error('[Notifications] Error cancelling all notifications:', error);
  }
}

/**
 * Dismiss all delivered notifications from notification center
 */
export async function dismissAllNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
    console.log('[Notifications] Dismissed all notifications');
  } catch (error) {
    console.error('[Notifications] Error dismissing notifications:', error);
  }
}
