# LumiMD Codebase Reference

> **Purpose**: Single source of truth for AI agents and developers to understand how the codebase is structured and connected.

**Last Updated**: January 2026

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Technology Stack](#technology-stack)
4. [API Endpoints](#api-endpoints)
5. [Firebase Services](#firebase-services)
6. [Firestore Collections](#firestore-collections)
7. [Mobile App Structure](#mobile-app-structure)
8. [Web Portal Structure](#web-portal-structure)
9. [Key Services](#key-services)
10. [Environment Variables](#environment-variables)
11. [Data Flow](#data-flow)

---

## Project Overview

LumiMD is a personal health assistant that helps patients:
- **Record** medical appointments via audio
- **AI-summarize** visits with diagnoses, medications, and action items
- **Track medications** with smart reminders
- **Share** health records with caregivers

### Core Flow
```
Mobile App → Audio Recording → AssemblyAI (Transcription) → OpenAI (Summarization) 
    → Firestore (Storage) → Push Notifications → Mobile/Web Display
```

---

## Directory Structure

```
/
├── functions/           # Firebase Cloud Functions (Express API)
│   ├── src/
│   │   ├── routes/      # REST API endpoints
│   │   ├── services/    # Business logic
│   │   ├── triggers/    # Firestore triggers
│   │   ├── middlewares/ # Auth, rate limiting
│   │   └── utils/       # Helpers
│   └── .env             # Server-side secrets
│
├── mobile/              # Expo React Native App
│   ├── app/             # Screens (Expo Router)
│   ├── components/      # Reusable UI components
│   ├── lib/             # Utilities, API clients
│   ├── targets/         # Native extensions (Widgets)
│   └── .env             # Client-side config
│
├── web-portal/          # Next.js Web Application
│   ├── app/             # App Router pages
│   ├── components/      # React components
│   ├── lib/             # Utilities, Firebase
│   └── .env.local       # Client-side config
│
├── marketing-site/      # Vite static marketing site
├── firebase-setup/      # Firestore/Storage rules
├── packages/sdk/        # Shared TypeScript types
└── docs/                # Documentation
    ├── features/        # Deep dives (Widgets, etc.)
    ├── architecture/    # System robustness & roadmaps
    ├── guides/          # Setup & How-to
    └── reference/       # API & Schema reference
```

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Mobile** | Expo SDK 54, React Native, Expo Router |
| **Widgets** | Swift, SwiftUI, WidgetKit |
| **Web** | Next.js 15, React 19, Tailwind CSS |
| **Backend** | Firebase Cloud Functions (Node.js 20), Express |
| **Database** | Firestore (NoSQL) |
| **Storage** | Firebase Storage (audio files) |
| **Auth** | Firebase Auth (Email, Google Sign-In) |
| **AI** | OpenAI GPT-4o (summarization), AssemblyAI (transcription) |
| **Notifications** | Expo Push Notifications |

---

## API Endpoints

Base URL: `https://us-central1-lumimd-dev.cloudfunctions.net/api`

### Authentication (`/v1/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/verify-token` | Verify Firebase ID token |

### Visits (`/v1/visits`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List user's visits |
| GET | `/:id` | Get single visit |
| POST | `/` | Create new visit |
| PUT | `/:id` | Update visit |
| DELETE | `/:id` | Delete visit |
| POST | `/:id/upload` | Upload audio for processing |
| POST | `/:id/reprocess` | Re-run AI summarization |

### Actions (`/v1/actions`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List user's action items |
| GET | `/:id` | Get single action |
| PUT | `/:id` | Update action (complete, etc.) |
| DELETE | `/:id` | Delete action |

### Medications (`/v1/meds`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List user's medications |
| GET | `/:id` | Get single medication |
| POST | `/` | Create medication |
| PUT | `/:id` | Update medication |
| DELETE | `/:id` | Delete medication |
| POST | `/:id/safety-check` | Run AI safety check |

### Medication Reminders (`/v1/meds/reminders`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List user's reminders |
| POST | `/` | Create reminder |
| PUT | `/:id` | Update reminder times |
| DELETE | `/:id` | Delete reminder |

### Nudges (`/v1/nudges`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List pending nudges |
| POST | `/:id/respond` | Respond to nudge |
| POST | `/:id/snooze` | Snooze nudge |
| POST | `/:id/dismiss` | Dismiss nudge |

### Health Logs (`/v1/healthLogs`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List health log entries |
| POST | `/` | Create health log entry |

### Shares (`/v1/shares`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | List user's shares |
| POST | `/` | Create share invite |
| PUT | `/:id/accept` | Accept share invite |
| PUT | `/:id/revoke` | Revoke share |

### Users (`/v1/users`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me` | Get current user profile |
| PUT | `/me` | Update profile |
| POST | `/push-token` | Register push notification token |
| DELETE | `/push-token/:token` | Remove push token |

### Webhooks (`/v1/webhooks`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/assemblyai` | AssemblyAI transcription callback |
| POST | `/visit-processed` | Internal processing webhook |

---

## Firebase Services

### Cloud Functions

| Function | Type | Schedule | Description |
|----------|------|----------|-------------|
| `api` | HTTP | - | Main Express API |
| `processVisitAudio` | Trigger | - | Firestore trigger on visit creation |
| `checkPendingTranscriptions` | Trigger | - | Check for stuck transcriptions |
| `processNudgeNotifications` | Scheduled | Every 15 min | Send pending nudge notifications |
| `processMedicationReminders` | Scheduled | Every 5 min | Send medication reminders |
| `processConditionReminders` | Scheduled | Daily 9 AM | Create condition check-in nudges |

### Storage Buckets

| Path | Purpose |
|------|---------|
| `visits/{userId}/{visitId}/audio.webm` | Original audio recordings |
| `visits/{userId}/{visitId}/transcript.txt` | Transcription text |

---

## Firestore Collections

### `users/{userId}`
```typescript
{
  email: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  dateOfBirth?: string;
  allergies?: string[];
  medicalHistory?: string[];
  timezone?: string;  // e.g., "America/New_York"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```
**Subcollections**: `pushTokens/{tokenId}`

### `visits/{visitId}`
```typescript
{
  userId: string;
  title: string;
  date: Timestamp;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  transcript?: string;
  summary?: {
    chiefComplaint?: string;
    diagnoses?: string[];
    assessment?: string;
    plan?: string;
    medications?: {
      started: MedicationEntry[];
      stopped: MedicationEntry[];
      changed: MedicationEntry[];
    };
    actionItems?: ActionItem[];
  };
  processedAt?: Timestamp;
  createdAt: Timestamp;
}
```

### `medications/{medId}`
```typescript
{
  userId: string;
  name: string;
  nameLower: string;
  canonicalName: string;
  dose?: string;
  frequency?: string;
  active: boolean;
  source: 'visit' | 'manual';
  sourceVisitId?: string;
  startedAt?: Timestamp;
  stoppedAt?: Timestamp;
  medicationWarning?: SafetyWarning[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `medicationReminders/{reminderId}`
```typescript
{
  userId: string;
  medicationId: string;
  medicationName: string;
  medicationDose?: string;
  times: string[];  // ["08:00", "20:00"]
  enabled: boolean;
  lastSentAt?: Timestamp;
  createdAt: Timestamp;
}
```

### `actions/{actionId}`
```typescript
{
  userId: string;
  visitId: string;
  text: string;
  type: 'follow_up' | 'lab_order' | 'referral' | 'lifestyle' | 'other';
  priority: 'high' | 'medium' | 'low';
  dueDate?: Timestamp;
  completed: boolean;
  completedAt?: Timestamp;
  createdAt: Timestamp;
}
```

### `nudges/{nudgeId}`
```typescript
{
  userId: string;
  type: 'medication_checkin' | 'condition_tracking' | 'follow_up';
  medicationId?: string;
  medicationName?: string;
  status: 'pending' | 'active' | 'responded' | 'snoozed' | 'dismissed' | 'expired';
  message: string;
  response?: string;
  scheduledFor: Timestamp;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}
```

### `shares/{ownerId_caregiverId}`
```typescript
{
  ownerId: string;
  caregiverUserId: string;
  caregiverEmail: string;
  status: 'pending' | 'accepted' | 'revoked';
  role: 'viewer';
  createdAt: Timestamp;
  acceptedAt?: Timestamp;
}
```

### `healthLogs/{logId}`
```typescript
{
  userId: string;
  type: 'symptom' | 'vitals' | 'mood' | 'custom';
  data: Record<string, any>;
  source: 'manual' | 'nudge';
  nudgeId?: string;
  createdAt: Timestamp;
}
```

---

## Mobile App Structure

### Screens (Expo Router)

| File | Route | Description |
|------|-------|-------------|
| `app/index.tsx` | `/` | Dashboard / Home |
| `app/visits.tsx` | `/visits` | Visit list |
| `app/visit-detail.tsx` | `/visit-detail?id=` | Visit details |
| `app/record-visit.tsx` | `/record-visit` | Audio recording |
| `app/medications.tsx` | `/medications` | Medication list |
| `app/medication-schedule.tsx` | `/medication-schedule` | Reminder settings |
| `app/actions.tsx` | `/actions` | Action items |
| `app/settings.tsx` | `/settings` | User settings |
| `app/caregiver-sharing.tsx` | `/caregiver-sharing` | Share management |
| `app/sign-in.tsx` | `/sign-in` | Login |
| `app/sign-up.tsx` | `/sign-up` | Registration |

### Key Components

| Component | Purpose |
|-----------|---------|
| `components/lumibot/` | AI chat interface (11 files) |
| `components/onboarding/` | First-run experience (5 files) |
| `MedicationWarningBanner.tsx` | Drug interaction alerts |
| `ReminderTimePickerModal.tsx` | Medication timing UI |
| `HealthLogButton.tsx` | Quick health logging |

### Widgets (`mobile/targets/widget`)

Widgets are native iOS extensions enabling Home Screen functionality.

| File | Purpose |
|------|---------|
| `widgets.swift` | Swift UI code for views and entries |
| `expo-target.config.js` | Configures the widget target and App Groups |

See [Widget Documentation](../features/WIDGETS.md) for build and sync details.

---

## Web Portal Structure

### Routes (Next.js App Router)

| Path | Description |
|------|-------------|
| `/` | Dashboard |
| `/visits` | Visit list |
| `/visits/[id]` | Visit detail |
| `/medications` | Medication management |
| `/actions` | Action items |
| `/settings` | Account settings |
| `/shared` | Caregiver view (read-only) |

### Key Components

| Directory | Purpose |
|-----------|---------|
| `components/visits/` | Visit display (7 files) |
| `components/medications/` | Med management (4 files) |
| `components/layout/` | Navigation, headers (7 files) |
| `components/ui/` | Shadcn UI primitives (16 files) |

---

## Key Services

### AI Services (`functions/src/services/`)

| Service | Purpose |
|---------|---------|
| `openai.ts` | GPT-4o summarization, structured extraction |
| `assemblyai.ts` | Audio transcription |
| `lumibotAI.ts` | Conversational AI responses |
| `lumibotAnalyzer.ts` | Medical context analysis |
| `intelligentNudgeGenerator.ts` | AI-powered health nudges |
| `medicationSafetyAI.ts` | Drug interaction AI checks |

### Core Services

| Service | Purpose |
|---------|---------|
| `medicationSync.ts` | Sync meds from visit summaries |
| `medicationSafety.ts` | Hardcoded drug interaction rules |
| `medicationReminderService.ts` | Process scheduled reminders |
| `nudgeNotificationService.ts` | Process scheduled nudges |
| `conditionReminderService.ts` | Daily condition check-ins |
| `notifications.ts` | Expo push notification sending |
| `visitProcessor.ts` | Visit audio processing pipeline |
| `patientContextAggregator.ts` | Aggregate patient history for AI |
| `pdfGenerator.ts` | Generate visit summary PDFs |

---

## Environment Variables

### Mobile (`.env`)
```bash
EXPO_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
EXPO_PUBLIC_WEB_PORTAL_URL=https://lumimd.app

# Firebase Config
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# Google Sign-In
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=

# Monitoring
EXPO_PUBLIC_SENTRY_DSN=
```

### Functions (`.env`)
```bash
# AI Services
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
ASSEMBLYAI_API_KEY=

# Email
RESEND_API_KEY=

# Webhooks
VISIT_PROCESSING_WEBHOOK_SECRET=

# Monitoring
SENTRY_DSN=

# CORS
ALLOWED_ORIGINS=https://lumimd.app,https://portal.lumimd.app
```

### Web Portal (`.env.local`)
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=

NEXT_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api

# Email (server-side)
RESEND_API_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

---

## Data Flow

### Visit Recording Flow
```
1. User taps "Record" in mobile app
2. Audio captured via expo-av
3. Audio uploaded to Firebase Storage
4. Visit document created in Firestore (status: 'pending')
5. processVisitAudio trigger fires
6. Audio sent to AssemblyAI for transcription
7. AssemblyAI webhook calls /v1/webhooks/assemblyai with transcript
8. Transcript sent to OpenAI for summarization
9. Summary extracted: diagnoses, medications, actions
10. Medications synced to /medications collection
11. Actions synced to /actions collection
12. Visit updated (status: 'completed')
13. Push notification sent to user
```

### Medication Reminder Flow
```
1. processMedicationReminders runs every 5 minutes
2. Queries /medicationReminders where enabled=true
3. For each reminder, fetches user's timezone
4. Checks if current time in user's timezone matches reminder times (±7 min window)
5. If match and not recently sent, sends Expo push notification
6. Updates lastSentAt timestamp
```

### Caregiver Sharing Flow
```
1. Owner creates share via POST /v1/shares
2. Share document created with status: 'pending' (Viewer)
3. Email sent to caregiver with invite link
4. Caregiver accepts via PUT /v1/shares/:id/accept
5. Firestore rules now allow caregiver to read owner's data
6. Caregiver sees read-only view in web portal
```

---

*This document is the canonical reference for LumiMD codebase structure.*
