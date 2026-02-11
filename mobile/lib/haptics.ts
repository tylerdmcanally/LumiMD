/**
 * Haptic feedback utilities for LumiMD
 * Provides tactile feedback for key interactions
 */

import { Platform } from 'react-native';

type ExpoHapticsModule = {
  impactAsync: (style: unknown) => Promise<void>;
  notificationAsync: (type: unknown) => Promise<void>;
  selectionAsync: () => Promise<void>;
  ImpactFeedbackStyle: {
    Light: unknown;
    Medium: unknown;
    Heavy: unknown;
  };
  NotificationFeedbackType: {
    Success: unknown;
    Warning: unknown;
    Error: unknown;
  };
};

function loadExpoHaptics(): ExpoHapticsModule | null {
  try {
    return require('expo-haptics') as ExpoHapticsModule;
  } catch {
    return null;
  }
}

const Haptics = loadExpoHaptics();

// Only trigger haptics on iOS (Android support is inconsistent)
const isHapticsSupported = Platform.OS === 'ios' && Haptics !== null;

export const haptic = {
  /**
   * Light impact - for subtle UI feedback
   * Use for: button presses, toggles, selections
   */
  light: async () => {
    if (!isHapticsSupported || !Haptics) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },

  /**
   * Medium impact - for moderate feedback
   * Use for: confirming actions, navigation
   */
  medium: async () => {
    if (!isHapticsSupported || !Haptics) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },

  /**
   * Heavy impact - for significant actions
   * Use for: recording start/stop, important confirmations
   */
  heavy: async () => {
    if (!isHapticsSupported || !Haptics) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  },

  /**
   * Success notification - for positive confirmations
   * Use for: medication logged, visit saved, action completed
   */
  success: async () => {
    if (!isHapticsSupported || !Haptics) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },

  /**
   * Warning notification - for caution states
   * Use for: validation issues, incomplete forms
   */
  warning: async () => {
    if (!isHapticsSupported || !Haptics) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },

  /**
   * Error notification - for error states
   * Use for: failed actions, critical alerts
   */
  error: async () => {
    if (!isHapticsSupported || !Haptics) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },

  /**
   * Selection changed - for picker/selection feedback
   * Use for: scrolling through pickers, toggles
   */
  selection: async () => {
    if (!isHapticsSupported || !Haptics) return;
    await Haptics.selectionAsync();
  },
};
