# LumiMD Technical Overview

> **For:** Non-engineer founders and stakeholders  
> **Purpose:** Understand how LumiMD works under the hood  
> **Last Updated:** January 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Folder Structure Explained](#2-folder-structure-explained)
3. [Data Model](#3-data-model)
4. [API Reference](#4-api-reference)
5. [Authentication & Authorization Flow](#5-authentication--authorization-flow)
6. [Key User Flows](#6-key-user-flows)
7. [Third-Party Integrations](#7-third-party-integrations)
8. [Environment & Configuration](#8-environment--configuration)
9. [Dependencies Deep Dive](#9-dependencies-deep-dive)
10. [Known Technical Debt & Improvement Opportunities](#10-known-technical-debt--improvement-opportunities)
11. [Glossary](#11-glossary)

---

## 1. Architecture Overview

### Tech Stack

| Layer | Technology | What It Does |
|-------|------------|--------------|
| **Mobile App** | Expo + React Native | iOS app users interact with |
| **Web Portal** | Next.js 15 + React | Browser-based dashboard for caregivers |
| **Backend API** | Firebase Cloud Functions + Express | Handles all business logic |
| **Database** | Firestore (NoSQL) | Stores all user data |
| **File Storage** | Firebase Storage | Stores audio recordings |
| **Authentication** | Firebase Auth | Handles login/signup |
| **AI - Transcription** | AssemblyAI | Converts speech to text |
| **AI - Summarization** | OpenAI GPT-4o | Extracts diagnoses, medications, action items |
| **Notifications** | Expo Push | Sends medication reminders and nudges |
| **Email** | Resend | Sends verification and caregiver invite emails |

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER DEVICES                                    │
├─────────────────────────────────┬───────────────────────────────────────────┤
│      📱 Mobile App (Expo)       │       💻 Web Portal (Next.js)             │
│      - Record visits            │       - View visit summaries               │
│      - View medications         │       - Manage medications                 │
│      - Get reminders            │       - Caregiver dashboard                │
└───────────────┬─────────────────┴───────────────────┬───────────────────────┘
                │                                     │
                │         HTTPS + Firebase Auth       │
                ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     🔥 FIREBASE CLOUD FUNCTIONS (Express API)                │
│   /v1/visits  /v1/meds  /v1/users  /v1/nudges  /v1/shares  /v1/webhooks     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Middlewares: Auth → Rate Limiting → CORS → Helmet Security Headers         │
└───────────────┬─────────────────────────────────────┬───────────────────────┘
                │                                     │
    ┌───────────┼─────────────────────────────────────┼───────────┐
    │           │                                     │           │
    ▼           ▼                                     ▼           ▼
┌───────┐  ┌─────────────┐                    ┌───────────┐  ┌─────────────┐
│🗄️     │  │📦 Firebase  │                    │🤖 OpenAI  │  │🎙️ AssemblyAI│
│Firestore│  │  Storage   │                    │  GPT-4o   │  │Transcription│
│Database │  │  (Audio)   │                    │ (Summary) │  │  (Speech)   │
└───────┘  └─────────────┘                    └───────────┘  └─────────────┘

                    ┌─────────────────────────────────┐
                    │     ⏰ SCHEDULED FUNCTIONS       │
                    │  • Medication reminders (5 min) │
                    │  • Nudge notifications (15 min) │
                    │  • Stale visit cleanup (hourly) │
                    └─────────────────────────────────┘
```

### Architectural Pattern

LumiMD follows a **3-Tier Architecture**:

1. **Presentation Layer**: Mobile app + web portal (UI only)
2. **Application Layer**: Firebase Cloud Functions (business logic)
3. **Data Layer**: Firestore + Firebase Storage

This is a **serverless monolith** - all backend code runs in one Cloud Function but is organized into routes and services. This keeps costs low and deployment simple while maintaining clear code organization.

---

## 2. Folder Structure Explained

### Top-Level Folders

```
LumiMD/Codebase/
├── functions/       # 🔧 Backend API (Express + Firebase Functions)
├── mobile/          # 📱 iOS/Android app (Expo + React Native)
├── web-portal/      # 💻 Web dashboard (Next.js)
├── firebase-setup/  # 🔒 Security rules for database/storage
├── marketing-site/  # 🌐 Static landing page
├── packages/        # 📦 Shared TypeScript types
├── docs/            # 📚 Documentation (you're reading from here!)
├── scripts/         # 🛠️ Build and deploy scripts
└── ios/             # 🍎 Native iOS code (generated by Expo)
```

### Most Important Files

| File | Purpose |
|------|---------|
| `functions/src/index.ts` | Main entry point - sets up Express app, middlewares, routes |
| `functions/src/routes/visits.ts` | API endpoints for recording and viewing visits |
| `functions/src/services/openai.ts` | AI summarization logic |
| `functions/src/services/assemblyai.ts` | Audio transcription |
| `mobile/app/record-visit.tsx` | Recording screen users interact with |
| `mobile/app/index.tsx` | Home dashboard |
| `web-portal/app/(protected)/visits/page.tsx` | Web visit list |
| `firebase-setup/firestore.rules` | Database security rules |
| `firebase-setup/storage.rules` | File storage security rules |

### Naming Conventions

| Convention | Example | Meaning |
|------------|---------|---------|
| `camelCase` files | `medicationSync.ts` | Service/utility files |
| `kebab-case` routes | `visit-detail.tsx` | Screen/page files |
| `SCREAMING_SNAKE` | `CODEBASE-REFERENCE.md` | Documentation files |
| `*.router.ts` pattern | Not used - routers are just `visits.ts`, `users.ts` | API route files |

---

## 3. Data Model

### Collections Overview

LumiMD uses **Firestore**, a NoSQL document database. Data is organized into **collections** (like tables) containing **documents** (like rows).

```
┌─────────────────────────────────────────────────────────────────┐
│                     FIRESTORE DATABASE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  users/{userId}                                                 │
│    ├── pushTokens/{tokenId}        (for notifications)         │
│    └── (profile, allergies, timezone...)                        │
│                                                                 │
│  visits/{visitId}                                               │
│    └── (audio, transcript, summary, medications, actions)       │
│                                                                 │
│  medications/{medId}                                            │
│    └── (name, dose, frequency, warnings, reminders)             │
│                                                                 │
│  medicationReminders/{reminderId}                               │
│    └── (times, enabled, last sent)                              │
│                                                                 │
│  actions/{actionId}                                             │
│    └── (follow-ups, labs, referrals from visits)                │
│                                                                 │
│  nudges/{nudgeId}                                               │
│    └── (AI health check-ins, scheduled prompts)                 │
│                                                                 │
│  healthLogs/{logId}                                             │
│    └── (BP, glucose, symptoms logged by user)                   │
│                                                                 │
│  shares/{ownerId_caregiverId}                                   │
│    └── (caregiver access permissions)                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Entity Relationship Diagram

```
                    ┌──────────────┐
                    │    USERS     │
                    │──────────────│
                    │ userId (PK)  │
                    │ email        │
                    │ firstName    │
                    │ allergies[]  │
                    │ timezone     │
                    └──────┬───────┘
                           │ 1
                           │
        ┌──────────────────┼──────────────────┬─────────────────┐
        │                  │                  │                 │
        ▼ many             ▼ many             ▼ many            ▼ many
┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐
│    VISITS     │  │  MEDICATIONS  │  │    ACTIONS    │  │   SHARES    │
│───────────────│  │───────────────│  │───────────────│  │─────────────│
│ visitId (PK)  │  │ medId (PK)    │  │ actionId (PK) │  │ shareId (PK)│
│ userId (FK)   │  │ userId (FK)   │  │ userId (FK)   │  │ ownerId (FK)│
│ transcript    │  │ name, dose    │  │ text, type    │  │ caregiverId │
│ summary       │  │ frequency     │  │ dueDate       │  │ status      │
│ status        │  │ active        │  │ completed     │  │ role        │
└───────┬───────┘  └───────┬───────┘  └───────────────┘  └─────────────┘
        │                  │
        │                  ▼ 1:1
        │          ┌───────────────────┐
        │          │ MED_REMINDERS     │
        │          │───────────────────│
        │          │ reminderId (PK)   │
        │          │ medicationId (FK) │
        │          │ times[]           │
        │          │ enabled           │
        │          └───────────────────┘
        │
        ▼ many
┌───────────────┐      ┌───────────────┐
│    NUDGES     │      │  HEALTH_LOGS  │
│───────────────│      │───────────────│
│ nudgeId (PK)  │      │ logId (PK)    │
│ userId (FK)   │      │ userId (FK)   │
│ type          │      │ type (vitals) │
│ message       │      │ data (BP, etc)│
│ status        │      │ createdAt     │
└───────────────┘      └───────────────┘
```

### Most Important Models

| Model | Why It Matters |
|-------|----------------|
| **visits** | Core of the app - contains audio, transcript, AI summary |
| **medications** | Synced from visits, tracks what patient is taking |
| **shares** | Enables caregiver access - key differentiator |
| **nudges** | Powers LumiBot proactive check-ins |

---

## 4. API Reference

Base URL: `https://us-central1-lumimd-dev.cloudfunctions.net/api`

All endpoints require authentication via `Authorization: Bearer <firebase_id_token>` header.

### Visits (Core Feature)

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| GET | `/v1/visits` | List all visits | - | `[{id, title, date, status, summary}]` |
| GET | `/v1/visits/:id` | Get single visit | - | `{id, title, transcript, summary, ...}` |
| POST | `/v1/visits` | Create new visit | `{audioUrl?, notes?}` | `{id, status: 'pending'}` |
| PATCH | `/v1/visits/:id` | Update visit | `{title?, notes?, ...}` | Updated visit |
| DELETE | `/v1/visits/:id` | Delete visit | - | `204 No Content` |
| POST | `/v1/visits/:id/reprocess` | Re-run AI | - | `{status: 'processing'}` |

### Medications

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| GET | `/v1/meds` | List medications | - |
| POST | `/v1/meds` | Add medication | `{name, dose?, frequency?}` |
| PATCH | `/v1/meds/:id` | Update medication | `{dose?, frequency?, active?}` |
| DELETE | `/v1/meds/:id` | Remove medication | - |
| POST | `/v1/meds/:id/stop` | Mark as discontinued | `{reason?}` |

### Medication Reminders

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| GET | `/v1/med-reminders` | List reminders | - |
| POST | `/v1/med-reminders` | Create reminder | `{medicationId, times: ["08:00"]}` |
| PATCH | `/v1/med-reminders/:id` | Update times | `{times?, enabled?}` |
| DELETE | `/v1/med-reminders/:id` | Delete reminder | - |

### Users & Profile

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| GET | `/v1/users/me` | Get profile | - |
| PUT | `/v1/users/me` | Update profile | `{firstName?, allergies?[], ...}` |
| POST | `/v1/users/push-token` | Register for notifications | `{token, platform}` |
| GET | `/v1/users/me/caregivers` | List caregivers | - |
| POST | `/v1/users/me/caregivers` | Add caregiver | `{email, name?, relationship?}` |

### Shares (Caregiver Access)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/shares` | List shares (as owner or caregiver) |
| POST | `/v1/shares` | Create share invite |
| PUT | `/v1/shares/:id/accept` | Accept invite |
| PUT | `/v1/shares/:id/revoke` | Revoke access |

### Nudges (LumiBot)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v1/nudges` | Get pending nudges |
| POST | `/v1/nudges/:id/respond` | Submit response |
| POST | `/v1/nudges/:id/snooze` | Snooze nudge |
| POST | `/v1/nudges/:id/dismiss` | Dismiss nudge |

### Health Logs

| Method | Endpoint | Purpose | Request Body |
|--------|----------|---------|--------------|
| GET | `/v1/healthLogs` | List health entries | - |
| POST | `/v1/healthLogs` | Log vitals/symptoms | `{type, data: {bloodPressure?, ...}}` |

---

## 5. Authentication & Authorization Flow

### How Sign-Up Works

```
1. User enters email + password in mobile app
   └── File: mobile/app/sign-up.tsx

2. App calls Firebase Auth createUserWithEmailAndPassword()
   └── Firebase creates account, returns userId

3. App calls POST /v1/users/register to create Firestore profile
   └── File: functions/src/routes/users.ts

4. App calls POST /v1/users/push-token to enable notifications
   └── Expo push token registered

5. User is now logged in
```

### How Login Works

```
1. User enters email + password
   └── File: mobile/app/sign-in.tsx

2. App calls Firebase Auth signInWithEmailAndPassword()
   └── Firebase returns ID token (JWT)

3. ID token stored in app memory
   └── Auto-refreshes every hour

4. All API calls include: Authorization: Bearer <id_token>
```

### How API Verifies Authentication

```typescript
// File: functions/src/middlewares/auth.ts

1. Extract token from Authorization header
   "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..."

2. Call admin.auth().verifyIdToken(idToken, true)
   - Validates signature
   - Checks expiration
   - checkRevoked: true ensures revoked tokens rejected

3. Attach decoded user to request
   req.user = { uid: "abc123", email: "user@example.com" }

4. Continue to route handler
```

### User Roles

| Role | Access Level | How Identified |
|------|--------------|----------------|
| **Patient (Owner)** | Full read/write to own data | `userId === req.user.uid` |
| **Caregiver (Viewer)** | Read-only to shared patient data | `shares` collection with `status: 'accepted'` |

Firestore security rules check:
```javascript
function isOwner(userId) {
  return request.auth.uid == userId;
}

function isViewerOf(ownerId) {
  return exists(/databases/$(database)/documents/shares/$(ownerId + '_' + request.auth.uid))
    && get(...).data.status == 'accepted';
}
```

---

## 6. Key User Flows

### Flow 1: Recording a Doctor Visit

This is the core feature - here's exactly what happens:

```
USER ACTION                          CODE PATH
──────────────────────────────────────────────────────────────────────

1. User taps "Record" button         mobile/app/record-visit.tsx
                                     └── Audio.Recording.createAsync()

2. User speaks during appointment    Audio captured via expo-av

3. User taps "Stop"                  mobile/app/record-visit.tsx
                                     └── recording.stopAndUnloadAsync()

4. App uploads audio to Firebase     mobile/lib/api.ts → uploadAudio()
   Storage                           └── Firebase Storage: visits/{userId}/{visitId}/audio.webm

5. App creates visit document        POST /v1/visits
                                     └── functions/src/routes/visits.ts (line 195)
                                     └── Firestore: visits/{visitId} with status: 'pending'

6. Firestore trigger fires           functions/src/triggers/processVisitAudio.ts
                                     └── onDocumentCreated('visits/{visitId}')

7. Send audio to AssemblyAI          functions/src/services/assemblyai.ts
                                     └── submitForTranscription()

8. AssemblyAI processes (2-5 min)    (External service)

9. AssemblyAI calls our webhook      POST /v1/webhooks/assemblyai
                                     └── functions/src/routes/webhooks.ts (line 50)

10. Send transcript to OpenAI        functions/src/services/openai.ts
                                     └── summarizeVisit() (line 700)

11. Extract medications, actions     functions/src/services/medicationSync.ts
                                     └── syncMedicationsFromVisit()

12. Update visit as completed        Firestore: visits/{visitId} status: 'completed'

13. Send push notification           functions/src/services/notifications.ts
                                     └── sendPushNotification()

14. User sees summary in app         mobile/app/visit-detail.tsx
```

### Flow 2: Medication Reminder

```
SCHEDULED EVERY 5 MINUTES            CODE PATH
──────────────────────────────────────────────────────────────────────

1. Cloud Scheduler triggers          functions/src/index.ts
                                     └── exports.processMedicationReminders

2. Query all enabled reminders       functions/src/services/medicationReminderService.ts
                                     └── processMedicationReminders() (line 45)

3. For each reminder:
   a. Get user's timezone            users/{userId}.timezone
   b. Check if current time          Compare "08:00" vs current time in their TZ
      matches reminder time
   c. If match (±7 min window):
      - Check lastSentAt to          Prevent duplicate sends
        avoid duplicates
      - Send Expo push notification  functions/src/services/notifications.ts
      - Update lastSentAt            medicationReminders/{id}.lastSentAt

4. User receives notification        "Time to take Lisinopril 10mg"
```

### Flow 3: Caregiver Sharing

```
USER ACTION                          CODE PATH
──────────────────────────────────────────────────────────────────────

1. Patient taps "Add Caregiver"      mobile/app/caregiver-sharing.tsx

2. Enters caregiver email            POST /v1/users/me/caregivers
                                     └── functions/src/routes/users.ts (line 523)

3. Create caregiver record           users/{userId}.caregivers[] array

4. Create share invite               shares/{ownerId_caregiverUserId} status: 'pending'

5. Send invite email                 functions/src/services/caregiverEmailService.ts
                                     └── sendCaregiverInviteEmail()

6. Caregiver clicks email link       Opens web-portal/app/invite/page.tsx

7. Caregiver signs up/logs in        Firebase Auth

8. Accept share invite               PUT /v1/shares/:id/accept
                                     └── functions/src/routes/shares.ts (line 180)

9. Share status → 'accepted'         Firestore rules now allow read access

10. Caregiver sees patient data      web-portal/app/shared/page.tsx
    in read-only dashboard
```

### Flow 4: LumiBot Nudge Check-in

```
FLOW                                 CODE PATH
──────────────────────────────────────────────────────────────────────

1. Visit processed with diagnosis    functions/src/services/lumibotAnalyzer.ts
                                     └── analyzeVisitForNudges() (line 569)

2. Match diagnosis to protocol       functions/src/data/conditionProtocols.ts
   (e.g., "Hypertension" → BP        └── matchDiagnosesToProtocols()
    tracking nudges)

3. Create nudge documents            nudges/{nudgeId} status: 'pending'
   scheduled for future dates        scheduledFor: 3 days from now

4. Every 15 min, check for due       functions/src/services/nudgeNotificationService.ts
   nudges and send push              └── processNudgeNotifications()

5. User sees nudge in app            mobile/components/lumibot/NudgeCard.tsx

6. User responds                     POST /v1/nudges/:id/respond
                                     └── functions/src/routes/nudges.ts (line 200)

7. AI interprets response            functions/src/services/lumibotAI.ts
                                     └── interpretResponse()

8. Log health data if applicable     healthLogs/{logId} with BP reading etc.
```

---

## 7. Third-Party Integrations

### Services Used

| Service | Purpose | Cost Model |
|---------|---------|------------|
| **Firebase** | Auth, Database, Storage, Functions | Pay-per-use (generous free tier) |
| **OpenAI** | Visit summarization, nudge generation | Per-token ($0.005/1K input) |
| **AssemblyAI** | Audio transcription | Per-minute ($0.0037/min) |
| **Resend** | Transactional emails | Free tier: 3K/month |
| **Expo** | Push notifications, app builds | Free for basic use |
| **Vercel** | Web portal hosting | Free tier available |

### Where Credentials Are Stored

| Secret | Location | Notes |
|--------|----------|-------|
| `OPENAI_API_KEY` | `functions/.env` | Server-side only |
| `ASSEMBLYAI_API_KEY` | `functions/.env` | Server-side only |
| `RESEND_API_KEY` | `functions/.env`, `web-portal/.env.local` | For email sending |
| `FIREBASE_*` | `mobile/.env`, `web-portal/.env.local` | Client-side (public keys) |

### Failure Handling

| Integration | If It Fails | User Impact |
|-------------|-------------|-------------|
| **AssemblyAI** | Retry 3x, mark visit as 'failed' | User sees error, can retry manually |
| **OpenAI** | Retry 2x, fallback to raw transcript | Summary says "Processing failed" |
| **Resend** | Log error, continue | Invite email not sent, user can resend |
| **Expo Push** | Remove invalid tokens | User misses notification |

---

## 8. Environment & Configuration

### Required Environment Variables

#### Functions (`functions/.env`)
```bash
# Required
OPENAI_API_KEY=sk-...              # OpenAI API key
OPENAI_MODEL=gpt-4o                # Model to use (gpt-4o recommended)
ASSEMBLYAI_API_KEY=...             # AssemblyAI API key
RESEND_API_KEY=re_...              # Resend email API key

# Optional
ALLOWED_ORIGINS=https://lumimd.app  # CORS allowed origins
NODE_ENV=production                  # Affects rate limits, error details
```

#### Mobile (`mobile/.env`)
```bash
# Firebase Config (all EXPO_PUBLIC_ prefix)
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=lumimd-dev.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=lumimd-dev
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=lumimd-dev.appspot.com

# API
EXPO_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
```

#### Web Portal (`web-portal/.env.local`)
```bash
# Firebase Config
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=lumimd-dev
NEXT_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api

# Server-side for email verification
FIREBASE_PROJECT_ID=lumimd-dev
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
RESEND_API_KEY=re_...
```
**Note:** Use `NEXT_PUBLIC_API_BASE_URL` for web portal API calls. `NEXT_PUBLIC_API_URL` is deprecated.

### Development vs Production

| Setting | Development | Production |
|---------|-------------|------------|
| **Rate Limits** | 500 req/15min | 100 req/15min |
| **Error Details** | Full stack traces | Generic messages |
| **CORS Origins** | localhost allowed | Explicit whitelist |
| **OpenAI Model** | Same | Same (gpt-4o) |

### Local Development Setup

```bash
# 1. Clone and install
git clone https://github.com/tylerdmcanally/LumiMD.git
cd LumiMD/Codebase

# 2. Install dependencies
npm install
cd functions && npm install && cd ..
cd web-portal && npm install && cd ..
cd mobile && npm install && cd ..

# 3. Set up environment files
# Copy .env.example files and fill in values

# 4. Start development
# Terminal 1 - Functions
cd functions && npm run serve

# Terminal 2 - Web Portal
cd web-portal && npm run dev

# Terminal 3 - Mobile
cd mobile && npx expo start
```

---

## 9. Dependencies Deep Dive

### Critical Dependencies

| Package | Version | Purpose | Risk If Outdated |
|---------|---------|---------|------------------|
| `firebase-admin` | 13.x | Server-side Firebase ops | AUTH BREAKS |
| `firebase` | 11.x | Client-side Firebase | AUTH BREAKS |
| `openai` | 4.x | AI summarization | SUMMARIES FAIL |
| `express` | 4.21+ | API framework | SECURITY VULN |
| `next` | 14.2.35+ | Web portal | SECURITY VULN |
| `expo` | SDK 54 | Mobile app framework | BUILD FAILS |
| `react-native` | 0.76.x | Mobile UI | APP CRASHES |

### Known Outdated Dependencies (from Security Audit)

| Package | Current | Target | Issue |
|---------|---------|--------|-------|
| `next` | 14.1.0 | 14.2.35+ | DoS vulnerability (CVE-2024-34351) |
| `express` | 4.18.2 | 4.21.2 | qs parsing DoS (GHSA-6rw7-vpxm-498p) |
| `pdfmake` | 0.2.20 | 0.3.2 | RCE vulnerability (CVE-2024-25180) |

### Nice-to-Have Dependencies

| Package | Purpose | Could Remove? |
|---------|---------|---------------|
| `pdfmake` | Generate provider reports | Yes, but feature would break |
| `zod` | Request validation | Could use alternatives |
| `date-fns` | Date formatting | Built-in Date works too |

---

## 10. Known Technical Debt & Improvement Opportunities

### Security Issues to Fix

| Issue | Severity | Location | Fix |
|-------|----------|----------|-----|
| `Math.random()` for tokens | HIGH | `web-portal/app/api/send-verification-email/route.ts` | Use `crypto.randomBytes()` |
| AsyncStorage unencrypted | HIGH | `mobile/app/settings.tsx` | Migrate to `react-native-encrypted-storage` |
| No session timeout | MEDIUM | N/A | Implement inactivity logout |
| No screen capture prevention | MEDIUM | N/A | Add `FLAG_SECURE` for Android |

### Code Quality Issues

| Issue | Location | Recommendation |
|-------|----------|----------------|
| Large service files | `lumibotAnalyzer.ts` (1200 lines) | Split into smaller modules |
| Duplicate medication normalization | Multiple files | Extract to shared utility |
| Inline Zod schemas | Route files | Move to dedicated schema files |

### Missing Features for Scale

| Gap | Why It Matters | Recommendation |
|-----|----------------|----------------|
| No request caching | Repeated API calls | Add Redis/in-memory cache |
| No database backups | Data loss risk | Enable Firestore scheduled exports |
| No monitoring dashboard | Can't see errors | Add Sentry error tracking |
| No load testing | Unknown capacity | Run stress tests before launch |

### Architectural Improvements

| Current State | Improvement | Benefit |
|---------------|-------------|---------|
| Monolithic Cloud Function | Extract high-frequency paths | Reduce cold starts |
| Direct Firestore reads | Add caching layer | Reduce costs |
| Synchronous AI calls | Queue-based processing | Better failure handling |

---

## 11. Glossary

| Term | Definition |
|------|------------|
| **Firestore** | Google's NoSQL document database (like MongoDB but managed) |
| **Cloud Function** | Serverless code that runs on Google's servers |
| **Firebase Auth** | Authentication service handling login/signup |
| **ID Token** | JWT (JSON Web Token) proving user identity, expires every hour |
| **Expo** | Framework for building React Native apps without native code |
| **AssemblyAI** | Third-party service that converts audio to text |
| **OpenAI GPT-4o** | AI model that generates visit summaries |
| **Nudge** | Proactive AI-generated health check-in message |
| **Share** | Permission granting caregiver access to patient data |
| **Webhook** | URL that external services call to notify us of events |
| **HIPAA** | Healthcare privacy law (Health Insurance Portability and Accountability Act) |
| **FTC HBNR** | Federal rule requiring breach notification for health apps |
| **CORS** | Security feature limiting which websites can call our API |
| **Rate Limiting** | Throttling requests to prevent abuse |
| **Zod** | Library for validating request data (like a schema enforcer) |
| **Expo Push Token** | Unique device ID for sending push notifications |
| **Cold Start** | Delay when Cloud Function hasn't run recently |
| **BAA** | Business Associate Agreement (HIPAA-required contract) |

---

*This document should be updated when significant architectural changes are made.*
