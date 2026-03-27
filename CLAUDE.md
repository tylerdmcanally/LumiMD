# LumiMD Codebase Reference

## What Is LumiMD?

A consumer health app that records medical visits, transcribes audio via AssemblyAI, and extracts structured medical data (diagnoses, medications, action items) using GPT-4. Patients use the mobile app; caregivers access a read-only web portal and a mobile caregiver experience (same app, role-based routing).

## Monorepo Layout

```
LumiMD/Codebase/
├── mobile/          # Expo 54 + React Native 0.81 + React 19 (iOS app)
├── functions/       # Firebase Cloud Functions + Express API (Node 20, TypeScript)
├── web-portal/      # Next.js 15 + React 19 (caregiver dashboard)
├── packages/sdk/    # Shared TypeScript types, API client, React Query hooks
├── firebase-setup/  # firestore.rules, storage.rules
├── marketing-site/  # Vite static landing page
├── firestore.indexes.json
├── firebase.json
└── docs/            # Architecture docs, schema, guides, reports
```

**Install:** `npm install --legacy-peer-deps` at root (Expo SDK 54 + React 19 conflict).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Expo 54, React Native 0.81, Expo Router (file-based) |
| Web | Next.js 15, TailwindCSS, Radix UI, Recharts |
| Backend | Firebase Cloud Functions, Express.js |
| Database | Cloud Firestore (NoSQL) |
| Storage | Firebase Storage (audio, AES-256 encrypted) |
| Auth | Firebase Auth (email/password, Google via native SDK, Apple) |
| AI - STT | AssemblyAI (transcript + speaker labels) |
| AI - NLP | OpenAI GPT-4 (gpt-4-turbo for transcripts, gpt-4o for Vision/document extraction) |
| Push | Expo Push + Firebase Cloud Messaging |
| Email | Resend |
| Error Tracking | Sentry |
| Hosting | Firebase Functions + Vercel (web) + Expo/TestFlight (mobile) |

## Firebase Projects

- **Dev:** `lumimd-dev`
- **Prod:** `lumimd`

Switch with `firebase use lumimd-dev`.

## Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `users/{uid}` | User profiles, allergies, medical history |
| `visits/{id}` | Visits with status machine + AI summary |
| `medications/{id}` | Medication list (active/inactive, safety warnings) |
| `actions/{id}` | Action items / follow-ups |
| `nudges/{id}` | Context-rich health check-ins (medication follow-ups, symptom checks, side effects, condition reminders) |
| `healthLogs/{id}` | Vitals / symptoms |
| `medicationLogs/{id}` | Medication dose logs (taken/skipped, source: manual or nudge_response) |
| `medicationReminders/{id}` | Reminder schedules with times + timezone |
| `caregiverMessages/{id}` | One-way caregiver → patient messages |
| `shares/{ownerId_cgId}` | Caregiver access (pending/accepted/revoked, includes `caregiverName`) |
| `shareInvites/{token}` | Pending invite tokens (includes optional `caregiverName`) |
| `devices/{id}` | Push notification tokens |
| `auth_handoffs/{code}` | Temporary mobile→web auth codes (10 min TTL) |
| `privacyAuditLogs/{id}` | Privacy audit trail (account deletions, data exports, sweeps, access changes) — admin SDK only |

**Soft deletes:** All records use `deletedAt` field instead of hard delete. Queries always filter `deletedAt == null`. 30-day retention before `privacySweeper` purges.

## Visit Processing Pipeline

**Audio-based visits:**
```
Mobile audio upload → Firebase Storage
    ↓ (Storage trigger)
AssemblyAI transcription (poll up to 8 min)
    ↓
GPT-4 extraction (4-stage prompt: v1 legacy → v2 structured → summary → education)
    ↓
Medication safety check (duplicate therapy, drug interactions, allergy alerts)
    ↓
Firestore update (status: pending → transcribing → processing → completed)
    ↓
Post-commit ops (denormalization sync, walkthrough generation, nudge creation — parallel)
    ↓
Push notification to caregiver
```

**Document-based visits (AVS photo/PDF):**
```
Mobile capture/select → Firebase Storage (visits/{userId}/{timestamp}.ext)
    ↓
POST /v1/visits/:id/process-document
    ↓
Generate signed URLs (images) or download + base64 encode (PDFs)
    ↓
GPT-4o Vision extraction (images as image_url blocks; PDFs as file content block)
    ↓
Summary stage → Medication safety check → Firestore update → Post-commit ops
```

**Visit status machine:** `pending` → `transcribing` → `processing` → `completed` | `failed`

## Key Source Files

### Backend (`functions/src/`)
- `index.ts` — Express app setup, middleware stack
- `config.ts` — Environment config
- `routes/visits.ts` — Visit CRUD + processing triggers
- `routes/medications.ts` — Medication CRUD
- `routes/actions.ts` — Action items CRUD
- `routes/messages.ts` — Patient inbox (list, mark-read, unread count)
- `routes/nudges.ts` — Nudge CRUD + response handler (includes `took_it`/`skipped_it` for medication follow-ups)
- `routes/care.ts` — Caregiver route aggregator + multi-patient overview
- `routes/care/followThrough.ts` — Per-visit follow-through (med changes + action items)
- `routes/care/quickOverview.ts` — Individual patient snapshot
- `routes/care/summary.ts` — Patient summary with alerts
- `routes/care/alerts.ts` — Patient alerts (missed doses, overdue items)
- `routes/care/tasks.ts` — Caregiver-created tasks CRUD
- `routes/care/upcomingActions.ts` — Upcoming/overdue action items
- `routes/care/trends.ts` — Health trends (vitals, adherence, coverage)
- `routes/care/medicationAdherence.ts` — Adherence stats with confidence indicators
- `routes/care/medicationStatus.ts` — Today's medication status
- `routes/care/medicationChanges.ts` — Medication change history
- `routes/care/messages.ts` — Caregiver → patient messaging (send + list sent, resolves sender name from share/profile/auth)
- `routes/care/notes.ts` — Caregiver notes per patient
- `routes/care/healthLogs.ts` — Patient health logs for caregiver view (includes trend insights)
- `routes/care/nudgeHistory.ts` — Nudge response history for caregiver view
- `routes/care/exportSummary.ts` — Printable care summary export
- `routes/shares.ts` — Share CRUD, invite system, `resolveCaregiverName()` helper (profile → auth → invite label → email fallback)
- `routes/webhooks.ts` — AssemblyAI webhook receiver
- `services/openai.ts` — GPT-4 summarization (4-stage prompts) + GPT-4o Vision document extraction (PDF via base64 `file` block, images via signed URL `image_url`)
- `services/assemblyai.ts` — Transcription polling
- `services/medicationSafety.ts` — Drug interaction checker (local CANONICAL_MEDICATIONS + optional RxNav)
- `services/visitProcessor.ts` — Orchestrates the full processing pipeline
- `services/denormalizationSync.ts` — Keeps caregiver-accessible fields in sync
- `services/walkthroughGenerator.ts` — Pre-computes post-visit walkthrough from GPT-4 output
- `services/walkthroughQA.ts` — 3-tier visit Q&A (keyword match → data match → guarded LLM)
- `services/trendAnalyzer.ts` — Rule-based health trend detection (no AI calls)
- `services/nudgeNotificationService.ts` — Nudge delivery + priority map
- `services/notificationPreferences.ts` — Patient notification preference reader (defaults-to-true semantics, configurable quiet hours)
- `services/repositories/` — Firestore data access (query building, pagination, soft-delete filtering)
- `services/domain/` — Domain service layer (VisitDomainService, MedicationDomainService, MedicationLogDomainService, etc.)
- `triggers/` — Scheduled Cloud Functions (processVisitAudio, checkPendingTranscriptions, medicationSafetyRecheck, staleVisitSweeper, medicationFollowUpNudges, actionItemReminderNudges, actionOverdueNotifier, caregiverDailyBriefing, caregiverAlerts, etc.)

### Mobile (`mobile/`)
- `app/index.tsx` — Home dashboard
- `app/record-visit.tsx` — Audio recording (max 2 hours)
- `app/visit-detail.tsx` — Visit summary view
- `app/medications.tsx` — Medication management
- `app/actions.tsx` — Action items (pending/completed tabs)
- `app/health.tsx` — Health log
- `app/messages.tsx` — Patient inbox (caregiver messages, elderly-friendly large text)
- `app/medication-schedule.tsx` — Reminder scheduling
- `app/caregiver-sharing.tsx` — Share management (invite with name, shows caregiver names)
- `app/upload-avs.tsx` — AVS document upload (photo/PDF capture, multi-image, Firebase Storage upload)
- `app/_layout.tsx` — Root layout + push notification routing + medication reminder action button handling (Took it / Skipped) + timezone sync on foreground
- `components/VisitWalkthrough.tsx` — Post-visit walkthrough overlay (3-step: heard → changed → next)
- `components/lumibot/PostLogFeedback.tsx` — Post-log feedback modal with trend context
- `lib/notifications.ts` — Push token registration, `syncTimezone()`, notification categories for medication reminder action buttons (`registerNotificationCategories()`)
- `lib/googleAuth.ts` — Native Google Sign-In via `@react-native-google-signin/google-signin` (replaced browser-based `expo-auth-session` which Google blocked for custom URI schemes)
- `lib/recordingConsent.ts` — Location-based recording consent detection with state abbreviation normalization
- `lib/auth.ts` — Firebase auth helpers (`hasPasswordProvider()`, `linkEmailPassword()` for adding web password to Apple/Google-only accounts)
- `lib/utils/medlineplus.ts` — MedlinePlus link resolver (`openMedlinePlus()` — conditions use NLM Health Topics API for direct page URLs; medications fall back to contextual search)
- `lib/api/hooks.ts` — React Query hooks (useRealtimeVisits, useRealtimeActiveMedications, useMyMessages, useUnreadMessageCount, etc.)
- `lib/api/mutations.ts` — Mutations (useCompleteAction, useUpdateUserProfile, useInviteCaregiver)
- `contexts/` — AuthContext (global auth state)

### Web Portal (`web-portal/`)
- `app/(protected)/` — Authenticated routes (dashboard, visits, medications, actions, ops/)
- `app/care/page.tsx` — Caregiver dashboard (multi-patient overview, clickable patient cards, refresh button)
- `app/care/[patientId]/page.tsx` — Patient detail (quick summary, trends, tasks CRUD, refresh + print summary buttons)
- `app/care/[patientId]/actions/` — Action items list (expandable cards with details, visit link, refresh button)
- `app/care/[patientId]/messages/` — Caregiver messaging (compose + sent history)
- `app/care/[patientId]/adherence/` — Medication adherence with confidence indicators
- `app/care/[patientId]/medications/` — Patient medication list
- `app/care/[patientId]/visits/` — Visit history
- `app/care/[patientId]/health/` — Health logs / vitals
- `app/care/[patientId]/conditions/` — Conditions list
- `app/care/[patientId]/providers/` — Provider list
- `app/sign-in/page.tsx` — Patient sign-in (email/password + Google + Apple guidance + app handoff)
- `app/sign-up/page.tsx` — Patient sign-up (email/password + Google with terms gate)
- `app/care/sign-in/page.tsx` — Caregiver sign-in (email/password + Google, requires invite token)
- `app/care/sign-up/page.tsx` — Caregiver sign-up (email/password + Google with terms gate, requires invite token)
- `app/shared/` — Caregiver read-only view (no login required)
- `app/api/` — Next.js API routes (auth, email, medlineplus redirect proxy)
- `app/api/medlineplus/route.ts` — Resolves MedlinePlus direct page URLs via NLM Health Topics API (302 redirect); avoids CORS issues for web
- `lib/utils/medlineplus.ts` — `getMedlinePlusUrl(name, type)` — conditions route through `/api/medlineplus` proxy; medications use contextual NLM search
- `lib/auth/errors.ts` — Shared Firebase auth error code → user-friendly message mapping
- `lib/api/hooks.ts` — React Query hooks (useCareOverview, useCareQuickOverview, useCareSummaryExport, useCareMessages, useSendCareMessage, etc.)

### Shared SDK (`packages/sdk/src/`)
- `api-client.ts` — HTTP client with retry, timeout, error mapping
- `models/` — TypeScript types (Visit, Medication, ActionItem, UserProfile, Share, Nudge, etc.)
- `hooks/` — Shared React Query hooks
- `realtime/` — Firestore real-time listeners

## API Endpoints

All routes are under `/v1/` and require `Authorization: Bearer <firebase-jwt>`.

| Route | Method | Description |
|-------|--------|-------------|
| `/v1/visits` | GET, POST | List visits (paginated), create visit |
| `/v1/visits/:id` | GET, PATCH, DELETE | Visit detail, update, soft-delete |
| `/v1/medications` | GET, POST | List meds, add medication |
| `/v1/medications/:id` | PATCH, DELETE | Update, soft-delete |
| `/v1/actions` | GET, POST, PATCH | Action items |
| `/v1/users/me` | GET, PATCH, DELETE | Profile, update, account delete |
| `/v1/users/push-tokens` | POST, DELETE | Register/unregister push tokens |
| `/v1/auth/create-handoff` | POST | Create mobile→web auth code |
| `/v1/auth/exchange-handoff` | POST | Exchange code for token |
| `/v1/shares` | GET, POST, PATCH | Caregiver sharing |
| `/v1/nudges` | GET, PATCH | Health check-ins (includes medication follow-up nudges) |
| `/v1/nudges/:id/respond` | POST | Respond to nudge (`took_it`/`skipped_it` creates med log) |
| `/v1/health-logs` | GET, POST | Vitals/symptoms |
| `/v1/health-logs/insights` | GET | Health trend insights (rule-based) |
| `/v1/medication-reminders` | GET, POST, PATCH, DELETE | Reminder schedules |
| `/v1/messages` | GET | Patient inbox (caregiver messages) |
| `/v1/messages/:id/read` | PATCH | Mark message as read |
| `/v1/messages/unread-count` | GET | Unread message count |
| `/v1/care/overview` | GET | Multi-patient dashboard overview |
| `/v1/care/:patientId/quick-overview` | GET | Individual patient snapshot |
| `/v1/care/:patientId/summary` | GET | Patient summary with alerts |
| `/v1/care/:patientId/messages` | GET, POST | Caregiver: list sent / send message (10/day limit) |
| `/v1/care/:patientId/medication-adherence` | GET | Adherence stats with confidence indicators |
| `/v1/care/:patientId/actions` | GET | Patient action items (paginated) |
| `/v1/care/:patientId/tasks` | GET, POST, PATCH, DELETE | Caregiver-created tasks (CRUD) |
| `/v1/care/:patientId/upcoming-actions` | GET | Upcoming/overdue action items |
| `/v1/care/:patientId/alerts` | GET | Patient alerts (missed doses, overdue actions) |
| `/v1/care/:patientId/trends` | GET | Health trends (vitals, adherence, actions) |
| `/v1/care/:patientId/export/summary` | GET | Printable care summary |
| `/v1/care/:patientId/health-logs` | GET | Patient health logs |
| `/v1/care/:patientId/notes` | GET, PUT, DELETE | Caregiver notes |
| `/v1/care/:patientId/medication-status` | GET | Today's medication status |
| `/v1/care/:patientId/medication-changes` | GET | Medication change history |
| `/v1/care/:patientId/nudge-history` | GET | Nudge response history for caregivers |
| `/v1/visits/:id/ask` | POST | Visit Q&A (walkthrough) |
| `/v1/visits/:id/process-document` | POST | Extract structured data from AVS document |
| `/v1/care/:patientId/visits/:visitId/follow-through` | GET | Per-visit follow-through (med changes + action items) |
| `/v1/webhooks/assemblyai` | POST | Transcription webhook |

## Security

- **CORS whitelist:** `https://lumimd.app`, `https://portal.lumimd.app`, localhost in dev, Vercel preview URLs
- **Rate limiting:** 100 req/15min (prod), 500 req/15min (dev); 5 auth attempts/15min
- **Helmet.js:** CSP, HSTS, X-Frame-Options, etc.
- **Firestore rules:** Owner-only writes; caregivers read via accepted `shares` doc
- **OpenAI:** `store: false` on all calls (no data retention)
- **Constant-time comparison:** Webhook secret validation
- **Storage path validation:** `validateStoragePath()` enforces user-namespace prefix on all `storagePath`/`documentStoragePath` fields before Admin SDK access (prevents cross-user document reads)
- **Soft deletes:** Audit trail preserved for 30 days

## Authentication Flow

1. **Mobile:** Firebase Auth (email/password, Google via `@react-native-google-signin/google-signin` native SDK, Apple). JWT attached as `Authorization: Bearer`
2. **Web portal (patient):** Email/password or Google Sign-In via `signInWithPopup`. New Google users auto-provisioned with `roles: ['patient']`
3. **Web portal (caregiver):** Email/password or Google Sign-In. Invite token accepted after auth. `email_mismatch` triggers sign-out + error
4. **Caregiver:** Gets invited by owner → creates account → accepts share → Firestore rules grant read access
5. **Mobile↔Web handoff:** Owner creates temp code via `/v1/auth/create-handoff` (5 min TTL); web exchanges via `/v1/auth/exchange-handoff` → `signInWithCustomToken`. Works for all auth providers (email, Google, Apple)
6. **Apple users on web:** No direct Apple Sign-In on web. Use mobile handoff (Settings → Web Access → Open Web Portal) or set a password via Settings → Web Access → Set Password for Web, then sign in with email/password
7. **Auth error handling:** All web auth pages use shared `getAuthErrorMessage()` from `web-portal/lib/auth/errors.ts` for consistent Firebase error mapping

## Scheduled Functions (Triggers)

| Function | Frequency | Purpose |
|----------|-----------|---------|
| `checkPendingTranscriptions` | Every 5 min | Retry stuck transcriptions |
| `processAndNotifyMedicationReminders` | Every 5 min | Send due reminders |
| `medicationSafetyRecheck` | Every 15 min | Re-check med warnings |
| `processAndNotifyDueNudges` | Every 15 min | Send nudge notifications |
| ~~`processMedicationFollowUpNudges`~~ | ~~Every 15 min~~ | ~~Send follow-up nudges for unlogged doses~~ (removed from cloud — replaced by notification action buttons) |
| `processActionItemReminderNudges` | Every 15 min | Create nudges for pending/overdue action items |
| `processActionOverdueNotifier` | Every 15 min | Push notifications for overdue actions |
| `processCaregiverAlerts` | Every 15 min | Missed-med + visit-ready push to caregivers (respects `alertPreferences`) |
| `processCaregiverDailyBriefing` | Hourly | Timezone-aware daily briefing push (respects `briefingEnabled`) |
| `staleVisitSweeper` | Hourly | Delete old failed visits |
| `privacyDataSweeper` | Daily | Clean up audio, documents, transcripts (24hr); expire/purge stale share invites; write privacy audit log |
| `purgeSoftDeletedData` | Daily | Purge soft-deleted records older than 30 days |
| `denormalizationSync` | On Firestore write | Sync caregiver-accessible fields |

## Development Commands

```bash
# Root install (required due to Expo/React 19 peer deps)
npm install --legacy-peer-deps

# Mobile
cd mobile && npm run ios

# Backend
cd functions && npm run build
cd functions && npm test              # Jest (107 suites / 554 tests)
firebase deploy --only functions

# Web portal
cd web-portal && npm run dev
cd web-portal && npx next build       # Verify production build

# SDK
cd packages/sdk && npm run build      # Builds CJS + ESM + DTS

# Firestore indexes
firebase deploy --only firestore:indexes

# OTA update (JS-only mobile changes, no App Store review needed)
cd mobile && eas update --branch default --message "description"

# Switch Firebase project
firebase use lumimd-dev   # or lumimd (prod)
```

## Testing (Mobile)

Run a single test file: `npx jest __tests__/<file> --no-coverage` (from `mobile/`)
Run multiple: `npx jest __tests__/file1 __tests__/file2 --no-coverage`

**Pre-existing failures:** 9 test suites (`auth-context.test.tsx`, `home.test.tsx`, `sign-in.test.tsx`, `visits.test.tsx`, etc.) fail with `SyntaxError: Unexpected token 'export'` from `lib/appleAuth.ts` or Firebase Firestore ESM issues. These are infrastructure-level failures unrelated to app changes — do not attempt to fix unless explicitly tasked.

**Healthy test files:** `role-resolution.test.tsx`, `notification-handler.test.tsx`, `notifications-registration.test.ts` — these pass reliably and cover auth, push tokens, and notification routing.

## Mobile Architecture Notes

**`@react-native-firebase/auth` fast path:** `auth().currentUser` is synchronously available (unlike web Firebase SDK). Used in `AuthContext` to unblock navigation before `onAuthStateChanged` fires. Mocked in `jest.setup.ts` as `jest.fn(() => ({ currentUser: null }))`.

**Role cache:** Stored as JSON `{ role, at }` in AsyncStorage key `lumimd:cachedRole`. TTL = 1 hour — skips `/v1/users/me` network fetch if fresh. Legacy plain-string values still parse as valid but stale.

**`fetchWithAuth` is private** in `mobile/lib/api/hooks.ts` — cannot be imported externally. Wrap shared prefetch logic in named exports (e.g. `prefetchOnAuth`).

## Common Patterns

**Cache-Control for mutable data:** Use `Cache-Control: private, no-cache` (NOT `max-age`). React Native's `fetch` respects HTTP cache headers, so `max-age` causes stale reads after mutations even when React Query triggers a refetch.

**Pagination:** Cursor-based using Firestore `startAfter`. Always pass `cursor` param for next page.

**Soft delete:** Set `deletedAt = serverTimestamp()` instead of calling `.delete()`. All queries include `.where('deletedAt', '==', null)`.

**Real-time hooks:** Mobile uses Firestore real-time listeners (not polling). Web uses React Query + listeners via SDK.

**Error handling (SDK):** Network errors, timeouts, 5xx → retryable. 401/403 → session expired. 429 → rate limit message.

**Caregiver access:** Firestore rules check `shares/{ownerId_caregiverId}` status = 'accepted'.

**Date-only overdue checks:** Always compare dates as `dueDate.toISOString().slice(0, 10) < todayDateStr` (NOT `dueDate < now`). Datetime comparison causes items due today to show as overdue once server time passes the stored timestamp.

**Soft-delete at query level:** Never use `includeDeleted: true` unless the endpoint specifically needs deleted records. Let the repository's `buildUserQuery` add `where('deletedAt', '==', null)` at the Firestore level rather than filtering in memory.

**z-index layers:** Dialogs use `z-modal` (500). Select/popover content must use `z-[510]` or higher to render above dialog overlays.

**Medical advice guardrails:** Never attribute health outcomes to specific medications. Show data and medications side by side — let the physician connect the dots. All AI-generated nudge/insight content passes through unsafe pattern regex (`since starting`, `appears to be working`, `caused by`, `you should stop/start`). Matches fall back to safe templates. Always deflect clinical questions to "your care team."

**Walkthrough generation:** Walkthroughs are pre-computed during visit processing from existing GPT-4 output (zero extra LLM calls). Stored directly on the visit document. Q&A uses 3-tier approach: keyword match → data match → guarded LLM fallback.

**GPT-4o Vision content types:** Images use `image_url` blocks with signed URLs. PDFs must be downloaded from Storage, base64 encoded, and sent as `file` content blocks (`data:application/pdf;base64,...`). The `image_url` type does NOT accept PDF URLs (returns 400).

**Timezone sync:** Device timezone (IANA string, e.g. `America/New_York`) is stored on `users/{uid}.timezone`. Updated via: (1) push token registration on app launch, (2) `syncTimezone()` on every app foreground — compares `Intl.DateTimeFormat().resolvedOptions().timeZone` to cached value, patches profile if changed. All backend triggers read timezone from user profile on each run. Medication reminders with `timingMode: 'local'` shift with the user's timezone; `timingMode: 'anchor'` stays fixed (intentional for time-critical meds). `PATCH /v1/users/me` accepts `timezone` field directly.

**MedlinePlus linking:** Condition links resolve to direct topic pages via NLM Health Topics API (`wsearch.nlm.nih.gov/ws/query?db=healthTopics`). Mobile calls API directly (no CORS in React Native); web proxies through `/api/medlineplus` (302 redirect). Medication links use contextual NLM search (appending "medication" to query). No drug-specific API exists from NLM.

## Key Documentation

- `docs/reference/DATABASE-SCHEMA.md` — Full Firestore schema
- `docs/TECHNICAL_OVERVIEW.md` — Architecture for non-engineers
- `docs/reports/SYSTEM-HEALTH-REPORT.md` — Current system health status
- `docs/CAREGIVER-ENHANCEMENTS-CHECKLIST.md` — Implementation checklist for caregiver portal features
- `docs/POSTVISIT-INSPIRED-ENHANCEMENTS.md` — PostVisit-inspired enhancements planning doc (Phases 5-7 complete, Strategic CRUD next)
- `docs/DATA-INTEGRATION-DESIGN.md` — Data integration design (AVS upload + action nudges)
- `docs/SECURITY.md` — Consolidated security & privacy doc (posture, incidents, open items, compliance)
- `docs/archive/` — Completed execution guides (LumiBot v2, PostVisit, data integration, privacy remediation, etc.)
- `docs/guides/` — Quick Start, Firebase setup, deployment checklists
- `docs/architecture/` — System design docs

## Recent Changes (March 2026)

### Caregiver Portal (deployed to `lumimd-dev`)

**Features:**
- **Full caregiver dashboard** — Multi-patient overview (`/care`), individual patient detail (`/care/:patientId`), with sub-pages for actions, medications, visits, adherence, messages, health, conditions, providers
- **Clickable patient cards** — Card body links to patient dashboard; bottom buttons for Medications and Actions
- **Refresh buttons** — Manual refresh on dashboard, patient detail, and actions pages (triggers React Query `refetch()`)
- **Print/export summary** — "Print Summary" button on patient detail; fetches from `/v1/care/:patientId/export/summary` and opens a print-ready page
- **Caregiver task management** — CRUD for caregiver-created tasks with title, description, due date, and priority selection
- **Adherence confidence indicators** — `GET /v1/care/:patientId/medication-adherence` returns `confidence: { level, factors }` per-medication
- **Medication follow-up nudges** — `processMedicationFollowUpNudges` trigger detects unlogged doses; `took_it`/`skipped_it` responses auto-create med logs
- **Caregiver → patient messaging** — Full pipeline: `caregiverMessages` collection, caregiver send (10/day limit), patient inbox, push notifications, mobile + web UI
- **Caregiver name support** — Name resolution via `resolveCaregiverName()`: profile `preferredName` → `firstName` → `displayName` → Auth `displayName` → invite label → email fallback
- **Action item details** — Expandable cards showing type, details, notes, and "View source visit" link

**Bug Fixes:**
- **Overdue action items showing on same day:** Datetime comparison (`dueDate < now`) marked items overdue once server time passed stored timestamp. Fixed with date-string comparison across all care routes (care.ts, quickOverview.ts, alerts.ts, tasks.ts, upcomingActions.ts, summary.ts, trends.ts, actions page)
- **Deleted actions still appearing:** `getPendingActionsAndOverdueAlertsForPatients` in care.ts queried without `deletedAt` filter. Fixed by adding `where('deletedAt', '==', null)` and removing `includeDeleted: true` across all care routes
- **Select dropdown hidden behind Dialog:** SelectContent z-index (50) was lower than Dialog z-modal (500). Fixed by bumping to z-[510]
- **Missing senderId in messages POST response:** Frontend expected `senderId` but it wasn't included. Added to response
- **Action item completion query key mismatch:** `useCompleteAction` was invalidating wrong query key. Now invalidates base `['actions']` to match all variants
- **Caregiver sharing revocation stale UI:** `Cache-Control: max-age=30` on shares endpoints. Fixed with `no-cache` + optimistic updates
- **Messages read/unread stale cache:** Same `max-age` issue on messages endpoints. Fixed with `no-cache`
- **All care routes Cache-Control:** Verified all GET endpoints use `Cache-Control: private, no-cache`

### Web Portal Design System (March 2026)

**Brand & Typography:**
- Brand cyan: `#40C9D0` (`--color-brand-primary`)
- Warm neutral palette: cream surfaces (`#FDFCF9`), warm borders (`rgba(38,35,28,...)`), sage gradients (`#7ECDB5`), coral accent (`#E07A5F`)
- Fonts: Plus Jakarta Sans (`--font-body`) + Fraunces (`--font-display`)
- Component variants via Class Variance Authority (CVA)

**Design Patterns:**
- Hero sections use `bg-hero-warm` (caregiver) or `bg-hero-brand` (sub-pages like adherence, health)
- Empty states: gradient strip (`from-brand-primary via-[#7ECDB5] to-[#E07A5F]`), coral icon circle (`bg-[#FDF0EC] text-[#E07A5F]`), visits use cyan instead of coral
- Section headers use semantic icon backgrounds: warning (med changes), info (data coverage), brand-primary (activity), success (care tasks)
- Quick Action cards and Health Snapshot items use `variantClasses` map: `brand`, `error`, `info`, `success`, `warning`
- Progress bars in Data Coverage: green/yellow/red based on thresholds
- Zone dividers: `border-t border-border-subtle` between major content sections

**Responsive Conventions:**
- Headings: `text-2xl sm:text-3xl lg:text-4xl` (never hardcode large sizes without mobile fallback)
- Grids: always include mobile fallback (`grid-cols-2 sm:grid-cols-4`, not bare `grid-cols-4`)
- Fixed-width inputs/selects: use `w-full sm:w-40` pattern (not bare `w-40`)
- Hero sections: use `rounded-2xl p-6` without negative margins (negative margins cause horizontal scroll on mobile)
- Button groups: use `flex-col sm:flex-row` for wrapping; hide labels with `hidden sm:inline` and keep icon visible
- Gaps: use responsive gaps (`gap-1.5 sm:gap-2`) when space is tight on mobile
- Calendar heatmaps: reduce label widths on mobile (`w-8 sm:w-10`, `ml-10 sm:ml-12`)

### LumiBot v2 (March 2026)

Evolved from notification-only system into contextual health companion across all 3 surfaces (mobile, web portal, backend).

**Context-rich nudges:** Every nudge carries `NudgeContext` linking back to visit, provider, diagnosis, medication, and last reading. NudgeCard displays context; PostLogFeedback shows trend after logging.

**Post-visit walkthrough:** 3-step bottom-sheet overlay on visit detail (What we heard → What changed → What's next). Auto-shows on first open, re-accessible via "Review with LumiBot" button. Suggested Q&A + guarded free-form ask.

**Health metrics hub:** Mobile health screen with SVG trend charts (BP/Glucose/Weight), period selector, insight cards from `trendAnalyzer.ts`, recent readings list. Linked from PostLogFeedback and home screen.

**Caregiver intelligence:** Nudge response history, trend insights, symptom/side-effect timelines on patient health page. `missed_checkins` and `medication_trouble` alert types. Cross-patient Health Overview on dashboard.

### Web Portal Auth & Apple Sign-In Web Access (March 2026)

**Problem:** Apple Sign-In users on mobile had no way to access the web portal directly — web only supported email/password login.

**Solution:**
- **Google Sign-In on web** — Added `signInWithPopup` + `GoogleAuthProvider` to all 4 web auth pages (sign-in, sign-up, care/sign-in, care/sign-up)
- **Terms gating on sign-up** — Google Sign-Up requires Terms + Privacy checkboxes before proceeding (records legal assent with `source: 'signup_web_google'`)
- **New-user role provisioning** — If a user hits Sign In (not Sign Up) with Google and it creates a new account, auto-sets `roles: ['patient']` via `getAdditionalUserInfo(result).isNewUser`
- **Caregiver invite token flow** — Google Sign-In on care pages accepts invite token after auth; `email_mismatch` triggers sign-out + user-friendly error
- **Shared error handling** — `web-portal/lib/auth/errors.ts` maps Firebase error codes (popup-closed, account-exists-with-different-credential, popup-blocked, etc.) to user-friendly messages across all auth pages
- **Mobile "Web Access" settings** — New section in `mobile/app/settings.tsx` with "Open Web Portal" (uses existing handoff) and "Set Password for Web" (uses `linkWithCredential` to add email/password provider to Apple/Google-only accounts)
- **Private relay email warning** — Coral-colored warning when Apple private relay email detected (`@privaterelay.appleid.com`)
- **Apple guidance cards** — All web sign-in pages show Apple Sign-In guidance: "In the LumiMD app, go to Settings > Web Access > Open Web Portal to sign in automatically"

### PostVisit-Inspired Enhancements (March 2026)

Phases A-D complete.

**Phase A — iOS Quick Wins:**
- Inline action item checkboxes on visit-detail (real-time Firestore listener + `useCompleteAction`, matched by description text)
- Sticky floating "Review with LumiBot" pill (always visible on completed visits with walkthrough data)
- Recording consent card gate on record-visit (two-party default, coral icon, privacy policy link)

**Phase B — MedlinePlus Resource Links:**
- Context-aware `getMedlinePlusUrl(name, type)` utility (mobile + web)
- Conditions: resolved to direct MedlinePlus topic pages via NLM Health Topics API (`wsearch.nlm.nih.gov`). Mobile calls API directly (no CORS in RN); web uses `/api/medlineplus` proxy route (302 redirect)
- Medications: contextual NLM search (appends "medication" to query, surfaces drug info page as first result)
- "Learn more" links on visit-detail diagnoses/medications (iOS + web), medication screens (iOS + web patient + caregiver)

**Phase C — Web Portal Enhancements:**
- `/v1/care/overview` extended with `latestVitals` (BP, weight, glucose from recent health logs)
- Patient cards on caregiver dashboard enriched with vitals row + last active indicator; `HealthOverviewPanel` removed
- Inline action checkboxes on web visit detail (`/visits/[id]`) with real-time Firestore listener + optimistic updates

**Phase D — Lightweight iOS CRUD:**
- Mutation hooks: `useCreateMedication`, `useUpdateMedication`, `useDeleteMedication`, `useCreateAction`
- `EditMedicationSheet` bottom-sheet (name, dose, frequency, stop medication)
- `AddMedicationSheet` bottom-sheet with post-add reminder navigation
- `AddActionSheet` bottom-sheet with optional date picker
- Medications screen: FAB for add, Edit/Stop/Delete in expanded cards (delete only for `source: 'manual'`)
- Actions screen: FAB for add action items
- Visit-detail: "Edit" links on started/changed medications (auto-creates doc if not in collection)

### Data Integration — AVS Upload & Action Nudges (March 2026)

Two-phase feature adding document-based visit creation and proactive action item reminders.

**Phase 1 — AVS Photo/Document Upload (mobile):**
- `mobile/app/upload-avs.tsx` — New screen for capturing/selecting AVS photos or PDFs via `expo-image-picker` / `expo-document-picker`
- Multi-image support (up to 10 pages) with thumbnail grid preview, page number badges, remove buttons, "Add page" tile
- PDF single-file upload via `expo-document-picker`
- Upload to Firebase Storage (`visits/{userId}/{timestamp}.ext`) with metadata (content type)
- Creates visit with `source: 'avs_photo' | 'avs_pdf'`, `documentStoragePath` (string or string[]), `documentType`
- Direct-attach flow: `visitId` param from visit-detail's AVS prompt banner updates existing visit instead of creating new one
- `POST /v1/visits/:id/process-document` — Images: generates signed URLs as `image_url` blocks; PDFs: downloads from Storage, base64 encodes, sends as `file` content block to GPT-4o Vision
- `openai.ts: extractFromDocument()` — Multi-image/PDF extraction with canonical medication matching, dynamic page-count prompting
- Same-day merge logic: AVS within 24hrs of a recording visit merges into it (AVS wins for factual data, recording wins for narrative; source becomes `recording+avs`)
- Document retry path in `POST /v1/visits/:id/retry` — detects `documentStoragePath`, re-runs GPT-4o extraction (separate from audio retry)
- Cloud Function timeout: 300s; OpenAI axios timeout: 180s (Vision with multi-page images needs extended time)
- Storage rules under `visits/{userId}/{fileName}` (owner read/write, 20 MB limit for image/PDF content types)
- Home screen "Upload AVS" card in the quick actions section
- AVS prompt banner on visit-detail for recording-only visits (dismissible via AsyncStorage, links to upload-avs with `visitId` for direct-attach)

**Phase 2 — Action Item Reminder Nudges:**
- `functions/src/triggers/actionItemReminderNudges.ts` — Scheduled trigger creating `action_reminder` nudges for pending/overdue actions
- `functions/src/triggers/actionOverdueNotifier.ts` — Scheduled trigger sending push notifications for overdue actions
- `NudgeActionType` extended with `action_followup_response`; `NudgeType` extended with `action_reminder`
- `NudgeContext` extended with `actionType` field (lab_draw, specialist_referral, imaging, follow_up_appointment, other)
- Nudge response handler supports `done` / `remind_later` responses for action follow-ups
- `NudgeCard` displays action context (Lab work / Referral / Follow-up) with clipboard icon
- `LumiBotBanner` handles `action_followup_response` with 3-option Alert (Not yet / Remind me later / Done)
- `GET /v1/care/:patientId/visits/:visitId/follow-through` — Per-visit follow-through endpoint (medication changes + action items with status)
- `FollowThroughSection` on web visit detail — Progress bar, sorted checklist (overdue → pending → completed), status badges
- SDK types updated: `ActionItem.visitId`, `Visit.source`, `Visit.documentStoragePath`, `Visit.documentType`, `RespondToNudgeRequest` extended

### Caregiver Mobile Experience (March 2026)

Single-app dual-experience: Expo Router route groups `(patient)/` and `(caregiver)/` with layout guards. All hooks cross-checked against backend API responses (March 13, 2026).

**Architecture:**
- Role resolution in `AuthContext`: `primaryRole` → `roles[]` → fallback `patient`, with AsyncStorage override for dual-role switching
- Root `app/index.tsx` is a thin role router → `/(patient)/` or `/(caregiver)/`
- Layout guards in both groups check `isAuthenticated` first (→ `/sign-in`), then `role` (→ `/`)
- All caregiver data comes from existing `/v1/care/*` API endpoints (no new backend routes)
- Caregiver screens nest under `(caregiver)/patient/[patientId]/` to avoid URL conflicts

**Screens:**
- `(caregiver)/index.tsx` — Home: daily briefing card, needs-attention alerts, patient status cards
- `(caregiver)/settings.tsx` — Notification preferences (briefing toggle/time, alert type toggles), role switch, linked patients
- `(caregiver)/patient/[patientId]/index.tsx` — Patient detail dashboard (quick overview, today's meds, alerts, action counts, recent activity, nav buttons)
- `(caregiver)/patient/[patientId]/visits.tsx` — Visit list with status badges, diagnosis preview
- `(caregiver)/patient/[patientId]/visit-detail.tsx` — Full visit summary (collapsible sections: diagnoses, medications started/changed/stopped/continued, next steps, follow-ups, tests, education)
- `(caregiver)/patient/[patientId]/medications.tsx` — Medication list with today's status dots, warnings, inactive badges
- `(caregiver)/patient/[patientId]/actions.tsx` — Action items sorted overdue → pending → completed, with "Message about this" shortcut
- `(caregiver)/patient/[patientId]/messages.tsx` — Caregiver → patient messaging (10/day limit, read receipts, prefill from action items)

**Caregiver hooks (mobile/lib/api/hooks.ts, line 1382+):**

| Hook | Endpoint | queryFn transform? | Status |
|------|----------|-------------------|--------|
| `useCareOverview` | `GET /v1/care/overview` | Yes — `userId`→`patientId`, `name`→`patientName`, `priority`→`severity` | Verified |
| `useCareAlerts` | `GET /v1/care/:patientId/alerts` | Yes — maps `severity: 'emergency'`→`'high'` (backend type not in mobile enum) | Verified |
| `useCareQuickOverview` | `GET /v1/care/:patientId/quick-overview` | Yes — `needsAttention`→`alerts`, `todaysMeds`→`medicationsToday` | Verified |
| `useCareMedicationStatus` | `GET /v1/care/:patientId/medication-status` | Yes — `schedule`→`medications`, `medicationId`→`id` | Verified |
| `useCareVisits` | `GET /v1/care/:patientId/visits` | No — bare array, field names match | Verified |
| `useCareVisitDetail` | `GET /v1/care/:patientId/visits/:visitId` | No — explicit fields match interface | Verified |
| `useCareMedications` | `GET /v1/care/:patientId/medications` | No — bare array, fields match | Verified |
| `useCareActions` | `GET /v1/care/:patientId/actions` | No — bare array, `dueAt` matches | Verified |
| `useCareMessages` | `GET /v1/care/:patientId/messages` | No — fields match exactly | Verified |
| `useSendCareMessage` | `POST /v1/care/:patientId/messages` | N/A — mutation, invalidates `['care-messages']` | Verified |

**Cloud Function triggers:**
- `processCaregiverDailyBriefing` — Hourly, timezone-aware daily briefing push (respects `briefingEnabled` + `briefingHour` from profile)
- `processCaregiverAlerts` — Every 15 min, missed-med + visit-ready push (respects `alertPreferences` from profile)

**User profile fields (caregiver preferences):**
- `briefingEnabled: boolean` — Toggle daily briefing (default true)
- `briefingHour: number` — Preferred briefing hour 0-23 (default 8)
- `alertPreferences: { missedMedications, visitReady, overdueActions }` — Per-type alert toggles (default all true)

**User profile fields (patient notification preferences):**
- `notificationPreferences.medicationReminders: boolean` — "Time to take X" pushes (default true)
- `notificationPreferences.medicationFollowUps: boolean` — "Did you take X?" nudges (default true, cascades: disabled when medicationReminders is false)
- `notificationPreferences.actionReminders: boolean` — Due-date action item reminders (default true)
- `notificationPreferences.healthNudges: boolean` — Condition tracking, side effects, insights (default true)
- `notificationPreferences.visitReady: boolean` — "Visit summary ready" push (default true)
- `notificationPreferences.caregiverMessages: boolean` — Caregiver → patient message push (default true; message document still created)
- `notificationPreferences.quietHoursStart: number` — Hour 0-23 (default 21 / 9 PM)
- `notificationPreferences.quietHoursEnd: number` — Hour 0-23 (default 8 / 8 AM)
- All fields default to true/21/8 when missing (backwards-compatible). Suppress pushes only — never suppress data creation.
- Quiet hours adjust dynamically to device timezone via `syncTimezone()` on app foreground (see "Timezone sync" pattern)
- Preference reader: `functions/src/services/notificationPreferences.ts` (`resolveNotificationPreferences()` + `isInQuietHours()`)
- Mobile UI: `mobile/app/(patient)/settings.tsx` (grouped toggles under Reminders / Updates / Schedule sections, each in its own section for proper spacing)

**Navigation flows (verified):**
- Login → role router → `/(caregiver)/` home (data loads via `useCareOverview`)
- Patient card tap → `/(caregiver)/patient/[patientId]/` detail dashboard
- Nav buttons → visits, medications, actions, messages sub-screens
- Visit card tap → visit detail (with collapsible sections)
- Back button (`router.back()`) on all sub-screens
- Sign-out → `router.replace('/')` → role router → `/sign-in`
- Pull-to-refresh on home and patient detail screens
- Settings → notification prefs, role switch, linked patients

**Key files:**
- `mobile/contexts/AuthContext.tsx` — Role resolution + override + available roles
- `mobile/lib/api/hooks.ts` (lines 1382+) — All caregiver hooks (10 hooks, 4 with queryFn transforms)
- `mobile/components/caregiver/` — PatientStatusCard, AlertBanner
- `functions/src/routes/care/patientResources.ts` — Backend: visits, medications, actions list + detail
- `functions/src/routes/care/alerts.ts` — Backend: patient alerts (7 alert types incl. emergency severity)
- `functions/src/routes/care/messages.ts` — Backend: caregiver messaging (send + list)
- `functions/src/triggers/caregiverAlerts.ts`, `caregiverDailyBriefing.ts` — Scheduled push notifications
- `docs/CAREGIVER-MOBILE-CROSSCHECK.md` — Hook crosscheck checklist and fix patterns

### Medication Reminder Action Buttons (March 2026)

**Problem:** Medication follow-up nudges ("Did you take X?") sent 2-4 hours after reminders were redundant with the existing reminder system ("Time to take X"), creating double-notifications.

**Solution:** Added "Took it" / "Skipped" action buttons directly on the medication reminder notification, eliminating the need for separate follow-up nudges entirely.

**Implementation:**
- `mobile/lib/notifications.ts` — `registerNotificationCategories()` creates `medication_reminder` category with `TOOK_IT` and `SKIPPED` action buttons via `Notifications.setNotificationCategoryAsync()`
- `functions/src/services/medicationReminderService.ts` — Added `categoryId: 'medication_reminder'` to Expo Push payload (maps to `categoryIdentifier` on iOS)
- `mobile/app/_layout.tsx` — `NotificationHandler` handles action button taps: creates medication log via `api.medicationLogs.create()`, deduplicates via AsyncStorage (`medLogDedupKey`), invalidates React Query caches
- `packages/sdk/src/api-client.ts` — Added `medicationLogs.create()` method
- `functions/src/index.ts` — `processMedicationFollowUpNudges` trigger disabled (commented out)
- Client-side dedup prevents double-logging from repeated notification taps (AsyncStorage key: `medlog:{medicationId}:{scheduledTime}:{date}`)

### Recording Consent Fix (March 2026)

**Problem:** `expo-location`'s `reverseGeocodeAsync` returns state abbreviations ("CA") on iOS simulator instead of full names ("California"), causing two-party consent states to be incorrectly classified as one-party.

**Fix:** Added `normalizeStateName()` with full 50-state + DC abbreviation-to-name lookup map in `mobile/lib/recordingConsent.ts`.

### Caregiver Login Routing Fix (March 2026)

**Problem:** `resolveRole()` in `AuthContext` didn't reset `roleLoading = true` when called after sign-in. After initial null-user resolution set `roleLoading = false`, a subsequent sign-in would start fetching the profile but the role router would see `roleLoading = false` + `role = null` and show a blank screen.

**Fix:** Added `setRoleLoading(true)` at the start of `resolveRole()` when there's a real user, so the role router waits for the API response before routing.

### Google Sign-In Native SDK Migration (March 2026)

**Problem:** Google blocked custom URI scheme redirects (`lumimd://`) for web-type OAuth clients, breaking the browser-based `expo-auth-session` Google Sign-In flow with "doesn't comply with Google's OAuth 2.0 policy" error.

**Fix:** Replaced `expo-auth-session` + `expo-web-browser` browser OAuth with `@react-native-google-signin/google-signin` native SDK.
- `mobile/lib/googleAuth.ts` — Uses `GoogleSignin.signIn()` for native UI, exchanges ID token with Firebase
- `mobile/app.config.js` — Added `@react-native-google-signin/google-signin` plugin (auto-reads iOS client ID from `GoogleService-Info.plist`)
- Google OAuth consent screen must be published (not Testing mode) for non-test users; basic scopes (`openid`, `profile`, `email`) don't require Google verification

### Deployment & Versioning (March 2026)

- **Current version:** 1.5.0 (build 125)
- **OTA updates:** `eas update --branch default --message "description"` for JS-only changes (no App Store review)
- **Native builds:** `eas build --platform ios --profile production --auto-submit` for native module changes
- **TestFlight:** Same-version builds (e.g., 1.5.0 build 124 → 125) skip Beta App Review. New version numbers trigger review (12-48 hours)
- **Google OAuth consent screen:** Published (production mode) in Google Cloud Console — required for all Gmail accounts to sign in
