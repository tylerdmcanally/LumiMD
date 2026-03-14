import {
  resolveNotificationPreferences,
  isInQuietHours,
  PatientNotificationPreferences,
} from '../notificationPreferences';

// ---------------------------------------------------------------------------
// resolveNotificationPreferences
// ---------------------------------------------------------------------------

describe('resolveNotificationPreferences', () => {
  it('returns all defaults when profile is null', () => {
    const prefs = resolveNotificationPreferences(null);
    expect(prefs).toEqual({
      medicationReminders: true,
      medicationFollowUps: true,
      actionReminders: true,
      healthNudges: true,
      visitReady: true,
      caregiverMessages: true,
      quietHoursStart: 21,
      quietHoursEnd: 8,
    });
  });

  it('returns all defaults when profile is undefined', () => {
    const prefs = resolveNotificationPreferences(undefined);
    expect(prefs).toEqual(expect.objectContaining({ medicationReminders: true, quietHoursStart: 21 }));
  });

  it('returns all defaults when profile has no notificationPreferences', () => {
    const prefs = resolveNotificationPreferences({ firstName: 'Alice' });
    expect(prefs.medicationReminders).toBe(true);
    expect(prefs.quietHoursEnd).toBe(8);
  });

  it('returns all defaults when notificationPreferences is empty object', () => {
    const prefs = resolveNotificationPreferences({ notificationPreferences: {} });
    expect(prefs.medicationReminders).toBe(true);
    expect(prefs.healthNudges).toBe(true);
    expect(prefs.quietHoursStart).toBe(21);
  });

  it('respects explicit false for a single field', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { medicationReminders: false },
    });
    expect(prefs.medicationReminders).toBe(false);
    expect(prefs.medicationFollowUps).toBe(true);
    expect(prefs.actionReminders).toBe(true);
    expect(prefs.healthNudges).toBe(true);
    expect(prefs.visitReady).toBe(true);
    expect(prefs.caregiverMessages).toBe(true);
  });

  it('respects explicit false for healthNudges', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { healthNudges: false },
    });
    expect(prefs.healthNudges).toBe(false);
    expect(prefs.medicationReminders).toBe(true);
  });

  it('ignores invalid type for boolean field (string "false")', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { medicationReminders: 'false' },
    });
    // 'false' !== false → defaults to true
    expect(prefs.medicationReminders).toBe(true);
  });

  it('ignores invalid type for quietHoursStart (string)', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { quietHoursStart: 'abc' },
    });
    expect(prefs.quietHoursStart).toBe(21);
  });

  it('ignores invalid type for quietHoursEnd (null)', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { quietHoursEnd: null },
    });
    expect(prefs.quietHoursEnd).toBe(8);
  });

  it('ignores out-of-range quiet hours (negative)', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { quietHoursStart: -1 },
    });
    expect(prefs.quietHoursStart).toBe(21);
  });

  it('ignores out-of-range quiet hours (> 23)', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { quietHoursEnd: 24 },
    });
    expect(prefs.quietHoursEnd).toBe(8);
  });

  it('ignores non-integer quiet hours', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { quietHoursStart: 21.5 },
    });
    expect(prefs.quietHoursStart).toBe(21);
  });

  it('accepts valid custom quiet hours', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { quietHoursStart: 22, quietHoursEnd: 7 },
    });
    expect(prefs.quietHoursStart).toBe(22);
    expect(prefs.quietHoursEnd).toBe(7);
  });

  it('accepts boundary values 0 and 23', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: { quietHoursStart: 0, quietHoursEnd: 23 },
    });
    expect(prefs.quietHoursStart).toBe(0);
    expect(prefs.quietHoursEnd).toBe(23);
  });

  it('handles multiple fields disabled', () => {
    const prefs = resolveNotificationPreferences({
      notificationPreferences: {
        medicationReminders: false,
        medicationFollowUps: false,
        actionReminders: false,
        healthNudges: false,
        visitReady: false,
        caregiverMessages: false,
      },
    });
    expect(prefs.medicationReminders).toBe(false);
    expect(prefs.medicationFollowUps).toBe(false);
    expect(prefs.actionReminders).toBe(false);
    expect(prefs.healthNudges).toBe(false);
    expect(prefs.visitReady).toBe(false);
    expect(prefs.caregiverMessages).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isInQuietHours
// ---------------------------------------------------------------------------

describe('isInQuietHours', () => {
  const defaultPrefs: PatientNotificationPreferences = {
    medicationReminders: true,
    medicationFollowUps: true,
    actionReminders: true,
    healthNudges: true,
    visitReady: true,
    caregiverMessages: true,
    quietHoursStart: 21,
    quietHoursEnd: 8,
  };

  // Helper: create a Date at a specific hour in a timezone
  function dateAtHour(hour: number, timezone = 'America/New_York'): Date {
    // Build a date where the local hour in the given timezone is `hour`
    // We do this by creating a UTC date and adjusting
    const base = new Date('2026-03-13T00:00:00Z');
    // Get UTC offset for this timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    });
    const currentLocalHour = parseInt(formatter.format(base), 10);
    const offsetHours = currentLocalHour - 0; // difference from UTC midnight
    // Adjust base to get desired local hour
    const targetUTCHour = (hour - offsetHours + 24) % 24;
    return new Date(`2026-03-13T${String(targetUTCHour).padStart(2, '0')}:30:00Z`);
  }

  it('returns true during default quiet hours (11pm)', () => {
    const now = dateAtHour(23);
    expect(isInQuietHours(now, 'America/New_York', defaultPrefs)).toBe(true);
  });

  it('returns true during default quiet hours (3am)', () => {
    const now = dateAtHour(3);
    expect(isInQuietHours(now, 'America/New_York', defaultPrefs)).toBe(true);
  });

  it('returns false outside default quiet hours (10am)', () => {
    const now = dateAtHour(10);
    expect(isInQuietHours(now, 'America/New_York', defaultPrefs)).toBe(false);
  });

  it('returns false at exactly quiet end hour (8am)', () => {
    const now = dateAtHour(8);
    expect(isInQuietHours(now, 'America/New_York', defaultPrefs)).toBe(false);
  });

  it('returns true at exactly quiet start hour (9pm)', () => {
    const now = dateAtHour(21);
    expect(isInQuietHours(now, 'America/New_York', defaultPrefs)).toBe(true);
  });

  it('handles custom quiet hours (22-7)', () => {
    const prefs = { ...defaultPrefs, quietHoursStart: 22, quietHoursEnd: 7 };
    expect(isInQuietHours(dateAtHour(22), 'America/New_York', prefs)).toBe(true);
    expect(isInQuietHours(dateAtHour(23), 'America/New_York', prefs)).toBe(true);
    expect(isInQuietHours(dateAtHour(3), 'America/New_York', prefs)).toBe(true);
    expect(isInQuietHours(dateAtHour(7), 'America/New_York', prefs)).toBe(false);
    expect(isInQuietHours(dateAtHour(10), 'America/New_York', prefs)).toBe(false);
  });

  it('handles quiet hours that do NOT wrap midnight (2-6)', () => {
    const prefs = { ...defaultPrefs, quietHoursStart: 2, quietHoursEnd: 6 };
    expect(isInQuietHours(dateAtHour(3), 'America/New_York', prefs)).toBe(true);
    expect(isInQuietHours(dateAtHour(1), 'America/New_York', prefs)).toBe(false);
    expect(isInQuietHours(dateAtHour(6), 'America/New_York', prefs)).toBe(false);
    expect(isInQuietHours(dateAtHour(10), 'America/New_York', prefs)).toBe(false);
  });

  it('returns false when start === end (quiet hours disabled)', () => {
    const prefs = { ...defaultPrefs, quietHoursStart: 0, quietHoursEnd: 0 };
    expect(isInQuietHours(dateAtHour(0), 'America/New_York', prefs)).toBe(false);
    expect(isInQuietHours(dateAtHour(12), 'America/New_York', prefs)).toBe(false);
    expect(isInQuietHours(dateAtHour(23), 'America/New_York', prefs)).toBe(false);
  });

  it('returns false for invalid timezone', () => {
    expect(isInQuietHours(new Date(), 'Invalid/Timezone', defaultPrefs)).toBe(false);
  });
});
