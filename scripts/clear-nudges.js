#!/usr/bin/env node
/**
 * Clear nudges and other test data for a user
 * 
 * Usage:
 *   node clear-nudges.js                    # Clear nudges for default test user
 *   node clear-nudges.js --user=<userId>    # Clear nudges for specific user
 *   node clear-nudges.js --all              # Clear ALL nudges (be careful!)
 *   node clear-nudges.js --status=pending   # Only clear pending nudges
 *   node clear-nudges.js --dry-run          # Preview without deleting
 * 
 * Prerequisites:
 *   - Run: gcloud auth application-default login
 *   - Or set GOOGLE_APPLICATION_CREDENTIALS env var
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
if (!admin.apps.length) {
    const serviceAccountPath = path.join(__dirname, '..', 'firebase-admin-key.json');

    if (fs.existsSync(serviceAccountPath)) {
        // Use service account file if available
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
    } else {
        // Fall back to application default credentials
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: 'lumimd-dev',
        });
    }
}

const db = admin.firestore();

// Default test user ID
const DEFAULT_USER_ID = '7Ta8FpJxCCgLgepcerjy547oxIE3';

// Parse command line arguments
function parseArgs() {
    const args = {
        userId: DEFAULT_USER_ID,
        all: false,
        status: null,
        dryRun: false,
    };

    process.argv.slice(2).forEach(arg => {
        if (arg.startsWith('--user=')) {
            args.userId = arg.split('=')[1];
        } else if (arg === '--all') {
            args.all = true;
        } else if (arg.startsWith('--status=')) {
            args.status = arg.split('=')[1];
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        }
    });

    return args;
}

async function clearNudges(args) {
    console.log('\n🧹 LumiMD Nudge Cleanup Script');
    console.log('================================\n');

    if (args.dryRun) {
        console.log('⚠️  DRY RUN MODE - No data will be deleted\n');
    }

    // Build query
    let query = db.collection('nudges');

    if (!args.all) {
        console.log(`User: ${args.userId}`);
        query = query.where('userId', '==', args.userId);
    } else {
        console.log('⚠️  Clearing ALL nudges across all users!');
    }

    if (args.status) {
        console.log(`Status filter: ${args.status}`);
        query = query.where('status', '==', args.status);
    }

    console.log('');

    // Fetch nudges
    const snapshot = await query.get();
    console.log(`Found ${snapshot.docs.length} nudges to delete.\n`);

    if (snapshot.empty) {
        console.log('✓ No nudges to delete.');
        return;
    }

    // Show summary by status
    const statusCounts = {};
    snapshot.docs.forEach(doc => {
        const status = doc.data().status || 'unknown';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log('Breakdown by status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  - ${status}: ${count}`);
    });
    console.log('');

    if (args.dryRun) {
        console.log('🔍 Dry run complete. Run without --dry-run to delete.');
        return;
    }

    // Delete in batches (Firestore limit is 500 per batch)
    const batchSize = 500;
    let deleted = 0;

    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = snapshot.docs.slice(i, i + batchSize);

        chunk.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        deleted += chunk.length;
        console.log(`Deleted ${deleted}/${snapshot.docs.length}...`);
    }

    console.log(`\n✓ Successfully deleted ${deleted} nudges.`);
    console.log('🧹 Done! Your nudges collection is now clean.\n');
}

// Run
clearNudges(parseArgs()).catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
