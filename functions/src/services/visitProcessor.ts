import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getOpenAIService } from './openai';
import type { FollowUpItem, VisitSummaryResult } from './openai';
import { MedicationDomainService } from './domain/medications/MedicationDomainService';
import { UserDomainService } from './domain/users/UserDomainService';
import { normalizeMedicationSummary, syncMedicationsFromSummary } from './medicationSync';
import { normalizeMedicationName } from './medicationSafety';
import { resolveActionDueDate, resolveVisitReferenceDate } from '../utils/actionDueDate';
import { getAssemblyAIService } from './assemblyai';
import { analyzeVisitWithDelta } from './lumibotAnalyzer';
import { getNotificationService } from './notifications';
import { sendVisitPdfToAllCaregivers } from './caregiverEmailService';
import { FirestoreMedicationRepository } from './repositories/medications/FirestoreMedicationRepository';
import { FirestoreUserRepository } from './repositories/users/FirestoreUserRepository';
import { FirestoreVisitActionSyncRepository } from './repositories/visitActionSync/FirestoreVisitActionSyncRepository';
import type { VisitActionSyncRepository } from './repositories/visitActionSync/VisitActionSyncRepository';
import {
  POST_COMMIT_OPERATION_NAMES,
  getPostCommitNextRetryDate,
  type PostCommitOperationName,
  RETRYABLE_POST_COMMIT_OPERATIONS,
} from './visitPostCommitOperations';


const db = () => admin.firestore();

const getSafeErrorMessage = (error: unknown): string => {
  if (!error) return 'Unknown error';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

interface SummarizeVisitOptions {
  visitRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  visitData: FirebaseFirestore.DocumentData;
}

interface ActionDraft {
  description: string;
  dueAt: Date | null;
}

interface ExistingMedicationRecord {
  name: string;
  canonicalName: string;
  nameLower: string;
  active: boolean;
  dose?: string | null;
  frequency?: string | null;
}

type VisitProcessorDependencies = {
  medicationService?: Pick<MedicationDomainService, 'listAllForUser'>;
  userService?: Pick<UserDomainService, 'getById'>;
  visitActionSyncRepository?: Pick<VisitActionSyncRepository, 'replaceForVisit'>;
};

function buildDefaultDependencies(): Required<VisitProcessorDependencies> {
  return {
    medicationService: new MedicationDomainService(new FirestoreMedicationRepository(db())),
    userService: new UserDomainService(new FirestoreUserRepository(db())),
    visitActionSyncRepository: new FirestoreVisitActionSyncRepository(db()),
  };
}

function resolveDependencies(
  overrides: VisitProcessorDependencies,
): Required<VisitProcessorDependencies> {
  const defaults = buildDefaultDependencies();
  return {
    medicationService: overrides.medicationService ?? defaults.medicationService,
    userService: overrides.userService ?? defaults.userService,
    visitActionSyncRepository:
      overrides.visitActionSyncRepository ?? defaults.visitActionSyncRepository,
  };
}

const buildMedicationSignature = (
  entry: { name: string; dose?: string; frequency?: string },
): string => {
  const canonical = normalizeMedicationName(entry.name || '');
  const dose = typeof entry.dose === 'string' ? entry.dose.trim().toLowerCase() : '';
  const frequency =
    typeof entry.frequency === 'string' ? entry.frequency.trim().toLowerCase() : '';
  return `${canonical}|${dose}|${frequency}`;
};

const normalizeExistingMedicationRecord = (
  data: FirebaseFirestore.DocumentData | null | undefined,
): ExistingMedicationRecord | null => {
  const rawName = typeof data?.name === 'string' ? data.name.trim() : '';
  if (!rawName) {
    return null;
  }

  const canonicalFromDoc =
    typeof data?.canonicalName === 'string' ? data.canonicalName.trim().toLowerCase() : '';
  const canonicalName = canonicalFromDoc || normalizeMedicationName(rawName);
  const nameLowerFromDoc =
    typeof data?.nameLower === 'string' ? data.nameLower.trim().toLowerCase() : '';
  const nameLower = nameLowerFromDoc || rawName.toLowerCase();
  const active = typeof data?.active === 'boolean' ? data.active : true;
  const dose = typeof data?.dose === 'string' ? data.dose.trim() : null;
  const frequency = typeof data?.frequency === 'string' ? data.frequency.trim() : null;

  return {
    name: rawName,
    canonicalName,
    nameLower,
    active,
    dose,
    frequency,
  };
};

const reconcileContinuedMedications = (
  medications: VisitSummaryResult['medications'],
  medicationReview: VisitSummaryResult['medicationReview'] | undefined,
  existingMedicationRecords: ExistingMedicationRecord[],
): VisitSummaryResult['medications'] => {
  if (!medicationReview?.continued?.length) {
    return medications;
  }

  const next = {
    started: [...medications.started],
    stopped: [...medications.stopped],
    changed: [...medications.changed],
  };

  const stagedCanonicalNames = new Set<string>(
    [...next.started, ...next.stopped, ...next.changed].map((entry) =>
      normalizeMedicationName(entry.name),
    ),
  );
  const stagedSignatures = new Set<string>(
    [...next.started, ...next.stopped, ...next.changed].map((entry) =>
      buildMedicationSignature(entry),
    ),
  );

  const existingByCanonical = new Map<string, ExistingMedicationRecord>();
  existingMedicationRecords.forEach((record) => {
    existingByCanonical.set(record.canonicalName, record);
  });

  let promotedCount = 0;

  for (const continuedEntry of medicationReview.continued) {
    const continuedCanonical = normalizeMedicationName(continuedEntry.name);
    if (!continuedCanonical || stagedCanonicalNames.has(continuedCanonical)) {
      continue;
    }

    const continuedSignature = buildMedicationSignature(continuedEntry);
    if (stagedSignatures.has(continuedSignature)) {
      continue;
    }

    const existing = existingByCanonical.get(continuedCanonical);
    if (!existing) {
      next.started.push(continuedEntry);
      stagedCanonicalNames.add(continuedCanonical);
      stagedSignatures.add(continuedSignature);
      promotedCount += 1;
      continue;
    }

    if (!existing.active) {
      next.changed.push(continuedEntry);
      stagedCanonicalNames.add(continuedCanonical);
      stagedSignatures.add(continuedSignature);
      promotedCount += 1;
      continue;
    }

    const continuedDose = continuedEntry.dose?.trim().toLowerCase() ?? '';
    const existingDose = existing.dose?.trim().toLowerCase() ?? '';
    const continuedFrequency = continuedEntry.frequency?.trim().toLowerCase() ?? '';
    const existingFrequency = existing.frequency?.trim().toLowerCase() ?? '';
    const hasMeaningfulDoseUpdate = continuedDose.length > 0 && continuedDose !== existingDose;
    const hasMeaningfulFrequencyUpdate =
      continuedFrequency.length > 0 && continuedFrequency !== existingFrequency;

    if (hasMeaningfulDoseUpdate || hasMeaningfulFrequencyUpdate) {
      next.changed.push(continuedEntry);
      stagedCanonicalNames.add(continuedCanonical);
      stagedSignatures.add(continuedSignature);
      promotedCount += 1;
    }
  }

  if (promotedCount > 0) {
    functions.logger.info('[visitProcessor] Promoted continued medications for sync', {
      promotedCount,
      continuedCount: medicationReview.continued.length,
      startedCount: next.started.length,
      changedCount: next.changed.length,
    });
  }

  return next;
};

const formatFollowUpActionDescription = (followUp: FollowUpItem): string => {
  const task = typeof followUp.task === 'string' && followUp.task.trim().length > 0
    ? followUp.task.trim()
    : 'Follow up';

  if (followUp.timeframe && followUp.timeframe.trim().length > 0) {
    return `${task} — ${followUp.timeframe.trim()}`;
  }

  if (followUp.dueAt && followUp.dueAt.trim().length > 0) {
    return `${task} — by ${followUp.dueAt.slice(0, 10)}`;
  }

  return task;
};

const buildActionDrafts = (
  summary: VisitSummaryResult,
  referenceDate: Date,
): ActionDraft[] => {
  const followUps = Array.isArray(summary.followUps) ? summary.followUps : [];
  const drafts: ActionDraft[] = [];

  if (followUps.length > 0) {
    followUps.forEach((followUp) => {
      const description = formatFollowUpActionDescription(followUp);
      const dueAt = resolveActionDueDate({
        description,
        dueAt: followUp.dueAt,
        timeframe: followUp.timeframe,
        referenceDate,
      });
      drafts.push({ description, dueAt });
    });
    return drafts;
  }

  const nextSteps = Array.isArray(summary.nextSteps) ? summary.nextSteps : [];
  nextSteps.forEach((step) => {
    const description = typeof step === 'string' ? step.trim() : '';
    if (!description) {
      return;
    }
    const dueAt = resolveActionDueDate({
      description,
      referenceDate,
    });
    drafts.push({ description, dueAt });
  });

  return drafts;
};

const isCaregiverAutoShareEnabled = async (
  userService: Pick<UserDomainService, 'getById'>,
  userId: string,
): Promise<boolean> => {
  try {
    const user = await userService.getById(userId);
    if (user && typeof user.autoShareWithCaregivers === 'boolean') {
      return user.autoShareWithCaregivers;
    }
    return true;
  } catch (error) {
    functions.logger.warn(
      `[visitProcessor] Failed to read autoShareWithCaregivers for user ${userId}; defaulting to enabled`,
      error,
    );
    return true;
  }
};

export async function summarizeVisit({
  visitRef,
  visitData,
}: SummarizeVisitOptions, dependencyOverrides: VisitProcessorDependencies = {}): Promise<void> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const openAI = getOpenAIService();
  const transcriptText =
    (typeof visitData.transcriptText === 'string' ? visitData.transcriptText : '') ||
    (typeof visitData.transcript === 'string' ? visitData.transcript : '');

  if (!transcriptText || !transcriptText.trim()) {
    throw new Error('Transcript content is required for summarization');
  }

  const sanitizedTranscript = transcriptText.trim();

  try {
    const knownMedicationRecords = (await dependencies.medicationService.listAllForUser(
      visitData.userId,
    ))
      .map((record) => normalizeExistingMedicationRecord(record))
      .filter((record): record is ExistingMedicationRecord => record !== null);
    const knownMedicationNames = knownMedicationRecords.map((record) => record.name);

    const summary = await openAI.summarizeTranscript(sanitizedTranscript, {
      knownMedications: knownMedicationNames,
    });
    const syncReadyMedications = reconcileContinuedMedications(
      summary.medications,
      summary.medicationReview,
      knownMedicationRecords,
    );
    const normalizedMedications = normalizeMedicationSummary(syncReadyMedications);
    const processedAt = admin.firestore.Timestamp.now();
    const batch = db().batch();

    batch.update(visitRef, {
      summary: summary.summary,
      diagnoses: summary.diagnoses,
      diagnosesDetailed: summary.diagnosesDetailed,
      medications: normalizedMedications,
      imaging: summary.imaging,
      testsOrdered: summary.testsOrdered,
      nextSteps: summary.nextSteps,
      followUps: summary.followUps,
      medicationReview: summary.medicationReview,
      education: summary.education,
      extractionVersion: summary.extractionVersion,
      promptMeta: summary.promptMeta,
      processingStatus: 'completed',
      status: 'completed',
      processedAt,
      updatedAt: processedAt,
      processingError: admin.firestore.FieldValue.delete(),
      summarizationCompletedAt: processedAt,
      postCommitStatus: 'pending',
      postCommitFailedOperations: admin.firestore.FieldValue.delete(),
      postCommitLastAttemptAt: admin.firestore.FieldValue.delete(),
      postCommitCompletedAt: admin.firestore.FieldValue.delete(),
      postCommitRetryEligible: admin.firestore.FieldValue.delete(),
      postCommitCompletedOperations: admin.firestore.FieldValue.delete(),
      postCommitOperationAttempts: admin.firestore.FieldValue.delete(),
      postCommitOperationNextRetryAt: admin.firestore.FieldValue.delete(),
      postCommitEscalatedAt: admin.firestore.FieldValue.delete(),
    });

    // Privacy Audit Log
    functions.logger.info(`[PrivacyAudit] Visit ${visitRef.id} processed by OpenAI (Zero Retention). Summary generated.`);

    const referenceDate = resolveVisitReferenceDate(visitData, processedAt.toDate());
    const actionDrafts = buildActionDrafts(summary, referenceDate);

    await dependencies.visitActionSyncRepository.replaceForVisit(batch, {
      visitId: visitRef.id,
      payloads: actionDrafts.map((draft) => ({
        userId: visitData.userId,
        visitId: visitRef.id,
        description: draft.description,
        completed: false,
        completedAt: null,
        notes: '',
        createdAt: processedAt,
        updatedAt: processedAt,
        dueAt: draft.dueAt ? admin.firestore.Timestamp.fromDate(draft.dueAt) : null,
      })),
    });

    await batch.commit();

    functions.logger.info(
      `[visitProcessor] Visit ${visitRef.id} summarized successfully. Actions created: ${actionDrafts.length}`,
    );

    // Run post-commit operations in parallel for speed
    // Using Promise.allSettled so failures don't block other operations
    const visitDate = visitData.visitDate?.toDate?.() || processedAt.toDate();
    const transcriptionId = visitData.transcriptionId;

    const postCommitResults = await Promise.allSettled([
      // 1. Sync medications to user's medication list
      syncMedicationsFromSummary({
        userId: visitData.userId,
        visitId: visitRef.id,
        medications: normalizedMedications,
        processedAt,
      }),

      // 2. PRIVACY: Delete AssemblyAI transcript immediately
      (async () => {
        if (transcriptionId && typeof transcriptionId === 'string') {
          const assemblyAI = getAssemblyAIService();
          await assemblyAI.deleteTranscript(transcriptionId);
          await visitRef.update({
            transcriptionId: admin.firestore.FieldValue.delete(),
            transcriptionDeletedAt: admin.firestore.Timestamp.now(),
          });
          functions.logger.info(
            `[PrivacyAudit] Deleted AssemblyAI transcript ${transcriptionId} for visit ${visitRef.id}`,
          );
        }
      })(),

      // 3. LumiBot: AI Delta Analysis for intelligent nudge creation
      (async () => {
        const lumibotResult = await analyzeVisitWithDelta(
          visitData.userId,
          visitRef.id,
          summary,
          visitDate
        );
        functions.logger.info(
          `[LumiBot] Delta analysis complete for visit ${visitRef.id}`,
          {
            nudgesCreated: lumibotResult.nudgesCreated,
            reasoning: lumibotResult.reasoning,
            conditionsAdded: lumibotResult.conditionsAdded,
            trackingEnabled: lumibotResult.trackingEnabled,
          }
        );
      })(),

      // 4. Send push notification to user that visit is ready
      (async () => {
        const notificationService = getNotificationService();
        await notificationService.notifyVisitReady(visitData.userId, visitRef.id);
      })(),

      // 5. Send visit summary emails to caregivers
      (async () => {
        const autoShareEnabled = await isCaregiverAutoShareEnabled(
          dependencies.userService,
          visitData.userId,
        );
        if (!autoShareEnabled) {
          functions.logger.info(
            `[visitProcessor] Auto-share disabled for user ${visitData.userId}; skipping caregiver emails for visit ${visitRef.id}`,
          );
          return;
        }

        const result = await sendVisitPdfToAllCaregivers(visitData.userId, visitRef.id);
        if (result.sent > 0 || result.failed > 0) {
          functions.logger.info(
            `[visitProcessor] Caregiver emails for visit ${visitRef.id}: sent=${result.sent}, failed=${result.failed}`
          );
        }
      })(),
    ]);

    const failedPostCommitOperations: PostCommitOperationName[] = [];
    const successfulPostCommitOperations: PostCommitOperationName[] = [];

    // Log any failures (but don't fail the visit)
    postCommitResults.forEach((result, index) => {
      const opName = POST_COMMIT_OPERATION_NAMES[index];
      if (!opName) {
        return;
      }
      if (result.status === 'rejected') {
        failedPostCommitOperations.push(opName);
        functions.logger.warn(
          `[visitProcessor] Post-commit operation ${opName} failed for visit ${visitRef.id}:`,
          result.reason
        );
      } else {
        successfulPostCommitOperations.push(opName);
      }
    });

    const postCommitTimestamp = admin.firestore.Timestamp.now();
    const hasRetryableFailures = failedPostCommitOperations.some((operation) =>
      RETRYABLE_POST_COMMIT_OPERATIONS.has(operation),
    );
    const failureAttemptMap = failedPostCommitOperations.reduce<
      Partial<Record<PostCommitOperationName, number>>
    >((acc, operation) => {
      acc[operation] = 1;
      return acc;
    }, {});
    const failureNextRetryMap = failedPostCommitOperations.reduce<
      Partial<Record<PostCommitOperationName, FirebaseFirestore.Timestamp>>
    >((acc, operation) => {
      acc[operation] = admin.firestore.Timestamp.fromDate(
        getPostCommitNextRetryDate(1, postCommitTimestamp.toDate()),
      );
      return acc;
    }, {});
    const postCommitStateUpdate =
      failedPostCommitOperations.length > 0
        ? {
          postCommitStatus: 'partial_failure',
          postCommitFailedOperations: failedPostCommitOperations,
          postCommitLastAttemptAt: postCommitTimestamp,
          postCommitCompletedAt: admin.firestore.FieldValue.delete(),
          postCommitRetryEligible: hasRetryableFailures,
          postCommitOperationAttempts: failureAttemptMap,
          postCommitOperationNextRetryAt: failureNextRetryMap,
          postCommitEscalatedAt: admin.firestore.FieldValue.delete(),
          ...(successfulPostCommitOperations.length > 0
            ? {
              postCommitCompletedOperations: admin.firestore.FieldValue.arrayUnion(
                ...successfulPostCommitOperations,
              ),
            }
            : {}),
        }
        : {
          postCommitStatus: 'completed',
          postCommitFailedOperations: admin.firestore.FieldValue.delete(),
          postCommitLastAttemptAt: postCommitTimestamp,
          postCommitCompletedAt: postCommitTimestamp,
          postCommitRetryEligible: admin.firestore.FieldValue.delete(),
          postCommitOperationAttempts: admin.firestore.FieldValue.delete(),
          postCommitOperationNextRetryAt: admin.firestore.FieldValue.delete(),
          postCommitEscalatedAt: admin.firestore.FieldValue.delete(),
          ...(successfulPostCommitOperations.length > 0
            ? {
              postCommitCompletedOperations: admin.firestore.FieldValue.arrayUnion(
                ...successfulPostCommitOperations,
              ),
            }
            : {}),
        };

    try {
      await visitRef.update(postCommitStateUpdate);
    } catch (postCommitStateError) {
      functions.logger.warn(
        `[visitProcessor] Failed to record post-commit status for visit ${visitRef.id}`,
        postCommitStateError,
      );
    }


  } catch (error) {
    const errorMessage = getSafeErrorMessage(error);

    await visitRef.update({
      processingStatus: 'failed',
      status: 'failed',
      processingError: errorMessage,
      updatedAt: admin.firestore.Timestamp.now(),
      summarizationStartedAt: admin.firestore.FieldValue.delete(),
    });

    functions.logger.error(`[visitProcessor] Failed to summarize visit ${visitRef.id}:`, errorMessage);
    throw error;
  }
}
