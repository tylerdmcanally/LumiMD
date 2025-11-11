# LumiMD Master Development Document (MDD)

**Owner:** Tyler McAnally (Product/Architect)
**Goal:** Build a patient-facing medical navigation app with minimal manual coding by pairing AI agents with clear specs, templates, and guardrails.
**Current Stack Direction:** React Native + Expo (iOS priority), Firebase (Auth + Firestore + Functions), Make.com for AI/automation pipelines, OpenAI for NLP.

---

## 1) Project Overview
**Problem:** Patients forget details from clinical visits and struggle to follow through on care plans.
**Solution:** Record visit → summarize → extract action items → track visits/meds with simple reminders.
**Primary Users:** Individual patients (Phase 1). Future: family/caregiver shared access (Phase 2).
**Success Criteria (MVP):**
- Start Visit → audio captured → AI summary + action items saved in user account.
- Home screen shows gradient hero, Start Visit CTA, and Action Items card (empty vs list).
- Tabs: Home / Actions / Visits / Meds.
- Deployed backend + working auth.

---

## 2) System Architecture (High-Level)
- **Mobile App (Expo RN TS):** UI + local cache + auth.
- **Firebase:**
  - Auth (email/password or Apple Sign-In).
  - Firestore (users, visits, actions, meds).
  - Functions (secure API facade; webhook endpoints for Make.com; role checks).
  - Storage (optional: audio files).
- **Make.com (Automation):**
  - Receive audio URL → transcribe (OpenAI Whisper or equivalent) → summarize → extract structured action items → write back to Firestore via Cloud Function endpoint.
- **OpenAI:** text summarization + item extraction.

---

## 3) Technology Stack & Conventions
**Frontend:**
- React Native (TypeScript), **Expo**, React Navigation (tabs/stack), **NativeWind (Tailwind RN)** for styling, `expo-linear-gradient`, `@expo/vector-icons`, **expo-av** for audio capture.
- Data: **TanStack Query** for server-state, **Zod** for runtime validation.
- Config: `.env` via expo-constants/Secrets; feature flags.

**Backend:**
- **Firebase**: Auth, Firestore (DB), Storage (audio), Cloud Functions (TypeScript) as API layer/webhooks.
- Express-style router inside Functions (versioned `/v1`).
- **OpenAPI YAML** in `/functions/openapi.yaml`; generate TS types for clients.

**Authentication (MVP):**
- **Email/Password** (Firebase Auth)
- **Google Sign‑In** (native iOS via Google SDK / reverse client ID)

**Automation / AI:***
- **Make.com scenarios** orchestrate transcription & summaries.
- **AssemblyAI** for transcription.
- **OpenAI** (or similar) for summarization & action extraction (optional backup if AssemblyAI summarization is used).

**Environments:**
- `dev` and `prod` Firebase projects. Per‑env config in `.env` + Firebase config files.

---

## 4) App Layout & Navigation

### Mobile (Expo — Light App)
**Screens:**
- **Record** (primary): consent once + mic permission → start/pause/stop → upload
- **Status**: last 5 visits (processing/completed) + **View details → portal**
- **Settings**: push toggle, legal, sign out
- **Auth**: sign in (Email/Google)

> We keep native UI extremely simple and push all management tasks to the web portal.

### Web Portal (Next.js)
- **/dashboard**: Action Items, Recent Visits
- **/visits**, **/visits/[id]**: transcript + summary + actions
- **/actions**: open/done, mark done
- **/meds**: CRUD
- **/sharing**: caregiver viewer invites
- **/profile**

---

## 5) Data Model (Firestore)
```
users/{userId}
  email, createdAt, providers: { google?: boolean }

visits/{visitId}
  userId, startedAt, status: ('recording'|'completed')
  audioPath, transcriptPath (optional)
  summary: { chiefConcern, assessment, plan, redFlags: string[] }

actions/{actionId}
  userId, visitId (optional), title, subtitle, due, status: ('open'|'done'), critical: bool

meds/{medId}
  userId, name, dose, frequency, notes

shares/{ownerId}_{caregiverUserId}
  ownerId, caregiverUserId, caregiverEmail, role: ('viewer'),
  status: ('pending'|'accepted'|'revoked'), createdAt

devices/{deviceId}
  userId, platform: ('ios'|'android'), pushToken
```
**Indexes:** userId composites for reads; `status` on actions; `ownerId` on shares. Shares use deterministic IDs of `ownerId_caregiverUserId` for rules simplicity.

---

## 6) API Contract (Functions, versioned `/v1`)
- `POST /v1/visits` → { startedAt } → Visit
- `GET /v1/visits` → list user visits
- `GET /v1/visits/{id}` → visit detail (summary, transcript refs)
- `POST /v1/actions` → create action item
- `GET /v1/actions?status=open|done` → { items: ActionItem[] }
- `PATCH /v1/actions/{id}` → { title?, subtitle?, due?, status?, critical? } → ActionItem
- `DELETE /v1/actions/{id}`
- `GET /v1/meds` | `POST /v1/meds` | `PATCH /v1/meds/{id}` | `DELETE /v1/meds/{id}`
- **Caregiver Sharing**
  - `POST /v1/shares` → invite caregiver `{ caregiverEmail }` (role fixed to `viewer`), creates doc `shares/{ownerId}_{caregiverUserId}` upon accept
  - `GET /v1/shares` → list current shares for owner
  - `POST /v1/shares/accept` → caregiver accepts invite (resolves caregiverUserId, sets `status='accepted'`)
  - `DELETE /v1/shares/{ownerId}_{caregiverUserId}` → revoke
- **Push Tokens**
  - `POST /v1/devices` → register device push token `{ platform, token }`
- **Webhooks (Make.com)**
  - `POST /v1/integrations/make/visit-processed` → payload: `{ visitId, transcriptUrl, summary, actions[] }`

OpenAPI spec kept in repo and source of truth for generated types.

---

## 7) AI & Automation Workflows (Make.com)
1. **Upload & Trigger** (App): User records audio (m4a) → upload to Firebase Storage → create Visit (status `recording`) → call Make.com webhook with `{ visitId, audioUrl }`.
2. **Transcribe (AssemblyAI):** Make.com calls AssemblyAI with `audioUrl` → gets transcript.
3. **Summarize & Extract:**
   - Option A: Use AssemblyAI Summarization + Entity/Task extraction if quality is sufficient.
   - Option B (default): Prompt LLM with transcript to produce **structured JSON**: `{ chiefConcern, assessment, plan, redFlags[], actionItems[] }`.
4. **Persist:** Make.com calls Cloud Function webhook with `{ visitId, transcriptUrl, summary, actions[] }`. Function validates (Zod), writes to Firestore, and marks Visit `completed`.
5. **Notify:** Cloud Function creates any due Action Items and sends **push notification** via FCM (if user opted‑in).

**Prompting Standard:** Provide JSON schema and few-shot examples. Enforce `application/json` responses and validate with Zod server‑side.

---

## 8) UI/UX Guidelines
**Color Tokens:**
- primary `#0A99A4`, primaryDark `#064E6D`, accent `#A3D8D0`, warning `#FFD166`, error `#FF6B6B`, surface `#FFFFFF`, background `#F9FAFB`, text `#1E293B`, textMuted `#64748B`, stroke `rgba(0,0,0,0.06)`.

**Type Scale:** 12, 13, 14, 16, 18, 20, 24, 28.  
**Spacing:** 4‑pt grid. **Radius:** 10/14/20. **Shadows:** soft (0.08, r=18, y=8).  
**Motion:** 150–220ms ease‑out; respect Reduce Motion.

**Components:** Card, PillLabel, GradientHero, StartVisitCTA, ActionItemsList, Empty, Error, Sheet/Modal, **ShareInviteDialog**.
**Accessibility:** Tap ≥44px, contrast ≥4.5:1, labels/hints, VoiceOver. Share flows must be readable and reversible.

---

## 9) Coding Standards & Best Practices
**General:**
- TypeScript strict mode. Single source of truth for tokens.
- All network calls via generated API client from OpenAPI.
- Validate external data with Zod before using in UI.

**Frontend:**
- Directory: `app/ (screens)`, `components/`, `lib/`, `styles/`.
- Keep screens dumb; use hooks (`useActions`, `useVisits`).
- React Query for fetch/cache; keys scoped by user.
- Avoid anonymous default exports; use PascalCase for components.
- No inline magic numbers—use tokens/spacing.

**Backend (Functions):**
- Versioned routes `/v1`; never break contract without bump.
- Auth middleware (verify Firebase ID token).
- Role guard (Phase 2) for caregiver sharing.
- Input validation (Zod) and consistent error shape `{code, message}`.
- Structured logs; do not log PHI.

**Git & Releases:**
- Branches: `main`, `dev/feature-*`.
- Conventional Commits (`feat:`, `fix:`, `chore:`).
- PR template with checkboxes (schema updated? OpenAPI regenerated? tokens untouched?).

---

## 10) Security & Privacy
- Auth providers: **Email/Password**, **Google**.
- Store audio in Firebase Storage; signed URLs; Storage rules enforce only owner or accepted caregiver can read; only owner can write.
- **Data retention:** audio auto‑deleted after **30 days** via Cloud Function lifecycle job; transcripts/summaries retained until user deletes.
- Do **not** send PHI to non‑approved services. Make.com routes only to AssemblyAI + Cloud Functions. Redact PII in prompts where possible.
- Webhook signatures (shared secret) + HTTPS only. Rate‑limit webhooks.
- Push: APNs key in Firebase; tokens stored in `devices` collection; opt‑in required. Push messages are generic (no PHI).
- **Client storage:** Auth tokens in Keychain; transcripts are not cached on device.
- **Secret rotation:** AssemblyAI/Make/Function bearer secrets rotated **quarterly** (document rotation steps).
- **Backups:** Nightly Firestore export to Cloud Storage; verify restore quarterly.

---

## 11) Rollout Plan
**Phase 0 (Scaffold):** Tokens, core components, Home (fixtures), Auth wiring (Email/Apple/Google).  
**Phase 1 (MVP):** In‑app audio record → upload → Make.com (AssemblyAI) → summary/actions persisted; Actions list with complete/edit (owner only); Push token registration.  
**Phase 1b (Sharing in MVP):** Caregiver invites (**viewer‑only**), accept/revoke, access control in Firestore rules, shared views (read‑only).  
**Phase 2:** Visits detail w/ transcript viewer, Meds CRUD, reminders for due items, optional caregiver `editor` role.  
**Phase 3:** Analytics, exports, offline transcription.

---

## 12) Auth Provider Setup Checklists (iOS)

### Google Sign‑In (Firebase)
1. Firebase Console → **Project settings → iOS apps**: ensure Bundle ID matches (use `com.lumimd.dev` and `com.lumimd.app`).
2. **Google Cloud Console → Credentials**: create **OAuth Client ID (iOS)** for each bundle ID.
3. Download/refresh **GoogleService‑Info.plist** for each environment; note `REVERSED_CLIENT_ID`.
4. iOS target **URL Types**: add a URL scheme with the `REVERSED_CLIENT_ID`.
5. Initialize Google Sign‑In in app; on success, exchange Google credential with Firebase Auth to obtain a Firebase ID token.

### Email/Password (Firebase)
1. Firebase Console → **Authentication → Sign‑in method**: enable **Email/Password**.
2. Client: simple email/pass form with validation; handle password resets via Firebase.

**General Notes**
- Keep separate configs for **dev** and **prod** bundle IDs.
- Store OAuth client IDs in your env/config docs.

## 13) In‑App Audio Recording (Implementation Notes) (Implementation Notes)
- **Library:** `expo-av` (or native module equivalent if not using Expo).
- **Format:** AAC (m4a), 44.1 kHz, mono. Target < 30 MB per visit segment.
- **Flow:** request mic permission → start → show timer & pause/resume → stop → save local file → upload to **/audio/{userId}/{visitId}.m4a** with metadata `{ userId, visitId }`.
- **Retry:** if upload fails, queue background retry; keep a local pointer until confirmed.
- **Trigger:** on upload success, create/confirm `visits/{visitId}` and POST to Make.com webhook `{ visitId, audioUrl }`.
- **UI:** clear start/stop, visible level/timer, and a post‑upload status chip (e.g., "Processing").

---

## 14) Initial AI‑Agent Tasks (MVP Sprint)
1. **Expo App Scaffold (Light)**
   - Files: `app/`, `src/core`, `lib/config.ts`, `lib/auth.ts`.
   - Accept: builds on device; routing works; Google/Email sign‑in screen.
2. **Record Screen (expo‑av)**
   - Files: `app/record/index.tsx`, `lib/audio.ts`.
   - Accept: consent check; record/pause/stop; m4a saved; upload to Storage; new `visits/{id}` with `status='recording'`.
3. **Status Screen + Deep Links**
   - Files: `app/status/index.tsx`, `lib/linking.ts`.
   - Accept: shows last 5 visits (processing/completed); “View details →” opens portal link `https://app.lumimd.com/visits/{id}`.
4. **Notifications**
   - Files: `lib/notifications.ts`, `functions/src/routes/devices.ts`.
   - Accept: device token registered; on visit completion, push “Summary ready →” with universal link.
5. **AI Workflow (Option A: Make.com)**
   - Files: `functions/src/routes/integrations.make.ts` (webhook proxy) and `/v1/integrations/make/visit-processed` handler.
   - Accept: end‑to‑end from upload → summary/actions in Firestore.
6. **Web Portal Scaffold (Next.js)**
   - Files: `web-portal/app/*`, shared tokens, Firebase auth.
   - Accept: `/dashboard` shows Action Items + Recent Visits; `/visits/[id]` shows summary/transcript.

---

## 15) Firebase Security Rules (Copy‑Paste v1)

### Firestore (`firestore.rules`)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isOwner(userId) { return signedIn() && request.auth.uid == userId; }
    function isViewerOf(ownerId) {
      return signedIn() &&
        exists(/databases/$(database)/documents/shares/$(ownerId + '_' + request.auth.uid)) &&
        get(/databases/$(database)/documents/shares/$(ownerId + '_' + request.auth.uid)).data.status == 'accepted';
    }

    match /users/{userId} {
      allow read, update: if isOwner(userId);
      allow create: if signedIn();
    }

    match /visits/{visitId} {
      allow create: if signedIn() && isOwner(request.resource.data.userId);
      allow read: if isOwner(resource.data.userId) || isViewerOf(resource.data.userId);
      allow update, delete: if isOwner(resource.data.userId);
    }

    match /actions/{actionId} {
      allow create: if signedIn() && isOwner(request.resource.data.userId);
      allow read: if isOwner(resource.data.userId) || isViewerOf(resource.data.userId);
      allow update, delete: if isOwner(resource.data.userId);
    }

    match /meds/{medId} {
      allow create: if signedIn() && isOwner(request.resource.data.userId);
      allow read: if isOwner(resource.data.userId) || isViewerOf(resource.data.userId);
      allow update, delete: if isOwner(resource.data.userId);
    }

    match /shares/{shareId} {
      // shareId must be ownerId_caregiverUserId
      allow create: if signedIn() && request.resource.data.ownerId == request.auth.uid;
      allow read: if isOwner(resource.data.ownerId) || (signedIn() && resource.id == (resource.data.ownerId + '_' + request.auth.uid));
      allow delete, update: if isOwner(resource.data.ownerId);
    }

    match /devices/{deviceId} {
      allow create: if signedIn() && request.resource.data.userId == request.auth.uid;
      allow read, update, delete: if signedIn() && resource.data.userId == request.auth.uid;
    }
  }
}
```

### Storage (`storage.rules`)
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() { return request.auth != null; }
    function isOwner(userId) { return signedIn() && request.auth.uid == userId; }
    function isViewerOf(ownerId) {
      return signedIn() &&
        firestore.exists(/databases/(default)/documents/shares/$(ownerId + '_' + request.auth.uid)) &&
        firestore.get(/databases/(default)/documents/shares/$(ownerId + '_' + request.auth.uid)).data.status == 'accepted';
    }

    match /audio/{userId}/{fileName} {
      allow write: if isOwner(userId);
      allow read: if isOwner(userId) || isViewerOf(userId);
    }
  }
}
```

> Note: if you prefer non‑deterministic share IDs, we can add a `sharesIndex/{ownerId}/accepted/{caregiverUserId}` mirror for rules lookups. The deterministic ID is simplest for MVP.

### OpenAPI Excerpt (copy into `functions/openapi.yaml`)
```
openapi: 3.1.0
info: { title: LumiMD API, version: 1.0.0 }
servers: [{ url: https://us-central1-lumimd.cloudfunctions.net }, { url: https://us-central1-lumimd-dev.cloudfunctions.net }]
paths:
  /v1/visits:
    post:
      summary: Start visit
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, properties: { startedAt: { type: string, format: date-time } }, required: [startedAt] }
      responses:
        '201': { description: Created }
    get: { summary: List visits, responses: { '200': { description: OK } } }
  /v1/visits/{id}:
    get: { summary: Get visit detail, responses: { '200': { description: OK } } }
  /v1/actions:
    get: { summary: List actions, responses: { '200': { description: OK } } }
    post:
      summary: Create action
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ActionItemInput' }
      responses:
        '201': { description: Created }
  /v1/actions/{id}:
    patch:
      summary: Update action
      requestBody:
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ActionItemPatch' }
      responses:
        '200': { description: Updated }
    delete: { summary: Delete action, responses: { '204': { description: No Content } } }
  /v1/meds:
    get: { summary: List medications, responses: { '200': { description: OK } } }
    post: { summary: Create medication, responses: { '201': { description: Created } } }
  /v1/meds/{id}:
    patch: { summary: Update medication, responses: { '200': { description: Updated } } }
    delete: { summary: Delete medication, responses: { '204': { description: No Content } } }
  /v1/shares:
    get: { summary: List owner shares, responses: { '200': { description: OK } } }
    post:
      summary: Invite caregiver (viewer)
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, properties: { caregiverEmail: { type: string, format: email } }, required: [caregiverEmail] }
      responses:
        '200': { description: Invite sent }
  /v1/shares/accept:
    post:
      summary: Accept caregiver invite
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, properties: { ownerId: { type: string } }, required: [ownerId] }
      responses:
        '200': { description: Accepted }
  /v1/shares/{ownerId}_{caregiverUserId}:
    delete: { summary: Revoke share, responses: { '204': { description: No Content } } }
  /v1/devices:
    post:
      summary: Register device token
      requestBody:
        required: true
        content:
          application/json:
            schema: { type: object, properties: { platform: { type: string, enum: ['ios','android'] }, token: { type: string } }, required: [platform, token] }
      responses:
        '204': { description: No Content }
  /v1/integrations/make/visit-processed:
    post:
      summary: Persist processed visit payload
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/VisitProcessed' }
      responses:
        '204': { description: No Content }
components:
  schemas:
    ActionItemInput: { type: object, properties: { title: { type: string }, subtitle: { type: string }, due: { type: string, format: date }, critical: { type: boolean } }, required: [title, subtitle] }
    ActionItemPatch: { type: object, properties: { title: { type: string }, subtitle: { type: string }, due: { type: string, format: date }, status: { type: string, enum: ['open','done'] }, critical: { type: boolean } } }
    VisitProcessed:
      type: object
      properties:
        visitId: { type: string }
        transcriptUrl: { type: string, format: uri }
        summary: { type: object, properties: { chiefConcern: { type: string }, assessment: { type: string }, plan: { type: string }, redFlags: { type: array, items: { type: string } } }, required: [chiefConcern, plan] }
        actions:
          type: array
          items: { $ref: '#/components/schemas/ActionItemInput' }
      required: [visitId, transcriptUrl, summary]
```

---

## 16) Environment Config & Constants
Create `.env.template` and a typed config wrapper.

**`.env.template`**
```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
EXPO_PUBLIC_API_BASE_URL= # https://us-central1-lumimd-dev.cloudfunctions.net (dev) or prod
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_SENTRY_DSN=
```

**`lib/config.ts`**
```ts
export const cfg = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL!,
  firebase: {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID!,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
  },
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID!,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  flags: { sharing: true, meds: true, push: true, mock: false },
} as const;
```

---

## 17) Error Codes & Retry Policy
**Client-visible error shape**
```json
{ "code": "string", "message": "human readable", "details": {"field": "optional context"} }
```
**Canonical codes:** `unauthorized`, `forbidden`, `not_found`, `validation_failed`, `rate_limited`, `conflict`, `server_error`.

**Retries:**
- Network 5xx/`rate_limited`: exponential backoff (250ms → 4s, max 5 tries).
- Idempotent writes only (POST start visit: client generates visitId first).
- Upload: resumable with Storage SDK; mark status `uploading` until confirmed.

---

## 18) Logging & Observability (MVP)
- **Sentry** enabled on client and Functions (errors, traces, perf samples).
- Structured logs in Functions: `{ userId, route, durationMs, outcome }`.
- Client breadcrumb logs (info/error) behind a dev flag.

---

## 19) UX Copy & Micro‑content
- **CTA:** Start Visit
- **Empty (Actions):** “Nothing pending. You’re all caught up!”
- **Processing:** “We’re transcribing your visit. This can take a few minutes.”
- **Share invite sent:** “We emailed your caregiver an invite to view your plan.”

**Recording Consent (required once + reminder):**
- Screen title: **Before you record**
- Body: “By tapping *Start Recording*, you confirm you have consent to record this conversation and you agree to our Terms and Privacy Notice. Recording laws vary by location.”
- Checkbox (must check first time): “I have consent to record.”
- Reminder chip shown on each recording screen: “Record responsibly.” (links to policy)

**Permission Prompts (microcopy):**
- **Microphone:** “We use your microphone to record your visit so we can summarize and track action items.”
- **Notifications:** “Allow reminders so we can notify you when an action item is due. We’ll never include health details.”

**Push Content Hygiene:**
- Push text is **generic only** (no PHI). Example: “You have an action due.”

---

## 20) Release Checklist (MVP)
- [ ] **Minimum iOS version:** 15+
- [ ] Firebase projects: dev/prod configured; API base URL set in `.env`.
- [ ] Auth: Email + Google enabled; iOS URL scheme matches `REVERSED_CLIENT_ID`.
- [ ] Storage rules & Firestore rules deployed.
- [ ] Make.com scenario URL & secret configured in Functions.
- [ ] In‑app audio works on device; background permissions out of scope for MVP.
- [ ] Push notifications: APNs key uploaded to Firebase; token registration verified; **generic message policy** enforced.
- [ ] **Sentry** initialized (DSN per env) for crash/error reporting.
- [ ] App icons & splash set; App Store privacy labels prepared (audio, diagnostics, device ID).

---

## 21) Frontend & Functions File Tree (Authoritative)
```
root/
  app/                      # Expo Router (RN)
    (tabs)/
      _layout.tsx
      index.tsx            # (optional) if we keep tabs
    auth/
      sign-in.tsx
      sign-up.tsx
    record/
      index.tsx            # Record screen
    status/
      index.tsx            # Last 5 visits + deep link to web
    settings/
      index.tsx
  src/
    core/
    ui/
    auth/
    visits/
    actions/
    meds/
    sharing/
    notifications/
    integrations/
  components/
    HeroBanner.tsx
    StartVisitCTA.tsx
    ActionItemsCard.tsx
    Empty.tsx
    ErrorState.tsx
    ui.tsx
  lib/
    api/
      openapi.yaml
      client.ts
      types.ts
    query/
      provider.tsx
      hooks.ts
    audio.ts               # expo-av helpers
    auth.ts                # Firebase client + Google/Email
    config.ts
    validators.ts
    strings.ts
    linking.ts             # expo-linking config (portal deep links)
    notifications.ts       # expo-notifications helpers
  web-portal/              # Next.js app (separate package optional)
    app/
      layout.tsx
      dashboard/page.tsx
      visits/page.tsx
      visits/[id]/page.tsx
      actions/page.tsx
      meds/page.tsx
      sharing/page.tsx
      profile/page.tsx
    lib/ (web specific)
      firebase.ts
      query.ts
      tokens.ts
  functions/
    src/
      index.ts
      routes/
        actions.ts
        visits.ts
        meds.ts
        shares.ts
        devices.ts
        integrations.make.ts  # or integrations.aai.ts if we remove Make.com
      middlewares/
        auth.ts
        json.ts
      jobs/
        retention.ts
      types/
        dto.ts
  firestore.rules
  storage.rules
  .env.template
  README.md
```

---

## 22) AI Workflow Orchestration
We will start with **Make.com + AssemblyAI** for speed, but the design allows swapping to a simpler **Cloud Functions–only** pipeline later.

### Option A — Make.com (current default)
**Scenario:** `Visit → AssemblyAI → Summarize → Actions → Persist`
1) **Webhook (from Functions)** `{ visitId, audioUrl, userId }`
2) **AssemblyAI transcribe** (poll until complete)
3) **(Optional) LLM summarize/extract** to structured JSON `{ summary, actions[] }`
4) **Callback to Functions** `/v1/integrations/make/visit-processed`
- Idempotency by `visitId`, exponential retries, secrets in Make connections

### Option B — Simpler (Functions‑only) — *recommended once stable*
- **functions/src/modules/integrations.aai.ts** handles:
  1) `startTranscription(audioUrl)` via AssemblyAI REST
  2) **HTTP onTranscriptionCallback** (AAI webhook → Function)
  3) Call LLM (if needed) → `{ summary, actions[] }`
  4) Upsert Firestore + send push
- **Pros:** fewer moving parts, no third‑party runner, easier to secure/observe
- **Cons:** a bit more initial code; you own the polling/webhook

**Switching path:** Build with Option A for MVP; create `integrations.aai.ts` in parallel and cut over by toggling a server flag.

---

## 23) First‑Sprint Task Board (Paste into Linear/Trello)

### EPIC: MVP Core
**Goal:** User can record a visit, and within minutes see a summary + action items on Home.

#### T1 — Project Scaffold & Env
- Create RN app, add Firebase SDKs, set up `lib/config.ts` with `.env`.
- Acceptance: app builds on device; `cfg` resolves; Google/Email sign-in screens exist (not wired).

#### T2 — Auth (Email + Google)
- Implement sign in/up UI; Google flow via iOS Client ID; Firebase user doc upsert.
- Acceptance: Sign in/out works; user doc `{ providers.google }` set.

#### T3 — UI Tokens + Home Shell
- Implement `ui.tsx` tokens, `HeroBanner`, `StartVisitCTA`, `ActionItemsCard`.
- Acceptance: Gradient hero; CTA press logs; Action list shows fixtures and empty state.

#### T4 — Audio Record & Upload
- Implement `lib/audio.ts` to record (m4a), show timer, upload to `/audio/{userId}/{visitId}.m4a`.
- Acceptance: File appears in Storage; visit doc created with `status='recording'`.

#### T5 — Functions: Webhook + Upsert
- Implement `/v1/integrations/make/visit-processed` + Zod validation + auth.
- Acceptance: Given payload, visit becomes `completed`; actions created.

#### T6 — Make.com Scenario
- Build pipeline per Blueprint §22; configure secrets; HMAC validation in Function.
- Acceptance: End-to-end: upload → Make → AssemblyAI → Function → Firestore.

#### T7 — Actions List (Live Data)
- Wire `useActions` to backend; show open/done; allow owner to mark done.
- Acceptance: Patch updates Firestore; Home card reflects state.

#### T8 — Caregiver Sharing (Viewer)
- Invite flow; accept flow; rules as per §15.
- Acceptance: Caregiver sees shared items read-only; owner can revoke.

#### T9 — Push Token Registration
- Register device token and POST `/v1/devices`; owner-only notifications.
- Acceptance: Token stored in `devices`; test push sent from Functions.

#### T10 — Polish & Release Checklist
- Empty/loading/error states; copy; icons/splash; storage & firestore rules deployed.
- Acceptance: Passes Release Checklist §20.

---

## 24) AI Agent Prompt Template (for each task)
```
You are an expert TypeScript + React Native engineer. Follow the LumiMD MDD.
Task: <paste task title>
Acceptance Criteria: <paste from MDD>
Repo Paths: <list affected files>
Constraints:
- Use tokens from components/ui.tsx; no hardcoded colors.
- Data types must come from lib/api/types.ts (generated from openapi.yaml).
- Validate external data with zod in validators.ts.
- Do not modify rules or schema unless specified.
Deliverables:
- Code diff with new/changed files.
- Short rationale and manual test steps.
```

---

## 25) Definition of Done (DoD)
- Matches **Acceptance Criteria** for the task.
- Builds & runs on device.
- No console errors; network failures handled with user‑visible error state.
- Uses tokens, types, and validators; no magic numbers.
- Updates the **README** if new env/config is required.

---

## 26) Modular Architecture (Feature Modules)
**Principle:** Build each feature as a **module** with clear boundaries, then wire modules together via stable contracts (OpenAPI types, Firestore doc shapes, and narrow hooks). Modules can be developed independently by AI agents and integrated incrementally.

### 26.1 Module List (MVP)
- **core/** — app shell, config, routing, error boundaries, QueryClientProvider.
- **ui/** — design tokens + shared primitives (Card, Button, ListItem, Sheet, Toast, Forms).
- **auth/** — sign-in screens, Firebase adapters (Email/Google), current user context.
- **visits/** — record screen, visit list/detail, upload pipeline client.
- **actions/** — actions list/detail, complete/edit flows.
- **meds/** — CRUD screens for medications.
- **sharing/** — invite/accept/revoke flows, viewer-mode routing guards.
- **notifications/** — device token registration + push helpers.
- **integrations/** — Make.com client, AssemblyAI DTOs, webhook utilities.

> Each module ships its own **types**, **zod validators**, **API hooks**, **screens**, and **barrel exports**.

### 26.2 Folder Shape per Module
```
<module>/
  index.ts                 # barrel exports for the module
  types.ts                 # module-local TS types (import server types if exist)
  validators.ts            # zod schemas for inbound/outbound data
  hooks.ts                 # React Query hooks (useXxx)
  screens/                 # module screens (RN components)
  components/              # module-specific UI (not shared)
  api.ts                   # thin wrapper over lib/api/client
```

### 26.3 Frontend Structure (src/)
```
src/
  core/
  ui/
  auth/
  visits/
  actions/
  meds/
  sharing/
  notifications/
  integrations/
```
> `app/` (routing) should import screens from modules rather than implement logic directly.

### 26.4 Cloud Functions Modules
```
functions/src/
  modules/
    visits/
      routes.ts     # /v1/visits
      service.ts    # business logic
      dto.ts        # zod schemas shared with client
    actions/
    meds/
    shares/
    devices/
    integrations/
```
- Each `routes.ts` only handles HTTP + validation, calls `service.ts`.
- Shared DTOs consolidated under `functions/src/modules/*/dto.ts` and exported for docs generation.

### 26.5 Inter‑Module Contracts
- **Types:** generated from `openapi.yaml` → `lib/api/types.ts` (single source of truth).
- **Firestore shapes:** captured in `validators.ts` per module; client validates all server responses.
- **Events (optional, later):** lightweight app‑level event bus for cross‑module notifications (e.g., `visit:completed` → actions module refetch).

### 26.6 Dependency Rules (enforced by convention)
- `core` and `ui` are **lowest** level → may not import from feature modules.
- Feature modules **may** import from `core`, `ui`, and `integrations`, but **not** from each other directly. Cross‑feature communication goes through API/contracts or event bus.
- Avoid circular imports. Prefer passing callbacks/props from the router.

### 26.7 Feature Flagging
- `lib/config.ts` exposes `flags`: `{ sharing: true, meds: true, push: true }`.
- Modules read flags to render routes/UI conditionally.
- Flags allow shipping a slim MVP while modules evolve independently.

### 26.8 Module Acceptance Template
When creating a new module or feature inside a module, include:
- ✅ **Screens** (states: loading/empty/error)
- ✅ **Hooks** (React Query) with cache keys documented
- ✅ **Types & Validators** (zod)
- ✅ **API wrapper** (no `fetch` inline in screens)
- ✅ **README.md** with routes and acceptance criteria

### 26.9 Wiring Order (Recommended)
1) `ui` + `core` → base app shell and tokens.
2) `auth` → gate routes.
3) `visits` → record/upload.
4) `integrations` → Make/AssemblyAI callback.
5) `actions` → reflect processed actions.
6) `sharing` → viewer routing + rules.
7) `meds` → CRUD.
8) `notifications` → device tokens + basic pushes.

### 26.10 Module Prompts for AI Agents
```
Build the <module> module following MDD §26. Use this folder shape:
- index.ts, types.ts, validators.ts, hooks.ts, api.ts, components/, screens/
Contracts:
- Types from lib/api/types.ts (OpenAPI)
- Firestore shapes validated via zod in validators.ts
Constraints:
- No inline fetch in screens; use api.ts + hooks.ts
- No cross-module imports except ui/core/integrations
Deliverables:
- Code + a README describing routes, cache keys, and integration points
```

---

## 27) Module QA & Testing (No-Test-Rig, Architect-Friendly)
**Goal:** Validate each module independently without a heavy test harness, using fixtures, contracts, and short manual scripts.

### 27.1 Golden Path Script (per module)
For each module, maintain a 5–10 step **Given/When/Then** script in the module README. Example for **actions/**:
1. Given I am signed in as a new user.
2. When I open Home and see empty Action Items.
3. When I navigate to Actions and create a new item.
4. Then I see it on Actions and on Home card.
5. When I mark it done.
6. Then it moves to Done and no longer shows on Home.

### 27.2 Fixture Mode & Mock Toggle
- Each module exposes a `useMock` toggle (read from `cfg.flags.mock`).
- **Fixture JSON** lives under `<module>/fixtures/` to simulate data.
- Screens render the same states (loading/empty/error/list) regardless of mock/real.

### 27.3 Contract & Shape Validation
- All network responses pass through **Zod** validators defined in `<module>/validators.ts`.
- Cloud Functions also validate incoming payloads with the **same Zod schemas** (shared DTOs where practical) to catch drift early.

### 27.4 Playground Screen (Dev only)
- Each module ships a hidden **Playground** screen in `screens/Playground.tsx` which:
  - toggles mock/real,
  - lets you create/edit/delete sample items,
  - visualizes raw request/response (sanitized).
- Exposed behind a **dev flag** (e.g., triple-tap the title to open).

### 27.5 Smoke Checklist (device)
- **Rendering:** no red boxes, text clipped, contrast OK.
- **Interaction:** tap targets ≥44pt, pull-to-refresh works.
- **States:** empty, loading, error, list all observable.
- **Offline/Retry (basic):** put phone in airplane mode → error state is shown; turning back on recovers.
- **Performance:** first paint < 1.5s on mid-range device; list scrolls at 60fps with 30 items.

### 27.6 E2E Slice Walkthrough (manual)
- Start from **Home** → use the module → return to Home.
- Confirm downstream effects (e.g., `visits` completion triggers `actions` refresh). Use the event bus or invalidate queries.

### 27.7 Observability (lightweight)
- Console logs are namespaced per module (`[actions] created id=...`).
- Functions log `{ route, userId, durationMs, ok }`.
- A simple `Debug Panel` shows last 20 client logs in dev.

### 27.8 Exit Criteria (per module)
- Golden path passes in both **mock** and **real** modes.
- Smoke checklist passes on device.
- No schema validation failures in logs for 24h of dogfooding.
- Module README updated with the latest script and any known caveats.

