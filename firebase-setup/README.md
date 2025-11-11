# LumiMD - Medical Visit Recording & Navigation App

**Tech Stack:**
- **Frontend**: React Native + Expo (iOS/Android with design flexibility)
- **Backend**: Firebase (Auth, Firestore, Storage)
- **AI Workflows**: Make.com (AssemblyAI + OpenAI)
- **Design Import**: Anima/TeleportHQ (Figma → React Native code)

## Design System

### Colors
- **Primary Blue**: #1e40af (professional, trustworthy)
- **Sage Green**: #047857 (health, wellness)
- **Neutral Gray**: #6b7280 (text, borders)
- **Light Background**: #f9fafb (clean backgrounds)
- **Success**: #047857 (same as sage for consistency)
- **Warning**: #d97706 (amber for attention)
- **Error**: #dc2626 (muted red for errors)

### Icons (Professional - No Emojis)
- **Record**: Microphone icon (heroicon or material)
- **Home**: House icon
- **Action Items**: Clipboard/List icon
- **Visits**: Calendar/Document icon
- **Medications**: Pill/Bottle icon
- **Profile**: User/Person icon
- **Checkmark**: Check icon (for completed items)

---

# Firebase Setup for LumiMD

## Quick Start - Production Mode Setup

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a project" → Name it "LumiMD"
3. Enable Google Analytics (optional but recommended)

### Step 2: Enable Services
1. **Authentication**: Go to Authentication → Sign-in method → Enable Email/Password
2. **Firestore**: Go to Firestore Database → Create database → Start in **production mode**
3. **Storage**: Go to Storage → Get started → Start in **production mode**
4. **Functions**: Go to Functions → Get started (if needed later)

### Step 3: Apply Security Rules

#### Firestore Rules:
1. Go to Firestore Database → Rules
2. Replace the default rules with the contents of `firestore.rules`
3. Click "Publish"

#### Storage Rules:
1. Go to Storage → Rules
2. Replace the default rules with the contents of `storage.rules`
3. Click "Save"

### Step 4: Test Authentication
1. Go to Authentication → Users → Add user (for testing)
2. Use this for your first FlutterFlow login

## Data Structure Overview

```
Firestore Collections:
├── users/{userId}           # User profiles
├── visits/{visitId}         # Medical visit recordings
├── summaries/{summaryId}    # AI-generated summaries
├── todos/{todoId}           # Action items
└── caregivers/{caregiverId} # Sharing relationships
    └── patients/{patientId} # Read-only access grants

Storage Buckets:
├── audio/{userId}/          # Audio recordings
└── transcripts/{userId}/    # Text transcripts
```

## Security Features

✅ **Authentication Required** - No anonymous access
✅ **User Isolation** - Users only access their own data
✅ **Caregiver Sharing** - Controlled read-only access
✅ **HIPAA-Ready** - Audit trails and access controls

## Next Steps

1. Connect FlutterFlow to this Firebase project
2. Test with a sample user account
3. Start building your app screens

## Important Notes

- **Never use test mode** with medical data
- These rules allow authenticated users appropriate access
- Caregiver sharing requires additional setup in your app
- Monitor usage in Firebase Console as you scale
