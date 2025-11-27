import { parseDate } from 'chrono-node';

function toDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value);
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      const maybeDate = (value as { toDate: () => Date }).toDate();
      if (maybeDate instanceof Date && !Number.isNaN(maybeDate.getTime())) {
        return maybeDate;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeToNoon(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(12, 0, 0, 0);
  return normalized;
}

/**
 * Attempts to extract a concrete due date from an action description.
 * Returns a Date normalized to noon local time to avoid timezone shifts.
 */
export function parseActionDueDate(
  description: string | null | undefined,
  referenceDate: Date,
): Date | null {
  if (!description || typeof description !== 'string') {
    return null;
  }

  const parsed = parseDate(description, referenceDate, {
    forwardDate: true,
  });

  if (!parsed) {
    return null;
  }

  const due = new Date(parsed);
  // Normalize to noon to reduce timezone-induced date shifts
  return normalizeToNoon(due);
}

/**
 * Determines the most appropriate reference date for interpreting follow-up timelines.
 */
export function resolveVisitReferenceDate(
  visit: Record<string, unknown> | null | undefined,
  fallback: Date,
): Date {
  const candidates: Array<Date | null> = [
    toDate(visit?.visitDate),
    toDate(visit?.createdAt),
    toDate(visit?.processedAt),
    toDate(visit?.updatedAt),
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return normalizeToNoon(candidate);
    }
  }

  return normalizeToNoon(fallback);
}

