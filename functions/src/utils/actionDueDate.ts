import { parseDate } from 'chrono-node';

function toDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value);
  }

  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      const localDate = new Date(year, month, day, 12, 0, 0, 0);
      if (!Number.isNaN(localDate.getTime())) {
        return localDate;
      }
    }

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

interface ResolveActionDueDateInput {
  description?: string | null;
  timeframe?: string | null;
  dueAt?: unknown;
  referenceDate: Date;
}

/**
 * Resolves due dates using model-structured data first, then natural-language fallbacks.
 * Priority:
 *  1) explicit dueAt from model output
 *  2) structured timeframe text from follow-up payload
 *  3) legacy free-text action description parsing
 */
export function resolveActionDueDate({
  description,
  timeframe,
  dueAt,
  referenceDate,
}: ResolveActionDueDateInput): Date | null {
  const structuredDueDate = toDate(dueAt);
  if (structuredDueDate) {
    return normalizeToNoon(structuredDueDate);
  }

  if (typeof timeframe === 'string' && timeframe.trim().length > 0) {
    const parsedTimeframe = parseDate(timeframe, referenceDate, {
      forwardDate: true,
    });
    if (parsedTimeframe) {
      return normalizeToNoon(new Date(parsedTimeframe));
    }
  }

  return parseActionDueDate(description, referenceDate);
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
