import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

async function clearMedicationSafetyCache() {
  const db = admin.firestore();
  const collection = db.collection('medicationSafetyCache');

  const snapshot = await collection.get();
  if (snapshot.empty) {
    console.log('No medicationSafetyCache documents to delete.');
    return;
  }

  console.log(`Deleting ${snapshot.size} medicationSafetyCache documents...`);

  const batchSize = 450;
  let batch = db.batch();
  snapshot.docs.forEach((doc, index) => {
    batch.delete(doc.ref);
    if ((index + 1) % batchSize === 0) {
      batch.commit();
      batch = db.batch();
    }
  });

  await batch.commit();
  console.log('Medication safety cache cleared.');
}

clearMedicationSafetyCache()
  .then(() => {
    console.log('Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to clear medication safety cache:', error);
    process.exit(1);
  });


