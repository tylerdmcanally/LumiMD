import { RepositoryValidationError } from '../common/errors';
import type { CursorPageResult, SortDirection } from '../common/pagination';
import type {
  VisitListAllByUserOptions,
  VisitListByUserOptions,
  VisitRecord,
  VisitRepository,
} from './VisitRepository';

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

function mapVisitDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): VisitRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as VisitRecord;
}

export class FirestoreVisitRepository implements VisitRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private buildUserQuery(
    userId: string,
    options: VisitListAllByUserOptions | VisitListByUserOptions,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    const includeDeleted = options.includeDeleted === true;
    const sortDirection = normalizeSortDirection(options.sortDirection);

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('visits')
      .where('userId', '==', userId);

    if (!includeDeleted) {
      query = query.where('deletedAt', '==', null);
    }

    return query.orderBy('createdAt', sortDirection);
  }

  async getById(visitId: string): Promise<VisitRecord | null> {
    const visitDoc = await this.db.collection('visits').doc(visitId).get();

    if (!visitDoc.exists) {
      return null;
    }

    return {
      id: visitDoc.id,
      ...(visitDoc.data() || {}),
    } as VisitRecord;
  }

  async create(payload: FirebaseFirestore.DocumentData): Promise<VisitRecord> {
    const ref = await this.db.collection('visits').add(payload);
    const createdDoc = await ref.get();
    return mapVisitDoc(
      createdDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async updateById(
    visitId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<VisitRecord | null> {
    const docRef = this.db.collection('visits').doc(visitId);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return null;
    }

    await docRef.update(updates);
    const updatedDoc = await docRef.get();
    if (!updatedDoc.exists) {
      return null;
    }

    return mapVisitDoc(
      updatedDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async softDeleteById(
    visitId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<{ softDeletedActions: number }> {
    const visitRef = this.db.collection('visits').doc(visitId);
    const actionsSnapshot = await this.db.collection('actions').where('visitId', '==', visitId).get();

    const batch = this.db.batch();
    let softDeletedActions = 0;

    actionsSnapshot.docs.forEach((actionDoc) => {
      const action = actionDoc.data();
      if (action.userId !== userId) {
        return;
      }

      batch.update(actionDoc.ref, {
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
      });
      softDeletedActions += 1;
    });

    batch.update(visitRef, {
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
    });

    await batch.commit();

    return { softDeletedActions };
  }

  async restoreById(
    visitId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<{ restoredActions: number }> {
    const visitRef = this.db.collection('visits').doc(visitId);
    const actionsSnapshot = await this.db
      .collection('actions')
      .where('visitId', '==', visitId)
      .where('userId', '==', userId)
      .get();

    const batch = this.db.batch();
    batch.update(visitRef, {
      deletedAt: null,
      deletedBy: null,
      updatedAt: now,
    });

    let restoredActions = 0;
    actionsSnapshot.docs.forEach((actionDoc) => {
      const action = actionDoc.data();
      if (!action.deletedAt) {
        return;
      }

      batch.update(actionDoc.ref, {
        deletedAt: null,
        deletedBy: null,
        updatedAt: now,
      });
      restoredActions += 1;
    });

    await batch.commit();

    return { restoredActions };
  }

  async listPostCommitEscalated(limit: number): Promise<VisitRecord[]> {
    const normalizedLimit = normalizeLimit(limit);
    const snapshot = await this.db
      .collection('visits')
      .where('postCommitStatus', '==', 'partial_failure')
      .where('postCommitEscalatedAt', '!=', null)
      .orderBy('postCommitEscalatedAt', 'desc')
      .limit(normalizedLimit)
      .get();

    return snapshot.docs.map((doc) => mapVisitDoc(doc));
  }

  async listPostCommitRecoverable(limit: number): Promise<VisitRecord[]> {
    const normalizedLimit = normalizeLimit(limit);
    const snapshot = await this.db
      .collection('visits')
      .where('processingStatus', '==', 'completed')
      .where('postCommitStatus', '==', 'partial_failure')
      .where('postCommitRetryEligible', '==', true)
      .orderBy('postCommitLastAttemptAt', 'asc')
      .limit(normalizedLimit)
      .get();

    return snapshot.docs.map((doc) => mapVisitDoc(doc));
  }

  async listByUser(
    userId: string,
    options: VisitListByUserOptions,
  ): Promise<CursorPageResult<VisitRecord>> {
    const limit = normalizeLimit(options.limit);
    const queryLimit = limit + 1;
    const includeDeleted = options.includeDeleted === true;

    let query = this.buildUserQuery(userId, options).limit(queryLimit);

    const cursor =
      typeof options.cursor === 'string' && options.cursor.trim().length > 0
        ? options.cursor.trim()
        : null;

    if (cursor) {
      const cursorDoc = await this.db.collection('visits').doc(cursor).get();
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
      items: pageDocs.map((doc) => mapVisitDoc(doc)),
      hasMore,
      nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null,
    };
  }

  async listAllByUser(
    userId: string,
    options: VisitListAllByUserOptions = {},
  ): Promise<VisitRecord[]> {
    const snapshot = await this.buildUserQuery(userId, options).get();
    return snapshot.docs.map((doc) => mapVisitDoc(doc));
  }
}
