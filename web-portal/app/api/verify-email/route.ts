import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

// Lazy initialization to avoid build-time errors
let firebaseApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

function initializeFirebaseAdmin() {
    if (!firebaseApp && !getApps().length) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (!process.env.FIREBASE_PROJECT_ID) {
            throw new Error('FIREBASE_PROJECT_ID not configured');
        }
        firebaseApp = initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_PROJECT_ID.trim(),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL?.trim(),
                privateKey: privateKey?.includes('\\n')
                    ? privateKey.replace(/\\n/g, '\n')
                    : privateKey,
            }),
        });
    }
    return firebaseApp || getApps()[0];
}

function getAdminAuth(): Auth {
    if (!adminAuth) {
        initializeFirebaseAdmin();
        adminAuth = getAuth();
    }
    return adminAuth;
}

function getAdminDb(): Firestore {
    if (!adminDb) {
        initializeFirebaseAdmin();
        adminDb = getFirestore();
    }
    return adminDb;
}

const requestSchema = z.object({
    token: z.string(),
    uid: z.string(),
});

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token, uid } = requestSchema.parse(body);

        // Get verification record from Firestore
        const verificationDoc = await getAdminDb().collection('emailVerifications').doc(uid).get();

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
            await getAdminAuth().setCustomUserClaims(uid, { emailVerified: true });
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
        await getAdminDb().collection('emailVerifications').doc(uid).update({
            verified: true,
            verifiedAt: Date.now(),
        });

        // Set custom claim for email verified
        await getAdminAuth().setCustomUserClaims(uid, { emailVerified: true });

        // Also update the user's email verified status in Firebase Auth
        try {
            await getAdminAuth().updateUser(uid, {
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
                { error: 'Invalid request data', details: error.issues },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
