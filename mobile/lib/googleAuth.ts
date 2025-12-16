import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import auth from '@react-native-firebase/auth';
import { cfg } from './config';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const scopes = ['openid', 'profile', 'email'];
// Dev client/TestFlight builds should use the native redirect scheme (no Expo proxy)
const useProxy = false;

/**
 * Sign in with Google via web OAuth and authenticate with Firebase.
 */
export async function signInWithGoogle() {
  if (!cfg.googleWebClientId) {
    console.warn('[googleAuth] Missing Google Web Client ID configuration');
    return { user: null, error: 'Google Sign-In is not configured' };
  }

  try {
    const redirectUri = AuthSession.makeRedirectUri({ scheme: 'lumimd' });

    const request = await AuthSession.loadAsync(
      {
        clientId: cfg.googleWebClientId,
        redirectUri,
        responseType: AuthSession.ResponseType.IdToken,
        scopes,
        usePKCE: false,
        extraParams: {
          prompt: 'select_account',
        },
      },
      discovery
    );

    const result = await request.promptAsync(discovery, { useProxy } as any);

    if (result.type !== 'success') {
      if (result.type === 'dismiss' || result.type === 'cancel') {
        return { user: null, error: 'Sign in was cancelled' };
      }
      return { user: null, error: 'Google Sign-In was interrupted' };
    }

    const idToken = result.params?.id_token;

    if (!idToken) {
      console.error('[googleAuth] No ID token returned from Google', result);
      return { user: null, error: 'Failed to obtain Google credentials' };
    }

    const credential = auth.GoogleAuthProvider.credential(idToken);
    const userCredential = await auth().signInWithCredential(credential);

    console.log('[googleAuth] Successfully signed in:', userCredential.user.email);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    console.error('[googleAuth] Sign in error:', error);
    return { user: null, error: error?.message || 'Failed to sign in with Google' };
  }
}

/**
 * No-op sign out helper (Firebase handles session).
 */
export async function signOutFromGoogle() {
  // Web-based OAuth doesn't maintain native session; Firebase sign-out is sufficient.
  console.log('[googleAuth] Web OAuth flow does not require explicit Google sign-out.');
}

/**
 * Indicates web OAuth does not manage a persistent Google session.
 */
export async function isSignedInToGoogle(): Promise<boolean> {
  return false;
}
