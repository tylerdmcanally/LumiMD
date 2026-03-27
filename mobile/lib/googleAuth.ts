import { GoogleSignin } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import { cfg } from './config';

// Configure with the web client ID (required for Firebase credential exchange)
GoogleSignin.configure({
  webClientId: cfg.googleWebClientId,
  iosClientId: cfg.googleIosClientId || undefined,
});

/**
 * Sign in with Google using the native SDK and authenticate with Firebase.
 */
export async function signInWithGoogle() {
  try {
    // Check if Google Play Services are available (Android) / Sign-In is possible
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Native sign-in UI
    const response = await GoogleSignin.signIn();

    const idToken = response.data?.idToken;

    if (!idToken) {
      console.error('[googleAuth] No ID token returned from Google Sign-In');
      return { user: null, error: 'Failed to obtain Google credentials' };
    }

    // Create Firebase credential and sign in
    const credential = auth.GoogleAuthProvider.credential(idToken);
    const userCredential = await auth().signInWithCredential(credential);

    if (__DEV__) console.log('[googleAuth] Successfully signed in:', userCredential.user.email);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    // Handle cancellation silently
    if (error?.code === 'SIGN_IN_CANCELLED' || error?.code === '12501') {
      return { user: null, error: 'Sign in was cancelled' };
    }

    console.error('[googleAuth] Sign in error:', error);
    return { user: null, error: error?.message || 'Failed to sign in with Google' };
  }
}

/**
 * Sign out from Google (clears native session).
 */
export async function signOutFromGoogle() {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not critical — Firebase sign-out is the primary mechanism
  }
}

/**
 * Check if the user has an active Google session.
 */
export async function isSignedInToGoogle(): Promise<boolean> {
  return GoogleSignin.getCurrentUser() !== null;
}
