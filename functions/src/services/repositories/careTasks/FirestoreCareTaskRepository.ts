import { RepositoryValidationError } from '../common/errors';
import type { CursorPageResult } from '../common/pagination';
import type {
  CareTaskListAllByCaregiverPatientOptions,
  CareTaskListByCaregiverPatientOptions,
  CareTaskRecord,
  CareTaskRepository,
  CareTaskStatus,
} from './CareTaskRepository';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function normalizeStatus(status: string | undefined): CareTaskStatus | undefined {
  if (status === 'pending' || status === 'in_progress' || status === 'completed' || status === 'cancelled') {
    return status;
  }

  return undefined;
}

function mapCareTaskDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): CareTaskRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as CareTaskRecord;
}

export class FirestoreCareTaskRepository implements CareTaskRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private buildScopedQuery(
    caregiverId: string,
    patientId: string,
    options: CareTaskListAllByCaregiverPatientOptions | CareTaskListByCaregiverPatientOptions,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    const includeDeleted = options.includeDeleted === true;
    const status = normalizeStatus(options.status);

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = this.db
      .collection('careTasks')
      .where('patientId', '==', patientId)
      .where('caregiverId', '==', caregiverId);

    if (!includeDeleted) {
      query = query.where('deletedAt', '==', null);
    }

    if (status) {
      query = query.where('status', '==', status);
    }

    return query;
  }

  async listByCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CareTaskListByCaregiverPatientOptions,
  ): Promise<CursorPageResult<CareTaskRecord>> {
    const limit = normalizeLimit(options.limit);
    const queryLimit = limit + 1;
    const includeDeleted = options.includeDeleted === true;
    const status = normalizeStatus(options.status);

    let query = this.buildScopedQuery(caregiverId, patientId, options)
      .orderBy('createdAt', 'desc')
      .limit(queryLimit);

    const cursor =
      typeof options.cursor === 'string' && options.cursor.trim().length > 0
        ? options.cursor.trim()
        : null;

    if (cursor) {
      const cursorDoc = await this.db.collection('careTasks').doc(cursor).get();
      const cursorData = cursorDoc.data();
      const cursorMatchesOwners =
        cursorData?.patientId === patientId && cursorData?.caregiverId === caregiverId;
      const cursorDeleted = Boolean(cursorData?.deletedAt);
      const cursorStatusMatches = status ? cursorData?.status === status : true;

      if (
        !cursorDoc.exists ||
        !cursorMatchesOwners ||
        (!includeDeleted && cursorDeleted) ||
        !cursorStatusMatches
      ) {
        throw new RepositoryValidationError('Invalid cursor');
      }

      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const pageDocs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    return {
      items: pageDocs.map((doc) => mapCareTaskDoc(doc)),
      hasMore,
      nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null,
    };
  }

  async listAllByCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CareTaskListAllByCaregiverPatientOptions = {},
  ): Promise<CareTaskRecord[]> {
    const snapshot = await this.buildScopedQuery(caregiverId, patientId, options)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => mapCareTaskDoc(doc));
  }

  async getById(taskId: string): Promise<CareTaskRecord | null> {
    const taskDoc = await this.db.collection('careTasks').doc(taskId).get();
    if (!taskDoc.exists) {
      return null;
    }

    return {
      id: taskDoc.id,
      ...(taskDoc.data() || {}),
    } as CareTaskRecord;
  }

  async create(payload: FirebaseFirestore.DocumentData): Promise<CareTaskRecord> {
    const ref = await this.db.collection('careTasks').add(payload);
    const refWithGet = ref as unknown as {
      id: string;
      get?: () => Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>>;
    };

    if (typeof refWithGet.get === 'function') {
      const createdDoc = await refWithGet.get();
      if (createdDoc.exists) {
        return mapCareTaskDoc(
          createdDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
        );
      }
    }

    return {
      id: ref.id,
      ...(payload || {}),
    } as CareTaskRecord;
  }

  async updateById(
    taskId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<CareTaskRecord | null> {
    const docRef = this.db.collection('careTasks').doc(taskId);
    const existingDoc = await docRef.get();
    if (!existingDoc.exists) {
      return null;
    }

    await docRef.update(updates);
    const updatedDoc = await docRef.get();
    if (!updatedDoc.exists) {
      return null;
    }

    return mapCareTaskDoc(
      updatedDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }
}
