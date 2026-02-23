import { RepositoryValidationError } from '../common/errors';
import type { CursorPageResult, SortDirection } from '../common/pagination';
import type {
  ActionListAllByUserOptions,
  ActionListByUserOptions,
  ActionRecord,
  ActionRepository,
} from './ActionRepository';

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

function mapActionDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): ActionRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as ActionRecord;
}

export class FirestoreActionRepository implements ActionRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private buildUserQuery(
    userId: string,
    options: ActionListAllByUserOptions | ActionListByUserOptions,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    const includeDeleted = options.includeDeleted === true;
    const sortDirection = normalizeSortDirection(options.sortDirection);

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('actions')
      .where('userId', '==', userId);

    if (!includeDeleted) {
      query = query.where('deletedAt', '==', null);
    }

    return query.orderBy('createdAt', sortDirection);
  }

  async getById(actionId: string): Promise<ActionRecord | null> {
    const actionDoc = await this.db.collection('actions').doc(actionId).get();
    if (!actionDoc.exists) {
      return null;
    }

    return {
      id: actionDoc.id,
      ...(actionDoc.data() || {}),
    } as ActionRecord;
  }

  async create(payload: FirebaseFirestore.DocumentData): Promise<ActionRecord> {
    const ref = await this.db.collection('actions').add(payload);
    const createdDoc = await ref.get();
    return mapActionDoc(
      createdDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async updateById(
    actionId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ActionRecord | null> {
    const docRef = this.db.collection('actions').doc(actionId);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return null;
    }

    await docRef.update(updates);
    const updatedDoc = await docRef.get();
    if (!updatedDoc.exists) {
      return null;
    }

    return mapActionDoc(
      updatedDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async softDeleteById(
    actionId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<void> {
    await this.db.collection('actions').doc(actionId).update({
      deletedAt: now,
      deletedBy: actorUserId,
      updatedAt: now,
    });
  }

  async restoreById(actionId: string, now: FirebaseFirestore.Timestamp): Promise<void> {
    await this.db.collection('actions').doc(actionId).update({
      deletedAt: null,
      deletedBy: null,
      updatedAt: now,
    });
  }

  async listByUser(
    userId: string,
    options: ActionListByUserOptions,
  ): Promise<CursorPageResult<ActionRecord>> {
    const limit = normalizeLimit(options.limit);
    const queryLimit = limit + 1;
    const includeDeleted = options.includeDeleted === true;

    let query = this.buildUserQuery(userId, options).limit(queryLimit);

    const cursor =
      typeof options.cursor === 'string' && options.cursor.trim().length > 0
        ? options.cursor.trim()
        : null;

    if (cursor) {
      const cursorDoc = await this.db.collection('actions').doc(cursor).get();
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
      items: pageDocs.map((doc) => mapActionDoc(doc)),
      hasMore,
      nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null,
    };
  }

  async listAllByUser(
    userId: string,
    options: ActionListAllByUserOptions = {},
  ): Promise<ActionRecord[]> {
    const snapshot = await this.buildUserQuery(userId, options).get();
    return snapshot.docs.map((doc) => mapActionDoc(doc));
  }
}
