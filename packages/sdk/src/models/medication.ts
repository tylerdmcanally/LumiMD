/**
 * Medication Model
 */

export interface Medication {
  id: string;
  userId: string;
  name: string;
  nameLower?: string;
  canonicalName?: string;
  dose?: string | null;
  frequency?: string | null;
  status?: string;
  active?: boolean;
  startedAt?: string | null;
  stoppedAt?: string | null;
  changedAt?: string | null;
  source?: 'manual' | 'visit';
  sourceVisitId?: string | null;
  visitId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastSyncedAt?: string | null;
  notes?: string | null;
  display?: string | null;
  originalText?: string | null;
  needsConfirmation?: boolean;
  medicationStatus?: 'matched' | 'fuzzy' | 'unverified' | null;
  medicationWarning?: Array<{
    type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
    severity: 'critical' | 'high' | 'moderate' | 'low';
    message: string;
    details: string;
    recommendation: string;
    conflictingMedication?: string;
    allergen?: string;
  }> | null;
  /** ISO timestamp of when non-critical warnings were acknowledged */
  warningAcknowledgedAt?: string | null;
  [key: string]: unknown;
}

