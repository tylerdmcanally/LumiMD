/**
 * Deep linking and web portal navigation with seamless auth
 */

import { Linking, Alert } from 'react-native';
import { cfg } from './config';
import { auth } from './auth';

/**
 * Creates a one-time auth handoff code
 * @returns Handoff code or null if failed
 */
async function createHandoffCode(): Promise<string | null> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[linking] No auth token available');
      return null;
    }

    const idToken = await currentUser.getIdToken();
    
    const response = await fetch(`${cfg.apiBaseUrl}/v1/auth/create-handoff`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    return data.code;
  } catch (error) {
    console.error('[linking] Failed to create handoff code:', error);
    return null;
  }
}

/**
 * Opens web portal URL with optional auth handoff
 * @param path - Path to open (e.g., '/dashboard', '/visits/123')
 * @param fallbackToUnauthenticated - If true, opens URL even if handoff fails
 */
async function openWebUrl(
  path: string,
  fallbackToUnauthenticated: boolean = true
): Promise<void> {
  try {
    // Attempt to create handoff code
    const code = await createHandoffCode();
    
    let url: string;
    
    if (code) {
      // Success: use handoff flow
      url = `${cfg.webPortalUrl}/auth/handoff?code=${code}&returnTo=${encodeURIComponent(path)}`;
      console.log(`[linking] Opening with handoff: ${path}`);
    } else if (fallbackToUnauthenticated) {
      // Fallback: open without auth
      url = `${cfg.webPortalUrl}${path}`;
      console.log(`[linking] Opening without handoff (fallback): ${path}`);
    } else {
      // No fallback allowed
      throw new Error('Authentication required but handoff failed');
    }
    
    const canOpen = await Linking.canOpenURL(url);
    
    if (!canOpen) {
      throw new Error('Cannot open URL');
    }
    
    await Linking.openURL(url);
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
  await openWebUrl('/meds');
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

