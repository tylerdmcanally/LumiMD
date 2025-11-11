/**
 * Firebase Authentication helpers
 * Provides auth utilities and wrappers for Firebase Auth
 */

import { auth as firebaseAuth } from './firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  User,
  onAuthStateChanged
} from 'firebase/auth';

// Re-export Firebase auth for direct use
export { firebaseAuth as auth };

// Re-export User type
export type AuthUser = User;

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    console.error('[auth] Sign in error:', error);
    return { user: null, error: error.message };
  }
}

/**
 * Create new account with email and password
 */
export async function signUpWithEmail(email: string, password: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    console.error('[auth] Sign up error:', error);
    return { user: null, error: error.message };
  }
}

/**
 * Sign out current user
 */
export async function signOut() {
  try {
    await firebaseSignOut(firebaseAuth);
    return { error: null };
  } catch (error: any) {
    console.error('[auth] Sign out error:', error);
    return { error: error.message };
  }
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  return firebaseAuth.currentUser;
}

/**
 * Get ID token for API calls
 */
export async function getIdToken(): Promise<string | null> {
  const user = firebaseAuth.currentUser;
  if (!user) return null;
  
  try {
    return await user.getIdToken();
  } catch (error) {
    console.error('[auth] Failed to get ID token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return firebaseAuth.currentUser !== null;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(firebaseAuth, callback);
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string) {
  try {
    await sendPasswordResetEmail(firebaseAuth, email);
    return { error: null };
  } catch (error: any) {
    console.error('[auth] Password reset error:', error);
    return { error: error.message };
  }
}

