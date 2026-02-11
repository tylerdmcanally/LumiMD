/**
 * Application configuration
 * Environment variables from .env
 */

export const cfg = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5001',
  webPortalUrl: process.env.EXPO_PUBLIC_WEB_PORTAL_URL || 'https://lumimd.app',
  
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId:
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID!,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
  },
  
  // Google Sign-In credentials
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
  
  // Feature flags
  flags: {
    sharing: true,
    // Health metrics/logs UI is currently out of scope (HealthKit removed).
    // If reintroduced, flip via build-time env var.
    health: process.env.EXPO_PUBLIC_HEALTH_ENABLED === 'true',
    meds: true,
    push: true,
    mock: false,
  },
} as const;

// Validate required config
function validateConfig() {
  const required = [
    'apiBaseUrl',
    'firebase.apiKey',
    'firebase.projectId',
    'firebase.messagingSenderId',
  ];
  
  const missing = required.filter(key => {
    const value = key.split('.').reduce((obj: any, k) => obj?.[k], cfg);
    return !value;
  });
  
  if (missing.length > 0) {
    console.warn('Missing required config:', missing);
  }
}

validateConfig();
