import * as chrono from 'chrono-node';
import { logger } from 'firebase-functions/v2';

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
 * Extracts the timeframe portion from an action description.
 * Handles formats like "Lab draw — in three months" by extracting "in three months"
 */
function extractTimeframePortion(description: string): string {
  // Split on em-dash, en-dash, or double hyphen
  const dashMatch = description.match(/[—–]|--/);
  if (dashMatch && dashMatch.index !== undefined) {
    const afterDash = description.slice(dashMatch.index + dashMatch[0].length).trim();
    if (afterDash.length > 0) {
      return afterDash;
    }
  }
  return description;
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

  // First try to extract just the timeframe portion (after the dash)
  const timeframePortion = extractTimeframePortion(description);
  
  // Try parsing the timeframe portion first
  let parsed = chrono.parseDate(timeframePortion, referenceDate, {
    forwardDate: true,
  });

  // If that fails, try the full description
  if (!parsed && timeframePortion !== description) {
    parsed = chrono.parseDate(description, referenceDate, {
      forwardDate: true,
    });
  }

  if (!parsed) {
    logger.debug('[actionDueDate] No date parsed from description', {
      description,
      timeframePortion,
      referenceDate: referenceDate.toISOString(),
    });
    return null;
  }

  const due = normalizeToNoon(parsed);
  
  logger.debug('[actionDueDate] Parsed date from description', {
    description,
    timeframePortion,
    referenceDate: referenceDate.toISOString(),
    parsedDate: due.toISOString(),
  });

  return due;
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

