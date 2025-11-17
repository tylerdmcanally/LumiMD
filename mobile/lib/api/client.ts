/**
 * API Client
 * Handles all HTTP requests to the backend with auth token injection
 */

import { getIdToken } from '../auth';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://us-central1-lumimd-dev.cloudfunctions.net/api';
const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const NETWORK_ERROR_MESSAGE =
  'We couldn’t reach LumiMD right now. Please check your connection and try again.';
const SERVER_ERROR_MESSAGE =
  'We ran into an issue on our end. Please try again in a moment.';
const UNAUTHORIZED_MESSAGE = 'Your session expired. Please sign in again.';

type ApiError = Error & {
  status?: number;
  code?: string;
  userMessage?: string;
  details?: unknown;
  body?: unknown;
  retriable?: boolean;
};

interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
  timeoutMs?: number;
  retry?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeHeaders(headersInit?: HeadersInit): Record<string, string> {
  if (!headersInit) return {};
  if (headersInit instanceof Headers) {
    const result: Record<string, string> = {};
    headersInit.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headersInit)) {
    return headersInit.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }
  return { ...headersInit };
}

function mapUserMessage(status: number, fallbackMessage: string): string {
  if (status === 401 || status === 403) return UNAUTHORIZED_MESSAGE;
  if (status === 404) return 'We couldn’t find what you were looking for.';
  if (status === 429) {
    return 'You’re doing that a little too quickly. Please wait a moment and try again.';
  }
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  return fallbackMessage;
}

async function buildApiError(response: Response): Promise<ApiError> {
  let parsedBody: any = null;
  let rawBody: string | null = null;
  try {
    rawBody = await response.text();
    if (rawBody) {
      parsedBody = JSON.parse(rawBody);
    }
  } catch {
    parsedBody = null;
  }

  const code =
    parsedBody?.code ||
    parsedBody?.error?.code ||
    parsedBody?.error_code ||
    undefined;
  const message =
    parsedBody?.message ||
    parsedBody?.error?.message ||
    response.statusText ||
    'Request failed';

  const error = new Error(message) as ApiError;
  error.status = response.status;
  error.code = code;
  error.details = parsedBody?.details ?? parsedBody?.error?.details;
  error.body = parsedBody ?? rawBody ?? null;
  error.userMessage = mapUserMessage(response.status, message);
  error.retriable =
    RETRYABLE_STATUS_CODES.has(response.status) ||
    (response.status >= 500 && response.status < 600);

  console.error('[API] HTTP Error', {
    status: response.status,
    code,
    message,
    body: error.body,
  });

  return error;
}

function buildNetworkError(original: unknown): ApiError {
  if (original instanceof Error && (original as Error).name === 'AbortError') {
    const error = new Error('Request timed out') as ApiError;
    error.code = 'timeout';
    error.userMessage = NETWORK_ERROR_MESSAGE;
    error.retriable = true;
    return error;
  }

  const message =
    original instanceof Error ? original.message : 'Network request failed';
  const error = new Error(message) as ApiError;
  error.code = 'network_error';
  error.userMessage = NETWORK_ERROR_MESSAGE;
  error.retriable = true;
  return error;
}

function buildParseError(original: unknown): ApiError {
  const error = new Error(
    'Failed to process the server response. Please try again.',
  ) as ApiError;
  error.code = 'parse_error';
  error.userMessage =
    'We received an unexpected response from the server. Please try again.';
  error.details = original;
  error.retriable = true;
  return error;
}

function isRetryable(error: ApiError, method: string): boolean {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return Boolean(error.retriable && error.code !== 'timeout');
  }
  if (error.retriable) return true;
  if (typeof error.status === 'number') {
    return (
      RETRYABLE_STATUS_CODES.has(error.status) ||
      (error.status >= 500 && error.status < 600)
    );
  }
  return error.code === 'network_error' || error.code === 'timeout';
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (options.signal) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    requireAuth = true,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retry: retryOption,
    headers: providedHeaders,
    ...restOptions
  } = options;

  const method = (restOptions.method ?? 'GET').toString().toUpperCase();
  const headers = normalizeHeaders(providedHeaders);

  if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (requireAuth) {
    const token = await getIdToken();
    if (!token) {
      const error = new Error('Authentication required') as ApiError;
      error.code = 'auth_required';
      error.userMessage = UNAUTHORIZED_MESSAGE;
      error.status = 401;
      throw error;
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const maxRetries =
    retryOption ?? (['GET', 'HEAD', 'OPTIONS'].includes(method) ? 2 : 0);

  let attempt = 0;
  let lastError: ApiError | undefined;

  while (attempt <= maxRetries) {
    const requestInit: RequestInit = {
      ...restOptions,
      method,
      headers,
    };

    try {
      console.log(`[API] ${method} ${url} (attempt ${attempt + 1})`);
      const response = await fetchWithTimeout(url, requestInit, timeoutMs);

      if (!response.ok) {
        const error = await buildApiError(response);
        if (attempt < maxRetries && isRetryable(error, method)) {
          lastError = error;
          attempt += 1;
          await sleep(250 * attempt);
          continue;
        }
        throw error;
      }

      if (response.status === 204) {
        return undefined as unknown as T;
      }

      const rawBody = await response.text();
      if (!rawBody) {
        return undefined as unknown as T;
      }

      if (!(response.headers.get('content-type') || '').includes('application/json')) {
        return rawBody as unknown as T;
      }

      try {
        return JSON.parse(rawBody) as T;
      } catch (parseError) {
        const error = buildParseError(parseError);
        if (attempt < maxRetries && isRetryable(error, method)) {
          lastError = error;
          attempt += 1;
          await sleep(250 * attempt);
          continue;
        }
        throw error;
      }
    } catch (err) {
      const error =
        (err as ApiError)?.userMessage || (err as ApiError)?.status !== undefined
          ? (err as ApiError)
          : buildNetworkError(err);

      if (attempt < maxRetries && isRetryable(error, method)) {
        lastError = error;
        attempt += 1;
        await sleep(250 * attempt);
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error('Request failed unexpectedly');
}

/**
 * API Client Methods
 */
export const api = {
  // Health check
  health: () => apiRequest<{ status: string }>('/health', { requireAuth: false }),

  // Visits
  visits: {
    list: () => apiRequest<any[]>('/v1/visits'),
    get: (id: string) => apiRequest<any>(`/v1/visits/${id}`),
    create: (data: any) => apiRequest<any>('/v1/visits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiRequest<any>(`/v1/visits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiRequest<void>(`/v1/visits/${id}`, {
      method: 'DELETE',
    }),
    retry: (id: string) => apiRequest<any>(`/v1/visits/${id}/retry`, {
      method: 'POST',
    }),
  },

  // Action Items
  actions: {
    list: () => apiRequest<any[]>('/v1/actions'),
    get: (id: string) => apiRequest<any>(`/v1/actions/${id}`),
    update: (id: string, data: any) => apiRequest<any>(`/v1/actions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiRequest<void>(`/v1/actions/${id}`, {
      method: 'DELETE',
    }),
  },

  // Medications
  medications: {
    list: () => apiRequest<any[]>('/v1/meds'),
    get: (id: string) => apiRequest<any>(`/v1/meds/${id}`),
    create: (data: any) => apiRequest<any>('/v1/meds', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    update: (id: string, data: any) => apiRequest<any>(`/v1/meds/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    delete: (id: string) => apiRequest<void>(`/v1/meds/${id}`, {
      method: 'DELETE',
    }),
  },

  // User Profile
  user: {
    getProfile: () => apiRequest<any>('/v1/users/me'),
    updateProfile: (data: Record<string, unknown>) =>
      apiRequest<any>('/v1/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
  },
};

