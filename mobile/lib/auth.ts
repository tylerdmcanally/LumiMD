/**
 * Firebase Authentication helpers
 * Provides auth utilities and wrappers for Firebase Auth
 */

import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';

// Re-export User type
export type AuthUser = FirebaseAuthTypes.User;

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email: string, password: string) {
  try {
    const userCredential = await auth().signInWithEmailAndPassword(email, password);
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
    const userCredential = await auth().createUserWithEmailAndPassword(email, password);
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
    await auth().signOut();
    return { error: null };
  } catch (error: any) {
    console.error('[auth] Sign out error:', error);
    return { error: error.message };
  }
}

/**
 * Get current user
 */
export function getCurrentUser(): FirebaseAuthTypes.User | null {
  return auth().currentUser;
}

/**
 * Get ID token for API calls
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth().currentUser;
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
  return auth().currentUser !== null;
}

/**
 * Subscribe to auth state changes
 */
export function onAuthStateChange(callback: (user: FirebaseAuthTypes.User | null) => void) {
  return auth().onAuthStateChanged(callback);
}

/**
 * Check if the current user has a password (email/password) provider linked.
 */
export function hasPasswordProvider(): boolean {
  const user = auth().currentUser;
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === 'password');
}

/**
 * Link an email/password credential to the current user.
 * Allows Apple/Google-only users to set a password for web portal access.
 */
export async function linkEmailPassword(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const user = auth().currentUser;
  if (!user) return { error: 'Not signed in' };

  try {
    const credential = auth.EmailAuthProvider.credential(email, password);
    await user.linkWithCredential(credential);
    return { error: null };
  } catch (error: any) {
    console.error('[auth] Link email/password error:', error);

    if (error.code === 'auth/email-already-in-use') {
      return { error: 'This email is already associated with another account.' };
    }
    if (error.code === 'auth/weak-password') {
      return { error: 'Password is too weak. Please use at least 6 characters.' };
    }
    if (error.code === 'auth/provider-already-linked') {
      return { error: 'A password is already set for this account.' };
    }
    return { error: error.message || 'Failed to set password. Please try again.' };
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string) {
  try {
    await auth().sendPasswordResetEmail(email);
    return { error: null };
  } catch (error: any) {
    console.error('[auth] Password reset error:', error);
    return { error: error.message };
  }
}

