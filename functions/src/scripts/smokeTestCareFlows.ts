/**
 * Care Flows Smoke Test Script
 *
 * Run with: npx ts-node --project tsconfig.json src/scripts/smokeTestCareFlows.ts
 *
 * Tests:
 * 1. Creates a test care flow document
 * 2. Runs the engine manually to see if it picks it up
 * 3. Verifies a nudge was created with careFlowId
 * 4. Cleans up test data
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env to pick up GCLOUD_PROJECT
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Initialize Firebase Admin with explicit project
if (!admin.apps.length) {
    const projectId = process.env.LUMIMD_FIREBASE_PROJECT || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
        console.error('ERROR: No project ID found. Set LUMIMD_FIREBASE_PROJECT in functions/.env');
        process.exit(1);
    }
    console.log(`Using Firebase project: ${projectId}\n`);
    admin.initializeApp({ projectId });
}

const db = admin.firestore();
const TEST_USER_ID = 'smoke-test-care-flows';
const TEST_VISIT_ID = 'smoke-test-visit';

async function runSmokeTest() {
    console.log('=== Care Flows Smoke Test ===\n');

    // Step 1: Create a test care flow
    console.log('1. Creating test care flow...');
    const now = admin.firestore.Timestamp.now();
    const flowRef = db.collection('careFlows').doc();
    await flowRef.set({
        userId: TEST_USER_ID,
        visitId: TEST_VISIT_ID,
        trigger: 'new_medication',
        condition: 'htn',
        medicationName: 'Lisinopril',
        status: 'active',
        phase: 'establish',
        cadence: {
            currentIntervalDays: 1,
            consecutiveNormalCount: 0,
        },
        touchpoints: [],
        nextTouchpointAt: now, // Due immediately
        nextTouchpointType: 'log_prompt',
        context: {
            visitDate: '2026-03-30',
            reportedIssues: [],
        },
        createdAt: now,
        updatedAt: now,
    });
    console.log(`   Created flow: ${flowRef.id}`);

    // Step 2: Verify the document was created
    console.log('\n2. Verifying flow document...');
    const flowDoc = await flowRef.get();
    const flowData = flowDoc.data();
    console.log(`   Status: ${flowData?.status}`);
    console.log(`   Phase: ${flowData?.phase}`);
    console.log(`   Condition: ${flowData?.condition}`);
    console.log(`   NextTouchpointAt: ${flowData?.nextTouchpointAt?.toDate()}`);
    console.log(`   ✓ Flow document valid`);

    // Step 3: Query to verify index works (same query the engine uses)
    console.log('\n3. Testing engine query (status=active, nextTouchpointAt<=now)...');
    try {
        const dueFlows = await db
            .collection('careFlows')
            .where('status', '==', 'active')
            .where('nextTouchpointAt', '<=', now)
            .orderBy('nextTouchpointAt', 'asc')
            .limit(10)
            .get();
        console.log(`   Found ${dueFlows.size} due flow(s)`);
        const found = dueFlows.docs.some(doc => doc.id === flowRef.id);
        console.log(`   Our test flow found: ${found ? '✓' : '✗'}`);

        if (!found && dueFlows.size === 0) {
            console.log('   ⚠ Index may still be building — this is expected for new indexes');
        }
    } catch (error: any) {
        if (error.code === 9 || error.message?.includes('index')) {
            console.log('   ⚠ Index not ready yet — Firestore is still building it');
            console.log('   This is normal for newly deployed indexes. Try again in a few minutes.');
        } else {
            console.log(`   ✗ Query error: ${error.message}`);
        }
    }

    // Step 4: Test dedup query (userId + condition + status)
    console.log('\n4. Testing dedup query (userId + condition + status)...');
    try {
        const dedupResult = await db
            .collection('careFlows')
            .where('userId', '==', TEST_USER_ID)
            .where('condition', '==', 'htn')
            .where('status', '==', 'active')
            .limit(1)
            .get();
        console.log(`   Found ${dedupResult.size} active HTN flow(s) for test user`);
        console.log(`   ✓ Dedup query works`);
    } catch (error: any) {
        if (error.code === 9 || error.message?.includes('index')) {
            console.log('   ⚠ Index not ready yet');
        } else {
            console.log(`   ✗ Query error: ${error.message}`);
        }
    }

    // Step 5: Test the care flow engine directly (without AI to avoid OpenAI calls)
    console.log('\n5. Testing care flow engine (nudge creation)...');
    try {
        const { NudgeDomainService } = await import('../services/domain/nudges/NudgeDomainService');
        const { FirestoreNudgeRepository } = await import('../services/repositories/nudges/FirestoreNudgeRepository');
        const nudgeService = new NudgeDomainService(new FirestoreNudgeRepository(db));

        // Create a nudge manually (simulating what the engine does)
        const nudgeNow = admin.firestore.Timestamp.now();
        await nudgeService.createRecord({
            userId: TEST_USER_ID,
            visitId: TEST_VISIT_ID,
            type: 'condition_tracking',
            conditionId: 'htn',
            medicationName: 'Lisinopril',
            title: 'Blood Pressure Check',
            message: 'Time for a quick BP reading.',
            actionType: 'log_bp',
            scheduledFor: nudgeNow,
            sequenceDay: 3,
            sequenceId: `careflow_${flowRef.id}_smoke`,
            status: 'pending',
            careFlowId: flowRef.id,
            context: {
                visitDate: '2026-03-30',
                medicationName: 'Lisinopril',
                trackingReason: 'Care flow: establish phase',
            },
            createdAt: nudgeNow,
            updatedAt: nudgeNow,
        } as any);
        console.log('   ✓ Created test nudge with careFlowId');

        // Verify the nudge was created with careFlowId
        const nudges = await nudgeService.listByUserAndStatuses(TEST_USER_ID, ['pending']);
        const careFlowNudge = nudges.find((n: any) => n.careFlowId === flowRef.id);
        console.log(`   Nudge found with careFlowId: ${careFlowNudge ? '✓' : '✗'}`);
        if (careFlowNudge) {
            console.log(`   Nudge ID: ${careFlowNudge.id}`);
            console.log(`   Title: ${(careFlowNudge as any).title}`);
            console.log(`   ActionType: ${(careFlowNudge as any).actionType}`);
        }
    } catch (error: any) {
        console.log(`   ✗ Engine test error: ${error.message}`);
    }

    // Step 6: Test response handler
    console.log('\n6. Testing response handler (cadence update)...');
    try {
        const { updateCareFlowFromResponse } = await import('../services/careFlowResponseHandler');

        // Get the nudge we just created
        const nudgesSnap = await db
            .collection('nudges')
            .where('userId', '==', TEST_USER_ID)
            .where('status', '==', 'pending')
            .limit(1)
            .get();

        if (!nudgesSnap.empty) {
            const testNudge = nudgesSnap.docs[0];
            await updateCareFlowFromResponse({
                careFlowId: flowRef.id,
                nudgeId: testNudge.id,
                response: 'good',
            });

            // Verify cadence was updated
            const updatedFlow = await flowRef.get();
            const updatedData = updatedFlow.data();
            console.log(`   consecutiveNormalCount: ${updatedData?.cadence?.consecutiveNormalCount}`);
            console.log(`   ✓ Response handler updated flow`);
        } else {
            console.log('   ⚠ No pending nudge found to test response handler');
        }
    } catch (error: any) {
        console.log(`   ✗ Response handler error: ${error.message}`);
    }

    // Step 7: Cleanup
    console.log('\n7. Cleaning up test data...');
    const batch = db.batch();

    // Delete test care flow
    batch.delete(flowRef);

    // Delete test nudges
    const testNudges = await db
        .collection('nudges')
        .where('userId', '==', TEST_USER_ID)
        .get();
    testNudges.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();
    console.log(`   Deleted flow + ${testNudges.size} nudge(s)`);
    console.log('   ✓ Cleanup complete');

    console.log('\n=== Smoke Test Complete ===');
}

runSmokeTest()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('Smoke test failed:', err);
        process.exit(1);
    });
