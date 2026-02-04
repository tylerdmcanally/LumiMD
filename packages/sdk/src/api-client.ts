/**
 * Shared API Client
 * Unified HTTP client with retry logic, timeout handling, and error mapping
 */

import type { Visit, Medication, ActionItem, UserProfile, Share, ShareInvite, ApiError } from './models';
import type {
  Nudge,
  HealthLog,
  HealthLogSummaryResponse,
  CreateHealthLogRequest,
  CreateHealthLogResponse,
  UpdateNudgeRequest,
  RespondToNudgeRequest,
  NudgeUpdateResponse,
  NudgeFeedbackRequest,
  NudgeEventRequest,
  MedicationReminder,
  CreateMedicationReminderRequest,
  UpdateMedicationReminderRequest,
} from './models/lumibot';

const DEFAULT_TIMEOUT_MS = 20_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 500, 502, 503, 504]); // Note: 429 removed - don't retry rate limits
const NETWORK_ERROR_MESSAGE =
  "We couldn't reach LumiMD right now. Please check your connection and try again.";
const SERVER_ERROR_MESSAGE =
  'We ran into an issue on our end. Please try again in a moment.';
const UNAUTHORIZED_MESSAGE = 'Your session expired. Please sign in again.';

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string | null>;
  enableLogging?: boolean;
}

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
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 429) {
    return "You're doing that a little too quickly. Please wait a moment and try again.";
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
    parsedBody?.code ??
    parsedBody?.error?.code ??
    parsedBody?.error_code ??
    undefined;
  const message =
    parsedBody?.message ??
    parsedBody?.error?.message ??
    response.statusText ??
    'Request failed';

  const error = new Error(message) as ApiError;
  error.status = response.status;
  error.code = code;
  error.details = parsedBody?.details ?? parsedBody?.error?.details;
  error.body = parsedBody ?? rawBody ?? null;
  // Use server-provided userMessage if available, otherwise map based on status
  // This allows business logic errors (like email_mismatch) to show proper messages
  error.userMessage =
    parsedBody?.userMessage ??
    parsedBody?.error?.userMessage ??
    mapUserMessage(response.status, message);
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

export function createApiClient(config: ApiClientConfig) {
  const { baseUrl, getAuthToken, enableLogging = false } = config;

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

    if (!headers['Content-Type'] && restOptions.body) {
      headers['Content-Type'] = 'application/json';
    }

    if (requireAuth) {
      const token = await getAuthToken();
      if (!token) {
        const error = new Error('Authentication required') as ApiError;
        error.code = 'auth_required';
        error.userMessage = UNAUTHORIZED_MESSAGE;
        error.status = 401;
        throw error;
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${baseUrl}${endpoint}`;
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
        if (enableLogging) {
          console.log(`[API] ${method} ${url} (attempt ${attempt + 1})`);
        }
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

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
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

  return {
    // Health check
    health: () =>
      apiRequest<{ status: string }>('/health', { requireAuth: false }),

    // Visits
    visits: {
      list: (params?: { limit?: number; sort?: 'asc' | 'desc' }) => {
        if (params) {
          const searchParams = new URLSearchParams();
          Object.entries(params).forEach(([k, v]) => {
            searchParams.append(k, String(v));
          });
          return apiRequest<Visit[]>(`/v1/visits?${searchParams.toString()}`);
        }
        return apiRequest<Visit[]>('/v1/visits');
      },
      get: (id: string) => apiRequest<Visit>(`/v1/visits/${id}`),
      create: (data: Partial<Visit>) =>
        apiRequest<Visit>('/v1/visits', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Partial<Visit>) =>
        apiRequest<Visit>(`/v1/visits/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        apiRequest<void>(`/v1/visits/${id}`, {
          method: 'DELETE',
        }),
      retry: (id: string) =>
        apiRequest<Visit>(`/v1/visits/${id}/retry`, {
          method: 'POST',
        }),
    },

    // Action Items
    actions: {
      list: () => apiRequest<ActionItem[]>('/v1/actions'),
      get: (id: string) => apiRequest<ActionItem>(`/v1/actions/${id}`),
      create: (data: Partial<ActionItem>) =>
        apiRequest<ActionItem>('/v1/actions', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Partial<ActionItem>) =>
        apiRequest<ActionItem>(`/v1/actions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        apiRequest<void>(`/v1/actions/${id}`, {
          method: 'DELETE',
        }),
    },

    // Medications
    medications: {
      list: () => apiRequest<Medication[]>('/v1/meds'),
      get: (id: string) => apiRequest<Medication>(`/v1/meds/${id}`),
      create: (data: Partial<Medication>) =>
        apiRequest<Medication>('/v1/meds', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: Partial<Medication>) =>
        apiRequest<Medication>(`/v1/meds/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        apiRequest<void>(`/v1/meds/${id}`, {
          method: 'DELETE',
        }),
      /** Acknowledge non-critical medication warnings (clears badge for moderate/low) */
      acknowledgeWarnings: (id: string) =>
        apiRequest<{ acknowledged: boolean; acknowledgedAt?: string }>(`/v1/meds/${id}/acknowledge-warnings`, {
          method: 'POST',
        }),
    },

    // User Profile
    user: {
      getProfile: () => apiRequest<UserProfile>('/v1/users/me'),
      updateProfile: (data: Partial<UserProfile>) =>
        apiRequest<UserProfile>('/v1/users/me', {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      registerPushToken: (data: { token: string; platform: string; timezone?: string }) =>
        apiRequest<void>('/v1/users/push-tokens', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      unregisterPushToken: (data: { token: string }) =>
        apiRequest<void>('/v1/users/push-tokens', {
          method: 'DELETE',
          body: JSON.stringify(data),
        }),
      /** Delete ALL push tokens for the current user (used during logout) */
      unregisterAllPushTokens: () =>
        apiRequest<void>('/v1/users/push-tokens/all', {
          method: 'DELETE',
        }),
      exportData: () =>
        apiRequest<any>('/v1/users/me/export', {
          method: 'GET',
        }),
      deleteAccount: () =>
        apiRequest<void>('/v1/users/me', {
          method: 'DELETE',
        }),
      // Caregiver management
      listCaregivers: () =>
        apiRequest<{ caregivers: any[]; autoShareWithCaregivers: boolean }>('/v1/users/me/caregivers'),
      addCaregiver: (data: { name: string; email: string; relationship?: string }) =>
        apiRequest<any>('/v1/users/me/caregivers', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      updateCaregiver: (id: string, data: { name?: string; relationship?: string }) =>
        apiRequest<any>(`/v1/users/me/caregivers/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      deleteCaregiver: (id: string) =>
        apiRequest<void>(`/v1/users/me/caregivers/${id}`, {
          method: 'DELETE',
        }),
    },

    // Shares
    shares: {
      list: () => apiRequest<Share[]>('/v1/shares'),
      get: (id: string) => apiRequest<Share>(`/v1/shares/${id}`),
      create: (data: { caregiverEmail: string; message?: string }) =>
        apiRequest<Share | ShareInvite>('/v1/shares', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: { status: 'accepted' | 'revoked' }) =>
        apiRequest<Share>(`/v1/shares/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      // Legacy accept-invite endpoint
      acceptInvite: (token: string) =>
        apiRequest<Share>('/v1/shares/accept-invite', {
          method: 'POST',
          body: JSON.stringify({ token }),
        }),
      getInvites: () => apiRequest<ShareInvite[]>('/v1/shares/invites'),
      cancelInvite: (inviteId: string) =>
        apiRequest<ShareInvite>(`/v1/shares/invites/${inviteId}`, {
          method: 'PATCH',
        }),
      // NEW: Token-based invite system
      invite: (data: { caregiverEmail: string; message?: string }) =>
        apiRequest<ShareInvite>('/v1/shares/invite', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      getInviteInfo: (token: string) =>
        apiRequest<{ ownerName: string; caregiverEmail: string; status: string; expiresAt?: string }>(
          `/v1/shares/invite-info/${token}`,
          { requireAuth: false }
        ),
      acceptToken: (token: string) =>
        apiRequest<ShareInvite>(`/v1/shares/accept/${token}`, {
          method: 'POST',
        }),
      myInvites: () => apiRequest<ShareInvite[]>('/v1/shares/my-invites'),
      revokeInvite: (token: string) =>
        apiRequest<{ success: boolean }>(`/v1/shares/revoke/${token}`, {
          method: 'PATCH',
        }),
    },

    // LumiBot Nudges
    nudges: {
      list: () => apiRequest<Nudge[]>('/v1/nudges'),
      history: (limit?: number) =>
        apiRequest<Nudge[]>(`/v1/nudges/history${limit ? `?limit=${limit}` : ''}`),
      update: (id: string, data: UpdateNudgeRequest) =>
        apiRequest<NudgeUpdateResponse>(`/v1/nudges/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      respond: (id: string, data: RespondToNudgeRequest) =>
        apiRequest<NudgeUpdateResponse>(`/v1/nudges/${id}/respond`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      feedback: (id: string, data: NudgeFeedbackRequest) =>
        apiRequest<{ id: string; message: string }>(`/v1/nudges/${id}/feedback`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      trackEvent: (id: string, data: NudgeEventRequest) =>
        apiRequest<{ id: string; message: string }>(`/v1/nudges/${id}/events`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
    },

    // LumiBot Health Logs
    healthLogs: {
      list: (params?: { type?: string; limit?: number; startDate?: string; endDate?: string }) => {
        const searchParams = new URLSearchParams();
        if (params?.type) searchParams.append('type', params.type);
        if (params?.limit) searchParams.append('limit', String(params.limit));
        if (params?.startDate) searchParams.append('startDate', params.startDate);
        if (params?.endDate) searchParams.append('endDate', params.endDate);
        const query = searchParams.toString();
        return apiRequest<HealthLog[]>(`/v1/health-logs${query ? `?${query}` : ''}`);
      },
      create: (data: CreateHealthLogRequest) =>
        apiRequest<CreateHealthLogResponse>('/v1/health-logs', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        apiRequest<void>(`/v1/health-logs/${id}`, {
          method: 'DELETE',
        }),
      summary: (days?: number) =>
        apiRequest<HealthLogSummaryResponse>(`/v1/health-logs/summary${days ? `?days=${days}` : ''}`),
      export: (days?: number) =>
        apiRequest<any>(`/v1/health-logs/export${days ? `?days=${days}` : ''}`),
      providerReport: async (): Promise<Blob> => {
        const token = await config.getAuthToken();
        const response = await fetch(`${config.baseUrl}/v1/health-logs/provider-report`, {
          method: 'GET',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!response.ok) {
          throw new Error('Failed to generate provider report');
        }
        return response.blob();
      },
    },

    medicationReminders: {
      list: () =>
        apiRequest<{ reminders: MedicationReminder[] }>('/v1/medication-reminders'),
      create: (data: CreateMedicationReminderRequest) =>
        apiRequest<MedicationReminder>('/v1/medication-reminders', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (id: string, data: UpdateMedicationReminderRequest) =>
        apiRequest<MedicationReminder>(`/v1/medication-reminders/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      delete: (id: string) =>
        apiRequest<void>(`/v1/medication-reminders/${id}`, {
          method: 'DELETE',
        }),
    },

  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

