/**
 * CLI script to grant or revoke paywall bypass for a user.
 * 
 * Usage:
 *   npm run bypass:grant -- <email>     # Grant bypass
 *   npm run bypass:revoke -- <email>    # Revoke bypass
 * 
 * Or directly:
 *   npx ts-node scripts/set-bypass.ts <email>           # Grant bypass
 *   npx ts-node scripts/set-bypass.ts --revoke <email>  # Revoke bypass
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
  const args = process.argv.slice(2);
  const revokeFlag = args.includes('--revoke');
  const email = args.find(arg => !arg.startsWith('--'));
  const bypass = !revokeFlag;

  if (!email) {
    console.error('Usage: npx ts-node scripts/set-bypass.ts <email> [true|false]');
    console.error('');
    console.error('Examples:');
    console.error('  npx ts-node scripts/set-bypass.ts tyler@example.com');
    console.error('  npx ts-node scripts/set-bypass.ts tyler@example.com false');
    process.exit(1);
  }

  console.log(`Looking up user with email: ${email}...`);

  // Find user by email
  const usersSnapshot = await db
    .collection('users')
    .where('email', '==', email)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`❌ No user found with email: ${email}`);
    process.exit(1);
  }

  const userDoc = usersSnapshot.docs[0];
  const userData = userDoc.data();
  const currentBypass = userData.bypassPaywall === true;

  console.log(`Found user: ${userData.displayName || 'N/A'} (uid: ${userDoc.id})`);
  console.log(`Current bypassPaywall: ${currentBypass}`);

  if (currentBypass === bypass) {
    console.log(`ℹ️  bypassPaywall is already set to ${bypass}. No changes needed.`);
    process.exit(0);
  }

  // Update the user document
  await userDoc.ref.update({
    bypassPaywall: bypass,
    updatedAt: admin.firestore.Timestamp.now(),
  });

  console.log(`✅ Set bypassPaywall=${bypass} for ${email}`);
  console.log('');
  console.log(bypass
    ? '   User now has full access without subscription.'
    : '   User is now subject to normal subscription rules.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
