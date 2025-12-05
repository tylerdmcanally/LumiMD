/**
 * Firebase initialization and configuration
 * Initialized once and exported for use throughout the app
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import * as Firestore from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { configureFirestoreRealtime } from '@lumimd/sdk';
import { cfg } from './config';

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(cfg.firebase) : getApp();

// Export Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

configureFirestoreRealtime(Firestore);

export default app;


