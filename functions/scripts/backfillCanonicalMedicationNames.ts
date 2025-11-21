import * as admin from 'firebase-admin';
import { normalizeMedicationName } from '../src/services/medicationSafety';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

async function backfillCanonicalMedicationNames() {
  const db = admin.firestore();
  const medsCollection = db.collection('medications');

  const snapshot = await medsCollection.get();
  if (snapshot.empty) {
    console.log('No medications found. Nothing to backfill.');
    return;
  }

  console.log(`Scanning ${snapshot.size} medications for canonicalName backfill...`);

  const updates: Array<Promise<FirebaseFirestore.WriteResult[]>> = [];
  const BATCH_SIZE = 400;
  let processed = 0;
  let updated = 0;
  let batch = db.batch();

  for (const doc of snapshot.docs) {
    processed += 1;
    const data = doc.data();
    const name = typeof data?.name === 'string' ? data.name : '';
    if (!name) {
      continue;
    }

    const canonicalName = normalizeMedicationName(name);
    if (!canonicalName) {
      continue;
    }

    if (data.canonicalName === canonicalName) {
      continue;
    }

    batch.update(doc.ref, { canonicalName });
    updated += 1;

    if (updated % BATCH_SIZE === 0) {
      updates.push(batch.commit());
      batch = db.batch();
    }
  }

  if (updated % BATCH_SIZE !== 0) {
    updates.push(batch.commit());
  }

  await Promise.all(updates);

  console.log(
    `Backfill completed. Processed ${processed} medications, updated ${updated} canonicalName fields.`,
  );
}

backfillCanonicalMedicationNames()
  .then(() => {
    console.log('Backfill finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Canonical medication backfill failed:', error);
    process.exit(1);
  });


