/**
 * useConsentFlow Hook
 * Manages recording consent logic based on user location
 */

import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useLocation,
  requiresTwoPartyConsent,
  CONSENT_FLOW_VERSION,
  type ConsentRecord,
  type StateSource,
} from '../location';

const SKIP_REMINDER_KEY = 'lumimd:skipOnePartyReminder';

export type ConsentModalType = 'required' | 'educational' | null;

export interface ConsentCheckResult {
  canProceed: boolean;
  modalType: ConsentModalType;
  stateCode: string | null;
  twoPartyRequired: boolean;
}

export interface UseConsentFlowResult {
  // State
  isLoading: boolean;
  userState: string | null;
  stateSource: StateSource | null;
  isUSLocation: boolean | null;
  requiresTwoPartyConsent: boolean;
  skipEducationalPrompt: boolean;

  // Location permission
  hasLocationPermission: boolean | null;
  requestLocationPermission: () => Promise<boolean>;

  // Actions
  checkConsentRequired: () => Promise<ConsentCheckResult>;
  generateConsentRecord: (acknowledged: boolean) => ConsentRecord;
  setSkipEducationalPrompt: (skip: boolean) => Promise<void>;
  resetConsentPreferences: () => Promise<void>;
  setManualState: (stateCode: string) => Promise<void>;
  clearManualState: () => Promise<void>;
  refreshLocation: () => Promise<void>;
}

export function useConsentFlow(): UseConsentFlowResult {
  const location = useLocation();
  const [skipEducationalPrompt, setSkipEducationalPromptState] = useState(false);

  // Load skip preference on mount
  useEffect(() => {
    loadSkipPreference();
  }, []);

  const loadSkipPreference = async () => {
    try {
      const value = await AsyncStorage.getItem(SKIP_REMINDER_KEY);
      setSkipEducationalPromptState(value === 'true');
    } catch (err) {
      console.error('[ConsentFlow] Error loading skip preference:', err);
    }
  };

  const twoPartyRequired = requiresTwoPartyConsent(location.stateCode);

  const checkConsentRequired = useCallback(async (): Promise<ConsentCheckResult> => {
    const stateCode = location.stateCode;
    const isTwoPartyState = requiresTwoPartyConsent(stateCode);
    
    console.log('[ConsentFlow] Checking consent for state:', stateCode, 'isTwoParty:', isTwoPartyState);

    // Two-party state: always show required modal
    if (isTwoPartyState) {
      console.log('[ConsentFlow] Two-party state - requiring consent modal');
      return {
        canProceed: false,
        modalType: 'required',
        stateCode,
        twoPartyRequired: true,
      };
    }

    // One-party state: show educational modal unless user opted out
    const skipReminder = await AsyncStorage.getItem(SKIP_REMINDER_KEY);
    console.log('[ConsentFlow] Skip reminder preference:', skipReminder);
    
    if (skipReminder === 'true') {
      console.log('[ConsentFlow] User opted out of educational modal');
      return {
        canProceed: true,
        modalType: null,
        stateCode,
        twoPartyRequired: false,
      };
    }

    console.log('[ConsentFlow] Showing educational modal');
    return {
      canProceed: false,
      modalType: 'educational',
      stateCode,
      twoPartyRequired: false,
    };
  }, [location.stateCode]);

  const generateConsentRecord = useCallback(
    (acknowledged: boolean): ConsentRecord => {
      return {
        consentAcknowledged: acknowledged,
        consentAcknowledgedAt: acknowledged ? new Date() : null,
        recordingStateCode: location.stateCode,
        twoPartyConsentRequired: requiresTwoPartyConsent(location.stateCode),
        consentFlowVersion: CONSENT_FLOW_VERSION,
      };
    },
    [location.stateCode]
  );

  const setSkipEducationalPrompt = useCallback(async (skip: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(SKIP_REMINDER_KEY, skip ? 'true' : 'false');
      setSkipEducationalPromptState(skip);
      console.log('[ConsentFlow] Skip educational prompt:', skip);
    } catch (err) {
      console.error('[ConsentFlow] Error saving skip preference:', err);
    }
  }, []);

  const resetConsentPreferences = useCallback(async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(SKIP_REMINDER_KEY);
      setSkipEducationalPromptState(false);
      console.log('[ConsentFlow] Reset consent preferences');
    } catch (err) {
      console.error('[ConsentFlow] Error resetting preferences:', err);
    }
  }, []);

  return {
    isLoading: location.isLoading,
    userState: location.stateCode,
    stateSource: location.stateSource,
    isUSLocation: location.isUSLocation,
    requiresTwoPartyConsent: twoPartyRequired,
    skipEducationalPrompt,
    hasLocationPermission: location.hasPermission,
    requestLocationPermission: location.requestPermission,
    checkConsentRequired,
    generateConsentRecord,
    setSkipEducationalPrompt,
    resetConsentPreferences,
    setManualState: location.setManualState,
    clearManualState: location.clearManualState,
    refreshLocation: location.refreshLocation,
  };
}
