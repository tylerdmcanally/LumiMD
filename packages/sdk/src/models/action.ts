/**
 * Action Item Model
 */

import type { FollowUpCategory } from './visit';

export interface CalendarEventEntry {
  platform?: string;
  calendarId?: string | null;
  eventId: string;
  addedAt?: string;
  removedAt?: string;
}

export interface ActionItem {
  id: string;
  userId: string;
  description: string;
  completed: boolean;
  completedAt?: string | null;
  dueAt?: string | null;
  visitId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: 'manual' | 'visit';
  notes?: string | null;
  type?: FollowUpCategory | null;
  details?: string | null;
  calendarEvents?: Record<string, CalendarEventEntry> | null;
  [key: string]: unknown;
}

/**
 * Human-readable labels for each FollowUpCategory value.
 */
export const FOLLOW_UP_CATEGORY_LABELS: Record<string, string> = {
  clinic_follow_up: 'Clinic Follow-Up',
  return_to_clinic: 'Return to Clinic',
  nurse_visit: 'Nurse Visit',
  lab_draw: 'Lab Draw',
  imaging_appointment: 'Imaging',
  stress_test: 'Stress Test',
  cardiac_testing: 'Cardiac Testing',
  specialist_referral: 'Specialist Referral',
  medication_review: 'Medication Review',
  contact_clinic: 'Contact Clinic',
  procedure: 'Procedure',
  other: 'Other',
};

/**
 * Returns the human-readable label for a FollowUpCategory, or null if not found.
 */
export function getFollowUpCategoryLabel(
  type: FollowUpCategory | string | null | undefined,
): string | null {
  if (!type) return null;
  return FOLLOW_UP_CATEGORY_LABELS[type] ?? null;
}

