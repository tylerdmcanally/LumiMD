import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getAssemblyAIService } from '../services/assemblyai';

const db = () => admin.firestore();

/**
 * Privacy Sweeper
 * Runs every 24 hours to ensure no sensitive data is left behind.
 * 
 * 1. Checks for "orphaned" AssemblyAI transcripts that weren't deleted
 * 2. Checks for audio files that should have been deleted but weren't
 */
export const privacyDataSweeper = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 24 hours',
    timeZone: 'America/Chicago',
    memory: '512MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async () => {
  functions.logger.info('[PrivacyAudit] Starting daily privacy data sweep...');
  
  const assemblyAI = getAssemblyAIService();
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - 24); // Look for items older than 24 hours
  
  // 1. Scan for visits that are "completed" but might still have a transcriptionId (meaning it wasn't deleted)
  const visitsSnapshot = await db()
    .collection('visits')
    .where('status', '==', 'completed')
    .where('processedAt', '<', admin.firestore.Timestamp.fromDate(cutoffTime))
    .get();

  let cleanedTranscripts = 0;
  let cleanedAudio = 0;

  for (const doc of visitsSnapshot.docs) {
    const data = doc.data();
    
    // Check for lingering AssemblyAI data
    if (data.transcriptionId) {
      try {
        await assemblyAI.deleteTranscript(data.transcriptionId);
        await doc.ref.update({
          transcriptionId: admin.firestore.FieldValue.delete()
        });
        cleanedTranscripts++;
        functions.logger.info(`[PrivacyAudit] Swept lingering transcript ${data.transcriptionId} for visit ${doc.id}`);
      } catch (error) {
        functions.logger.error(`[PrivacyAudit] Failed to sweep transcript for visit ${doc.id}`, error);
      }
    }

    // Check for lingering Audio files
    if (data.storagePath || data.audioUrl) {
      try {
        if (data.storagePath) {
          const bucket = admin.storage().bucket(data.bucketName);
          await bucket.file(data.storagePath).delete({ ignoreNotFound: true });
        }
        
        await doc.ref.update({
          audioUrl: admin.firestore.FieldValue.delete(),
          storagePath: admin.firestore.FieldValue.delete(),
          audioDeletedAt: admin.firestore.Timestamp.now(),
          sweptByPrivacyJob: true
        });
        cleanedAudio++;
        functions.logger.info(`[PrivacyAudit] Swept lingering audio for visit ${doc.id}`);
      } catch (error) {
        functions.logger.error(`[PrivacyAudit] Failed to sweep audio for visit ${doc.id}`, error);
      }
    }
  }

  functions.logger.info(`[PrivacyAudit] Sweep complete. Cleaned ${cleanedTranscripts} transcripts and ${cleanedAudio} audio files.`);
});

