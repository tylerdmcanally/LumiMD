/**
 * Clear all nudges for a user
 * Run with: node clear-nudges.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize with service account
const serviceAccount = require(path.join(__dirname, '..', 'firebase-admin-key.json'));
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();
const userId = '7Ta8FpJxCCgLgepcerjy547oxIE3';

async function run() {
    console.log(`Clearing all nudges for user: ${userId}\n`);

    const snapshot = await db.collection('nudges')
        .where('userId', '==', userId)
        .get();

    console.log(`Found ${snapshot.docs.length} nudges to delete.\n`);

    if (snapshot.empty) {
        console.log('No nudges to delete.');
        process.exit(0);
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`✓ Deleted ${snapshot.docs.length} nudges.`);
    console.log('\n🧹 Done! Your nudges collection is now clean.');
    process.exit(0);
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
