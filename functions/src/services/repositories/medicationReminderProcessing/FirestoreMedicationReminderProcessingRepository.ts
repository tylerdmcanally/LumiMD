import * as admin from 'firebase-admin';
import type {
  MedicationReminderProcessingMedicationRecord,
  MedicationReminderProcessingRecord,
  MedicationReminderProcessingRepository,
  MedicationReminderProcessingUpdate,
} from './MedicationReminderProcessingRepository';

const REMINDERS_COLLECTION = 'medicationReminders';
const MEDICATIONS_COLLECTION = 'medications';
const USERS_COLLECTION = 'users';
const MEDICATION_LOGS_COLLECTION = 'medicationLogs';
const MAX_BATCH_SIZE = 500;

function timestampFromDate(date: Date): FirebaseFirestore.Timestamp {
  const fromDate = (admin.firestore as unknown as { Timestamp?: { fromDate?: (value: Date) => FirebaseFirestore.Timestamp } })
    ?.Timestamp?.fromDate;
  if (typeof fromDate === 'function') {
    return fromDate(date);
  }

  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as FirebaseFirestore.Timestamp;
}

function mapReminderDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): MedicationReminderProcessingRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as MedicationReminderProcessingRecord;
}

export class FirestoreMedicationReminderProcessingRepository
  implements MedicationReminderProcessingRepository
{
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async listEnabledReminders(): Promise<MedicationReminderProcessingRecord[]> {
    const snapshot = await this.db
      .collection(REMINDERS_COLLECTION)
      .where('enabled', '==', true)
      .get();

    return snapshot.docs.map((doc) => mapReminderDoc(doc));
  }

  async listTimingBackfillPage(params: {
    cursorDocId?: string | null;
    limit: number;
  }): Promise<{
    items: MedicationReminderProcessingRecord[];
    processedCount: number;
    hasMore: boolean;
    nextCursor: string | null;
  }> {
    const queryLimit = Math.max(1, Math.floor(params.limit));

    let query = this.db
      .collection(REMINDERS_COLLECTION)
      .orderBy('__name__')
      .limit(queryLimit);

    const cursorDocId =
      typeof params.cursorDocId === 'string' && params.cursorDocId.trim().length > 0
        ? params.cursorDocId.trim()
        : null;
    if (cursorDocId) {
      query = query.startAfter(cursorDocId);
    }

    const snapshot = await query.get();
    const items = snapshot.docs.map((doc) => mapReminderDoc(doc));
    const hasMore = snapshot.size === queryLimit;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items,
      processedCount: items.length,
      hasMore,
      nextCursor,
    };
  }

  async listSoftDeletedByCutoff(
    cutoff: FirebaseFirestore.Timestamp,
    limit: number,
  ): Promise<MedicationReminderProcessingRecord[]> {
    const queryLimit = Math.max(1, Math.floor(limit));
    const snapshot = await this.db
      .collection(REMINDERS_COLLECTION)
      .where('deletedAt', '<=', cutoff)
      .orderBy('deletedAt', 'asc')
      .limit(queryLimit)
      .get();

    return snapshot.docs.map((doc) => mapReminderDoc(doc));
  }

  async getUserTimezoneValue(userId: string): Promise<string | null> {
    const userDoc = await this.db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) {
      return null;
    }

    const timezone = userDoc.data()?.timezone;
    return typeof timezone === 'string' ? timezone : null;
  }

  async getMedicationState(
    medicationId: string,
  ): Promise<MedicationReminderProcessingMedicationRecord> {
    const medicationDoc = await this.db.collection(MEDICATIONS_COLLECTION).doc(medicationId).get();
    if (!medicationDoc.exists) {
      return {
        id: medicationId,
        exists: false,
        active: false,
        deletedAt: null,
      };
    }

    const active = medicationDoc.get('active') !== false;
    const deletedAt =
      (medicationDoc.get('deletedAt') as FirebaseFirestore.Timestamp | null | undefined) ?? null;

    return {
      id: medicationId,
      exists: true,
      active,
      deletedAt,
    };
  }

  async acquireReminderSendLock(
    reminderId: string,
    now: FirebaseFirestore.Timestamp,
    lockUntil: FirebaseFirestore.Timestamp,
  ): Promise<boolean> {
    const reminderRef = this.db.collection(REMINDERS_COLLECTION).doc(reminderId);

    return this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(reminderRef);
      if (!snapshot.exists) {
        return false;
      }

      const data = snapshot.data() as { lastSentLockUntil?: FirebaseFirestore.Timestamp } | undefined;
      const existingLock = data?.lastSentLockUntil;
      if (existingLock && existingLock.toMillis() > now.toMillis()) {
        return false;
      }

      tx.update(reminderRef, {
        lastSentLockUntil: lockUntil,
        lastSentLockAt: now,
        updatedAt: now,
      });

      return true;
    });
  }

  async updateReminderById(
    reminderId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void> {
    await this.db.collection(REMINDERS_COLLECTION).doc(reminderId).update(updates);
  }

  async applyReminderUpdates(updates: MedicationReminderProcessingUpdate[]): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    let updated = 0;

    for (let index = 0; index < updates.length; index += MAX_BATCH_SIZE) {
      const chunk = updates.slice(index, index + MAX_BATCH_SIZE);
      const batch = this.db.batch();
      chunk.forEach((entry) => {
        const ref = this.db.collection(REMINDERS_COLLECTION).doc(entry.reminderId);
        batch.update(ref, entry.updates);
      });
      await batch.commit();
      updated += chunk.length;
    }

    return updated;
  }

  async deleteReminderIds(reminderIds: string[]): Promise<number> {
    if (reminderIds.length === 0) {
      return 0;
    }

    let deleted = 0;
    for (let index = 0; index < reminderIds.length; index += MAX_BATCH_SIZE) {
      const chunk = reminderIds.slice(index, index + MAX_BATCH_SIZE);
      const batch = this.db.batch();
      chunk.forEach((id) => {
        const ref = this.db.collection(REMINDERS_COLLECTION).doc(id);
        batch.delete(ref);
      });
      await batch.commit();
      deleted += chunk.length;
    }

    return deleted;
  }

  async listMedicationLogsByUserAndLoggedAtRange(
    userId: string,
    range: { start: Date; end: Date },
  ): Promise<FirebaseFirestore.DocumentData[]> {
    const snapshot = await this.db
      .collection(MEDICATION_LOGS_COLLECTION)
      .where('userId', '==', userId)
      .where('loggedAt', '>=', timestampFromDate(range.start))
      .where('loggedAt', '<=', timestampFromDate(range.end))
      .get();

    return snapshot.docs.map((doc) => doc.data() || {});
  }
}
