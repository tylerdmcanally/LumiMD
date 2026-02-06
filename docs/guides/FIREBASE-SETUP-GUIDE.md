# 🔥 Firebase Setup Guide for LumiMD

This guide will help you set up Firebase from scratch for your LumiMD project.

## ✅ Cleanup Complete!

I've cleaned up the old Firebase configuration:
- ✅ Removed old project ID (`lumimd-57538`)
- ✅ Fixed absolute paths to relative paths
- ✅ Added emulator configuration for local development
- ✅ Ready for fresh Firebase setup

## 🚀 Step-by-Step Setup

### Step 1: Create Firebase Projects (10 minutes)

#### Create Development Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"** or **"Create a project"**
3. **Project name:** `lumimd-dev`
4. Click **Continue**
5. Disable Google Analytics (optional for dev)
6. Click **Create project**
7. Wait for it to finish (~30 seconds)

#### Create Production Project (Later)
Same steps but use name: `lumimd`

---

### Step 2: Enable Authentication (5 minutes)

In your `lumimd-dev` project:

1. **Left sidebar → Build → Authentication**
2. Click **"Get started"**
3. Click **"Sign-in method"** tab

#### Enable Email/Password:
1. Click **"Email/Password"**
2. Toggle **Enable** to ON
3. Click **Save**

#### Enable Google Sign-In:
1. Click **"Google"**
2. Toggle **Enable** to ON
3. **Project support email:** Your email
4. Click **Save**

---

### Step 3: Create Firestore Database (5 minutes)

1. **Left sidebar → Build → Firestore Database**
2. Click **"Create database"**
3. **Location:** Choose closest to you (e.g., `us-central` for US)
4. Click **Next**
5. **Security rules:** Select **"Start in test mode"**
   - Don't worry, we'll deploy secure rules later
6. Click **Create**
7. Wait for database creation (~1 minute)

---

### Step 4: Enable Firebase Storage (3 minutes)

1. **Left sidebar → Build → Storage**
2. Click **"Get started"**
3. **Security rules:** Select **"Start in test mode"**
4. Click **Next**
5. **Location:** Same as Firestore (should auto-select)
6. Click **Done**

---

### Step 5: Register iOS App (5 minutes)

1. **Left sidebar → Project Overview (⚙️ icon) → Project settings**
2. Scroll down to **"Your apps"**
3. Click iOS icon (📱)
4. **iOS bundle ID:** `com.lumimd.app` (or `com.lumimd.dev` for dev)
5. **App nickname:** `LumiMD Mobile Dev` (optional)
6. Click **Register app**
7. **Download GoogleService-Info.plist** (you'll need this later)
8. Click **Continue** → **Continue** → **Continue to console**

---

### Step 6: Get Your Firebase Credentials

#### For Mobile App (.env)

1. **Project Overview → ⚙️ icon → Project settings**
2. Scroll down to **"Your apps"** → Click your iOS app
3. Under **"SDK setup and configuration"** → Select **"Config"**
4. Copy these values:

```bash
# Copy to mobile/.env
EXPO_PUBLIC_FIREBASE_API_KEY=<apiKey>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<authDomain>
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=<storageBucket>
EXPO_PUBLIC_FIREBASE_SENDER_ID=<messagingSenderId>
EXPO_PUBLIC_FIREBASE_APP_ID=<appId>
```

#### For Web Portal (.env.local)

Same values as above:

```bash
# Copy to web-portal/.env.local
NEXT_PUBLIC_FIREBASE_API_KEY=<apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<authDomain>
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<projectId>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<storageBucket>
NEXT_PUBLIC_FIREBASE_SENDER_ID=<messagingSenderId>
NEXT_PUBLIC_FIREBASE_APP_ID=<appId>

NEXT_PUBLIC_API_BASE_URL=https://us-central1-<projectId>.cloudfunctions.net/api
```

---

### Step 7: Configure Firebase CLI (5 minutes)

#### Install Firebase CLI (if not already installed)
```bash
npm install -g firebase-tools
```

#### Login to Firebase
```bash
firebase login
```
This will open your browser - sign in with your Google account.

#### Select Your Project
```bash
cd /Users/tylermcanally/Desktop/LumiMD
firebase use lumimd-dev
```

#### Verify It Worked
```bash
firebase projects:list
```
You should see `lumimd-dev` marked as (current)

---

### Step 8: Deploy Security Rules (2 minutes)

Deploy the secure Firestore and Storage rules:

```bash
firebase deploy --only firestore:rules,storage:rules
```

✅ This deploys the rules from:
- `firebase-setup/firestore.rules`
- `firebase-setup/storage.rules`

These rules are from your Dev Guide (Section 15) and include:
- User authentication checks
- Owner-only access
- Caregiver sharing rules

---

### Step 9: Deploy Cloud Functions (5 minutes)

```bash
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

This deploys your auth handoff endpoints:
- `POST /v1/auth/create-handoff`
- `POST /v1/auth/exchange-handoff`

**Note:** First deployment takes 3-5 minutes.

---

### Step 10: Set Up Firestore TTL (2 minutes)

Follow the TTL setup guide to auto-delete expired auth handoff codes:

1. Go to **Firestore Database → Settings (gear icon)**
2. Scroll to **"Time-to-live (TTL)"**
3. Click **"+ Add TTL policy"**
4. **Collection:** `auth_handoffs`
5. **Timestamp field:** `expiresAt`
6. **Status:** Enabled
7. Click **Create**

See `/firebase-setup/TTL-SETUP.md` for details.

---

### Step 11: Update Mobile .env File

Now that you have your credentials, update the mobile app:

```bash
cd mobile
cp .env .env.backup  # Backup existing
nano .env  # Or use your preferred editor
```

Paste your Firebase credentials from Step 6.

**Also update:**
```bash
EXPO_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
EXPO_PUBLIC_WEB_PORTAL_URL=http://localhost:3000  # For now
```

Save and exit.

---

### Step 12: Test Everything (5 minutes)

#### Test Functions
```bash
curl https://us-central1-lumimd-dev.cloudfunctions.net/api/health
```

Should return: `{"status":"ok","timestamp":"..."}`

#### Test Mobile App
```bash
cd mobile
npm start
```

The app should start without Firebase warnings.

#### Test Emulators (Optional but Recommended)
```bash
firebase emulators:start
```

This starts local Firebase emulators for testing:
- **Firestore:** localhost:8080
- **Functions:** localhost:5001
- **Storage:** localhost:9199
- **UI:** localhost:4000

---

## ✅ Success Checklist

After completing all steps, you should have:

- [x] Firebase projects created (dev)
- [x] Authentication enabled (Email + Google)
- [x] Firestore database created
- [x] Firebase Storage enabled
- [x] iOS app registered
- [x] Credentials copied to .env files
- [x] Firebase CLI configured
- [x] Security rules deployed
- [x] Cloud Functions deployed
- [x] Firestore TTL configured
- [x] Mobile app running without errors

---

## 🎯 What's Next?

Now that Firebase is set up, you can:

1. **Implement Authentication** in mobile app
   - Replace `mobile/lib/auth.ts` with real Firebase auth
   - Create sign-in screens
   - Test auth flow

2. **Test Auth Handoff**
   - Sign in on mobile
   - Tap a glanceable card
   - Verify seamless web login works

3. **Wire Up Real Data**
   - Replace mock data with API calls
   - Add TanStack Query
   - Connect to your deployed functions

---

## 🐛 Troubleshooting

### "Project not found"
```bash
firebase use lumimd-dev
firebase projects:list
```
Make sure you selected the right project.

### "Permission denied" in Firestore
Check that you deployed the rules:
```bash
firebase deploy --only firestore:rules
```

### Functions won't deploy
```bash
cd functions
npm install
npm run build
# Fix any TypeScript errors, then:
firebase deploy --only functions
```

### Mobile app still shows placeholders
Make sure you:
1. Updated `mobile/.env` with real credentials
2. Restarted Expo: Press `Ctrl+C` then `npm start`

---

## 📚 Helpful Commands

```bash
# Switch between projects
firebase use lumimd-dev
firebase use lumimd

# Deploy everything
firebase deploy

# Deploy specific services
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only storage:rules

# Check logs
firebase functions:log

# Start emulators
firebase emulators:start

# List projects
firebase projects:list
```

---

## 🔐 Security Notes

### Don't Commit:
- ❌ `mobile/.env` (has API keys)
- ❌ `web-portal/.env.local` (has API keys)
- ❌ `.firebaserc` (if it has sensitive info)
- ❌ `functions/.env` (if you add function secrets)

### DO Commit:
- ✅ `mobile/.env.template` (example without real keys)
- ✅ `firebase.json` (config file)
- ✅ `firebase-setup/*.rules` (security rules)

### API Keys are Okay to Expose
Firebase API keys are safe to expose in mobile apps - they're designed for this. Security comes from:
- Firestore rules
- Firebase Auth
- Storage rules

---

## 🎉 You're All Set!

Firebase is now configured and ready. You can start building the auth flow and connecting your app to real data!

**Next:** See `APP-STORE-READINESS.md` for the full development roadmap.

---

**Questions?**
- Firebase Docs: https://firebase.google.com/docs
- LumiMD Codebase Reference: `../CODEBASE-REFERENCE.md`
- Security Rules: `../../firebase-setup/*.rules`

