import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  AssemblyAITranscript,
  AssemblyAIUtterance,
  getAssemblyAIService,
} from '../services/assemblyai';

const db = () => admin.firestore();

const MAX_TRANSCRIPTION_DURATION_MS = 60 * 60 * 1000; // 60 minutes
const QUERY_LIMIT = 10;

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

export const checkPendingTranscriptions = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '512MB',
    failurePolicy: true,
  })
  .pubsub.schedule('every minute')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    const snapshot = await db()
      .collection('visits')
      .where('processingStatus', '==', 'transcribing')
      .limit(QUERY_LIMIT)
      .get();

    if (snapshot.empty) {
      functions.logger.info('[checkPendingTranscriptions] No pending transcriptions found.');
      return null;
    }

    const assemblyAI = getAssemblyAIService();
    const now = admin.firestore.Timestamp.now();

    for (const docSnapshot of snapshot.docs) {
      const visitRef = docSnapshot.ref;
      const visitData = docSnapshot.data();
      const transcriptionId = visitData.transcriptionId as string | undefined;

      if (!transcriptionId) {
        functions.logger.warn(
          `[checkPendingTranscriptions] Visit ${visitRef.id} missing transcriptionId while transcribing.`,
        );
        continue;
      }

      try {
        const transcript = await assemblyAI.getTranscript(transcriptionId);

        if (transcript.status === 'completed') {
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

          functions.logger.info(
            `[checkPendingTranscriptions] Visit ${visitRef.id} transcription completed and transcript stored.`,
          );
          continue;
        }

        if (transcript.status === 'error') {
          await visitRef.update({
            transcriptionStatus: 'error',
            transcriptionError: transcript.error || 'Transcription failed',
            processingStatus: 'failed',
            status: 'failed',
            processingError: transcript.error || 'Transcription failed',
            updatedAt: now,
          });

          functions.logger.error(
            `[checkPendingTranscriptions] Visit ${visitRef.id} transcription failed: ${transcript.error}`,
          );
          continue;
        }

        const submittedAt = visitData.transcriptionSubmittedAt as admin.firestore.Timestamp | undefined;

        if (submittedAt) {
          const elapsedMs = Date.now() - submittedAt.toMillis();

          if (elapsedMs > MAX_TRANSCRIPTION_DURATION_MS) {
            await visitRef.update({
              transcriptionStatus: 'error',
              transcriptionError: 'Transcription timed out after 60 minutes',
              processingStatus: 'failed',
              status: 'failed',
              processingError: 'Transcription timed out after 60 minutes',
              updatedAt: now,
            });

            functions.logger.error(
              `[checkPendingTranscriptions] Visit ${visitRef.id} transcription timed out after 60 minutes.`,
            );
            continue;
          }
        }

        if (visitData.transcriptionStatus !== transcript.status) {
          await visitRef.update({
            transcriptionStatus: transcript.status,
            updatedAt: now,
          });
        }
      } catch (error) {
        functions.logger.error(
          `[checkPendingTranscriptions] Failed to check transcription for visit ${visitRef.id}:`,
          error,
        );
      }
    }

    return null;
  });

