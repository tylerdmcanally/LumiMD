/**
 * Weekly aggregate metrics — writes anonymous product stats to Firestore.
 * No PII, no health data, no per-user breakdowns. Just counts and rates.
 *
 * Collection: metrics/{YYYY-Www} (e.g. metrics/2026-W13)
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { Resend } from 'resend';

const METRICS_RECIPIENT = 'tyler@lumimd.app';
const METRICS_FROM = 'LumiMD <updates@lumimd.app>';

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

/**
 * Simple single-range count queries that don't require composite indexes.
 * For compound filters, we fetch small doc sets and count in memory.
 */
async function countSimple(
  collection: string,
  field: string,
  op: FirebaseFirestore.WhereFilterOp,
  value: unknown,
): Promise<number> {
  const db = admin.firestore();
  const snapshot = await db.collection(collection).where(field, op, value).count().get();
  return snapshot.data().count;
}

async function countRange(
  collection: string,
  field: string,
  start: admin.firestore.Timestamp,
  end: admin.firestore.Timestamp,
): Promise<number> {
  const db = admin.firestore();
  const snapshot = await db.collection(collection)
    .where(field, '>=', start)
    .where(field, '<', end)
    .count().get();
  return snapshot.data().count;
}

export async function generateWeeklyMetrics(): Promise<{ weekLabel: string; metrics: WeeklyMetrics }> {
  const db = admin.firestore();
  const { start, end, weekLabel } = getWeekBounds();
  const startTs = admin.firestore.Timestamp.fromDate(start);
  const endTs = admin.firestore.Timestamp.fromDate(end);

  functions.logger.info(`[WeeklyMetrics] Generating metrics for ${weekLabel} (${start.toISOString()} → ${end.toISOString()})`);

  // Use simple single-field queries to avoid needing composite indexes.
  // Counts may include soft-deleted docs for time-range queries — acceptable
  // for aggregate metrics since deletions are rare.
  const [
    totalUsers,
    newUsersThisWeek,
    activeUsersThisWeek,
    totalVisits,
    visitsThisWeek,
    visitsCompletedThisWeek,
    visitsFailedThisWeek,
    totalActiveMedications,
    totalLogsThisWeek,
    _skippedAllTime,
    activeCaregiverShares,
    caregiverInvitesSentThisWeek,
    nudgesSentThisWeek,
    actionItemsCompletedThisWeek,
  ] = await Promise.all([
    // Users
    countSimple('users', 'deletedAt', '==', null),
    countRange('users', 'createdAt', startTs, endTs),
    countRange('devices', 'updatedAt', startTs, endTs),

    // Visits
    countSimple('visits', 'deletedAt', '==', null),
    countRange('visits', 'createdAt', startTs, endTs),
    countRange('visits', 'processedAt', startTs, endTs), // completed ~ processedAt exists
    countSimple('visits', 'processingStatus', '==', 'failed'),

    // Medications
    countSimple('medications', 'status', '==', 'active'),

    // Adherence
    countRange('medicationLogs', 'createdAt', startTs, endTs), // all logs this week
    countSimple('medicationLogs', 'status', '==', 'skipped'), // all-time skipped (approx)

    // Caregivers
    countSimple('shares', 'status', '==', 'accepted'),
    countRange('shareInvites', 'createdAt', startTs, endTs),

    // Engagement
    countRange('nudges', 'createdAt', startTs, endTs),
    countRange('actions', 'completedAt', startTs, endTs),
  ]);

  // Document uploads: query visits created this week with source=document
  // Use a small fetch since volume is low
  let documentUploadsThisWeek = 0;
  try {
    const docVisits = await db.collection('visits')
      .where('source', '==', 'document')
      .where('createdAt', '>=', startTs)
      .where('createdAt', '<', endTs)
      .count().get();
    documentUploadsThisWeek = docVisits.data().count;
  } catch {
    // Index may not exist — non-critical
  }

  // Nudge response rate: count nudges with respondedAt in the week
  let nudgesRespondedThisWeek = 0;
  try {
    const responded = await db.collection('nudges')
      .where('respondedAt', '>=', startTs)
      .where('respondedAt', '<', endTs)
      .count().get();
    nudgesRespondedThisWeek = responded.data().count;
  } catch {
    // Non-critical
  }

  // Approximate this-week adherence: takenLogsThisWeek is all logs this week,
  // skippedLogsThisWeek is all-time skipped. For a better rate we use the
  // total logs this week minus a rough skipped estimate.
  // Better: query taken this week specifically
  let takenThisWeek = 0;
  try {
    const taken = await db.collection('medicationLogs')
      .where('status', '==', 'taken')
      .where('createdAt', '>=', startTs)
      .where('createdAt', '<', endTs)
      .count().get();
    takenThisWeek = taken.data().count;
  } catch {
    takenThisWeek = totalLogsThisWeek; // fallback to total this week
  }
  const skippedThisWeek = totalLogsThisWeek - takenThisWeek; // total logs - taken = skipped
  const totalDoses = takenThisWeek + Math.max(skippedThisWeek, 0);

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
    adherenceRateThisWeek: totalDoses > 0 ? Number((takenThisWeek / totalDoses).toFixed(3)) : 0,

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

  // Email digest
  await sendMetricsEmail(weekLabel, metrics);

  return { weekLabel, metrics };
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function delta(current: number, label: string): string {
  return current > 0 ? ` (+${current} ${label})` : '';
}

async function sendMetricsEmail(weekLabel: string, m: WeeklyMetrics): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    functions.logger.warn('[WeeklyMetrics] RESEND_API_KEY not set, skipping email');
    return;
  }

  const resend = new Resend(apiKey);

  const subject = `LumiMD Weekly — ${weekLabel}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1C1917;">
      <h2 style="font-size: 20px; margin: 0 0 4px;">LumiMD Weekly — ${weekLabel}</h2>
      <p style="color: #78716C; font-size: 14px; margin: 0 0 24px;">${m.periodStart.slice(0, 10)} → ${m.periodEnd.slice(0, 10)}</p>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr style="border-bottom: 1px solid #E7E5E4;">
          <td colspan="2" style="padding: 12px 0 6px; font-weight: 700; color: #40C9D0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Users</td>
        </tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Total users</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.totalUsers}</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Active this week</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.activeUsersThisWeek}${delta(m.newUsersThisWeek, 'new')}</td></tr>

        <tr style="border-bottom: 1px solid #E7E5E4;">
          <td colspan="2" style="padding: 16px 0 6px; font-weight: 700; color: #40C9D0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Visits</td>
        </tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Visits this week</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.visitsThisWeek} (${m.visitsCompletedThisWeek} completed)</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Document uploads</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.documentUploadsThisWeek}</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Failure rate</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${pct(m.visitFailureRate)}</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Total visits (all time)</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.totalVisits}</td></tr>

        <tr style="border-bottom: 1px solid #E7E5E4;">
          <td colspan="2" style="padding: 16px 0 6px; font-weight: 700; color: #40C9D0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Medications</td>
        </tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Active medications</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.totalActiveMedications}</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Adherence rate</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${pct(m.adherenceRateThisWeek)}</td></tr>

        <tr style="border-bottom: 1px solid #E7E5E4;">
          <td colspan="2" style="padding: 16px 0 6px; font-weight: 700; color: #40C9D0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Caregivers</td>
        </tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Active shares</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.activeCaregiverShares}</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Invites sent this week</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.caregiverInvitesSentThisWeek}</td></tr>

        <tr style="border-bottom: 1px solid #E7E5E4;">
          <td colspan="2" style="padding: 16px 0 6px; font-weight: 700; color: #40C9D0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Engagement</td>
        </tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Nudges sent</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.nudgesSentThisWeek}</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Nudge response rate</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${pct(m.nudgeResponseRate)}</td></tr>
        <tr><td style="padding: 4px 0; color: #78716C;">Action items completed</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${m.actionItemsCompletedThisWeek}</td></tr>
      </table>

      <p style="color: #A8A29E; font-size: 12px; margin: 24px 0 0; border-top: 1px solid #E7E5E4; padding-top: 16px;">
        Auto-generated by LumiMD weekly metrics. No patient data is included in this report.
      </p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: METRICS_FROM,
      to: METRICS_RECIPIENT,
      subject,
      html,
    });
    functions.logger.info(`[WeeklyMetrics] Email sent to ${METRICS_RECIPIENT}`);
  } catch (error) {
    functions.logger.error('[WeeklyMetrics] Failed to send email:', error);
    // Don't throw — metrics are already saved to Firestore
  }
}
