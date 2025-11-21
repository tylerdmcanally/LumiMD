import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { summarizeVisit } from '../services/visitProcessor';

const hasTranscript = (visitData: FirebaseFirestore.DocumentData): boolean => {
  const transcript = typeof visitData.transcript === 'string' ? visitData.transcript : '';
  const transcriptText =
    typeof visitData.transcriptText === 'string' ? visitData.transcriptText : '';

  return Boolean(transcript?.trim() || transcriptText?.trim());
};

export const summarizeVisitTrigger = onDocumentUpdated(
  {
    document: 'visits/{visitId}',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (event) => {
    const change = event.data;
    if (!change) {
      logger.warn('[summarizeVisitTrigger] No data in event');
      return;
    }
    const after = change.after.data();

    if (!after) {
      return;
    }

    if (after.processingStatus !== 'summarizing') {
      return;
    }

    if (after.summary && after.processingStatus === 'completed') {
      return;
    }

    if (!hasTranscript(after)) {
      logger.warn(
        `[summarizeVisitTrigger] Visit ${change.after.ref.id} is in summarizing state without transcript.`,
      );
      return;
    }

    if (after.summarizationStartedAt) {
      // Another invocation already started summarization.
      return;
    }

    try {
      const startedAt = admin.firestore.Timestamp.now();
      await change.after.ref.update({
        summarizationStartedAt: startedAt,
        processingError: admin.firestore.FieldValue.delete(),
        updatedAt: startedAt,
      });

      const updatedSnapshot = await change.after.ref.get();
      const updatedData = updatedSnapshot.data();

      if (!updatedData) {
        logger.warn(
          `[summarizeVisitTrigger] Visit ${change.after.ref.id} data unavailable after setting start timestamp.`,
        );
        return;
      }

      await summarizeVisit({
        visitRef: change.after.ref,
        visitData: updatedData,
      });
    } catch (error) {
      logger.error(
        `[summarizeVisitTrigger] Failed to run summarization for visit ${change.after.ref.id}:`,
        error,
      );
    }
  });

