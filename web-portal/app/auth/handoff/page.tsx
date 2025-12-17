'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithCustomToken, signOut, onAuthStateChanged, type User } from 'firebase/auth';

export default function AuthHandoffPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Wait for Firebase auth to restore session from IndexedDB before processing
  useEffect(() => {
    console.log('[handoff] Waiting for auth state...');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('[handoff] Auth state changed:', user ? `User: ${user.uid} (${user.email})` : 'No user');
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Don't process until auth state is determined
    if (!authReady) return;

    console.log('[handoff] Auth ready, currentUser:', currentUser ? currentUser.uid : 'null');

    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnTo = params.get('returnTo') || '/dashboard';
    const expectedUid = params.get('uid');

    console.log('[handoff] Params - expectedUid:', expectedUid, 'returnTo:', returnTo);

    if (!code) {
      router.push('/sign-in?error=missing_code');
      return;
    }

    handleHandoff(code, returnTo, expectedUid, currentUser);
  }, [authReady, router, currentUser]);

  async function handleHandoff(code: string, returnTo: string, expectedUid: string | null, user: User | null) {
    try {
      setError(null);

      console.log('[handoff] handleHandoff called - user:', user?.uid, 'expectedUid:', expectedUid);

      // If user is already signed in with the correct UID, skip the handoff entirely
      if (user && expectedUid && user.uid === expectedUid) {
        console.log('[handoff] ✓ User already signed in with correct UID, skipping handoff');
        router.push(returnTo);
        return;
      }

      // Sign out only if there's a different user (session mismatch)
      if (user && user.uid !== expectedUid) {
        console.log('[handoff] ✗ Different user signed in, signing out:', user.email);
        await signOut(auth);
      } else {
        console.log('[handoff] No user signed in, proceeding with handoff');
      }

      // Exchange code for custom token
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api';
      console.log('[handoff] Exchanging code at:', apiBaseUrl);

      const response = await fetch(`${apiBaseUrl}/v1/auth/exchange-handoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });

      console.log('[handoff] Exchange response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[handoff] Exchange failed:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        throw new Error(errorData.message || 'Failed to authenticate');
      }

      const { token } = await response.json();
      console.log('[handoff] Got custom token, calling signInWithCustomToken...');

      // Sign in with custom token
      const userCredential = await signInWithCustomToken(auth, token);
      console.log('[handoff] ✓ Signed in successfully! User:', userCredential.user.uid);
      console.log('[handoff] Current auth.currentUser:', auth.currentUser?.uid);

      console.log('[handoff] Redirecting to:', returnTo);
      router.push(returnTo);

    } catch (err) {
      console.error('[handoff] ✗ Authentication failed:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');

      // Redirect to sign-in after delay
      setTimeout(() => {
        router.push('/sign-in?error=handoff_failed');
      }, 3000);
    }
  }



  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="max-w-md w-full bg-surface rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-error-light rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-text-primary mb-2">
            Authentication Failed
          </h1>
          <p className="text-text-secondary mb-4">
            {error}
          </p>
          <p className="text-sm text-text-muted">
            Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="max-w-md w-full bg-surface rounded-2xl shadow-lg p-8 text-center">
        {/* Loading spinner */}
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-brand-primary/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-brand-primary rounded-full border-t-transparent animate-spin"></div>
        </div>

        <h1 className="text-xl font-semibold text-text-primary mb-2">
          Signing you in...
        </h1>
        <p className="text-text-secondary">
          Please wait a moment
        </p>
      </div>
    </div>
  );
}
