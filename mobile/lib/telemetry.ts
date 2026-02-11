import AsyncStorage from '@react-native-async-storage/async-storage';

type TelemetryValue = string | number | boolean;
type TelemetryConsentSource =
  | 'settings_toggle'
  | 'app_boot_sync'
  | 'migration'
  | 'server_default';

const TELEMETRY_CONSENT_STORAGE_KEY = 'lumimd:analyticsConsent';
const TELEMETRY_CONFIG_ENABLED = process.env.EXPO_PUBLIC_ANALYTICS_ENABLED === 'true';
const MAX_STRING_LENGTH = 80;
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://us-central1-lumimd-dev.cloudfunctions.net/api';

export interface TelemetryConsentState {
  granted: boolean;
  source: string | null;
  policyVersion: string | null;
  updatedAt: string | null;
  changed?: boolean;
}

interface SetTelemetryConsentOptions {
  syncRemote?: boolean;
  source?: TelemetryConsentSource;
  policyVersion?: string;
  platform?: 'ios' | 'android' | 'web';
  appVersion?: string;
}

const EVENT_SCHEMA = {
  home_load_partial_failure: ['failedCount', 'overviewFailedCount', 'failedCards'] as const,
  home_load_full_failure: ['failedCount', 'overviewFailedCount', 'failedCards'] as const,
  home_load_recovered: ['previousFailure'] as const,
  home_recovery_attempt: ['source', 'hadFailures', 'failedCards'] as const,
  home_recovery_result: ['source', 'rejectedCount', 'erroredCount', 'success'] as const,
  visit_detail_load_failure: ['reason'] as const,
  visit_detail_load_recovered: [] as const,
  visit_detail_retry_attempt: ['source', 'fromErrorState'] as const,
} as const;

type TelemetryEvent = keyof typeof EVENT_SCHEMA;
type AllowedPropKey<E extends TelemetryEvent> = (typeof EVENT_SCHEMA)[E][number];
type TelemetryPropsForEvent<E extends TelemetryEvent> = Partial<
  Record<AllowedPropKey<E>, TelemetryValue>
>;

const PHONE_OR_ID_PATTERN = /\d{8,}/;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const SUSPICIOUS_TEXT_PATTERN = /\b(summary|transcript|diagnosis|condition|medication|patient|note)\b/i;

let consentLoaded = false;
let consentGranted = false;

function sanitizeString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    EMAIL_PATTERN.test(trimmed) ||
    PHONE_OR_ID_PATTERN.test(trimmed) ||
    SUSPICIOUS_TEXT_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed.slice(0, MAX_STRING_LENGTH);
}

function sanitizeValue(value: TelemetryValue): TelemetryValue | null {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  return value;
}

function sanitizeProps<E extends TelemetryEvent>(
  event: E,
  props: TelemetryPropsForEvent<E>,
): Record<string, TelemetryValue> {
  const safeProps: Record<string, TelemetryValue> = {};
  const unsafeProps = props as Record<string, TelemetryValue | undefined>;
  for (const key of EVENT_SCHEMA[event] as readonly string[]) {
    if (!Object.prototype.hasOwnProperty.call(unsafeProps, key)) continue;
    const rawValue = unsafeProps[key];
    if (rawValue === undefined || rawValue === null) continue;
    const value = sanitizeValue(rawValue);
    if (value !== null) {
      safeProps[key] = value;
    }
  }
  return safeProps;
}

export async function initializeTelemetryConsent(): Promise<void> {
  if (consentLoaded) return;

  try {
    const stored = await AsyncStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY);
    consentGranted = stored === 'granted';
  } catch (error) {
    console.warn('[Telemetry] Failed to load consent state', error);
    consentGranted = false;
  } finally {
    consentLoaded = true;
  }
}

async function setLocalTelemetryConsent(granted: boolean): Promise<void> {
  await AsyncStorage.setItem(
    TELEMETRY_CONSENT_STORAGE_KEY,
    granted ? 'granted' : 'denied',
  );
  consentGranted = granted;
  consentLoaded = true;
}

async function telemetryApiRequest<T>(
  endpoint: string,
  options: RequestInit,
): Promise<T> {
  const { getIdToken } = await import('./auth');
  const token = await getIdToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Telemetry API request failed: ${response.status}`) as Error & {
      status?: number;
      body?: string;
    };
    error.status = response.status;
    error.body = body;
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getTelemetryConsent(): Promise<boolean> {
  await initializeTelemetryConsent();
  return consentGranted;
}

export async function refreshTelemetryConsentFromServer(): Promise<TelemetryConsentState> {
  const remoteState = await telemetryApiRequest<TelemetryConsentState>(
    '/v1/users/privacy/analytics-consent',
    {
      method: 'GET',
    },
  );
  await setLocalTelemetryConsent(Boolean(remoteState.granted));
  return remoteState;
}

export async function fetchTelemetryConsentAudit(limit = 50): Promise<{
  events: Array<{
    id: string;
    eventType: string | null;
    granted: boolean | null;
    previousGranted: boolean | null;
    source: string | null;
    policyVersion: string | null;
    platform: string | null;
    appVersion: string | null;
    occurredAt: string | null;
  }>;
  count: number;
  limit: number;
}> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return telemetryApiRequest(
    `/v1/users/privacy/analytics-consent/audit?limit=${safeLimit}`,
    {
      method: 'GET',
    },
  );
}

export async function setTelemetryConsent(
  granted: boolean,
  options: SetTelemetryConsentOptions = {},
): Promise<TelemetryConsentState | null> {
  const {
    syncRemote = false,
    source = 'settings_toggle',
    policyVersion,
    platform,
    appVersion,
  } = options;

  if (syncRemote) {
    const remoteState = await telemetryApiRequest<TelemetryConsentState>(
      '/v1/users/privacy/analytics-consent',
      {
        method: 'POST',
        body: JSON.stringify({
          granted,
          source,
          policyVersion,
          platform,
          appVersion,
        }),
      },
    );
    await setLocalTelemetryConsent(Boolean(remoteState.granted));
    return remoteState;
  }

  try {
    await setLocalTelemetryConsent(granted);
    return null;
  } catch (error) {
    console.warn('[Telemetry] Failed to persist consent state', error);
    throw error;
  }
}

export function isTelemetryConfigured(): boolean {
  return TELEMETRY_CONFIG_ENABLED;
}

function canSendTelemetry(): boolean {
  return TELEMETRY_CONFIG_ENABLED && consentLoaded && consentGranted;
}

/**
 * PHI-safe telemetry layer:
 * - disabled unless env-configured AND user has opted in
 * - accepts only known events/props
 * - sanitizes values to avoid high-risk payloads
 */
export function trackEvent<E extends TelemetryEvent>(
  event: E,
  props: TelemetryPropsForEvent<E> = {},
): void {
  if (!canSendTelemetry()) return;

  const safeProps = sanitizeProps(event, props);
  const isDevRuntime =
    typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

  // Debug visibility for internal testing; production transport intentionally omitted
  if (isDevRuntime) {
    console.log('[Telemetry]', event, {
      ...safeProps,
      at: new Date().toISOString(),
    });
  }
}
