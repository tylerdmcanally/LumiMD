import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const adminAuth = getAuth();
const adminDb = getFirestore();

const requestSchema = z.object({
    token: z.string(),
    uid: z.string(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token, uid } = requestSchema.parse(body);

        // Get verification record from Firestore
        const verificationDoc = await adminDb.collection('emailVerifications').doc(uid).get();

        if (!verificationDoc.exists) {
            return NextResponse.json(
                { error: 'Invalid verification link' },
                { status: 400 }
            );
        }

        const verificationData = verificationDoc.data();

        // Check if already verified
        if (verificationData?.verified) {
            // Set custom claim
            await adminAuth.setCustomUserClaims(uid, { emailVerified: true });
            return NextResponse.json({ success: true, alreadyVerified: true });
        }

        // Check if token matches
        if (verificationData?.token !== token) {
            return NextResponse.json(
                { error: 'Invalid verification link' },
                { status: 400 }
            );
        }

        // Check if expired
        if (verificationData?.expiresAt < Date.now()) {
            return NextResponse.json(
                { error: 'Token expired' },
                { status: 400 }
            );
        }

        // Mark as verified in Firestore
        await adminDb.collection('emailVerifications').doc(uid).update({
            verified: true,
            verifiedAt: Date.now(),
        });

        // Set custom claim for email verified
        await adminAuth.setCustomUserClaims(uid, { emailVerified: true });

        // Also update the user's email verified status in Firebase Auth
        try {
            await adminAuth.updateUser(uid, {
                emailVerified: true,
            });
        } catch (error) {
            console.error('[verify-email] Failed to update Firebase Auth emailVerified:', error);
            // Continue anyway since we set custom claim
        }

        console.log('[verify-email] Email verified successfully for user:', uid);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[verify-email] Error:', error);

        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request data', details: error.errors },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
