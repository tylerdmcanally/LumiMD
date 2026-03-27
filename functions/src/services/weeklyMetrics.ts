/**
 * Weekly aggregate metrics — writes anonymous product stats to Firestore.
 * No PII, no health data, no per-user breakdowns. Just counts and rates.
 *
 * Collection: metrics/{YYYY-Www} (e.g. metrics/2026-W13)
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

interface WeeklyMetrics {
  periodStart: string;
  periodEnd: string;
  generatedAt: admin.firestore.Timestamp;

  // Users
  totalUsers: number;
  activeUsersThisWeek: number; // users who opened the app (have a device token updated this week)
  newUsersThisWeek: number;

  // Visits
  totalVisits: number;
  visitsThisWeek: number;
  visitsCompletedThisWeek: number;
  visitFailureRate: number; // failed / (completed + failed) this week
  documentUploadsThisWeek: number;

  // Medications
  totalActiveMedications: number;
  adherenceRateThisWeek: number; // taken / (taken + skipped) from medicationLogs

  // Caregivers
  activeCaregiverShares: number; // accepted shares
  caregiverInvitesSentThisWeek: number;

  // Engagement
  nudgesSentThisWeek: number;
  nudgeResponseRate: number; // responded / sent
  actionItemsCompletedThisWeek: number;
}

function getWeekBounds(): { start: Date; end: Date; weekLabel: string } {
  const now = new Date();
  // Go back to the most recent Monday 00:00 UTC
  const dayOfWeek = now.getUTCDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);

  // ISO week number
  const jan1 = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
  const daysSinceJan1 = Math.floor((start.getTime() - jan1.getTime()) / 86400000);
  const weekNum = Math.ceil((daysSinceJan1 + jan1.getUTCDay() + 1) / 7);
  const weekLabel = `${start.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;

  return { start, end, weekLabel };
}

async function countDocs(
  collection: string,
  filters: Array<[string, FirebaseFirestore.WhereFilterOp, unknown]>,
): Promise<number> {
  const db = admin.firestore();
  let query: FirebaseFirestore.Query = db.collection(collection);
  for (const [field, op, value] of filters) {
    query = query.where(field, op, value);
  }
  const snapshot = await query.count().get();
  return snapshot.data().count;
}

export async function generateWeeklyMetrics(): Promise<{ weekLabel: string; metrics: WeeklyMetrics }> {
  const db = admin.firestore();
  const { start, end, weekLabel } = getWeekBounds();
  const startTs = admin.firestore.Timestamp.fromDate(start);
  const endTs = admin.firestore.Timestamp.fromDate(end);

  functions.logger.info(`[WeeklyMetrics] Generating metrics for ${weekLabel} (${start.toISOString()} → ${end.toISOString()})`);

  // Run all queries in parallel
  const [
    totalUsers,
    newUsersThisWeek,
    activeUsersThisWeek,
    totalVisits,
    visitsThisWeek,
    visitsCompletedThisWeek,
    visitsFailedThisWeek,
    documentUploadsThisWeek,
    totalActiveMedications,
    takenLogsThisWeek,
    skippedLogsThisWeek,
    activeCaregiverShares,
    caregiverInvitesSentThisWeek,
    nudgesSentThisWeek,
    nudgesRespondedThisWeek,
    actionItemsCompletedThisWeek,
  ] = await Promise.all([
    // Users
    countDocs('users', [['deletedAt', '==', null]]),
    countDocs('users', [['deletedAt', '==', null], ['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),
    countDocs('devices', [['updatedAt', '>=', startTs], ['updatedAt', '<', endTs]]),

    // Visits
    countDocs('visits', [['deletedAt', '==', null]]),
    countDocs('visits', [['deletedAt', '==', null], ['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),
    countDocs('visits', [['deletedAt', '==', null], ['processingStatus', '==', 'completed'], ['processedAt', '>=', startTs], ['processedAt', '<', endTs]]),
    countDocs('visits', [['deletedAt', '==', null], ['processingStatus', '==', 'failed'], ['updatedAt', '>=', startTs], ['updatedAt', '<', endTs]]),
    countDocs('visits', [['deletedAt', '==', null], ['source', '==', 'document'], ['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),

    // Medications
    countDocs('medications', [['deletedAt', '==', null], ['status', '==', 'active']]),

    // Adherence (medication logs this week)
    countDocs('medicationLogs', [['status', '==', 'taken'], ['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),
    countDocs('medicationLogs', [['status', '==', 'skipped'], ['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),

    // Caregivers
    countDocs('shares', [['status', '==', 'accepted'], ['deletedAt', '==', null]]),
    countDocs('shareInvites', [['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),

    // Engagement
    countDocs('nudges', [['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),
    countDocs('nudges', [['respondedAt', '!=', null], ['createdAt', '>=', startTs], ['createdAt', '<', endTs]]),
    countDocs('actions', [['deletedAt', '==', null], ['completedAt', '>=', startTs], ['completedAt', '<', endTs]]),
  ]);

  const totalDoses = takenLogsThisWeek + skippedLogsThisWeek;
  const totalProcessed = visitsCompletedThisWeek + visitsFailedThisWeek;

  const metrics: WeeklyMetrics = {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    generatedAt: admin.firestore.Timestamp.now(),

    totalUsers,
    activeUsersThisWeek,
    newUsersThisWeek,

    totalVisits,
    visitsThisWeek,
    visitsCompletedThisWeek,
    visitFailureRate: totalProcessed > 0 ? Number((visitsFailedThisWeek / totalProcessed).toFixed(3)) : 0,
    documentUploadsThisWeek,

    totalActiveMedications,
    adherenceRateThisWeek: totalDoses > 0 ? Number((takenLogsThisWeek / totalDoses).toFixed(3)) : 0,

    activeCaregiverShares,
    caregiverInvitesSentThisWeek,

    nudgesSentThisWeek,
    nudgeResponseRate: nudgesSentThisWeek > 0 ? Number((nudgesRespondedThisWeek / nudgesSentThisWeek).toFixed(3)) : 0,
    actionItemsCompletedThisWeek,
  };

  // Write to metrics/{weekLabel}
  await db.collection('metrics').doc(weekLabel).set(metrics);

  functions.logger.info(`[WeeklyMetrics] Written metrics for ${weekLabel}`, {
    totalUsers,
    activeUsersThisWeek,
    visitsThisWeek,
    adherenceRateThisWeek: metrics.adherenceRateThisWeek,
  });

  return { weekLabel, metrics };
}
