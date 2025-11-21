/**
 * API Client for Web Portal
 * Uses shared SDK with web-specific auth integration and production logging guards
 */

import { createApiClient } from '@lumimd/sdk';
import { auth } from '@/lib/firebase';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://us-central1-lumimd-dev.cloudfunctions.net/api';

async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (error) {
    console.error('[API] Failed to fetch auth token', error);
    return null;
  }
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAuthToken: getIdToken,
  enableLogging: process.env.NODE_ENV !== 'production',
});

export type { ApiError } from '@lumimd/sdk';
