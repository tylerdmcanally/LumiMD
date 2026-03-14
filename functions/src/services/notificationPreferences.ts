/**
 * Patient notification preference resolution.
 *
 * Every field defaults to `true` (or 21/8 for quiet hours) so that
 * existing users who have never touched settings keep receiving
 * every notification type.  Only an explicit `false` disables a type.
 */

export interface PatientNotificationPreferences {
  medicationReminders: boolean;
  medicationFollowUps: boolean;
  actionReminders: boolean;
  healthNudges: boolean;
  visitReady: boolean;
  caregiverMessages: boolean;
  quietHoursStart: number; // 0-23
  quietHoursEnd: number;   // 0-23
}

const DEFAULT_QUIET_HOURS_START = 21; // 9 PM
const DEFAULT_QUIET_HOURS_END = 8;    // 8 AM

/**
 * Resolve patient notification preferences from a user profile document.
 * Missing or invalid fields fall back to safe defaults (enabled / 21 / 8).
 */
export function resolveNotificationPreferences(
  profile: Record<string, unknown> | null | undefined,
): PatientNotificationPreferences {
  const prefs = (profile?.notificationPreferences ?? undefined) as
    | Record<string, unknown>
    | undefined;

  return {
    medicationReminders: prefs?.medicationReminders !== false,
    medicationFollowUps: prefs?.medicationFollowUps !== false,
    actionReminders: prefs?.actionReminders !== false,
    healthNudges: prefs?.healthNudges !== false,
    visitReady: prefs?.visitReady !== false,
    caregiverMessages: prefs?.caregiverMessages !== false,
    quietHoursStart: isValidHour(prefs?.quietHoursStart)
      ? (prefs!.quietHoursStart as number)
      : DEFAULT_QUIET_HOURS_START,
    quietHoursEnd: isValidHour(prefs?.quietHoursEnd)
      ? (prefs!.quietHoursEnd as number)
      : DEFAULT_QUIET_HOURS_END,
  };
}

/**
 * Check whether the current moment falls within the user's quiet hours
 * window, respecting their timezone.
 *
 * Quiet hours wrap around midnight when start > end (e.g. 23–6).
 * When start === end, quiet hours are effectively disabled (no hours match).
 */
export function isInQuietHours(
  now: Date,
  timezone: string,
  prefs: PatientNotificationPreferences,
): boolean {
  const { quietHoursStart, quietHoursEnd } = prefs;

  // Same start and end = quiet hours disabled
  if (quietHoursStart === quietHoursEnd) {
    return false;
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    const localHour = parseInt(formatter.format(now), 10);

    if (quietHoursStart < quietHoursEnd) {
      // e.g. 2–6 → quiet between 2 and 6
      return localHour >= quietHoursStart && localHour < quietHoursEnd;
    }
    // Wraps midnight, e.g. 21–8 → quiet at >=21 OR <8
    return localHour >= quietHoursStart || localHour < quietHoursEnd;
  } catch {
    // Invalid timezone — default to not quiet
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidHour(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
}
