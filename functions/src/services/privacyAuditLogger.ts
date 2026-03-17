/**
 * Privacy Audit Logger
 *
 * Writes privacy-sensitive events to a top-level `privacyAuditLogs` collection.
 * This collection is admin-only (Firestore rules deny all client access).
 *
 * Events: account deletions, data exports, privacy sweeps, caregiver access changes.
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export type PrivacyEventType =
  | 'account_deletion'
  | 'data_export'
  | 'privacy_sweep'
  | 'caregiver_access_granted'
  | 'caregiver_access_revoked';

export interface PrivacyAuditEvent {
  eventType: PrivacyEventType;
  actorUserId: string;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
}

const COLLECTION = 'privacyAuditLogs';

export async function logPrivacyEvent(event: PrivacyAuditEvent): Promise<void> {
  try {
    await admin.firestore().collection(COLLECTION).add({
      ...event,
      occurredAt: admin.firestore.Timestamp.now(),
    });
  } catch (error) {
    // Audit logging must never block the primary operation
    functions.logger.error('[PrivacyAudit] Failed to write audit log', { event, error });
  }
}
