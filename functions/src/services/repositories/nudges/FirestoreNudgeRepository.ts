import * as admin from 'firebase-admin';
import type { NudgeRecord, NudgeRepository } from './NudgeRepository';

const FIRESTORE_BATCH_SIZE = 450;

function mapNudgeDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): NudgeRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as NudgeRecord;
}

export class FirestoreNudgeRepository implements NudgeRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async getById(nudgeId: string): Promise<NudgeRecord | null> {
    const nudgeDoc = await this.db.collection('nudges').doc(nudgeId).get();
    if (!nudgeDoc.exists) {
      return null;
    }

    return {
      id: nudgeDoc.id,
      ...(nudgeDoc.data() || {}),
    } as NudgeRecord;
  }

  async hasByUserConditionAndStatuses(
    userId: string,
    conditionId: string,
    statuses: string[],
  ): Promise<boolean> {
    if (statuses.length === 0) {
      return false;
    }

    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('conditionId', '==', conditionId)
      .where('status', 'in', statuses)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async hasByUserMedicationNameAndStatuses(
    userId: string,
    medicationName: string,
    statuses: string[],
  ): Promise<boolean> {
    if (statuses.length === 0) {
      return false;
    }

    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('medicationName', '==', medicationName)
      .where('status', 'in', statuses)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async hasRecentInsightByPattern(
    userId: string,
    pattern: string,
    since: FirebaseFirestore.Timestamp,
  ): Promise<boolean> {
    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('type', '==', 'insight')
      .where('conditionId', '==', pattern)
      .where('createdAt', '>', since)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async listByUserStatusesScheduledBetween(
    userId: string,
    statuses: string[],
    start: FirebaseFirestore.Timestamp,
    end: FirebaseFirestore.Timestamp,
  ): Promise<NudgeRecord[]> {
    if (statuses.length === 0) {
      return [];
    }

    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('status', 'in', statuses)
      .where('scheduledFor', '>=', start)
      .where('scheduledFor', '<=', end)
      .get();

    return snapshot.docs.map((doc) => mapNudgeDoc(doc));
  }

  async listDuePendingForNotification(
    now: FirebaseFirestore.Timestamp,
    limit: number,
  ): Promise<NudgeRecord[]> {
    const snapshot = await this.db
      .collection('nudges')
      .where('status', '==', 'pending')
      .where('scheduledFor', '<=', now)
      .where('notificationSent', '==', false)
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => mapNudgeDoc(doc));
  }

  async countByUserNotificationSentBetween(
    userId: string,
    start: FirebaseFirestore.Timestamp,
    end: FirebaseFirestore.Timestamp,
  ): Promise<number> {
    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('notificationSentAt', '>=', start)
      .where('notificationSentAt', '<=', end)
      .get();

    return snapshot.size;
  }

  async acquireNotificationSendLock(
    nudgeId: string,
    now: FirebaseFirestore.Timestamp,
    lockWindowMs: number,
  ): Promise<boolean> {
    const nudgeRef = this.db.collection('nudges').doc(nudgeId);
    const lockUntil = admin.firestore.Timestamp.fromMillis(now.toMillis() + lockWindowMs);

    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(nudgeRef);
      if (!snapshot.exists) {
        return false;
      }

      const data = snapshot.data();
      if (data?.notificationSent === true) {
        return false;
      }

      const existingLock = data?.notificationLockUntil as FirebaseFirestore.Timestamp | undefined;
      if (existingLock && existingLock.toMillis() > now.toMillis()) {
        return false;
      }

      tx.update(nudgeRef, {
        notificationLockUntil: lockUntil,
        notificationLockAt: now,
        updatedAt: now,
      });

      return true;
    });
  }

  async markNotificationProcessed(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      sentAt?: FirebaseFirestore.Timestamp;
      skippedReason?: string;
      clearLock?: boolean;
    },
  ): Promise<void> {
    const payload: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      notificationSent: true,
      updatedAt: params.now,
    };

    if (params.sentAt) {
      payload.notificationSentAt = params.sentAt;
    }
    if (params.skippedReason) {
      payload.notificationSkipped = params.skippedReason;
    }
    if (params.clearLock) {
      payload.notificationLockUntil = admin.firestore.FieldValue.delete();
      payload.notificationLockAt = admin.firestore.FieldValue.delete();
    }

    await this.db.collection('nudges').doc(nudgeId).update(payload);
  }

  async backfillPendingNotificationSentField(): Promise<number> {
    const snapshot = await this.db.collection('nudges').where('status', '==', 'pending').get();

    if (snapshot.empty) {
      return 0;
    }

    const batch = this.db.batch();
    let updatedCount = 0;
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.notificationSent === undefined) {
        batch.update(doc.ref, { notificationSent: false });
        updatedCount += 1;
      }
    });

    if (updatedCount > 0) {
      await batch.commit();
    }

    return updatedCount;
  }

  async listActiveByUser(
    userId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      limit: number;
    },
  ): Promise<NudgeRecord[]> {
    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .get();

    const activeNudges: NudgeRecord[] = [];
    const batch = this.db.batch();
    let needsCommit = false;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const status = data.status as string;
      const scheduledFor = data.scheduledFor as FirebaseFirestore.Timestamp | undefined;
      const snoozedUntil = data.snoozedUntil as FirebaseFirestore.Timestamp | undefined;

      if (status === 'completed' || status === 'dismissed') {
        return;
      }

      if (status === 'pending' && scheduledFor && scheduledFor.toMillis() <= params.now.toMillis()) {
        batch.update(doc.ref, {
          status: 'active',
          updatedAt: params.now,
        });
        needsCommit = true;
        activeNudges.push({
          id: doc.id,
          ...data,
          status: 'active',
        } as NudgeRecord);
        return;
      }

      if (status === 'active') {
        activeNudges.push({
          id: doc.id,
          ...data,
        } as NudgeRecord);
        return;
      }

      if (status === 'snoozed' && snoozedUntil && snoozedUntil.toMillis() <= params.now.toMillis()) {
        batch.update(doc.ref, {
          status: 'active',
          snoozedUntil: admin.firestore.FieldValue.delete(),
          updatedAt: params.now,
        });
        needsCommit = true;
        activeNudges.push({
          id: doc.id,
          ...data,
          status: 'active',
        } as NudgeRecord);
      }
    });

    if (needsCommit) {
      await batch.commit();
    }

    activeNudges.sort((left, right) => {
      const leftTime = left.scheduledFor?.toMillis?.() || 0;
      const rightTime = right.scheduledFor?.toMillis?.() || 0;
      return leftTime - rightTime;
    });

    return activeNudges.slice(0, params.limit);
  }

  async listHistoryByUser(userId: string, limit: number): Promise<NudgeRecord[]> {
    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('status', 'in', ['completed', 'dismissed'])
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => mapNudgeDoc(doc));
  }

  async listByUserAndStatuses(userId: string, statuses: string[]): Promise<NudgeRecord[]> {
    if (statuses.length === 0) {
      return [];
    }

    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('status', 'in', statuses)
      .get();

    return snapshot.docs.map((doc) => mapNudgeDoc(doc));
  }

  async listByUserAndSequence(
    userId: string,
    sequenceId: string,
    statuses: string[],
  ): Promise<NudgeRecord[]> {
    if (statuses.length === 0) {
      return [];
    }

    const snapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('sequenceId', '==', sequenceId)
      .where('status', 'in', statuses)
      .get();

    return snapshot.docs.map((doc) => mapNudgeDoc(doc));
  }

  async create(payload: FirebaseFirestore.DocumentData): Promise<{ id: string }> {
    const ref = await this.db.collection('nudges').add(payload);
    return { id: ref.id };
  }

  async completeById(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      responseValue?: string | Record<string, unknown>;
    },
  ): Promise<void> {
    let cleanedResponseValue = params.responseValue;
    if (cleanedResponseValue && typeof cleanedResponseValue === 'object') {
      cleanedResponseValue = Object.fromEntries(
        Object.entries(cleanedResponseValue).filter(([, value]) => value !== undefined),
      );
    }

    const updateData: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      status: 'completed',
      completedAt: params.now,
      updatedAt: params.now,
    };

    if (cleanedResponseValue !== undefined) {
      updateData.responseValue = cleanedResponseValue;
    }

    await this.db.collection('nudges').doc(nudgeId).update(updateData);
  }

  async snoozeById(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      snoozedUntil: FirebaseFirestore.Timestamp;
    },
  ): Promise<void> {
    await this.db.collection('nudges').doc(nudgeId).update({
      status: 'snoozed',
      snoozedUntil: params.snoozedUntil,
      updatedAt: params.now,
    });
  }

  async dismissByIds(
    nudgeIds: string[],
    params: {
      now: FirebaseFirestore.Timestamp;
      dismissalReason?: string;
    },
  ): Promise<{ updatedCount: number }> {
    if (nudgeIds.length === 0) {
      return { updatedCount: 0 };
    }

    let updatedCount = 0;
    for (let start = 0; start < nudgeIds.length; start += FIRESTORE_BATCH_SIZE) {
      const batch = this.db.batch();
      const chunk = nudgeIds.slice(start, start + FIRESTORE_BATCH_SIZE);
      chunk.forEach((nudgeId) => {
        const payload: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
          status: 'dismissed',
          dismissedAt: params.now,
          updatedAt: params.now,
        };
        if (params.dismissalReason) {
          payload.dismissalReason = params.dismissalReason;
        }
        batch.update(this.db.collection('nudges').doc(nudgeId), payload);
      });
      await batch.commit();
      updatedCount += chunk.length;
    }

    return { updatedCount };
  }
}
