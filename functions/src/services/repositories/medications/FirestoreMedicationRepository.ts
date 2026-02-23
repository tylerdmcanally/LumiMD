import { RepositoryValidationError } from '../common/errors';
import type { CursorPageResult, SortDirection } from '../common/pagination';
import type {
  MedicationListActiveOptions,
  MedicationListAllByUserOptions,
  MedicationListByUserOptions,
  MedicationRecord,
  MedicationRepository,
  MedicationSortField,
} from './MedicationRepository';

const DEFAULT_LIMIT = 50;

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.floor(limit);
}

function normalizeSortDirection(value: SortDirection | undefined): SortDirection {
  return value === 'asc' ? 'asc' : 'desc';
}

function normalizeSortField(value: MedicationSortField | undefined): MedicationSortField {
  return value === 'createdAt' ? 'createdAt' : 'name';
}

function mapMedicationDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): MedicationRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as MedicationRecord;
}

export class FirestoreMedicationRepository implements MedicationRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private buildUserQuery(
    userId: string,
    options: MedicationListAllByUserOptions | MedicationListByUserOptions,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    const includeDeleted = options.includeDeleted === true;
    const sortDirection = normalizeSortDirection(options.sortDirection);
    const sortField = normalizeSortField(options.sortField);

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('medications')
      .where('userId', '==', userId);

    if (!includeDeleted) {
      query = query.where('deletedAt', '==', null);
    }

    return query.orderBy(sortField, sortDirection);
  }

  async getById(medicationId: string): Promise<MedicationRecord | null> {
    const medicationDoc = await this.db.collection('medications').doc(medicationId).get();

    if (!medicationDoc.exists) {
      return null;
    }

    return {
      id: medicationDoc.id,
      ...(medicationDoc.data() || {}),
    } as MedicationRecord;
  }

  async listActive(options: MedicationListActiveOptions = {}): Promise<MedicationRecord[]> {
    const includeDeleted = options.includeDeleted === true;
    const limit =
      typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : null;

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('medications')
      .where('active', '==', true);

    if (!includeDeleted) {
      query = query.where('deletedAt', '==', null);
    }

    if (limit !== null) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => mapMedicationDoc(doc));
  }

  async create(payload: FirebaseFirestore.DocumentData): Promise<MedicationRecord> {
    const ref = await this.db.collection('medications').add(payload);
    const createdDoc = await ref.get();
    return mapMedicationDoc(
      createdDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async updateById(
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<MedicationRecord | null> {
    const docRef = this.db.collection('medications').doc(medicationId);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return null;
    }

    await docRef.update(updates);
    const updatedDoc = await docRef.get();
    if (!updatedDoc.exists) {
      return null;
    }

    return mapMedicationDoc(
      updatedDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async createReminder(payload: FirebaseFirestore.DocumentData): Promise<{ id: string }> {
    const ref = await this.db.collection('medicationReminders').add(payload);
    return { id: ref.id };
  }

  async updateRemindersByMedication(
    userId: string,
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<number> {
    const remindersSnapshot = await this.db
      .collection('medicationReminders')
      .where('userId', '==', userId)
      .where('medicationId', '==', medicationId)
      .get();

    if (remindersSnapshot.empty) {
      return 0;
    }

    const batch = this.db.batch();
    remindersSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, updates);
    });
    await batch.commit();

    return remindersSnapshot.size;
  }

  async softDeleteRemindersByMedication(
    userId: string,
    medicationId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<number> {
    const remindersSnapshot = await this.db
      .collection('medicationReminders')
      .where('userId', '==', userId)
      .where('medicationId', '==', medicationId)
      .get();

    if (remindersSnapshot.empty) {
      return 0;
    }

    const batch = this.db.batch();
    remindersSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        enabled: false,
        deletedAt: now,
        deletedBy: actorUserId,
        updatedAt: now,
      });
    });
    await batch.commit();

    return remindersSnapshot.size;
  }

  async dismissNudgesByMedication(
    userId: string,
    medicationId: string,
    reason: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<number> {
    const nudgesSnapshot = await this.db
      .collection('nudges')
      .where('userId', '==', userId)
      .where('medicationId', '==', medicationId)
      .where('status', 'in', ['pending', 'active', 'snoozed'])
      .get();

    if (nudgesSnapshot.empty) {
      return 0;
    }

    const batch = this.db.batch();
    nudgesSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'dismissed',
        dismissedAt: now,
        dismissalReason: reason,
        updatedAt: now,
      });
    });
    await batch.commit();

    return nudgesSnapshot.size;
  }

  async softDeleteMedicationCascade(
    medicationId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<{ disabledReminders: number; dismissedNudges: number }> {
    const medRef = this.db.collection('medications').doc(medicationId);

    const [remindersSnapshot, nudgesSnapshot] = await Promise.all([
      this.db
        .collection('medicationReminders')
        .where('userId', '==', userId)
        .where('medicationId', '==', medicationId)
        .get(),
      this.db
        .collection('nudges')
        .where('userId', '==', userId)
        .where('medicationId', '==', medicationId)
        .where('status', 'in', ['pending', 'active', 'snoozed'])
        .get(),
    ]);

    const batch = this.db.batch();
    batch.update(medRef, {
      active: false,
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
    });

    remindersSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        enabled: false,
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
      });
    });

    nudgesSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'dismissed',
        dismissedAt: now,
        dismissalReason: 'medication_deleted',
        updatedAt: now,
      });
    });

    await batch.commit();

    return {
      disabledReminders: remindersSnapshot.size,
      dismissedNudges: nudgesSnapshot.size,
    };
  }

  async restoreMedicationCascade(
    medicationId: string,
    ownerUserId: string,
    medicationDeletedAtMillis: number | null,
    now: FirebaseFirestore.Timestamp,
  ): Promise<{ restoredReminders: number }> {
    const medRef = this.db.collection('medications').doc(medicationId);
    const remindersSnapshot = await this.db
      .collection('medicationReminders')
      .where('userId', '==', ownerUserId)
      .where('medicationId', '==', medicationId)
      .get();

    const batch = this.db.batch();
    batch.update(medRef, {
      active: true,
      deletedAt: null,
      deletedBy: null,
      updatedAt: now,
    });

    let restoredReminders = 0;
    remindersSnapshot.docs.forEach((doc) => {
      const reminder = doc.data();
      if (!reminder.deletedAt) {
        return;
      }

      const reminderDeletedAtMillis =
        typeof reminder.deletedAt?.toMillis === 'function'
          ? reminder.deletedAt.toMillis()
          : null;

      if (
        medicationDeletedAtMillis !== null &&
        reminderDeletedAtMillis !== null &&
        reminderDeletedAtMillis !== medicationDeletedAtMillis
      ) {
        return;
      }

      batch.update(doc.ref, {
        enabled: true,
        deletedAt: null,
        deletedBy: null,
        updatedAt: now,
      });
      restoredReminders += 1;
    });

    await batch.commit();

    return { restoredReminders };
  }

  async stopMedicationCascade(
    userId: string,
    medicationId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<{ disabledReminders: number; dismissedNudges: number }> {
    const [nudgesSnapshot, remindersSnapshot] = await Promise.all([
      this.db
        .collection('nudges')
        .where('userId', '==', userId)
        .where('medicationId', '==', medicationId)
        .where('status', 'in', ['pending', 'active', 'snoozed'])
        .get(),
      this.db
        .collection('medicationReminders')
        .where('userId', '==', userId)
        .where('medicationId', '==', medicationId)
        .get(),
    ]);

    if (nudgesSnapshot.empty && remindersSnapshot.empty) {
      return { disabledReminders: 0, dismissedNudges: 0 };
    }

    const batch = this.db.batch();
    nudgesSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'dismissed',
        dismissedAt: now,
        dismissalReason: 'medication_stopped',
        updatedAt: now,
      });
    });

    remindersSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        enabled: false,
        deletedAt: now,
        deletedBy: actorUserId,
        updatedAt: now,
      });
    });

    await batch.commit();

    return {
      disabledReminders: remindersSnapshot.size,
      dismissedNudges: nudgesSnapshot.size,
    };
  }

  async listByUser(
    userId: string,
    options: MedicationListByUserOptions,
  ): Promise<CursorPageResult<MedicationRecord>> {
    const limit = normalizeLimit(options.limit);
    const queryLimit = limit + 1;
    const includeDeleted = options.includeDeleted === true;

    let query = this.buildUserQuery(userId, options).limit(queryLimit);

    const cursor =
      typeof options.cursor === 'string' && options.cursor.trim().length > 0
        ? options.cursor.trim()
        : null;

    if (cursor) {
      const cursorDoc = await this.db.collection('medications').doc(cursor).get();
      const cursorData = cursorDoc.data();
      const cursorBelongsToUser = cursorData?.userId === userId;
      const cursorDeleted = Boolean(cursorData?.deletedAt);

      if (!cursorDoc.exists || !cursorBelongsToUser || (!includeDeleted && cursorDeleted)) {
        throw new RepositoryValidationError('Invalid cursor');
      }

      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const pageDocs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    return {
      items: pageDocs.map((doc) => mapMedicationDoc(doc)),
      hasMore,
      nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null,
    };
  }

  async listAllByUser(
    userId: string,
    options: MedicationListAllByUserOptions = {},
  ): Promise<MedicationRecord[]> {
    const snapshot = await this.buildUserQuery(userId, options).get();
    return snapshot.docs.map((doc) => mapMedicationDoc(doc));
  }
}
