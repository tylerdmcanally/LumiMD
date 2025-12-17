/**
 * Deep linking and web portal navigation with seamless auth
 */

import { Alert, Linking } from 'react-native';
import auth from '@react-native-firebase/auth';
import { cfg } from './config';

/**
 * Creates a one-time auth handoff code
 * @returns Handoff code or null if failed
 */
async function createHandoffCode(): Promise<string | null> {
  try {
    const currentUser = auth().currentUser;
    if (!currentUser) {
      console.warn('[linking] No auth token available - user not signed in');
      return null;
    }

    console.log('[linking] Getting ID token for user:', currentUser.uid);
    const idToken = await currentUser.getIdToken();

    console.log('[linking] Calling create-handoff API...');
    const response = await fetch(`${cfg.apiBaseUrl}/v1/auth/create-handoff`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[linking] create-handoff failed:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[linking] Got handoff code successfully');
    return data.code;
  } catch (error) {
    console.error('[linking] Failed to create handoff code:', error);
    return null;
  }
}

/**
 * Opens web portal URL with auth handoff
 * Uses Linking.openURL to open in user's default browser (Chrome, Safari, etc.)
 * If handoff fails, redirects to sign-in page instead of showing wrong account
 * @param path - Path to open (e.g., '/dashboard', '/visits/123')
 */
async function openWebUrl(path: string): Promise<void> {
  try {
    // Attempt to create handoff code
    const code = await createHandoffCode();

    let url: string;

    if (code) {
      // Success: use handoff flow - include userId so web can skip re-auth if already signed in
      const userId = auth().currentUser?.uid;
      url = `${cfg.webPortalUrl}/auth/handoff?code=${code}&returnTo=${encodeURIComponent(path)}&uid=${userId}`;
      console.log(`[linking] Opening with handoff: ${path}`);

    } else {
      // Handoff failed - redirect to sign-in with the intended destination
      // This prevents showing wrong account data
      url = `${cfg.webPortalUrl}/sign-in?returnTo=${encodeURIComponent(path)}&reason=app_handoff`;
      console.log(`[linking] Handoff failed, redirecting to sign-in: ${path}`);
    }

    // Open in user's default browser (Chrome, Safari, etc.)
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      throw new Error('Cannot open URL');
    }
  } catch (error) {
    console.error('[linking] Failed to open web URL:', error);

    Alert.alert(
      'Unable to Open',
      'We couldn\'t open the web portal. Please check your internet connection and try again.',
      [{ text: 'OK' }]
    );
  }
}


/**
 * Opens the main dashboard
 */
export async function openWebDashboard(): Promise<void> {
  await openWebUrl('/dashboard');
}

/**
 * Opens a specific visit detail page
 * @param visitId - The visit ID to view
 */
export async function openWebVisit(visitId: string): Promise<void> {
  await openWebUrl(`/visits/${visitId}`);
}

/**
 * Opens the actions/tasks page
 */
export async function openWebActions(): Promise<void> {
  await openWebUrl('/actions');
}

/**
 * Opens the medications page
 */
export async function openWebMeds(): Promise<void> {
  await openWebUrl('/medications');
}

/**
 * Opens the caregiver sharing page
 */
export async function openWebSharing(): Promise<void> {
  await openWebUrl('/sharing');
}

/**
 * Opens the profile/settings page
 */
export async function openWebProfile(): Promise<void> {
  await openWebUrl('/profile');
}

/**
 * Generic helper to open any web path
 */
export async function openWeb(path: string): Promise<void> {
  await openWebUrl(path);
}
