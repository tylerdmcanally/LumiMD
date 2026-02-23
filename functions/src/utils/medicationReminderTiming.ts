export const DEFAULT_REMINDER_TIMEZONE = 'America/Chicago';

export type ReminderTimingMode = 'local' | 'anchor';
export type ReminderCriticality = 'standard' | 'time_sensitive';

const TIME_SENSITIVE_MEDICATION_KEYWORDS = [
  'birth control',
  'contracept',
  'ethinyl',
  'levonorgestrel',
  'norgestimate',
  'desogestrel',
  'drospirenone',
  'hiv',
  'antiretroviral',
  'biktarvy',
  'truvada',
  'descovy',
  'dolutegravir',
  'tenofovir',
  'emtricitabine',
  'tacrolimus',
  'cyclosporine',
  'sirolimus',
  'mycophenolate',
  'immunosuppress',
  'transplant',
];

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeIanaTimezone(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!isValidIanaTimezone(trimmed)) {
    return null;
  }

  return trimmed;
}

export function resolveTimezoneOrDefault(
  value: unknown,
  fallback: string = DEFAULT_REMINDER_TIMEZONE,
): string {
  return normalizeIanaTimezone(value) ?? fallback;
}

export function inferReminderCriticality(medicationName: unknown): ReminderCriticality {
  if (typeof medicationName !== 'string') {
    return 'standard';
  }

  const normalizedName = medicationName.toLowerCase();
  const isTimeSensitive = TIME_SENSITIVE_MEDICATION_KEYWORDS.some((keyword) =>
    normalizedName.includes(keyword),
  );

  return isTimeSensitive ? 'time_sensitive' : 'standard';
}

export function normalizeReminderTimingMode(value: unknown): ReminderTimingMode {
  return value === 'anchor' ? 'anchor' : 'local';
}

export function resolveReminderTimingPolicy(params: {
  medicationName: unknown;
  userTimezone: string;
  requestedTimingMode?: unknown;
  requestedAnchorTimezone?: unknown;
}): {
  timingMode: ReminderTimingMode;
  anchorTimezone: string | null;
  criticality: ReminderCriticality;
} {
  const criticality = inferReminderCriticality(params.medicationName);

  const requestedTimingMode =
    params.requestedTimingMode === 'anchor' || params.requestedTimingMode === 'local'
      ? params.requestedTimingMode
      : undefined;

  const timingMode =
    requestedTimingMode ?? (criticality === 'time_sensitive' ? 'anchor' : 'local');

  if (timingMode === 'local') {
    return {
      timingMode,
      anchorTimezone: null,
      criticality,
    };
  }

  return {
    timingMode,
    anchorTimezone:
      normalizeIanaTimezone(params.requestedAnchorTimezone) ?? params.userTimezone,
    criticality,
  };
}
