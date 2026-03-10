/**
 * Apple Sign-In via expo-apple-authentication + Firebase Auth.
 *
 * Uses the native Apple Sign-In flow on iOS. Returns a Firebase credential
 * which is then used to sign in with Firebase Auth.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import auth from '@react-native-firebase/auth';

/**
 * Sign in with Apple and authenticate with Firebase.
 */
export async function signInWithApple() {
  try {
    // Generate a nonce for security
    const rawNonce = generateNonce(32);
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!appleCredential.identityToken) {
      return { user: null, error: 'Failed to obtain Apple credentials' };
    }

    // Build Firebase credential from Apple's identity token
    const credential = auth.AppleAuthProvider.credential(
      appleCredential.identityToken,
      rawNonce,
    );

    const userCredential = await auth().signInWithCredential(credential);

    // Apple only returns the name on the first sign-in. If we got it,
    // update the Firebase user profile so it's available later.
    if (appleCredential.fullName) {
      const { givenName, familyName } = appleCredential.fullName;
      const displayName = [givenName, familyName].filter(Boolean).join(' ');
      if (displayName && !userCredential.user.displayName) {
        await userCredential.user.updateProfile({ displayName });
      }
    }

    console.log('[appleAuth] Successfully signed in:', userCredential.user.email);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    // User cancelled the sign-in
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return { user: null, error: 'Sign in was cancelled' };
    }

    console.error('[appleAuth] Sign in error:', error);
    return { user: null, error: error?.message || 'Failed to sign in with Apple' };
  }
}

/**
 * Check if Apple Sign-In is available on this device (iOS 13+).
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

/**
 * Generate a random nonce string.
 */
function generateNonce(length: number): string {
  const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
  const values = Crypto.getRandomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length];
  }
  return result;
}
