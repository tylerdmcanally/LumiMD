import * as admin from 'firebase-admin';
import type {
  MedicationLogDateField,
  MedicationLogListByUsersOptions,
  MedicationLogListByUserOptions,
  MedicationLogRecord,
  MedicationLogRepository,
} from './MedicationLogRepository';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function normalizeLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function normalizeDateField(value: MedicationLogDateField | undefined): MedicationLogDateField {
  return value === 'createdAt' ? 'createdAt' : 'loggedAt';
}

function mapMedicationLogDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): MedicationLogRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as MedicationLogRecord;
}

export class FirestoreMedicationLogRepository implements MedicationLogRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private buildCommonQuery(
    query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>,
    options: MedicationLogListByUserOptions | MedicationLogListByUsersOptions,
  ): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
    const dateField = normalizeDateField(options.dateField);

    if (options.startDate) {
      query = query.where(
        dateField,
        '>=',
        admin.firestore.Timestamp.fromDate(options.startDate),
      );
    }

    if (options.endDate) {
      query = query.where(
        dateField,
        '<=',
        admin.firestore.Timestamp.fromDate(options.endDate),
      );
    }

    if (options.medicationId) {
      query = query.where('medicationId', '==', options.medicationId);
    }

    const limit = normalizeLimit(options.limit);
    if (limit !== undefined) {
      query = query.limit(limit);
    }

    return query;
  }

  async listByUser(
    userId: string,
    options: MedicationLogListByUserOptions = {},
  ): Promise<MedicationLogRecord[]> {
    let query = this.db
      .collection('medicationLogs')
      .where('userId', '==', userId);
    query = this.buildCommonQuery(query, options);

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => mapMedicationLogDoc(doc));
  }

  async listByUsers(
    userIds: string[],
    options: MedicationLogListByUsersOptions = {},
  ): Promise<MedicationLogRecord[]> {
    if (userIds.length === 0) {
      return [];
    }

    let query = this.db
      .collection('medicationLogs')
      .where('userId', 'in', userIds);
    query = this.buildCommonQuery(query, options);

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => mapMedicationLogDoc(doc));
  }
}
