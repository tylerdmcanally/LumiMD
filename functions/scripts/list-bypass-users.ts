/**
 * CLI script to list all users with paywall bypass enabled.
 * 
 * Usage:
 *   npx ts-node scripts/list-bypass-users.ts
 * 
 * Note: Requires Firebase Admin SDK credentials.
 * Set GOOGLE_APPLICATION_CREDENTIALS environment variable or run from
 * a machine with application default credentials configured.
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function main() {
  console.log('Fetching users with bypassPaywall=true...\n');

  const snapshot = await db
    .collection('users')
    .where('bypassPaywall', '==', true)
    .get();

  if (snapshot.empty) {
    console.log('No users with bypass enabled.');
    return;
  }

  console.log(`Found ${snapshot.size} user(s) with bypassPaywall=true:\n`);
  console.log('Email                                    | UID                      | Name');
  console.log('-----------------------------------------|--------------------------|-----------------');

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const email = (data.email || 'N/A').padEnd(40);
    const uid = doc.id.padEnd(24);
    const name = data.displayName || 'N/A';
    console.log(`${email} | ${uid} | ${name}`);
  }

  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
