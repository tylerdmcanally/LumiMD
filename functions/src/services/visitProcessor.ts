import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getOpenAIService } from './openai';
import { normalizeMedicationSummary, syncMedicationsFromSummary } from './medicationSync';

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

export async function summarizeVisit({
  visitRef,
  visitData,
}: SummarizeVisitOptions): Promise<void> {
  const openAI = getOpenAIService();
  const transcriptText =
    (typeof visitData.transcriptText === 'string' ? visitData.transcriptText : '') ||
    (typeof visitData.transcript === 'string' ? visitData.transcript : '');

  if (!transcriptText || !transcriptText.trim()) {
    throw new Error('Transcript content is required for summarization');
  }

  const sanitizedTranscript = transcriptText.trim();

  try {
    const knownMedsSnapshot = await db()
      .collection('medications')
      .where('userId', '==', visitData.userId)
      .get();

    const knownMedicationNames = knownMedsSnapshot.docs
      .map((doc) => doc.get('name') as string | undefined)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

    const summary = await openAI.summarizeTranscript(sanitizedTranscript, {
      knownMedications: knownMedicationNames,
    });
    const normalizedMedications = normalizeMedicationSummary(summary.medications);
    const processedAt = admin.firestore.Timestamp.now();
    const batch = db().batch();

    batch.update(visitRef, {
      summary: summary.summary,
      diagnoses: summary.diagnoses,
      medications: normalizedMedications,
      imaging: summary.imaging,
      nextSteps: summary.nextSteps,
      education: summary.education,
      processingStatus: 'completed',
      status: 'completed',
      processedAt,
      updatedAt: processedAt,
      processingError: admin.firestore.FieldValue.delete(),
      summarizationCompletedAt: processedAt,
    });

    const actionsCollection = db().collection('actions');
    const existingActions = await actionsCollection.where('visitId', '==', visitRef.id).get();

    existingActions.docs.forEach((doc) => batch.delete(doc.ref));

    summary.nextSteps.forEach((step) => {
      const actionRef = actionsCollection.doc();
      batch.set(actionRef, {
        userId: visitData.userId,
        visitId: visitRef.id,
        description: step,
        completed: false,
        completedAt: null,
        notes: '',
        createdAt: processedAt,
        updatedAt: processedAt,
      });
    });

    await batch.commit();

    await syncMedicationsFromSummary({
      userId: visitData.userId,
      visitId: visitRef.id,
      medications: normalizedMedications,
      processedAt,
    });

    functions.logger.info(
      `[visitProcessor] Visit ${visitRef.id} summarized successfully. Actions created: ${summary.nextSteps.length}`,
    );
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



