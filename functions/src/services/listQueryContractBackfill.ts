import * as admin from 'firebase-admin';

export const LIST_QUERY_CONTRACT_COLLECTIONS = [
  'visits',
  'actions',
  'medications',
] as const;

export type ListQueryContractCollection = (typeof LIST_QUERY_CONTRACT_COLLECTIONS)[number];

export const LIST_QUERY_CONTRACT_BACKFILL_STATE_DOC_ID = 'listQueryContractBackfill';

const DEFAULT_BACKFILL_PAGE_SIZE = 250;
const MAX_BACKFILL_PAGE_SIZE = 1000;
const MAX_BATCH_SIZE = 400;

type BackfillCursorState = {
  visitsCursorDocId: string | null;
  actionsCursorDocId: string | null;
  medicationsCursorDocId: string | null;
};

type CollectionBackfillResult = {
  processed: number;
  updated: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export type ListQueryContractBackfillResult = {
  processedVisits: number;
  updatedVisits: number;
  processedActions: number;
  updatedActions: number;
  processedMedications: number;
  updatedMedications: number;
  hasMore: boolean;
  cursors: BackfillCursorState;
  dryRun: boolean;
  pageSize: number;
};

type RunListQueryContractBackfillParams = {
  db: FirebaseFirestore.Firestore;
  stateCollection: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;
  now: FirebaseFirestore.Timestamp;
  pageSize?: number;
  dryRun?: boolean;
};

type TimestampLike = {
  toDate?: () => Date;
  toMillis?: () => number;
};

function documentIdField(): FirebaseFirestore.FieldPath | string {
  const firestoreNamespace = admin.firestore as unknown as {
    FieldPath?: { documentId?: () => FirebaseFirestore.FieldPath };
  };
  const fieldPathFactory = firestoreNamespace.FieldPath?.documentId;
  if (typeof fieldPathFactory === 'function') {
    return fieldPathFactory();
  }
  return '__name__';
}

function hasOwnProperty(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asCursor(value: unknown): string | null {
  return asString(value);
}

function isTimestampLike(value: unknown): value is TimestampLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as TimestampLike;
  return (
    typeof candidate.toDate === 'function' ||
    typeof candidate.toMillis === 'function'
  );
}

function resolveCreatedAtCandidate(
  record: Record<string, unknown>,
  fields: string[],
): TimestampLike | null {
  for (const field of fields) {
    const candidate = record[field];
    if (isTimestampLike(candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveMedicationName(record: Record<string, unknown>): string {
  const candidateFields = ['name', 'medicationName', 'canonicalName', 'drugName'];
  for (const field of candidateFields) {
    const value = asString(record[field]);
    if (value) {
      return value;
    }
  }
  return 'Untitled medication';
}

export function buildListQueryContractUpdates(
  collection: ListQueryContractCollection,
  data: FirebaseFirestore.DocumentData | undefined,
  now: FirebaseFirestore.Timestamp,
): FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> {
  const record = (data ?? {}) as Record<string, unknown>;
  const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {};

  if (!hasOwnProperty(record, 'deletedAt')) {
    updates.deletedAt = null;
  }

  if (!hasOwnProperty(record, 'deletedBy')) {
    updates.deletedBy = null;
  }

  const createdAtCandidatesByCollection: Record<ListQueryContractCollection, string[]> = {
    visits: ['createdAt', 'visitDate', 'updatedAt', 'summarizedAt', 'transcriptionCompletedAt'],
    actions: ['createdAt', 'dueAt', 'updatedAt', 'completedAt'],
    medications: ['createdAt', 'startedAt', 'changedAt', 'updatedAt', 'stoppedAt'],
  };

  if (!isTimestampLike(record.createdAt)) {
    updates.createdAt =
      resolveCreatedAtCandidate(record, createdAtCandidatesByCollection[collection]) ?? now;
  }

  if (collection === 'medications') {
    const canonicalName = resolveMedicationName(record);
    if (record.name !== canonicalName) {
      updates.name = canonicalName;
    }
  }

  return updates;
}

async function runCollectionBackfillPage(params: {
  db: FirebaseFirestore.Firestore;
  collectionName: ListQueryContractCollection;
  cursorDocId: string | null;
  pageSize: number;
  now: FirebaseFirestore.Timestamp;
  dryRun: boolean;
}): Promise<CollectionBackfillResult> {
  const { db, collectionName, cursorDocId, pageSize, now, dryRun } = params;
  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
    .collection(collectionName)
    .orderBy(documentIdField())
    .limit(pageSize + 1);

  if (cursorDocId) {
    query = query.startAfter(cursorDocId);
  }

  const snapshot = await query.get();
  const hasMore = snapshot.docs.length > pageSize;
  const pageDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
  const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;

  if (pageDocs.length === 0) {
    return {
      processed: 0,
      updated: 0,
      hasMore: false,
      nextCursor: null,
    };
  }

  let updated = 0;
  let batch = db.batch();
  let pendingWrites = 0;

  for (const doc of pageDocs) {
    const updates = buildListQueryContractUpdates(collectionName, doc.data(), now);
    if (Object.keys(updates).length === 0) {
      continue;
    }

    updated += 1;
    if (dryRun) {
      continue;
    }

    batch.update(doc.ref, updates);
    pendingWrites += 1;

    if (pendingWrites >= MAX_BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (!dryRun && pendingWrites > 0) {
    await batch.commit();
  }

  return {
    processed: pageDocs.length,
    updated,
    hasMore,
    nextCursor,
  };
}

export async function backfillListQueryContractData(
  params: RunListQueryContractBackfillParams,
): Promise<ListQueryContractBackfillResult> {
  const dryRun = params.dryRun === true;
  const pageSize = Math.max(
    1,
    Math.min(MAX_BACKFILL_PAGE_SIZE, Math.floor(params.pageSize ?? DEFAULT_BACKFILL_PAGE_SIZE)),
  );
  const stateRef = params.stateCollection.doc(LIST_QUERY_CONTRACT_BACKFILL_STATE_DOC_ID);

  const stateSnapshot = await stateRef.get();
  const stateData = stateSnapshot.exists ? (stateSnapshot.data() ?? {}) : {};
  const state: BackfillCursorState = {
    visitsCursorDocId: asCursor(stateData.visitsCursorDocId),
    actionsCursorDocId: asCursor(stateData.actionsCursorDocId),
    medicationsCursorDocId: asCursor(stateData.medicationsCursorDocId),
  };

  const [visitsResult, actionsResult, medicationsResult] = await Promise.all([
    runCollectionBackfillPage({
      db: params.db,
      collectionName: 'visits',
      cursorDocId: state.visitsCursorDocId,
      pageSize,
      now: params.now,
      dryRun,
    }),
    runCollectionBackfillPage({
      db: params.db,
      collectionName: 'actions',
      cursorDocId: state.actionsCursorDocId,
      pageSize,
      now: params.now,
      dryRun,
    }),
    runCollectionBackfillPage({
      db: params.db,
      collectionName: 'medications',
      cursorDocId: state.medicationsCursorDocId,
      pageSize,
      now: params.now,
      dryRun,
    }),
  ]);

  const cursors: BackfillCursorState = {
    visitsCursorDocId: visitsResult.nextCursor,
    actionsCursorDocId: actionsResult.nextCursor,
    medicationsCursorDocId: medicationsResult.nextCursor,
  };

  const hasMore = visitsResult.hasMore || actionsResult.hasMore || medicationsResult.hasMore;

  if (!dryRun) {
    await stateRef.set(
      {
        ...cursors,
        pageSize,
        lastProcessedAt: params.now,
        lastRun: {
          processedVisits: visitsResult.processed,
          updatedVisits: visitsResult.updated,
          processedActions: actionsResult.processed,
          updatedActions: actionsResult.updated,
          processedMedications: medicationsResult.processed,
          updatedMedications: medicationsResult.updated,
        },
        completedAt: hasMore ? null : params.now,
      },
      { merge: true },
    );
  }

  return {
    processedVisits: visitsResult.processed,
    updatedVisits: visitsResult.updated,
    processedActions: actionsResult.processed,
    updatedActions: actionsResult.updated,
    processedMedications: medicationsResult.processed,
    updatedMedications: medicationsResult.updated,
    hasMore,
    cursors,
    dryRun,
    pageSize,
  };
}
