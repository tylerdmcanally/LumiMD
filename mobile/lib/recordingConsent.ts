/**
 * Recording Consent — Location-based two-party / one-party consent detection.
 *
 * US states fall into two categories:
 * - One-party: only the person recording needs to consent (majority of states)
 * - Two-party (all-party): all parties must consent to be recorded
 *
 * This module detects the user's state via device location and surfaces
 * the appropriate consent flow.
 */

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import auth from '@react-native-firebase/auth';

/** Per-user key so dismissal doesn't leak across accounts on the same device. */
function consentDismissedKey(): string {
  const uid = auth().currentUser?.uid;
  return uid
    ? `lumimd:onePartyConsentDismissed:${uid}`
    : 'lumimd:onePartyConsentDismissed';
}

/**
 * Two-party (all-party) consent states.
 * Sources: Digital Media Law Project, Reporters Committee for Freedom of the Press.
 * Note: some states have nuances (e.g., Vermont — case law, not statute).
 * We err on the side of caution and include borderline states.
 */
const TWO_PARTY_STATES = new Set([
  'California',
  'Connecticut',
  'Delaware',
  'Florida',
  'Illinois',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Montana',
  'Nevada',
  'New Hampshire',
  'Oregon',
  'Pennsylvania',
  'Vermont',
  'Washington',
]);

export type ConsentRequirement = 'two-party' | 'one-party' | 'unknown';

export interface ConsentResult {
  requirement: ConsentRequirement;
  /** US state name if detected, null otherwise */
  detectedState: string | null;
  /** Whether the user previously dismissed the one-party notice */
  previouslyDismissed: boolean;
}

/**
 * Reverse-geocode the device's current position and determine consent requirement.
 * Returns 'unknown' if location is unavailable or outside the US.
 */
export async function detectConsentRequirement(): Promise<ConsentResult> {
  const previouslyDismissed = await getOnePartyDismissed();

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { requirement: 'unknown', detectedState: null, previouslyDismissed };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });

    const [place] = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    if (!place?.region || place.isoCountryCode !== 'US') {
      return { requirement: 'unknown', detectedState: place?.region ?? null, previouslyDismissed };
    }

    const isTwoParty = TWO_PARTY_STATES.has(place.region);
    return {
      requirement: isTwoParty ? 'two-party' : 'one-party',
      detectedState: place.region,
      previouslyDismissed,
    };
  } catch (error) {
    console.warn('[recordingConsent] Location detection failed:', error);
    return { requirement: 'unknown', detectedState: null, previouslyDismissed };
  }
}

/** Persist that the user has dismissed the one-party consent notice. */
export async function dismissOnePartyNotice(): Promise<void> {
  try {
    await AsyncStorage.setItem(consentDismissedKey(), 'true');
  } catch (error) {
    console.warn('[recordingConsent] Failed to persist dismissal:', error);
  }
}

/** Clear the dismissed flag (called on sign-out). */
export async function clearOnePartyDismissal(): Promise<void> {
  try {
    await AsyncStorage.removeItem(consentDismissedKey());
  } catch (error) {
    console.warn('[recordingConsent] Failed to clear dismissal:', error);
  }
}

/** Check whether the user previously dismissed the one-party notice. */
async function getOnePartyDismissed(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(consentDismissedKey());
    return value === 'true';
  } catch {
    return false;
  }
}
