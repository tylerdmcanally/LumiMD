/**
 * Conversion Nudges Module
 * 
 * Contextual prompts shown to free users when they perform manual actions
 * that premium automates. Designed to drive subscription conversion.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '@lumimd/sdk';

// Storage keys
const NUDGE_DISMISSALS_KEY = 'lumimd:nudge_dismissals';
const NUDGE_LAST_SHOWN_KEY = 'lumimd:nudge_last_shown';
const NUDGE_SESSION_SHOWN_KEY = 'lumimd:nudge_session_shown';

// Nudge types
export type NudgeType = 
  | 'manual_med_add'
  | 'manual_action_add'
  | 'multiple_meds';

// Nudge configuration
export interface NudgeConfig {
  type: NudgeType;
  title: string;
  message: string;
  cooldownDays: number;
}

// Nudge configurations
export const NUDGE_CONFIGS: Record<NudgeType, NudgeConfig> = {
  manual_med_add: {
    type: 'manual_med_add',
    title: 'Save time on medications',
    message: 'Record your next visit and we\'ll extract medications automatically — no typing needed.',
    cooldownDays: 7,
  },
  manual_action_add: {
    type: 'manual_action_add',
    title: 'Get automatic reminders',
    message: 'Premium members get action items extracted from visit summaries automatically.',
    cooldownDays: 7,
  },
  multiple_meds: {
    type: 'multiple_meds',
    title: 'Managing multiple medications?',
    message: 'Record visits to keep your medication list synced automatically with every doctor appointment.',
    cooldownDays: 14,
  },
};

// Minimum account age before showing nudges (in days)
const MIN_ACCOUNT_AGE_DAYS = 3;

/**
 * Check if a nudge should be shown based on various conditions.
 */
export async function shouldShowNudge(
  type: NudgeType,
  userProfile?: Partial<UserProfile> | null,
): Promise<boolean> {
  // Don't show nudges if user is subscribed
  if (userProfile?.subscriptionStatus === 'active') {
    return false;
  }

  // Don't show nudges if bypass is enabled (testing/beta users)
  if (userProfile?.bypassPaywall === true) {
    return false;
  }

  // Check if account is too new
  if (userProfile?.createdAt) {
    const accountAgeDays = (Date.now() - Date.parse(userProfile.createdAt)) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS) {
      return false;
    }
  }

  // Check if nudge was permanently dismissed
  const dismissals = await getDismissals();
  if (dismissals.includes(type)) {
    return false;
  }

  // Check if already shown a nudge this session
  const sessionShown = await AsyncStorage.getItem(NUDGE_SESSION_SHOWN_KEY);
  if (sessionShown === 'true') {
    return false;
  }

  // Check cooldown
  const lastShown = await getLastShownTimestamp(type);
  if (lastShown) {
    const daysSince = (Date.now() - lastShown) / (1000 * 60 * 60 * 24);
    if (daysSince < NUDGE_CONFIGS[type].cooldownDays) {
      return false;
    }
  }

  return true;
}

/**
 * Mark a nudge as shown (updates cooldown timestamp and session flag).
 */
export async function markNudgeShown(type: NudgeType): Promise<void> {
  try {
    // Update last shown timestamp for this nudge type
    const lastShownData = await AsyncStorage.getItem(NUDGE_LAST_SHOWN_KEY);
    const timestamps: Record<string, number> = lastShownData 
      ? JSON.parse(lastShownData) 
      : {};
    
    timestamps[type] = Date.now();
    await AsyncStorage.setItem(NUDGE_LAST_SHOWN_KEY, JSON.stringify(timestamps));

    // Mark that a nudge was shown this session
    await AsyncStorage.setItem(NUDGE_SESSION_SHOWN_KEY, 'true');
  } catch (error) {
    console.warn('[ConversionNudges] Failed to mark nudge shown:', error);
  }
}

/**
 * Permanently dismiss a nudge type (user clicked "Don't show again").
 */
export async function dismissNudge(type: NudgeType): Promise<void> {
  try {
    const dismissals = await getDismissals();
    if (!dismissals.includes(type)) {
      dismissals.push(type);
      await AsyncStorage.setItem(NUDGE_DISMISSALS_KEY, JSON.stringify(dismissals));
    }
  } catch (error) {
    console.warn('[ConversionNudges] Failed to dismiss nudge:', error);
  }
}

/**
 * Reset session nudge flag (call on app launch or background/foreground).
 */
export async function resetSessionNudgeFlag(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NUDGE_SESSION_SHOWN_KEY);
  } catch (error) {
    console.warn('[ConversionNudges] Failed to reset session flag:', error);
  }
}

/**
 * Get the nudge configuration for a type.
 */
export function getNudgeConfig(type: NudgeType): NudgeConfig {
  return NUDGE_CONFIGS[type];
}

// Helper functions

async function getDismissals(): Promise<NudgeType[]> {
  try {
    const data = await AsyncStorage.getItem(NUDGE_DISMISSALS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function getLastShownTimestamp(type: NudgeType): Promise<number | null> {
  try {
    const data = await AsyncStorage.getItem(NUDGE_LAST_SHOWN_KEY);
    if (!data) return null;
    
    const timestamps: Record<string, number> = JSON.parse(data);
    return timestamps[type] || null;
  } catch {
    return null;
  }
}
