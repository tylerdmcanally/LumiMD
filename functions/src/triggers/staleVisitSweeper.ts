/**
 * Stale Visit Sweeper
 * 
 * A scheduled Cloud Function that runs every 10 minutes to find and recover
 * visits that are stuck in processing states.
 * 
 * Scenarios handled:
 * 1. Visits stuck in "transcribing" for >30 minutes (transcription may have failed silently)
 * 2. Visits stuck in "summarizing" for >15 minutes (OpenAI call may have timed out)
 * 3. Visits with transcriptionId but no transcript for >45 minutes (webhook may have failed)
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { getAssemblyAIService } from '../services/assemblyai';
import {
    resolveSummarizingRecoveryMode,
    resolveTranscribingRecoveryMode,
} from '../services/visitProcessingTransitions';

const db = () => admin.firestore();

// Thresholds for stale states (in milliseconds)
export const TRANSCRIBING_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const SUMMARIZING_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes

// Maximum retries before marking as permanently failed
export const MAX_RETRIES = 3;

interface StaleVisitStats {
    staleTranscribing: number;
    staleSummarizing: number;
    staleWebhook: number;
    retried: number;
    failed: number;
}

/**
 * Checks if a Firestore Timestamp is older than the given threshold
 */
export function isOlderThan(timestamp: admin.firestore.Timestamp | undefined, thresholdMs: number): boolean {
    if (!timestamp) return false;
    const now = Date.now();
    const timestampMs = timestamp.toMillis();
    return now - timestampMs > thresholdMs;
}

/**
 * Attempts to recover a stale transcribing visit by checking AssemblyAI status
 */
export async function recoverTranscribingVisit(
    visitRef: FirebaseFirestore.DocumentReference,
    visitData: FirebaseFirestore.DocumentData,
): Promise<'retried' | 'failed' | 'skipped'> {
    const visitId = visitRef.id;
    const retryCount = visitData.retryCount || 0;
    const initialMode = resolveTranscribingRecoveryMode({
        retryCount,
        hasTranscriptionId: Boolean(visitData.transcriptionId),
        maxRetries: MAX_RETRIES,
    });

    // If we've exceeded max retries, mark as failed
    if (initialMode === 'fail_max_retries') {
        logger.warn(`[sweeper] Visit ${visitId} exceeded max retries (${MAX_RETRIES}), marking as failed`);
        await visitRef.update({
            processingStatus: 'failed',
            status: 'failed',
            processingError: `Transcription failed after ${MAX_RETRIES} attempts`,
            updatedAt: admin.firestore.Timestamp.now(),
        });
        return 'failed';
    }

    // No transcription id available: reset to pending for a clean retry.
    if (initialMode === 'retry_pending') {
        logger.info(`[sweeper] Visit ${visitId} has no transcriptionId, resetting to pending`);
        await visitRef.update({
            processingStatus: 'pending',
            retryCount: admin.firestore.FieldValue.increment(1),
            processingError: 'Transcription timed out, retrying',
            updatedAt: admin.firestore.Timestamp.now(),
        });
        return 'retried';
    }

    // Try to check transcription status with AssemblyAI for known transcription ids.
    if (visitData.transcriptionId) {
        try {
            const assemblyAI = getAssemblyAIService();
            const transcript = await assemblyAI.getTranscript(visitData.transcriptionId);
            const mode = resolveTranscribingRecoveryMode({
                retryCount,
                hasTranscriptionId: true,
                transcriptStatus: transcript.status,
                maxRetries: MAX_RETRIES,
            });

            if (mode === 'resume_summarizing') {
                // Transcription completed but webhook may have failed
                // Format the transcript and move to summarizing
                const transcriptText = assemblyAI.formatTranscript(transcript.utterances, transcript.text);

                await visitRef.update({
                    transcript: transcriptText,
                    transcriptText: transcript.text || '',
                    processingStatus: 'summarizing',
                    updatedAt: admin.firestore.Timestamp.now(),
                });

                logger.info(`[sweeper] Visit ${visitId} transcript recovered, moving to summarizing`);
                return 'retried';
            }

            if (mode === 'mark_failed') {
                // Transcription failed at AssemblyAI
                logger.warn(`[sweeper] Visit ${visitId} transcription failed at AssemblyAI: ${transcript.error}`);
                await visitRef.update({
                    processingStatus: 'failed',
                    status: 'failed',
                    processingError: transcript.error || 'Transcription failed at AssemblyAI',
                    updatedAt: admin.firestore.Timestamp.now(),
                });
                return 'failed';
            }

            // Still processing at AssemblyAI - skip for now
            logger.info(`[sweeper] Visit ${visitId} still processing at AssemblyAI (status: ${transcript.status})`);
            return 'skipped';
        } catch (error) {
            // Error checking AssemblyAI - reset to allow retry
            logger.error(`[sweeper] Error checking AssemblyAI for visit ${visitId}:`, error);
            await visitRef.update({
                processingStatus: 'pending',
                transcriptionId: admin.firestore.FieldValue.delete(),
                retryCount: admin.firestore.FieldValue.increment(1),
                processingError: error instanceof Error ? error.message : 'Failed to check transcription status',
                updatedAt: admin.firestore.Timestamp.now(),
            });
            return 'retried';
        }
    }
    return 'skipped';
}

/**
 * Attempts to recover a stale summarizing visit
 */
export async function recoverSummarizingVisit(
    visitRef: FirebaseFirestore.DocumentReference,
    visitData: FirebaseFirestore.DocumentData,
): Promise<'retried' | 'failed'> {
    const visitId = visitRef.id;
    const retryCount = visitData.retryCount || 0;
    const mode = resolveSummarizingRecoveryMode({
        retryCount,
        maxRetries: MAX_RETRIES,
    });

    if (mode === 'fail_max_retries') {
        logger.warn(`[sweeper] Visit ${visitId} exceeded max retries (${MAX_RETRIES}) for summarization`);
        await visitRef.update({
            processingStatus: 'failed',
            status: 'failed',
            processingError: `Summarization failed after ${MAX_RETRIES} attempts`,
            updatedAt: admin.firestore.Timestamp.now(),
        });
        return 'failed';
    }

    // Reset summarization to try again
    logger.info(`[sweeper] Visit ${visitId} summarization timed out, resetting for retry`);
    await visitRef.update({
        summarizationStartedAt: admin.firestore.FieldValue.delete(),
        retryCount: admin.firestore.FieldValue.increment(1),
        processingError: 'Summarization timed out, retrying',
        updatedAt: admin.firestore.Timestamp.now(),
    });
    return 'retried';
}

/**
 * Main sweeper function - runs on a schedule
 */
export const staleVisitSweeper = onSchedule(
    {
        region: 'us-central1',
        schedule: 'every 10 minutes',
        timeZone: 'America/Chicago',
        memory: '256MiB',
        timeoutSeconds: 120,
        maxInstances: 1,
    },
    async () => {
        const stats: StaleVisitStats = {
            staleTranscribing: 0,
            staleSummarizing: 0,
            staleWebhook: 0,
            retried: 0,
            failed: 0,
        };

        logger.info('[sweeper] Starting stale visit sweep');

        try {
            // Find visits stuck in "transcribing"
            const transcribingQuery = await db()
                .collection('visits')
                .where('processingStatus', '==', 'transcribing')
                .get();

            for (const doc of transcribingQuery.docs) {
                const data = doc.data();
                const startTime = data.transcriptionSubmittedAt || data.updatedAt;

                if (isOlderThan(startTime, TRANSCRIBING_TIMEOUT_MS)) {
                    stats.staleTranscribing++;
                    const result = await recoverTranscribingVisit(doc.ref, data);
                    if (result === 'retried') stats.retried++;
                    if (result === 'failed') stats.failed++;
                }
            }

            // Find visits stuck in "summarizing"
            const summarizingQuery = await db()
                .collection('visits')
                .where('processingStatus', '==', 'summarizing')
                .get();

            for (const doc of summarizingQuery.docs) {
                const data = doc.data();
                const startTime = data.summarizationStartedAt || data.updatedAt;

                if (isOlderThan(startTime, SUMMARIZING_TIMEOUT_MS)) {
                    stats.staleSummarizing++;
                    const result = await recoverSummarizingVisit(doc.ref, data);
                    if (result === 'retried') stats.retried++;
                    if (result === 'failed') stats.failed++;
                }
            }

            logger.info('[sweeper] Sweep complete', stats);
        } catch (error) {
            logger.error('[sweeper] Error during sweep:', error);
            throw error;
        }
    },
);
