/**
 * Heart Failure Test Script - creates compressed HF nudge sequence
 * Run with: node create-hf-test-sequence.js
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
const sequenceId = 'hf_test_' + Date.now();
const intervalMs = 30000; // 30 seconds between each step

const steps = [
    {
        day: 1,
        type: 'condition_followup',
        title: 'Welcome to HF Monitoring',
        message: 'Welcome! Daily weight tracking is the #1 way to catch fluid buildup early. Weigh yourself each morning, same time, after using the bathroom.',
        actionType: 'log_weight',
    },
    {
        day: 3,
        type: 'condition_followup',
        title: 'Daily Weight Check',
        message: "How's the daily weighing going? A gain of 2+ lbs in a day or 5+ lbs in a week can signal fluid buildup. Let's log today's weight.",
        actionType: 'log_weight',
    },
    {
        day: 5,
        type: 'condition_followup',
        title: 'Symptom Check-In',
        message: 'Quick check-in: Any swelling in your ankles or feet? More shortness of breath than usual? Let us know how you\'re feeling.',
        actionType: 'log_symptom_check',
    },
    {
        day: 7,
        type: 'condition_followup',
        title: 'Weekly Symptom Check',
        message: 'Weekly symptom check: How are you doing overall? Rate your breathing, energy level, and any swelling you\'ve noticed.',
        actionType: 'log_symptom_check',
    },
    {
        day: 7,
        type: 'condition_followup',
        title: 'BP Check',
        message: 'Let\'s log your blood pressure to check how things are going.',
        actionType: 'log_bp',
    },
    {
        day: 14,
        type: 'condition_followup',
        title: 'Weekly HF Check-In',
        message: 'Time for your weekly heart failure check-in. How\'s your weight trend? Any changes in breathing or swelling?',
        actionType: 'log_symptom_check',
    },
];


async function run() {
    console.log('Creating compressed Heart Failure sequence for testing...\n');
    console.log(`User ID: ${userId}`);
    console.log(`Condition: Heart Failure`);
    console.log(`Interval: ${intervalMs / 1000}s between each step\n`);

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const scheduledDate = new Date(Date.now() + (i * intervalMs));
        const scheduledFor = admin.firestore.Timestamp.fromDate(scheduledDate);

        const nudgeData = {
            userId,
            visitId: 'debug-hf-visit',
            type: step.type,
            conditionId: 'heart_failure',
            title: `[HF TEST] ${step.title}`,
            message: step.message,
            actionType: step.actionType,
            scheduledFor,
            sequenceDay: step.day,
            sequenceId,
            status: 'pending',
            notificationSent: false,
            createdAt: now,
            updatedAt: now,
        };

        const docRef = await db.collection('nudges').add(nudgeData);
        console.log(`✓ Created: ${step.title}`);
        console.log(`  Action: ${step.actionType}`);
        console.log(`  → Surfaces in ${i * 30}s (ID: ${docRef.id})`);
    }

    console.log('\n🫀 Done! Watch your app for HF nudges appearing every 30 seconds.');
    console.log('\nNudge types:');
    console.log('  - log_weight: Opens weight log modal');
    console.log('  - log_symptom_check: Opens symptom check modal (sliders!)');
    console.log('  - log_bp: Opens BP log modal');
    process.exit(0);
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
