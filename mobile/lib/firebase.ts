/**
 * Firebase initialization and configuration
 * Using @react-native-firebase native SDK
 */

import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// Native Firebase initializes automatically from GoogleService-Info.plist (iOS)
// and google-services.json (Android) during app launch.
// No explicit initializeApp call is needed here.

let cachedApp: ReturnType<typeof firebase.app> | null = null;

export function getFirebaseApp() {
  if (cachedApp) return cachedApp;

  try {
    cachedApp = firebase.app();
    return cachedApp;
  } catch (error) {
    console.error(
      '[firebase] Failed to access default app. Ensure GoogleService-Info.plist / google-services.json are bundled.',
      error
    );
    throw error;
  }
}

// Lazily access services to avoid crashing if initialization is misconfigured.
export const authInstance = () => auth();
export const dbInstance = () => firestore();
export const storageInstance = () => storage();

export default getFirebaseApp;
