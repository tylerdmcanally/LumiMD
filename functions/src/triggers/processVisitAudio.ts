import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { storageConfig } from '../config';
import { getAssemblyAIService } from '../services/assemblyai';

const db = () => admin.firestore();

// Helper to wait for a specified time
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Find visit document with retry logic to handle race condition
// where audio upload completes before visit document is created
async function findVisitDocument(
  filePath: string,
  bucketName: string,
  downloadToken: string | undefined,
  maxRetries = 5,
  initialDelayMs = 1000
): Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData> | null> {

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // First try: query by storagePath
    let visitSnapshot = await db()
      .collection('visits')
      .where('storagePath', '==', filePath)
      .limit(1)
      .get();

    if (!visitSnapshot.empty) {
      return visitSnapshot;
    }

    // Second try: query by audioUrl if we have a download token
    if (downloadToken) {
      const encodedPath = encodeURIComponent(filePath);
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;

      visitSnapshot = await db()
        .collection('visits')
        .where('audioUrl', '==', downloadUrl)
        .limit(1)
        .get();

      if (!visitSnapshot.empty) {
        return visitSnapshot;
      }
    }

    // Third try: derive visitId from path pattern (visits/{userId}/{timestamp}.m4a)
    // The path format may be visits/{visitId} or visits/{userId}/{filename}
    const visitIdMatch = filePath.match(/^visits\/([^/]+)/);
    const derivedVisitId = visitIdMatch?.[1];

    if (derivedVisitId) {
      const derivedRef = db().collection('visits').doc(derivedVisitId);
      const derivedDoc = await derivedRef.get();
      if (derivedDoc.exists) {
        return {
          docs: [derivedDoc],
          empty: false,
        } as unknown as FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
      }
    }

    // If not found and we have retries left, wait before trying again
    if (attempt < maxRetries - 1) {
      const waitTime = initialDelayMs * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      logger.info(`[processVisitAudio] Visit document not found, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
      await delay(waitTime);
    }
  }

  return null; // Not found after all retries
}

export const processVisitAudio = onObjectFinalized(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
    maxInstances: 20,
  },
  async (event) => {
    const object = event.data;
    const filePath = object.name;
    const bucketName = object.bucket || storageConfig.bucket;

    if (!filePath) {
      logger.warn('[processVisitAudio] No file path provided.');
      return;
    }

    if (!filePath.startsWith('visits/')) {
      logger.info(`[processVisitAudio] Ignoring non-visit file: ${filePath}`);
      return;
    }

    const downloadToken =
      object.metadata?.firebaseStorageDownloadTokens ||
      object.metadata?.firebaseStorageDownloadToken;

    // Find visit document with retries to handle race condition
    const visitSnapshot = await findVisitDocument(filePath, bucketName, downloadToken);

    if (!visitSnapshot || visitSnapshot.empty) {
      throw new Error(`[processVisitAudio] No visit document found for file: ${filePath} after retries`);
    }

    const visitDoc = visitSnapshot.docs[0];
    const visitRef = visitDoc.ref;
    const visitData = visitDoc.data();

    if (
      visitData.transcriptionId &&
      ['transcribing', 'summarizing', 'completed'].includes(visitData.processingStatus)
    ) {
      logger.info(
        `[processVisitAudio] Visit ${visitDoc.id} already submitted for processing. Skipping.`,
      );
      return;
    }

    try {
      const storagePath = visitData.storagePath || filePath;
      const bucket = admin.storage().bucket(bucketName);
      const file = bucket.file(storagePath);

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });

      if (!signedUrl) {
        throw new Error('Unable to generate signed URL for transcription submission');
      }

      const assemblyAI = getAssemblyAIService();

      // Construct webhook URL for instant transcription completion callbacks
      // Falls back to polling if webhook fails
      const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'lumimd-dev';
      const region = 'us-central1';
      const webhookUrl = `https://${region}-${projectId}.cloudfunctions.net/api/v1/webhooks/assemblyai/transcription-complete`;

      const transcriptionId = await assemblyAI.submitTranscription(signedUrl, webhookUrl);
      const now = admin.firestore.Timestamp.now();

      const updatePayload: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        storagePath,
        transcriptionId,
        transcriptionSubmittedAt: now,
        transcriptionStatus: 'submitted',
        processingStatus: 'transcribing',
        status: 'processing',
        processingError: admin.firestore.FieldValue.delete(),
        retryCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      };

      if (!visitData.storagePath) {
        updatePayload.storagePath = storagePath;
      }

      if (downloadToken && !visitData.audioUrl) {
        const encodedPath = encodeURIComponent(storagePath);
        updatePayload.audioUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
      }

      await visitRef.update(updatePayload);

      // Increment freeVisitsUsed counter for session-based trial tracking
      // This counts visits that have been successfully submitted for processing
      const userId = visitData.userId;
      if (userId) {
        try {
          const userRef = db().collection('users').doc(userId);
          await userRef.update({
            freeVisitsUsed: admin.firestore.FieldValue.increment(1),
          });
          logger.info(`[processVisitAudio] Incremented freeVisitsUsed for user ${userId}`);
        } catch (userUpdateError) {
          // Log but don't fail the visit processing if counter update fails
          logger.warn(`[processVisitAudio] Failed to increment freeVisitsUsed for user ${userId}:`, userUpdateError);
        }
      }

      // Step 4: Clean up external data (Privacy & Data Minimization)
      // NOTE: This runs AFTER the transcript has been received and processed.
      // Since this function (processVisitAudio) only SUBMITS the job, we can't delete yet.
      // Deletion must happen in the webhook handler (when job is done) or the sweeper.

      logger.info(
        `[processVisitAudio] Visit ${visitRef.id} submitted to AssemblyAI. transcriptionId=${transcriptionId}`,
      );
    } catch (error) {
      logger.error(
        `[processVisitAudio] Failed to submit visit ${visitDoc.id} for transcription:`,
        error,
      );

      await visitRef.update({
        processingStatus: 'failed',
        status: 'failed',
        processingError:
          error instanceof Error ? error.message : 'Failed to submit audio for transcription',
        updatedAt: admin.firestore.Timestamp.now(),
      });
    }
  }
);
