/**
 * API Client for Mobile
 * Uses shared SDK with mobile-specific auth integration
 */

import { createApiClient } from '@lumimd/sdk';
import { getIdToken } from '../auth';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://us-central1-lumimd-dev.cloudfunctions.net/api';

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAuthToken: getIdToken,
  enableLogging: __DEV__,
});

export type { ApiError } from '@lumimd/sdk';
