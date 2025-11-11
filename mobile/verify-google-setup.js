#!/usr/bin/env node
/**
 * Verification script for Google Sign-In setup
 * Run: node verify-google-setup.js
 */

require('dotenv').config();

console.log('\n🔍 Verifying Google Sign-In Configuration...\n');

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

let hasErrors = false;

// Check Web Client ID
if (!webClientId) {
  console.log('❌ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing');
  hasErrors = true;
} else if (!webClientId.includes('apps.googleusercontent.com')) {
  console.log('⚠️  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID format looks incorrect');
  console.log(`   Current value: ${webClientId}`);
  hasErrors = true;
} else {
  console.log('✅ EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is set correctly');
  console.log(`   Value: ${webClientId.substring(0, 30)}...`);
}

// Check Firebase config
if (!apiKey) {
  console.log('❌ EXPO_PUBLIC_FIREBASE_API_KEY is missing');
  hasErrors = true;
} else {
  console.log('✅ Firebase API Key is set');
}

if (!projectId) {
  console.log('❌ EXPO_PUBLIC_FIREBASE_PROJECT_ID is missing');
  hasErrors = true;
} else {
  console.log('✅ Firebase Project ID is set:', projectId);
}

console.log('\n' + '='.repeat(60) + '\n');

if (hasErrors) {
  console.log('❌ Configuration has errors. Please fix them before building.\n');
  console.log('📚 See: GOOGLE-SIGNIN-QUICKSTART.md for help\n');
  process.exit(1);
} else {
  console.log('🎉 Configuration looks good!\n');
  console.log('Next steps:');
  console.log('  1. Create development build: eas build --profile development --platform ios');
  console.log('  2. Install on simulator: eas build:run -p ios');
  console.log('  3. Test Google Sign-In!\n');
  process.exit(0);
}

