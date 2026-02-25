import * as admin from 'firebase-admin';
import {
  LIST_QUERY_CONTRACT_COLLECTIONS,
  type ListQueryContractCollection,
  buildListQueryContractUpdates,
} from '../src/services/listQueryContractBackfill';

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1000;
const MAX_BATCH_SIZE = 400;

type CollectionSummary = {
  collection: ListQueryContractCollection;
  scanned: number;
  updated: number;
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

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getArgValue(flag: string): string | undefined {
  const match = process.argv.find((entry) => entry.startsWith(`${flag}=`));
  if (!match) {
    return undefined;
  }

  return match.slice(flag.length + 1);
}

function parsePageSize(): number {
  const raw = getArgValue('--pageSize');
  if (!raw) {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(MAX_PAGE_SIZE, parsed);
}

function parseCollections(): ListQueryContractCollection[] {
  const raw = getArgValue('--collections');
  if (!raw) {
    return [...LIST_QUERY_CONTRACT_COLLECTIONS];
  }

  const requested = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const valid = requested.filter((entry): entry is ListQueryContractCollection =>
    (LIST_QUERY_CONTRACT_COLLECTIONS as readonly string[]).includes(entry),
  );

  return valid.length > 0 ? valid : [...LIST_QUERY_CONTRACT_COLLECTIONS];
}

function parseProjectId(): string | null {
  const raw = getArgValue('--projectId') ?? process.env.FIREBASE_PROJECT_ID;
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function initializeFirebaseApp(projectIdOverride: string | null): void {
  if (admin.apps.length > 0) {
    return;
  }

  const projectId = (projectIdOverride ?? '').replace(/\\n/g, '\n').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/\\n/g, '\n').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    console.log(`[list-query-backfill] Initialized Firebase Admin with service account (${projectId}).`);
    return;
  }

  if (projectId) {
    admin.initializeApp({ projectId });
    console.log(
      `[list-query-backfill] Initialized Firebase Admin with application default credentials (${projectId}).`,
    );
    return;
  }

  admin.initializeApp();
  console.log(
    '[list-query-backfill] Initialized Firebase Admin with application default credentials (project auto-detect).',
  );
}

async function backfillCollection(
  db: FirebaseFirestore.Firestore,
  collection: ListQueryContractCollection,
  now: FirebaseFirestore.Timestamp,
  applyChanges: boolean,
  pageSize: number,
): Promise<CollectionSummary> {
  let scanned = 0;
  let updated = 0;
  let cursor: string | null = null;

  while (true) {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
      .collection(collection)
      .orderBy(documentIdField())
      .limit(pageSize);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    let batch = db.batch();
    let pendingWrites = 0;

    for (const doc of snapshot.docs) {
      scanned += 1;

      const updates = buildListQueryContractUpdates(collection, doc.data(), now);
      if (Object.keys(updates).length === 0) {
        continue;
      }

      updated += 1;
      if (!applyChanges) {
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

    if (applyChanges && pendingWrites > 0) {
      await batch.commit();
    }

    cursor = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;

    console.log(`[list-query-backfill] ${collection}: scanned=${scanned}, updated=${updated}`);

    if (snapshot.docs.length < pageSize) {
      break;
    }
  }

  return {
    collection,
    scanned,
    updated,
  };
}

async function main() {
  const applyChanges = hasFlag('--apply');
  const pageSize = parsePageSize();
  const collections = parseCollections();
  const projectId = parseProjectId();

  initializeFirebaseApp(projectId);
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  console.log(
    `[list-query-backfill] Starting (apply=${applyChanges}, pageSize=${pageSize}, collections=${collections.join(',')}, projectId=${projectId ?? 'auto'})`,
  );

  const summaries: CollectionSummary[] = [];
  for (const collection of collections) {
    const summary = await backfillCollection(db, collection, now, applyChanges, pageSize);
    summaries.push(summary);
  }

  const totals = summaries.reduce(
    (acc, summary) => {
      acc.scanned += summary.scanned;
      acc.updated += summary.updated;
      return acc;
    },
    { scanned: 0, updated: 0 },
  );

  console.log('[list-query-backfill] Summary:');
  summaries.forEach((summary) => {
    console.log(`  - ${summary.collection}: scanned=${summary.scanned}, updated=${summary.updated}`);
  });
  console.log(
    `[list-query-backfill] Totals: scanned=${totals.scanned}, updated=${totals.updated}`,
  );

  if (!applyChanges) {
    console.log('[list-query-backfill] Dry-run only. Re-run with --apply to persist updates.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[list-query-backfill] Failed:', error);
    process.exit(1);
  });
