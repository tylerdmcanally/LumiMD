#!/usr/bin/env node
/**
 * LumiBot Nudge Test Script
 * 
 * Creates compressed nudge sequences to test LumiBot behavior across various
 * conditions without waiting days/weeks. Nudges fire every 30-60 seconds.
 * 
 * Usage:
 *   node test-nudges.js htn           # Hypertension sequence
 *   node test-nudges.js hf            # Heart failure sequence
 *   node test-nudges.js dm            # Diabetes sequence
 *   node test-nudges.js med           # New medication sequence
 *   node test-nudges.js all           # All sequences
 *   node test-nudges.js clear         # Clear all nudges first
 * 
 * Options:
 *   --interval=60    Set seconds between nudges (default: 30)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Config
const DEFAULT_USER_ID = '7Ta8FpJxCCgLgepcerjy547oxIE3';
const PROJECT_ID = 'lumimd-dev';

// Parse args
const args = process.argv.slice(2);
const scenario = args.find(a => !a.startsWith('--')) || 'help';
const intervalArg = args.find(a => a.startsWith('--interval='));
const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) : 30;

// Nudge sequences by condition
const SEQUENCES = {
    htn: {
        name: 'Hypertension',
        conditionId: 'hypertension',
        type: 'condition_tracking',
        steps: [
            { day: 1, title: 'BP Baseline', message: "Let's establish your baseline blood pressure. Please take a reading now.", actionType: 'log_bp' },
            { day: 3, title: 'Morning BP Check', message: 'Quick morning BP check - measure before taking any meds.', actionType: 'log_bp' },
            { day: 5, title: "How's the BP Going?", message: 'Have you noticed any patterns with your blood pressure readings?', actionType: 'log_bp' },
            { day: 7, title: 'Weekly BP Summary', message: 'Time for your weekly BP check. How are you feeling overall?', actionType: 'log_bp' },
        ]
    },
    hf: {
        name: 'Heart Failure',
        conditionId: 'heart_failure',
        type: 'condition_tracking',
        steps: [
            { day: 1, title: 'Welcome to HF Monitoring', message: 'Daily weight tracking catches fluid buildup early. Weigh yourself each morning.', actionType: 'log_weight' },
            { day: 3, title: 'Weight Trend Check', message: "How's the daily weighing going? A gain of 2+ lbs in a day signals fluid buildup.", actionType: 'log_weight' },
            { day: 5, title: 'Symptom Check-In', message: 'Any swelling in ankles or feet? More shortness of breath than usual?', actionType: 'symptom_check' },
            { day: 7, title: 'Weekly HF Review', message: 'Weekly check: rate your breathing, energy, and any swelling.', actionType: 'symptom_check' },
        ]
    },
    dm: {
        name: 'Diabetes',
        conditionId: 'diabetes',
        type: 'condition_tracking',
        steps: [
            { day: 1, title: 'Glucose Baseline', message: "Let's start tracking your blood sugar. Log your fasting glucose.", actionType: 'log_glucose' },
            { day: 3, title: 'Post-Meal Check', message: "How's your blood sugar after meals? Log a reading 2 hours after eating.", actionType: 'log_glucose' },
            { day: 7, title: 'Weekly Glucose Review', message: 'Weekly check-in: How are your blood sugars trending overall?', actionType: 'log_glucose' },
        ]
    },
    med: {
        name: 'New Medication (Lisinopril)',
        conditionId: null,
        type: 'medication_checkin',
        medicationName: 'Lisinopril 10mg',
        steps: [
            { day: 1, title: 'Prescription Pickup', message: 'Have you picked up Lisinopril 10mg from the pharmacy?', actionType: 'pickup_check' },
            { day: 4, title: 'Getting Started', message: 'Have you started taking Lisinopril 10mg?', actionType: 'started_check' },
            { day: 10, title: 'Side Effects Check', message: 'Any side effects from Lisinopril? Cough, dizziness, or other concerns?', actionType: 'side_effects' },
            { day: 28, title: 'Monthly Check-in', message: "How's Lisinopril 10mg working for you overall?", actionType: 'feeling_check' },
        ]
    }
};

// Generate nudge documents for a sequence
function generateNudges(key, startOffset = 0) {
    const seq = SEQUENCES[key];
    const now = Date.now();
    const sequenceId = `test_${key}_${now}`;

    return seq.steps.map((step, i) => {
        const scheduledTime = new Date(now + ((startOffset + i) * interval * 1000));

        return {
            userId: DEFAULT_USER_ID,
            visitId: `test-${key}-visit`,
            type: seq.type,
            conditionId: seq.conditionId,
            medicationName: seq.medicationName || null,
            title: `[TEST] ${step.title}`,
            message: step.message,
            actionType: step.actionType,
            scheduledFor: { _seconds: Math.floor(scheduledTime.getTime() / 1000), _nanoseconds: 0 },
            sequenceDay: step.day,
            sequenceId,
            status: 'pending',
            notificationSent: false,
            createdAt: { _seconds: Math.floor(now / 1000), _nanoseconds: 0 },
            updatedAt: { _seconds: Math.floor(now / 1000), _nanoseconds: 0 },
        };
    });
}

// Write nudges using a temp file and Firebase CLI
async function createNudges(nudges, seqName) {
    const tmpDir = '/tmp/lumimd-nudges';

    // Create temp directory structure
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Write each nudge as a separate JSON file for import
    const nudgeIds = [];
    for (let i = 0; i < nudges.length; i++) {
        const nudge = nudges[i];
        const nudgeId = `test_${Date.now()}_${i}`;
        nudgeIds.push(nudgeId);

        // Use firebase CLI to set document
        const dataStr = JSON.stringify(nudge).replace(/"/g, '\\"');

        try {
            execSync(
                `npx firebase-tools firestore:write --project ${PROJECT_ID} nudges/${nudgeId} "${dataStr}" --force`,
                { stdio: 'pipe', encoding: 'utf8' }
            );

            const scheduledIn = Math.floor((nudge.scheduledFor._seconds * 1000 - Date.now()) / 1000);
            console.log(`  ✓ ${nudge.title} (fires in ${scheduledIn}s)`);
        } catch (e) {
            // Fallback: manual instructions
            console.log(`  → ${nudge.title} - use Firebase Console to create`);
        }
    }

    return nudgeIds;
}

// Clear all nudges
function clearNudges() {
    console.log('🧹 Clearing all nudges...\n');
    try {
        execSync(`npx firebase-tools firestore:delete --project ${PROJECT_ID} nudges --shallow --force`, {
            stdio: 'inherit'
        });
        console.log('\n✓ All nudges cleared!\n');
    } catch (e) {
        console.log('Note: Collection may already be empty\n');
    }
}

// Main
async function main() {
    console.log('\n🤖 LumiBot Nudge Test Script');
    console.log('================================\n');

    if (scenario === 'help') {
        console.log('Usage: node test-nudges.js <scenario>\n');
        console.log('Scenarios:');
        console.log('  htn     - Hypertension monitoring sequence');
        console.log('  hf      - Heart failure monitoring sequence');
        console.log('  dm      - Diabetes monitoring sequence');
        console.log('  med     - New medication sequence');
        console.log('  all     - All sequences');
        console.log('  clear   - Clear all nudges\n');
        console.log('Options:');
        console.log('  --interval=60  Seconds between nudges (default: 30)\n');
        console.log('Example:');
        console.log('  node test-nudges.js clear && node test-nudges.js hf --interval=45\n');
        return;
    }

    if (scenario === 'clear') {
        clearNudges();
        return;
    }

    const sequences = scenario === 'all' ? Object.keys(SEQUENCES) : [scenario];

    if (!SEQUENCES[sequences[0]]) {
        console.error(`Unknown scenario: ${scenario}`);
        console.log('Run with "help" for usage.\n');
        return;
    }

    console.log(`Interval: ${interval}s between nudges`);
    console.log(`User: ${DEFAULT_USER_ID}\n`);

    let offset = 0;
    for (const key of sequences) {
        const seq = SEQUENCES[key];
        console.log(`\n📋 ${seq.name} (${seq.steps.length} nudges)`);
        console.log('-'.repeat(40));

        const nudges = generateNudges(key, offset);
        await createNudges(nudges, seq.name);

        offset += seq.steps.length;
    }

    console.log('\n✅ Done! Nudges will surface automatically.');
    console.log('   Check LumiBot in your app to see them appear.\n');
}

main().catch(console.error);
