/**
 * Quick test script to create compressed DIABETES medication sequence
 * Run with: node create-dm-test-sequence.js
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
const now = admin.firestore.Timestamp.now();
const medName = 'Metformin';
const sequenceId = 'dm_test_seq_' + Date.now();
const intervalMs = 30000; // 30 seconds

const steps = [
    { day: 1, title: 'Prescription Pickup', message: `Have you been able to pick up ${medName} from the pharmacy?`, actionType: 'confirm_yes_no' },
    { day: 4, title: 'Getting Started', message: `How's it going with ${medName}? Have you been able to start taking it?`, actionType: 'confirm_yes_no' },
    { day: 7, title: 'First Glucose Check', message: `Time to log your blood sugar to see how ${medName} is working.`, actionType: 'log_glucose' },
    { day: 10, title: 'Side Effects Check', message: `You've been on ${medName} for a bit now. Any side effects or concerns?`, actionType: 'medication_check' },
    { day: 14, title: 'Two Week Glucose Check', message: `Let's log another blood sugar reading to track your progress on ${medName}.`, actionType: 'log_glucose' },
    { day: 28, title: 'Monthly Check-in', message: `It's been a while on ${medName}. How are things going overall?`, actionType: 'medication_check' },
];

async function run() {
    console.log('Creating compressed DIABETES medication sequence for testing...\n');
    console.log(`User ID: ${userId}`);
    console.log(`Medication: ${medName}`);
    console.log(`Interval: ${intervalMs / 1000}s between each step\n`);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const scheduledDate = new Date(Date.now() + (i * intervalMs));
        const scheduledFor = admin.firestore.Timestamp.fromDate(scheduledDate);

        const nudgeData = {
            userId,
            visitId: 'debug-dm-visit',
            type: 'medication_checkin',
            medicationName: medName,
            title: `[TEST-DM] ${step.title}`,
            message: step.message,
            actionType: step.actionType,
            scheduledFor,
            sequenceDay: step.day,
            sequenceId,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await db.collection('nudges').add(nudgeData);
        console.log(`✓ Created: ${step.title}`);
        console.log(`  → Surfaces in ${i * 30}s (ID: ${docRef.id})`);
    }

    console.log('\n🩸 Done! Watch your app for glucose nudges appearing every 30 seconds.');
    process.exit(0);
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
