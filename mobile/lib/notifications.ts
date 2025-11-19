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
    return 'undetermined';
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
 * Register push token with backend
 */
export async function registerPushToken(token: string): Promise<void> {
  try {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await api.user.registerPushToken({ token, platform });
    console.log('[Notifications] Push token registered successfully');
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

