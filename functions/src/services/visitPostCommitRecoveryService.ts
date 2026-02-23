import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getAssemblyAIService } from './assemblyai';
import { normalizeMedicationSummary, syncMedicationsFromSummary } from './medicationSync';
import { analyzeVisitWithDelta } from './lumibotAnalyzer';
import { getNotificationService } from './notifications';
import { sendVisitPdfToAllCaregivers } from './caregiverEmailService';
import type { VisitSummaryResult } from './openai';
import { UserDomainService } from './domain/users/UserDomainService';
import { VisitDomainService } from './domain/visits/VisitDomainService';
import { FirestoreUserRepository } from './repositories/users/FirestoreUserRepository';
import { FirestoreVisitRepository } from './repositories/visits/FirestoreVisitRepository';
import {
  getPostCommitNextRetryDate,
  isPostCommitOperationName,
  POST_COMMIT_MAX_RETRY_ATTEMPTS,
  POST_COMMIT_RETRY_ALERT_THRESHOLD,
  type PostCommitOperationName,
  RETRYABLE_POST_COMMIT_OPERATIONS,
} from './visitPostCommitOperations';

const db = () => admin.firestore();
const DEFAULT_RECOVERY_LIMIT = 25;
const MAX_RECOVERY_LIMIT = 100;

export type VisitPostCommitRecoveryResult = {
  visitsScanned: number;
  visitsRetried: number;
  visitsResolved: number;
  visitsStillFailing: number;
  operationAttempts: number;
  operationFailures: number;
};

type VisitPostCommitRecoveryDependencies = {
  visitService?: Pick<VisitDomainService, 'listPostCommitRecoverable' | 'updateRecord'>;
  userService?: Pick<UserDomainService, 'getById'>;
};

function buildDefaultDependencies(): Required<VisitPostCommitRecoveryDependencies> {
  return {
    visitService: new VisitDomainService(new FirestoreVisitRepository(db())),
    userService: new UserDomainService(new FirestoreUserRepository(db())),
  };
}

function resolveDependencies(
  overrides: VisitPostCommitRecoveryDependencies,
): Required<VisitPostCommitRecoveryDependencies> {
  const defaults = buildDefaultDependencies();
  return {
    visitService: overrides.visitService ?? defaults.visitService,
    userService: overrides.userService ?? defaults.userService,
  };
}

function normalizeRecoveryLimit(rawLimit?: number): number {
  if (!rawLimit || !Number.isFinite(rawLimit) || rawLimit <= 0) {
    return DEFAULT_RECOVERY_LIMIT;
  }
  return Math.min(Math.floor(rawLimit), MAX_RECOVERY_LIMIT);
}

function extractFailedOperations(raw: unknown): PostCommitOperationName[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((value): value is PostCommitOperationName => isPostCommitOperationName(value));
}

function extractCompletedOperations(raw: unknown): PostCommitOperationName[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((value): value is PostCommitOperationName => isPostCommitOperationName(value));
}

function extractAttemptMap(raw: unknown): Partial<Record<PostCommitOperationName, number>> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const attemptMap: Partial<Record<PostCommitOperationName, number>> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([operation, value]) => {
    if (!isPostCommitOperationName(operation)) {
      return;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return;
    }
    attemptMap[operation] = Math.floor(value);
  });
  return attemptMap;
}

function extractNextRetryMap(
  raw: unknown,
): Partial<Record<PostCommitOperationName, FirebaseFirestore.Timestamp>> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const nextRetryMap: Partial<Record<PostCommitOperationName, FirebaseFirestore.Timestamp>> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([operation, value]) => {
    if (!isPostCommitOperationName(operation) || !isTimestampLike(value)) {
      return;
    }
    nextRetryMap[operation] = value;
  });
  return nextRetryMap;
}

function isTimestampLike(raw: unknown): raw is FirebaseFirestore.Timestamp {
  return (
    !!raw &&
    typeof raw === 'object' &&
    typeof (raw as { toDate?: unknown }).toDate === 'function' &&
    typeof (raw as { toMillis?: unknown }).toMillis === 'function'
  );
}

function extractProcessedAtTimestamp(raw: unknown): FirebaseFirestore.Timestamp {
  if (isTimestampLike(raw)) {
    return raw;
  }
  if (raw instanceof Date) {
    return admin.firestore.Timestamp.fromDate(raw);
  }
  return admin.firestore.Timestamp.now();
}

function toDateSafe(raw: unknown): Date | null {
  if (!raw) {
    return null;
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (isTimestampLike(raw)) {
    const date = raw.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function ensureStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((value): value is string => typeof value === 'string');
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null;
}

function buildSummaryForRetry(visitData: FirebaseFirestore.DocumentData): VisitSummaryResult {
  const medications = normalizeMedicationSummary(
    (visitData.medications as Record<string, unknown> | undefined) ?? {},
  );

  return {
    summary: typeof visitData.summary === 'string' ? visitData.summary : '',
    diagnoses: ensureStringArray(visitData.diagnoses),
    diagnosesDetailed: Array.isArray(visitData.diagnosesDetailed)
      ? (visitData.diagnosesDetailed as VisitSummaryResult['diagnosesDetailed'])
      : [],
    medications,
    imaging: ensureStringArray(visitData.imaging),
    testsOrdered: Array.isArray(visitData.testsOrdered)
      ? (visitData.testsOrdered as NonNullable<VisitSummaryResult['testsOrdered']>)
      : [],
    nextSteps: ensureStringArray(visitData.nextSteps),
    followUps: Array.isArray(visitData.followUps)
      ? (visitData.followUps as NonNullable<VisitSummaryResult['followUps']>)
      : [],
    medicationReview: isRecord(visitData.medicationReview)
      ? (visitData.medicationReview as unknown as VisitSummaryResult['medicationReview'])
      : {
        reviewed: false,
        continued: [],
        continuedReviewed: [],
        adherenceConcerns: [],
        reviewConcerns: [],
        sideEffectsDiscussed: [],
        followUpNeeded: false,
        notes: [],
      },
    education: isRecord(visitData.education)
      ? (visitData.education as VisitSummaryResult['education'])
      : {
        diagnoses: [],
        medications: [],
      },
    extractionVersion: typeof visitData.extractionVersion === 'string'
      ? (visitData.extractionVersion as VisitSummaryResult['extractionVersion'])
      : undefined,
    promptMeta: isRecord(visitData.promptMeta)
      ? (visitData.promptMeta as unknown as VisitSummaryResult['promptMeta'])
      : undefined,
  };
}

function resolveVisitDateForRetry(visitData: FirebaseFirestore.DocumentData): Date {
  return (
    toDateSafe(visitData.visitDate) ??
    toDateSafe(visitData.createdAt) ??
    toDateSafe(visitData.processedAt) ??
    new Date()
  );
}

async function isCaregiverAutoShareEnabled(
  userService: Pick<UserDomainService, 'getById'>,
  userId: string,
): Promise<boolean> {
  try {
    const user = await userService.getById(userId);
    if (user && typeof user.autoShareWithCaregivers === 'boolean') {
      return user.autoShareWithCaregivers;
    }
    return true;
  } catch (error) {
    functions.logger.warn(
      `[visitPostCommitRecovery] Failed to read autoShareWithCaregivers for user ${userId}; defaulting to enabled`,
      error,
    );
    return true;
  }
}

async function retryOperation(
  operation: PostCommitOperationName,
  visitId: string,
  visitData: FirebaseFirestore.DocumentData,
  dependencies: Required<VisitPostCommitRecoveryDependencies>,
): Promise<void> {
  const userId = typeof visitData.userId === 'string' ? visitData.userId : '';
  if (!userId) {
    throw new Error(`visit userId is missing; cannot retry ${operation}`);
  }

  switch (operation) {
    case 'syncMedications': {
      const normalizedMedications = normalizeMedicationSummary(
        (visitData.medications as Record<string, unknown> | undefined) ?? {},
      );
      const processedAt = extractProcessedAtTimestamp(visitData.processedAt);

      await syncMedicationsFromSummary({
        userId,
        visitId,
        medications: normalizedMedications,
        processedAt,
      });
      return;
    }

    case 'deleteTranscript': {
      const transcriptionId =
        typeof visitData.transcriptionId === 'string' ? visitData.transcriptionId.trim() : '';

      // If transcript is already absent, treat as successful/no-op.
      if (!transcriptionId) {
        return;
      }

      const assemblyAI = getAssemblyAIService();
      await assemblyAI.deleteTranscript(transcriptionId);
      await dependencies.visitService.updateRecord(visitId, {
        transcriptionId: admin.firestore.FieldValue.delete(),
        transcriptionDeletedAt: admin.firestore.Timestamp.now(),
      });
      return;
    }

    case 'lumibotAnalysis': {
      const summary = buildSummaryForRetry(visitData);
      const visitDate = resolveVisitDateForRetry(visitData);
      await analyzeVisitWithDelta(userId, visitId, summary, visitDate);
      return;
    }

    case 'pushNotification': {
      const notificationService = getNotificationService();
      await notificationService.notifyVisitReady(userId, visitId);
      return;
    }

    case 'caregiverEmails': {
      const autoShareEnabled = await isCaregiverAutoShareEnabled(dependencies.userService, userId);
      if (!autoShareEnabled) {
        functions.logger.info(
          `[visitPostCommitRecovery] Auto-share disabled for user ${userId}; skipping caregiver emails for visit ${visitId}`,
        );
        return;
      }
      await sendVisitPdfToAllCaregivers(userId, visitId);
      return;
    }

    default:
      throw new Error(`Operation ${operation} is not configured as retryable`);
  }
}

export async function processVisitPostCommitRecoveries(
  options: { limit?: number } = {},
  dependencyOverrides: VisitPostCommitRecoveryDependencies = {},
): Promise<VisitPostCommitRecoveryResult> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const result: VisitPostCommitRecoveryResult = {
    visitsScanned: 0,
    visitsRetried: 0,
    visitsResolved: 0,
    visitsStillFailing: 0,
    operationAttempts: 0,
    operationFailures: 0,
  };

  const limit = normalizeRecoveryLimit(options.limit);
  const visits = await dependencies.visitService.listPostCommitRecoverable(limit);

  result.visitsScanned = visits.length;

  for (const visit of visits) {
    const visitData = visit ?? {};
    const now = admin.firestore.Timestamp.now();
    const nowMs = now.toMillis();
    const completedOperationSet = new Set(
      extractCompletedOperations(visitData.postCommitCompletedOperations),
    );
    const operationAttempts = extractAttemptMap(visitData.postCommitOperationAttempts);
    const operationNextRetryAt = extractNextRetryMap(visitData.postCommitOperationNextRetryAt);
    const failedOperations = extractFailedOperations(visitData.postCommitFailedOperations)
      .filter((operation) => !completedOperationSet.has(operation));

    if (failedOperations.length === 0) {
      await dependencies.visitService.updateRecord(visit.id, {
        postCommitStatus: 'completed',
        postCommitFailedOperations: admin.firestore.FieldValue.delete(),
        postCommitRetryEligible: admin.firestore.FieldValue.delete(),
        postCommitLastAttemptAt: now,
        postCommitCompletedAt: now,
        postCommitOperationAttempts: admin.firestore.FieldValue.delete(),
        postCommitOperationNextRetryAt: admin.firestore.FieldValue.delete(),
      });
      result.visitsResolved += 1;
      continue;
    }

    const remainingFailures = new Set<PostCommitOperationName>(failedOperations);
    const newlyCompletedOperations = new Set<PostCommitOperationName>();
    let attemptedAnyRetry = false;
    let stateChanged = false;
    let escalatedFailure = false;

    for (const operation of failedOperations) {
      if (completedOperationSet.has(operation)) {
        remainingFailures.delete(operation);
        delete operationAttempts[operation];
        delete operationNextRetryAt[operation];
        stateChanged = true;
        continue;
      }
      if (!RETRYABLE_POST_COMMIT_OPERATIONS.has(operation)) {
        continue;
      }

      const priorAttempts = Math.max(operationAttempts[operation] ?? 1, 1);
      if (priorAttempts >= POST_COMMIT_MAX_RETRY_ATTEMPTS) {
        continue;
      }

      const nextRetryAt = operationNextRetryAt[operation];
      if (nextRetryAt && nextRetryAt.toMillis() > nowMs) {
        continue;
      }

      attemptedAnyRetry = true;
      result.operationAttempts += 1;

      try {
        await retryOperation(operation, visit.id, visitData, dependencies);
        remainingFailures.delete(operation);
        newlyCompletedOperations.add(operation);
        delete operationAttempts[operation];
        delete operationNextRetryAt[operation];
        stateChanged = true;
      } catch (error) {
        result.operationFailures += 1;
        const updatedAttempts = priorAttempts + 1;
        operationAttempts[operation] = updatedAttempts;
        if (updatedAttempts >= POST_COMMIT_MAX_RETRY_ATTEMPTS) {
          delete operationNextRetryAt[operation];
        } else {
          operationNextRetryAt[operation] = admin.firestore.Timestamp.fromDate(
            getPostCommitNextRetryDate(updatedAttempts, now.toDate()),
          );
        }
        stateChanged = true;
        if (updatedAttempts >= POST_COMMIT_RETRY_ALERT_THRESHOLD) {
          escalatedFailure = true;
          functions.logger.error(
            `[visitPostCommitRecovery][ALERT] Repeated failure for ${operation} on visit ${visit.id} (attempt ${updatedAttempts})`,
          );
        }
        functions.logger.warn(
          `[visitPostCommitRecovery] Retry failed for ${operation} on visit ${visit.id}`,
          error,
        );
      }
    }

    if (attemptedAnyRetry) {
      result.visitsRetried += 1;
    }

    const unresolvedOperations = Array.from(remainingFailures);
    const unresolvedAttemptMap = unresolvedOperations.reduce<
      Partial<Record<PostCommitOperationName, number>>
    >((acc, operation) => {
      acc[operation] = Math.max(operationAttempts[operation] ?? 1, 1);
      return acc;
    }, {});
    const unresolvedNextRetryMap = unresolvedOperations.reduce<
      Partial<Record<PostCommitOperationName, FirebaseFirestore.Timestamp>>
    >((acc, operation) => {
      const retryAt = operationNextRetryAt[operation];
      if (retryAt) {
        acc[operation] = retryAt;
      }
      return acc;
    }, {});

    if (unresolvedOperations.length === 0) {
      await dependencies.visitService.updateRecord(visit.id, {
        postCommitStatus: 'completed',
        postCommitFailedOperations: admin.firestore.FieldValue.delete(),
        postCommitRetryEligible: admin.firestore.FieldValue.delete(),
        postCommitLastAttemptAt: now,
        postCommitCompletedAt: now,
        postCommitOperationAttempts: admin.firestore.FieldValue.delete(),
        postCommitOperationNextRetryAt: admin.firestore.FieldValue.delete(),
        ...(newlyCompletedOperations.size > 0
          ? {
            postCommitCompletedOperations: admin.firestore.FieldValue.arrayUnion(
              ...Array.from(newlyCompletedOperations),
            ),
          }
          : {}),
      });
      result.visitsResolved += 1;
      continue;
    }

    const stillRetryEligible = unresolvedOperations.some((operation) =>
      RETRYABLE_POST_COMMIT_OPERATIONS.has(operation) &&
      (unresolvedAttemptMap[operation] ?? 1) < POST_COMMIT_MAX_RETRY_ATTEMPTS,
    );

    if (!attemptedAnyRetry && !stateChanged && stillRetryEligible) {
      result.visitsStillFailing += 1;
      continue;
    }

    await dependencies.visitService.updateRecord(visit.id, {
      postCommitStatus: 'partial_failure',
      postCommitFailedOperations: unresolvedOperations,
      postCommitRetryEligible: stillRetryEligible,
      postCommitLastAttemptAt: now,
      postCommitCompletedAt: admin.firestore.FieldValue.delete(),
      postCommitOperationAttempts: unresolvedAttemptMap,
      postCommitOperationNextRetryAt:
        Object.keys(unresolvedNextRetryMap).length > 0
          ? unresolvedNextRetryMap
          : admin.firestore.FieldValue.delete(),
      ...(escalatedFailure ? { postCommitEscalatedAt: now } : {}),
      ...(newlyCompletedOperations.size > 0
        ? {
          postCommitCompletedOperations: admin.firestore.FieldValue.arrayUnion(
            ...Array.from(newlyCompletedOperations),
          ),
        }
        : {}),
    });
    result.visitsStillFailing += 1;
  }

  return result;
}
