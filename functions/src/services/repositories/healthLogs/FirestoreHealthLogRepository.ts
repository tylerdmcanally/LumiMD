import * as admin from 'firebase-admin';
import { RepositoryValidationError } from '../common/errors';
import type { CursorPageResult, SortDirection } from '../common/pagination';
import type {
  HealthLogFindBySourceIdOptions,
  HealthLogListPageByUserOptions,
  HealthLogListByUserOptions,
  HealthLogRecord,
  HealthLogRepository,
} from './HealthLogRepository';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const PAGE_DEFAULT_LIMIT = 50;

function normalizeLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function normalizeSortDirection(value: SortDirection | undefined): SortDirection {
  return value === 'asc' ? 'asc' : 'desc';
}

function normalizePageLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return PAGE_DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function mapHealthLogDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): HealthLogRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as HealthLogRecord;
}

export class FirestoreHealthLogRepository implements HealthLogRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private buildUserQuery(
    userId: string,
    options: HealthLogListByUserOptions | HealthLogListPageByUserOptions,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    const includeDeleted = options.includeDeleted === true;
    const sortDirection = normalizeSortDirection(options.sortDirection);

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('healthLogs')
      .where('userId', '==', userId);

    if (!includeDeleted) {
      query = query.where('deletedAt', '==', null);
    }

    if (options.type) {
      query = query.where('type', '==', options.type);
    }

    if (options.startDate) {
      query = query.where(
        'createdAt',
        '>=',
        admin.firestore.Timestamp.fromDate(options.startDate),
      );
    }

    if (options.endDate) {
      query = query.where(
        'createdAt',
        '<=',
        admin.firestore.Timestamp.fromDate(options.endDate),
      );
    }

    return query.orderBy('createdAt', sortDirection);
  }

  async getById(healthLogId: string): Promise<HealthLogRecord | null> {
    const healthLogDoc = await this.db.collection('healthLogs').doc(healthLogId).get();
    if (!healthLogDoc.exists) {
      return null;
    }

    return {
      id: healthLogDoc.id,
      ...(healthLogDoc.data() || {}),
    } as HealthLogRecord;
  }

  async create(payload: FirebaseFirestore.DocumentData): Promise<HealthLogRecord> {
    const ref = await this.db.collection('healthLogs').add(payload);
    const refWithGet = ref as unknown as {
      id: string;
      get?: () => Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>>;
    };

    if (typeof refWithGet.get === 'function') {
      const createdDoc = await refWithGet.get();
      if (createdDoc.exists) {
        return mapHealthLogDoc(
          createdDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
        );
      }
    }

    return {
      id: ref.id,
      ...(payload || {}),
    } as HealthLogRecord;
  }

  async updateById(
    healthLogId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<HealthLogRecord | null> {
    const docRef = this.db.collection('healthLogs').doc(healthLogId);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return null;
    }

    await docRef.update(updates);
    const updatedDoc = await docRef.get();
    if (!updatedDoc.exists) {
      return null;
    }

    return mapHealthLogDoc(
      updatedDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async listByUser(
    userId: string,
    options: HealthLogListByUserOptions = {},
  ): Promise<HealthLogRecord[]> {
    const limit = normalizeLimit(options.limit);
    let query = this.buildUserQuery(userId, options);

    if (limit !== undefined) {
      query = query.limit(limit);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => mapHealthLogDoc(doc));
  }

  async listPageByUser(
    userId: string,
    options: HealthLogListPageByUserOptions,
  ): Promise<CursorPageResult<HealthLogRecord>> {
    const limit = normalizePageLimit(options.limit);
    const queryLimit = limit + 1;
    const includeDeleted = options.includeDeleted === true;
    const cursor =
      typeof options.cursor === 'string' && options.cursor.trim().length > 0
        ? options.cursor.trim()
        : null;

    let query = this.buildUserQuery(userId, options).limit(queryLimit);

    if (cursor) {
      const cursorDoc = await this.db.collection('healthLogs').doc(cursor).get();
      const cursorData = cursorDoc.data();
      const cursorBelongsToUser = cursorData?.userId === userId;
      const cursorDeleted = Boolean(cursorData?.deletedAt);
      const cursorTypeMatches = options.type ? cursorData?.type === options.type : true;
      const cursorCreatedAt = cursorData?.createdAt?.toDate?.();
      const inStartDate = options.startDate
        ? cursorCreatedAt instanceof Date && cursorCreatedAt >= options.startDate
        : true;
      const inEndDate = options.endDate
        ? cursorCreatedAt instanceof Date && cursorCreatedAt <= options.endDate
        : true;

      if (
        !cursorDoc.exists ||
        !cursorBelongsToUser ||
        (!includeDeleted && cursorDeleted) ||
        !cursorTypeMatches ||
        !inStartDate ||
        !inEndDate
      ) {
        throw new RepositoryValidationError('Invalid cursor');
      }

      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const pageDocs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    return {
      items: pageDocs.map((doc) => mapHealthLogDoc(doc)),
      hasMore,
      nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null,
    };
  }

  async findBySourceId(
    userId: string,
    sourceId: string,
    options: HealthLogFindBySourceIdOptions = {},
  ): Promise<HealthLogRecord[]> {
    const includeDeleted = options.includeDeleted === true;
    const limit = normalizeLimit(options.limit ?? 5) ?? 5;

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('healthLogs')
      .where('userId', '==', userId)
      .where('sourceId', '==', sourceId);

    if (!includeDeleted) {
      query = query.where('deletedAt', '==', null);
    }

    const snapshot = await query.limit(limit).get();
    return snapshot.docs.map((doc) => mapHealthLogDoc(doc));
  }

  async softDeleteById(
    healthLogId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<void> {
    await this.db.collection('healthLogs').doc(healthLogId).update({
      deletedAt: now,
      deletedBy: actorUserId,
      updatedAt: now,
    });
  }

  async restoreById(healthLogId: string, now: FirebaseFirestore.Timestamp): Promise<void> {
    await this.db.collection('healthLogs').doc(healthLogId).update({
      deletedAt: null,
      deletedBy: null,
      updatedAt: now,
    });
  }
}
