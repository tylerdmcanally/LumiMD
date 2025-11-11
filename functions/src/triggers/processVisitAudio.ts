import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { storageConfig } from '../config';
import { getAssemblyAIService } from '../services/assemblyai';

const db = () => admin.firestore();

export const processVisitAudio = functions
  .runWith({
    timeoutSeconds: 60,
    memory: '512MB',
    failurePolicy: true,
  })
  .storage.object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    const bucketName = object.bucket || storageConfig.bucket;

    if (!filePath) {
      functions.logger.warn('[processVisitAudio] No file path provided.');
      return;
    }

    if (!filePath.startsWith('visits/')) {
      functions.logger.info(`[processVisitAudio] Ignoring non-visit file: ${filePath}`);
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
      functions.logger.error(`[processVisitAudio] No visit document found for file: ${filePath}`);
      return;
    }

    const visitDoc = visitSnapshot.docs[0];
    const visitRef = visitDoc.ref;
    const visitData = visitDoc.data();

    if (
      visitData.transcriptionId &&
      ['transcribing', 'summarizing', 'completed'].includes(visitData.processingStatus)
    ) {
      functions.logger.info(
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
      const transcriptionId = await assemblyAI.submitTranscription(signedUrl);
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

      functions.logger.info(
        `[processVisitAudio] Visit ${visitRef.id} submitted to AssemblyAI. transcriptionId=${transcriptionId}`,
      );
    } catch (error) {
      functions.logger.error(
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
  });
