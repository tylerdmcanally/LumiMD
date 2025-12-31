import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { storageConfig } from '../config';
import { getAssemblyAIService } from '../services/assemblyai';

const db = () => admin.firestore();

export const processVisitAudio = onObjectFinalized(
  {
    timeoutSeconds: 60,
    memory: '512MiB',
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

    let visitSnapshot = await db()
      .collection('visits')
      .where('storagePath', '==', filePath)
      .limit(1)
      .get();

    if (visitSnapshot.empty) {
      const encodedPath = encodeURIComponent(filePath);
      const downloadUrl = downloadToken
        ? `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`
        : null;

      if (downloadUrl) {
        visitSnapshot = await db()
          .collection('visits')
          .where('audioUrl', '==', downloadUrl)
          .limit(1)
          .get();
      }
    }

    if (visitSnapshot.empty) {
      const visitIdMatch = filePath.match(/^visits\/([^/]+)/);
      const derivedVisitId = visitIdMatch?.[1];

      if (derivedVisitId) {
        const derivedRef = db().collection('visits').doc(derivedVisitId);
        const derivedDoc = await derivedRef.get();
        if (derivedDoc.exists) {
          visitSnapshot = {
            docs: [derivedDoc],
          } as unknown as FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
        }
      }
    }

    if (visitSnapshot.empty) {
      throw new Error(`[processVisitAudio] No visit document found for file: ${filePath}`);
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
