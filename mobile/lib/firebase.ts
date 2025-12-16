/**
 * Firebase initialization for React Native
 * Uses React Native Firebase (native SDK) exclusively
 */

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// Export pre-configured Firebase services from RNFB
// These are already initialized by the native modules
export { auth, firestore, storage };

// Convenience export for Firestore instance
export const db = firestore();

// Export types for convenience
export type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
export type { FirebaseAuthTypes } from '@react-native-firebase/auth';
export type { FirebaseStorageTypes } from '@react-native-firebase/storage';
