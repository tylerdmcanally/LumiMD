# 🔐 Google Sign-In Setup Guide for LumiMD

This guide walks you through setting up Google Sign-In authentication for the LumiMD mobile app.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Get Web Client ID from Firebase](#step-1-get-web-client-id-from-firebase)
4. [Step 2: Configure iOS App](#step-2-configure-ios-app)
5. [Step 3: Update Environment Variables](#step-3-update-environment-variables)
6. [Step 4: Build and Test](#step-4-build-and-test)
7. [Troubleshooting](#troubleshooting)
8. [How It Works](#how-it-works)

---

## 📖 Overview

Google Sign-In provides a seamless authentication experience for users. This implementation:
- Uses native Google Sign-In on iOS
- Integrates with Firebase Authentication
- Shares session across mobile and web
- Requires a **custom development build** (not compatible with Expo Go)

**⚠️ Important**: Google Sign-In requires a custom Expo development build. You cannot test this in Expo Go.

---

## ✅ Prerequisites

Before you begin, ensure you have:
- [x] Firebase project set up (`lumimd-dev`)
- [x] Google Sign-In enabled in Firebase Console
- [x] iOS app registered in Firebase
- [x] Xcode installed (for iOS development)
- [x] EAS CLI installed (`npm install -g eas-cli`)

---

## 🔑 Step 1: Get Web Client ID from Firebase

### 1.1 Navigate to Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `lumimd-dev`
3. Click **⚙️ Settings** → **Project settings**

### 1.2 Get OAuth Client ID
1. Scroll down to **"Your apps"**
2. Find your **iOS app** section
3. Look for **"GoogleService-Info.plist"** download button
4. **Important**: We need the **Web Client ID**, not the iOS client ID

### 1.3 Find the Web Client ID
**Option A: From Firebase Authentication**
1. Go to **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Expand the **"Web SDK configuration"** section
4. Copy the **Web client ID**
   - Format: `XXXXXXXX-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com`

**Option B: From Google Cloud Console**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Navigate to **APIs & Services** → **Credentials**
4. Find the **"Web client (auto created by Google Service)"**
5. Copy the **Client ID**

### 1.4 Verify You Have the Right Client ID
✅ Correct (Web Client ID):
```
1234567890-abc123def456ghi789jkl012mno345pq.apps.googleusercontent.com
```

❌ Wrong (iOS Client ID):
```
1234567890-xyz987uvw654rst321opq098lmn765ed.apps.googleusercontent.com
```

**Pro Tip**: The web client ID typically ends with `.apps.googleusercontent.com` and is labeled as "Web client" in Google Cloud Console.

---

## 📱 Step 2: Configure iOS App

### 2.1 Update app.json
Add Google Sign-In configuration to your `mobile/app.json`:

```json
{
  "expo": {
    "name": "LumiMD",
    "slug": "lumimd",
    "ios": {
      "bundleIdentifier": "com.lumimd.dev",
      "googleServicesFile": "./GoogleService-Info.plist",
      "config": {
        "googleSignIn": {
          "reservedClientId": "com.googleusercontent.apps.YOUR_REVERSED_CLIENT_ID"
        }
      }
    },
    "plugins": [
      "@react-native-google-signin/google-signin"
    ]
  }
}
```

### 2.2 Get the Reversed Client ID
1. Open your `GoogleService-Info.plist` file (in the mobile directory)
2. Find the `REVERSED_CLIENT_ID` key
3. Copy its value (format: `com.googleusercontent.apps.XXXXXXXX-xxxxx`)
4. Replace `YOUR_REVERSED_CLIENT_ID` in the app.json above

**Example**:
```xml
<key>REVERSED_CLIENT_ID</key>
<string>com.googleusercontent.apps.1234567890-abc123def456</string>
```

### 2.3 Verify GoogleService-Info.plist Location
Ensure `GoogleService-Info.plist` is in the correct location:
```
/Users/tylermcanally/Desktop/LumiMD/mobile/GoogleService-Info.plist
```

If it's in the root directory, move it to the `mobile/` directory:
```bash
cd /Users/tylermcanally/Desktop/LumiMD
mv GoogleService-Info.plist mobile/
```

---

## ⚙️ Step 3: Update Environment Variables

### 3.1 Update mobile/.env
Add the Google Web Client ID to your `.env` file:

```bash
# Existing Firebase config
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyDfwy_6f9a79S3gfLdtdUSMG0S1sf6osxk
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=lumimd-dev.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=lumimd-dev
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=lumimd-dev.firebasestorage.app
EXPO_PUBLIC_FIREBASE_SENDER_ID=355816267177
EXPO_PUBLIC_FIREBASE_APP_ID=1:355816267177:web:7a01d39f0d6a8cc3a178b8

# API URLs
EXPO_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
EXPO_PUBLIC_WEB_PORTAL_URL=http://localhost:3000

# 🆕 ADD THIS - Google Sign-In Web Client ID
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=PASTE_YOUR_WEB_CLIENT_ID_HERE

# 🆕 ADD THIS - Google Sign-In iOS Client ID (optional, for reference)
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=PASTE_YOUR_IOS_CLIENT_ID_HERE
```

### 3.2 Replace Placeholder Values
Replace `PASTE_YOUR_WEB_CLIENT_ID_HERE` with the actual Web Client ID from Step 1.

**Example**:
```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=1234567890-abc123def456ghi789jkl012mno345pq.apps.googleusercontent.com
```

---

## 🏗️ Step 4: Build and Test

### 4.1 Create a Development Build

**Important**: Google Sign-In requires a custom development build. Expo Go will not work.

```bash
cd /Users/tylermcanally/Desktop/LumiMD/mobile

# Login to EAS (if not already)
eas login

# Configure EAS build
eas build:configure

# Create iOS development build
eas build --profile development --platform ios
```

This will:
1. Bundle your app with Google Sign-In native module
2. Create an installable `.app` file
3. Take ~10-15 minutes

### 4.2 Install on Simulator

After the build completes:

```bash
# Download and install the build
eas build:run -p ios
```

Or manually:
1. Download the `.tar.gz` file from EAS
2. Extract it
3. Drag the `.app` file to your iOS Simulator

### 4.3 Test Google Sign-In Flow

1. Open the app in simulator
2. Navigate to sign-in screen
3. Tap **"Continue with Google"**
4. Select a Google account
5. Verify successful sign-in
6. Check Firebase Console → Authentication → Users (should see the new user)

---

## 🐛 Troubleshooting

### Problem: "DEVELOPER_ERROR" when tapping Google button

**Cause**: Incorrect Web Client ID or not configured properly.

**Solution**:
1. Double-check your `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env`
2. Ensure it's the **Web Client ID**, not iOS Client ID
3. Rebuild your app: `eas build --profile development --platform ios`
4. Reinstall the app

### Problem: "Sign in was cancelled" immediately

**Cause**: Google Sign-In not properly configured in `app.json` or `REVERSED_CLIENT_ID` is wrong.

**Solution**:
1. Check `app.json` has the correct `reservedClientId`
2. Verify it matches the `REVERSED_CLIENT_ID` from `GoogleService-Info.plist`
3. Rebuild the app

### Problem: "No ID token received from Google"

**Cause**: User cancelled or authentication flow failed.

**Solution**:
1. Try signing in again
2. Check Firebase Console for any restrictions on the Google provider
3. Ensure Google Sign-In is enabled in Firebase Console

### Problem: Works in production but not development

**Cause**: Different OAuth clients for development vs production.

**Solution**:
- Use the same Web Client ID for both environments
- Or create separate Firebase projects for dev/prod

### Problem: "PLAY_SERVICES_NOT_AVAILABLE" (Android only)

**Cause**: Google Play Services not installed on emulator.

**Solution**:
- Use a device/emulator with Google Play Services
- Or use a different sign-in method for testing

---

## 🧠 How It Works

### Architecture Overview

```
User taps "Continue with Google"
    ↓
Native Google Sign-In flow opens
    ↓
User selects account & grants permission
    ↓
Google returns ID Token
    ↓
App sends ID Token to Firebase Auth
    ↓
Firebase creates/signs in user
    ↓
User session established
    ↓
App navigates to home screen
```

### Code Flow

1. **Initialization** (`mobile/app/_layout.tsx`)
   - Configures Google Sign-In with Web Client ID on app startup

2. **User Triggers Sign-In** (`mobile/app/sign-in.tsx`)
   - User taps "Continue with Google" button
   - Calls `signInWithGoogle()` from AuthContext

3. **Google Sign-In** (`mobile/lib/googleAuth.ts`)
   - Opens native Google Sign-In flow
   - User selects account
   - Returns ID token

4. **Firebase Authentication** (`mobile/lib/googleAuth.ts`)
   - Creates Firebase credential with Google ID token
   - Signs in to Firebase using credential
   - Returns authenticated user

5. **Session Management** (`mobile/contexts/AuthContext.tsx`)
   - Stores user in React context
   - Persists session via Firebase Auth
   - Updates UI to show authenticated state

---

## 📚 Additional Resources

### Firebase Documentation
- [Google Sign-In for iOS](https://firebase.google.com/docs/auth/ios/google-signin)
- [Firebase Authentication](https://firebase.google.com/docs/auth)

### Expo Documentation
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [Configuration with app.json](https://docs.expo.dev/versions/latest/config/app/)

### React Native Google Sign-In
- [Package Documentation](https://react-native-google-signin.github.io/docs/)
- [iOS Setup Guide](https://react-native-google-signin.github.io/docs/setting-up/ios)

---

## ✅ Checklist

Before you deploy to production, ensure:

- [ ] Web Client ID is correct and added to `.env`
- [ ] `REVERSED_CLIENT_ID` matches `GoogleService-Info.plist`
- [ ] `app.json` is properly configured
- [ ] Custom development build created and tested
- [ ] Google Sign-In works on physical iOS device
- [ ] User appears in Firebase Console after sign-in
- [ ] Sign-out works correctly
- [ ] Error handling is graceful
- [ ] Loading states are clear

---

## 🔒 Security Notes

### Safe to Expose
- ✅ Web Client ID (designed to be public)
- ✅ iOS Client ID (designed to be public)
- ✅ Firebase API keys (protected by Firebase rules)

### Keep Private
- ❌ OAuth Client Secret (if you have one)
- ❌ Firebase Admin SDK keys
- ❌ Service account credentials

### Best Practices
1. Use different Firebase projects for dev/staging/prod
2. Implement proper Firestore security rules
3. Monitor authentication logs in Firebase Console
4. Implement rate limiting for auth endpoints
5. Add analytics to track sign-in success/failure rates

---

## 🎉 You're Done!

Google Sign-In is now fully integrated! Users can:
- Sign in with their Google account
- Skip manual email/password entry
- Enjoy a seamless, modern auth experience

**Next Steps**:
- Test on a physical iOS device
- Implement analytics for auth flow
- Add "Sign in with Apple" (required for App Store)
- Build the web portal with auth handoff

---

**Questions or Issues?**
- Check Firebase Console logs
- Review Google Cloud Console credentials
- Consult the troubleshooting section above
- Refer to `FIREBASE-SETUP-GUIDE.md` for Firebase basics

**Happy Coding! 🚀**

