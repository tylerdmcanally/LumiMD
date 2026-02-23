import * as admin from 'firebase-admin';
import { sanitizePlainText } from '../utils/inputSanitization';
import {
  FirestoreRestoreAuditRepository,
  RestoreAuditRepository,
} from './repositories';

const getDb = () => admin.firestore();

export const RESTORE_AUDIT_COLLECTION = 'restoreAuditLogs';
export const RESTORE_REASON_MAX_LENGTH = 500;
export const RESTORE_AUDIT_TRIAGE_NOTE_MAX_LENGTH = 2000;

export const RESTORE_AUDIT_RESOURCE_TYPES = [
  'action',
  'visit',
  'medication',
  'health_log',
  'medication_reminder',
  'care_task',
] as const;

export type RestoreAuditResourceType = (typeof RESTORE_AUDIT_RESOURCE_TYPES)[number];

export const RESTORE_AUDIT_TRIAGE_STATUSES = [
  'unreviewed',
  'in_review',
  'resolved',
] as const;

export type RestoreAuditTriageStatus = (typeof RESTORE_AUDIT_TRIAGE_STATUSES)[number];

type RecordRestoreAuditEventInput = {
  resourceType: RestoreAuditResourceType;
  resourceId: string;
  ownerUserId: string;
  actorUserId: string;
  actorIsOperator?: boolean;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: admin.firestore.Timestamp;
};

type RestoreAuditServiceDependencies = {
  restoreAuditRepository?: Pick<RestoreAuditRepository, 'createEvent'>;
};

function resolveDependencies(
  overrides: RestoreAuditServiceDependencies = {},
): Required<RestoreAuditServiceDependencies> {
  return {
    restoreAuditRepository:
      overrides.restoreAuditRepository ?? new FirestoreRestoreAuditRepository(getDb()),
  };
}

const sanitizeRestoreReason = (reason?: string | null): string | null => {
  if (typeof reason !== 'string') {
    return null;
  }
  const sanitized = sanitizePlainText(reason, RESTORE_REASON_MAX_LENGTH);
  return sanitized.length > 0 ? sanitized : null;
};

const sanitizeMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  return metadata;
};

export async function recordRestoreAuditEvent(
  input: RecordRestoreAuditEventInput,
  dependencyOverrides: RestoreAuditServiceDependencies = {},
): Promise<string> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const createdAt = input.createdAt ?? admin.firestore.Timestamp.now();
  const reason = sanitizeRestoreReason(input.reason);
  const actorCategory =
    input.ownerUserId === input.actorUserId
      ? 'owner'
      : input.actorIsOperator
        ? 'operator'
        : 'delegate';

  const payload = {
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    ownerUserId: input.ownerUserId,
    actorUserId: input.actorUserId,
    actorCategory,
    reason,
    metadata: sanitizeMetadata(input.metadata),
    triageStatus: 'unreviewed' as RestoreAuditTriageStatus,
    triageNote: null,
    triageUpdatedAt: null,
    triageUpdatedBy: null,
    createdAt,
  };

  return dependencies.restoreAuditRepository.createEvent(payload);
}
