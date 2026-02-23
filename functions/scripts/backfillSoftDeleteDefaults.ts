import * as admin from 'firebase-admin';

const DEFAULT_COLLECTIONS = [
  'visits',
  'actions',
  'medications',
  'healthLogs',
  'careTasks',
  'medicationReminders',
] as const;

const MAX_BATCH_SIZE = 400;
const DEFAULT_PAGE_SIZE = 500;

type BackfillCollection = (typeof DEFAULT_COLLECTIONS)[number] | string;

type CollectionSummary = {
  collection: string;
  scanned: number;
  needsUpdate: number;
  updated: number;
};

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

  return Math.min(parsed, 1000);
}

function parseCollections(): BackfillCollection[] {
  const raw = getArgValue('--collections');
  if (!raw) {
    return [...DEFAULT_COLLECTIONS];
  }

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function initializeFirebaseApp(): void {
  if (admin.apps.length > 0) {
    return;
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/\\n/g, '\n').trim();
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
    console.log(`[soft-delete-backfill] Initialized Firebase Admin with service account (${projectId}).`);
    return;
  }

  admin.initializeApp();
  console.log('[soft-delete-backfill] Initialized Firebase Admin with application default credentials.');
}

function missingSoftDeleteFields(data: FirebaseFirestore.DocumentData | undefined): {
  needsDeletedAt: boolean;
  needsDeletedBy: boolean;
} {
  const record = (data ?? {}) as Record<string, unknown>;
  return {
    needsDeletedAt: !Object.prototype.hasOwnProperty.call(record, 'deletedAt'),
    needsDeletedBy: !Object.prototype.hasOwnProperty.call(record, 'deletedBy'),
  };
}

async function backfillCollection(
  db: FirebaseFirestore.Firestore,
  collection: string,
  applyChanges: boolean,
  pageSize: number,
): Promise<CollectionSummary> {
  let scanned = 0;
  let needsUpdate = 0;
  let updated = 0;
  let cursor: string | null = null;

  while (true) {
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
      .collection(collection)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    let batch = db.batch();
    let pendingBatchUpdates = 0;

    for (const doc of snapshot.docs) {
      scanned += 1;

      const missing = missingSoftDeleteFields(doc.data());
      if (!missing.needsDeletedAt && !missing.needsDeletedBy) {
        continue;
      }

      needsUpdate += 1;

      if (!applyChanges) {
        continue;
      }

      const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {};
      if (missing.needsDeletedAt) {
        updates.deletedAt = null;
      }
      if (missing.needsDeletedBy) {
        updates.deletedBy = null;
      }

      batch.update(doc.ref, updates);
      pendingBatchUpdates += 1;

      if (pendingBatchUpdates >= MAX_BATCH_SIZE) {
        await batch.commit();
        updated += pendingBatchUpdates;
        batch = db.batch();
        pendingBatchUpdates = 0;
      }
    }

    if (applyChanges && pendingBatchUpdates > 0) {
      await batch.commit();
      updated += pendingBatchUpdates;
    }

    cursor = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;

    console.log(
      `[soft-delete-backfill] ${collection}: scanned=${scanned}, needsUpdate=${needsUpdate}, updated=${updated}`,
    );

    if (snapshot.docs.length < pageSize) {
      break;
    }
  }

  return {
    collection,
    scanned,
    needsUpdate,
    updated,
  };
}

async function main() {
  const applyChanges = hasFlag('--apply');
  const collections = parseCollections();
  const pageSize = parsePageSize();

  initializeFirebaseApp();

  const db = admin.firestore();

  console.log(
    `[soft-delete-backfill] Starting (apply=${applyChanges}, pageSize=${pageSize}, collections=${collections.join(',')})`,
  );

  const summaries: CollectionSummary[] = [];
  for (const collection of collections) {
    const summary = await backfillCollection(db, collection, applyChanges, pageSize);
    summaries.push(summary);
  }

  const totals = summaries.reduce(
    (acc, summary) => {
      acc.scanned += summary.scanned;
      acc.needsUpdate += summary.needsUpdate;
      acc.updated += summary.updated;
      return acc;
    },
    { scanned: 0, needsUpdate: 0, updated: 0 },
  );

  console.log('[soft-delete-backfill] Summary:');
  summaries.forEach((summary) => {
    console.log(
      `  - ${summary.collection}: scanned=${summary.scanned}, needsUpdate=${summary.needsUpdate}, updated=${summary.updated}`,
    );
  });
  console.log(
    `[soft-delete-backfill] Totals: scanned=${totals.scanned}, needsUpdate=${totals.needsUpdate}, updated=${totals.updated}`,
  );

  if (!applyChanges) {
    console.log('[soft-delete-backfill] Dry-run only. Re-run with --apply to persist updates.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[soft-delete-backfill] Failed:', error);
    process.exit(1);
  });
