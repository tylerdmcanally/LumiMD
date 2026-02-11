import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  AssemblyAITranscript,
  AssemblyAIUtterance,
  getAssemblyAIService,
} from '../services/assemblyai';

const db = () => admin.firestore();

const MAX_TRANSCRIPTION_DURATION_MS = 60 * 60 * 1000; // 60 minutes
const QUERY_LIMIT = 25;
const MAX_VISITS_PER_RUN = 100;

export type PendingTranscriptionDecision =
  | 'complete'
  | 'error'
  | 'timeout'
  | 'status_update'
  | 'noop';

interface ResolvePendingTranscriptionDecisionInput {
  transcriptStatus: string;
  currentTranscriptionStatus?: string;
  submittedAtMillis?: number | null;
  nowMillis: number;
  maxDurationMs?: number;
}

export function resolvePendingTranscriptionDecision(
  input: ResolvePendingTranscriptionDecisionInput,
): PendingTranscriptionDecision {
  const {
    transcriptStatus,
    currentTranscriptionStatus,
    submittedAtMillis,
    nowMillis,
    maxDurationMs = MAX_TRANSCRIPTION_DURATION_MS,
  } = input;

  if (transcriptStatus === 'completed') {
    return 'complete';
  }

  if (transcriptStatus === 'error') {
    return 'error';
  }

  if (
    typeof submittedAtMillis === 'number' &&
    nowMillis - submittedAtMillis > maxDurationMs
  ) {
    return 'timeout';
  }

  if (currentTranscriptionStatus !== transcriptStatus) {
    return 'status_update';
  }

  return 'noop';
}

const formatTranscriptAndText = (
  transcript: AssemblyAITranscript,
  formatFn: (utterances?: AssemblyAIUtterance[], fallbackText?: string) => string,
) => {
  const formattedTranscript = formatFn(transcript.utterances, transcript.text);

  return {
    formattedTranscript,
    rawText: transcript.text || '',
  };
};

export const checkPendingTranscriptions = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every minute',
    timeZone: 'Etc/UTC',
    timeoutSeconds: 300,
    memory: '512MiB',
    maxInstances: 1,
  },
  async () => {
    const assemblyAI = getAssemblyAIService();
    const now = admin.firestore.Timestamp.now();

    let polled = 0;
    let completed = 0;
    let failed = 0;
    let unchanged = 0;
    let cursorDocId: string | null = null;

    while (polled < MAX_VISITS_PER_RUN) {
      const remainingCapacity = MAX_VISITS_PER_RUN - polled;
      const batchSize = Math.min(QUERY_LIMIT, remainingCapacity);

      let query = db()
        .collection('visits')
        .where('processingStatus', '==', 'transcribing')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(batchSize);

      if (cursorDocId) {
        query = query.startAfter(cursorDocId);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        break;
      }

      const docsToProcess = snapshot.docs;

      for (const docSnapshot of docsToProcess) {
        polled += 1;

        const visitRef = docSnapshot.ref;
        const visitData = docSnapshot.data();
        const transcriptionId = visitData.transcriptionId as string | undefined;

        if (!transcriptionId) {
          logger.warn(
            `[checkPendingTranscriptions] Visit ${visitRef.id} missing transcriptionId while transcribing.`,
          );
          unchanged += 1;
          continue;
        }

        try {
          const transcript = await assemblyAI.getTranscript(transcriptionId);
          const submittedAt = visitData.transcriptionSubmittedAt as
            | admin.firestore.Timestamp
            | undefined;
          const decision = resolvePendingTranscriptionDecision({
            transcriptStatus: transcript.status,
            currentTranscriptionStatus: visitData.transcriptionStatus,
            submittedAtMillis: submittedAt?.toMillis?.(),
            nowMillis: Date.now(),
          });

          if (decision === 'complete') {
            const { formattedTranscript, rawText } = formatTranscriptAndText(
              transcript,
              assemblyAI.formatTranscript.bind(assemblyAI),
            );

            await visitRef.update({
              transcriptionStatus: 'completed',
              transcriptionCompletedAt: now,
              transcriptionError: admin.firestore.FieldValue.delete(),
              transcript: formattedTranscript,
              transcriptText: rawText,
              processingStatus: 'summarizing',
              processingError: admin.firestore.FieldValue.delete(),
              updatedAt: now,
            });

            logger.info(
              `[checkPendingTranscriptions] Visit ${visitRef.id} transcription completed and transcript stored.`,
            );
            completed += 1;
            continue;
          }

          if (decision === 'error') {
            await visitRef.update({
              transcriptionStatus: 'error',
              transcriptionError: transcript.error || 'Transcription failed',
              processingStatus: 'failed',
              status: 'failed',
              processingError: transcript.error || 'Transcription failed',
              updatedAt: now,
            });

            logger.error(
              `[checkPendingTranscriptions] Visit ${visitRef.id} transcription failed: ${transcript.error}`,
            );
            failed += 1;
            continue;
          }

          if (decision === 'timeout') {
            await visitRef.update({
              transcriptionStatus: 'error',
              transcriptionError: 'Transcription timed out after 60 minutes',
              processingStatus: 'failed',
              status: 'failed',
              processingError: 'Transcription timed out after 60 minutes',
              updatedAt: now,
            });

            logger.error(
              `[checkPendingTranscriptions] Visit ${visitRef.id} transcription timed out after 60 minutes.`,
            );
            failed += 1;
            continue;
          }

          if (decision === 'status_update') {
            await visitRef.update({
              transcriptionStatus: transcript.status,
              updatedAt: now,
            });
          }
          unchanged += 1;
        } catch (error) {
          logger.error(
            `[checkPendingTranscriptions] Failed to check transcription for visit ${visitRef.id}:`,
            error,
          );
          unchanged += 1;
        }
      }

      if (snapshot.size < batchSize) {
        break;
      }
      cursorDocId = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;
    }

    if (polled === 0) {
      logger.info('[checkPendingTranscriptions] No pending transcriptions found.');
      return;
    }

    logger.info('[checkPendingTranscriptions] Polling pass complete', {
      polled,
      completed,
      failed,
      unchanged,
      capped: polled >= MAX_VISITS_PER_RUN,
    });
  }
);
