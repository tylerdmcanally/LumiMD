/**
 * Unified medication frequency → reminder times mapping.
 *
 * Single source of truth used by ALL paths that create medication reminders:
 *   - medicationSync.ts (AVS upload + audio recording extraction)
 *   - medications/helpers.ts (manual medication add via API)
 *
 * Two-tier resolution:
 *   1. frequencyCode enum (deterministic, preferred) — from GPT structured output
 *   2. Free-text frequency string (pattern matching fallback) — for legacy data
 *      or manual entry where users type freeform
 */

export type FrequencyCode = 'QD' | 'BID' | 'TID' | 'QID' | 'QHS' | 'PRN' | 'WEEKLY' | 'MONTHLY' | 'OTHER';

/**
 * Map a frequencyCode enum to deterministic reminder times.
 * Returns:
 *   - string[] for known frequencies
 *   - null for PRN (no automatic reminder)
 *   - undefined for OTHER/unknown (fall through to free-text)
 */
function getTimesFromFrequencyCode(code: string): string[] | null | undefined {
  switch (code.toUpperCase()) {
    case 'QD': return ['08:00'];
    case 'BID': return ['08:00', '20:00'];
    case 'TID': return ['08:00', '14:00', '20:00'];
    case 'QID': return ['08:00', '12:00', '16:00', '20:00'];
    case 'QHS': return ['21:00'];
    case 'PRN': return null;
    case 'WEEKLY': return ['08:00'];
    case 'MONTHLY': return ['08:00'];
    case 'OTHER': return undefined;
    default: return undefined;
  }
}

/**
 * Parse a free-text frequency string into reminder times.
 * Fallback path for when frequencyCode is not available.
 *
 * Pattern evaluation order matters — multi-dose patterns (QID → TID → BID)
 * are checked before the generic "daily" catch-all to prevent "twice daily"
 * from matching as once-daily.
 */
function getTimesFromFreeText(frequency: string): string[] | null {
  const freq = frequency.toLowerCase().trim();

  // PRN / as needed — no automatic reminder
  if (freq.includes('prn') || freq.includes('as needed') || freq.includes('when needed')) {
    return null;
  }

  // ===== MEALTIME PATTERNS =====
  if (freq.includes('with meals') || freq.includes('with food') ||
    freq.includes('at meals') || freq.includes('at mealtimes')) {
    return ['08:00', '12:00', '18:00'];
  }
  if (freq.includes('breakfast') || freq.includes('morning meal') ||
    (freq.includes('morning') && !freq.includes('every morning'))) {
    return ['08:00'];
  }
  if (freq.includes('lunch') || freq.includes('midday') || freq.includes('noon')) {
    return ['12:00'];
  }
  if (freq.includes('dinner') || freq.includes('supper') ||
    freq.includes('evening meal') || freq.includes('with evening')) {
    return ['18:00'];
  }

  // ===== MULTI-DOSE PATTERNS (must match before generic "daily") =====
  if (freq.includes('four times') || freq.includes('qid') || freq.includes('4x') ||
    freq.includes('every 6 hour')) {
    return ['08:00', '12:00', '16:00', '20:00'];
  }
  if (freq.includes('three times') || freq.includes('tid') || freq.includes('3x') ||
    freq.includes('every 8 hour')) {
    return ['08:00', '14:00', '20:00'];
  }
  if (freq.includes('twice') || freq.includes('bid') || freq.includes('b.i.d') ||
    freq.includes('2x') || freq.includes('two times') || freq.includes('every 12') ||
    freq.includes('2 times')) {
    return ['08:00', '20:00'];
  }

  // ===== ONCE DAILY / TIME-OF-DAY PATTERNS =====
  if (freq.includes('bedtime') || freq.includes('at night') ||
    freq.includes('before bed') || freq.includes('hs') || freq.includes('nightly')) {
    return ['21:00'];
  }
  if (freq.includes('once daily') || freq.includes('once a day') || freq.includes('qd') ||
    freq.includes('daily') || freq === 'qday') {
    if (freq.includes('evening') || freq.includes('pm') || freq.includes('night') ||
      freq.includes('bedtime') || freq.includes('hs')) {
      return ['20:00'];
    }
    return ['08:00'];
  }

  // Weekly
  if (freq.includes('weekly') || freq.includes('once a week')) {
    return ['08:00'];
  }

  // Default: single morning reminder
  return ['08:00'];
}

/**
 * Resolve medication frequency to default reminder times.
 *
 * @param frequency   - Human-readable frequency string (e.g. "twice daily")
 * @param frequencyCode - Structured enum from GPT extraction (e.g. "BID")
 * @returns string[] of HH:MM times, or null if no reminder warranted (PRN)
 */
export function resolveReminderTimes(
  frequency?: string | null,
  frequencyCode?: string | null,
): string[] | null {
  // Primary path: structured enum
  if (frequencyCode) {
    const codeTimes = getTimesFromFrequencyCode(frequencyCode);
    if (codeTimes !== undefined) {
      return codeTimes;
    }
    // undefined = OTHER/unknown — fall through to free-text
  }

  // Fallback: free-text parsing
  if (!frequency) return ['08:00'];
  return getTimesFromFreeText(frequency);
}
