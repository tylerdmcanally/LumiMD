import { RepositoryValidationError } from '../common/errors';
import type { CursorPageResult } from '../common/pagination';
import type {
  CaregiverNoteListByCaregiverPatientOptions,
  CaregiverNoteRecord,
  CaregiverNoteRepository,
} from './CaregiverNoteRepository';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function mapCaregiverNoteDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): CaregiverNoteRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as CaregiverNoteRecord;
}

export class FirestoreCaregiverNoteRepository implements CaregiverNoteRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private buildScopedQuery(
    caregiverId: string,
    patientId: string,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    return this.db
      .collection('caregiverNotes')
      .where('caregiverId', '==', caregiverId)
      .where('patientId', '==', patientId);
  }

  async listByCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CaregiverNoteListByCaregiverPatientOptions,
  ): Promise<CursorPageResult<CaregiverNoteRecord>> {
    const limit = normalizeLimit(options.limit);
    const queryLimit = limit + 1;

    let query = this.buildScopedQuery(caregiverId, patientId)
      .orderBy('updatedAt', 'desc')
      .limit(queryLimit);

    const cursor =
      typeof options.cursor === 'string' && options.cursor.trim().length > 0
        ? options.cursor.trim()
        : null;

    if (cursor) {
      const cursorDoc = await this.db.collection('caregiverNotes').doc(cursor).get();
      const cursorData = cursorDoc.data();
      const cursorMatchesOwners =
        cursorData?.caregiverId === caregiverId && cursorData?.patientId === patientId;

      if (!cursorDoc.exists || !cursorMatchesOwners) {
        throw new RepositoryValidationError('Invalid cursor');
      }

      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > limit;
    const pageDocs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

    return {
      items: pageDocs.map((doc) => mapCaregiverNoteDoc(doc)),
      hasMore,
      nextCursor: hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null,
    };
  }

  async listAllByCaregiverPatient(
    caregiverId: string,
    patientId: string,
  ): Promise<CaregiverNoteRecord[]> {
    const snapshot = await this.buildScopedQuery(caregiverId, patientId)
      .orderBy('updatedAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => mapCaregiverNoteDoc(doc));
  }

  async getById(noteId: string): Promise<CaregiverNoteRecord | null> {
    const noteDoc = await this.db.collection('caregiverNotes').doc(noteId).get();
    if (!noteDoc.exists) {
      return null;
    }

    return {
      id: noteDoc.id,
      ...(noteDoc.data() || {}),
    } as CaregiverNoteRecord;
  }

  async upsertById(
    noteId: string,
    payload: FirebaseFirestore.DocumentData,
  ): Promise<CaregiverNoteRecord | null> {
    const docRef = this.db.collection('caregiverNotes').doc(noteId);
    await docRef.set(payload, { merge: true });

    const updatedDoc = await docRef.get();
    if (!updatedDoc.exists) {
      return null;
    }

    return mapCaregiverNoteDoc(
      updatedDoc as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
    );
  }

  async deleteById(noteId: string): Promise<void> {
    await this.db.collection('caregiverNotes').doc(noteId).delete();
  }
}
