import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { getAssemblyAIService } from '../services/assemblyai';
import { logPrivacyEvent } from '../services/privacyAuditLogger';

const db = () => admin.firestore();

/**
 * Privacy Sweeper
 * Runs every 24 hours to ensure no sensitive data is left behind.
 *
 * 1. Checks for "orphaned" AssemblyAI transcripts that weren't deleted
 * 2. Checks for audio files that should have been deleted but weren't
 * 3. Checks for lingering AVS document files (photos/PDFs) in Storage
 * 4. Expires stale pending shareInvites past their TTL
 * 5. Hard-deletes expired/revoked shareInvites older than 30 days
 */
export const privacyDataSweeper = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 24 hours',
    timeZone: 'Etc/UTC',
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
  let cleanedDocuments = 0;

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

    // Check for lingering document files (AVS photos/PDFs)
    if (data.documentStoragePath) {
      try {
        const paths = Array.isArray(data.documentStoragePath)
          ? data.documentStoragePath
          : [data.documentStoragePath];
        const bucket = admin.storage().bucket();
        for (const docPath of paths) {
          await bucket.file(docPath).delete({ ignoreNotFound: true });
        }
        await doc.ref.update({
          documentStoragePath: admin.firestore.FieldValue.delete(),
          documentDeletedAt: admin.firestore.Timestamp.now(),
          sweptByPrivacyJob: true,
        });
        cleanedDocuments++;
        functions.logger.info(`[PrivacyAudit] Swept lingering documents for visit ${doc.id}`);
      } catch (error) {
        functions.logger.error(`[PrivacyAudit] Failed to sweep documents for visit ${doc.id}`, error);
      }
    }
  }

  functions.logger.info(`[PrivacyAudit] Sweep complete. Cleaned ${cleanedTranscripts} transcripts, ${cleanedAudio} audio files, and ${cleanedDocuments} document files.`);

  // ── Phase 2: ShareInvite cleanup ──────────────────────────────────────────

  const now = admin.firestore.Timestamp.now();
  let expiredInvites = 0;
  let deletedInvites = 0;

  // 3. Mark pending invites that are past their expiresAt as expired
  try {
    const pendingSnapshot = await db()
      .collection('shareInvites')
      .where('status', '==', 'pending')
      .where('expiresAt', '<', now)
      .get();

    const expireBatch = db().batch();
    for (const doc of pendingSnapshot.docs) {
      expireBatch.update(doc.ref, { status: 'expired', updatedAt: now });
    }
    if (!pendingSnapshot.empty) {
      await expireBatch.commit();
      expiredInvites = pendingSnapshot.size;
    }
  } catch (error) {
    functions.logger.error('[PrivacyAudit] Failed to expire stale shareInvites:', error);
  }

  // 4. Hard-delete expired/revoked invites older than 30 days
  try {
    const retentionCutoff = new Date();
    retentionCutoff.setDate(retentionCutoff.getDate() - 30);
    const retentionTimestamp = admin.firestore.Timestamp.fromDate(retentionCutoff);

    // Expired invites older than 30 days
    const expiredSnapshot = await db()
      .collection('shareInvites')
      .where('status', '==', 'expired')
      .where('createdAt', '<', retentionTimestamp)
      .get();

    // Revoked invites older than 30 days
    const revokedSnapshot = await db()
      .collection('shareInvites')
      .where('status', '==', 'revoked')
      .where('createdAt', '<', retentionTimestamp)
      .get();

    const allStaleDocs = [...expiredSnapshot.docs, ...revokedSnapshot.docs];

    if (allStaleDocs.length > 0) {
      // Firestore batch limit is 500, chunk if needed
      const BATCH_LIMIT = 500;
      for (let i = 0; i < allStaleDocs.length; i += BATCH_LIMIT) {
        const chunk = allStaleDocs.slice(i, i + BATCH_LIMIT);
        const deleteBatch = db().batch();
        for (const doc of chunk) {
          deleteBatch.delete(doc.ref);
        }
        await deleteBatch.commit();
      }
      deletedInvites = allStaleDocs.length;
    }
  } catch (error) {
    functions.logger.error('[PrivacyAudit] Failed to purge old shareInvites:', error);
  }

  functions.logger.info(
    `[PrivacyAudit] ShareInvite cleanup: expired ${expiredInvites} pending invites, deleted ${deletedInvites} stale invites.`,
  );

  await logPrivacyEvent({
    eventType: 'privacy_sweep',
    actorUserId: 'system',
    metadata: {
      cleanedTranscripts,
      cleanedAudio,
      cleanedDocuments,
      expiredInvites,
      deletedInvites,
    },
  });
});

