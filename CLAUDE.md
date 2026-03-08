# LumiMD Codebase Reference

## What Is LumiMD?

A consumer health app that records medical visits, transcribes audio via AssemblyAI, and extracts structured medical data (diagnoses, medications, action items) using GPT-4. Patients use the mobile app; caregivers view a read-only web portal.

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
| Auth | Firebase Auth (email/password, Google, Apple) |
| AI - STT | AssemblyAI (transcript + speaker labels) |
| AI - NLP | OpenAI GPT-4 (gpt-4-turbo, structured JSON output) |
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
| `nudges/{id}` | AI health check-in prompts (includes `medication_followup` type) |
| `healthLogs/{id}` | Vitals / symptoms |
| `medicationLogs/{id}` | Medication dose logs (taken/skipped, source: manual or nudge_response) |
| `medicationReminders/{id}` | Reminder schedules with times + timezone |
| `caregiverMessages/{id}` | One-way caregiver → patient messages |
| `shares/{ownerId_cgId}` | Caregiver access (pending/accepted/revoked) |
| `shareInvites/{token}` | Pending invite tokens |
| `devices/{id}` | Push notification tokens |
| `auth_handoffs/{code}` | Temporary mobile→web auth codes (10 min TTL) |

**Soft deletes:** All records use `deletedAt` field instead of hard delete. Queries always filter `deletedAt == null`. 30-day retention before `privacySweeper` purges.

## Visit Processing Pipeline

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
Denormalization sync (copy share info to visits/meds for caregiver access)
    ↓
Push notification to caregiver
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
- `routes/care.ts` — Caregiver route aggregator
- `routes/care/medicationAdherence.ts` — Adherence stats with confidence indicators
- `routes/care/messages.ts` — Caregiver → patient messaging (send + list sent)
- `routes/webhooks.ts` — AssemblyAI webhook receiver
- `services/openai.ts` — GPT-4 summarization (52KB, 4-stage prompts)
- `services/assemblyai.ts` — Transcription polling
- `services/medicationSafety.ts` — Drug interaction checker (local CANONICAL_MEDICATIONS + optional RxNav)
- `services/visitProcessor.ts` — Orchestrates the full processing pipeline
- `services/denormalizationSync.ts` — Keeps caregiver-accessible fields in sync
- `services/nudgeNotificationService.ts` — Nudge delivery + priority map
- `services/repositories/` — Firestore data access (query building, pagination, soft-delete filtering)
- `services/domain/` — Domain service layer (VisitDomainService, MedicationDomainService, MedicationLogDomainService, etc.)
- `triggers/` — Scheduled Cloud Functions (processVisitAudio, checkPendingTranscriptions, medicationSafetyRecheck, staleVisitSweeper, medicationFollowUpNudges, etc.)

### Mobile (`mobile/`)
- `app/index.tsx` — Home dashboard
- `app/record-visit.tsx` — Audio recording (max 2 hours)
- `app/visit-detail.tsx` — Visit summary view
- `app/medications.tsx` — Medication management
- `app/actions.tsx` — Action items (pending/completed tabs)
- `app/health.tsx` — Health log
- `app/messages.tsx` — Patient inbox (caregiver messages, elderly-friendly large text)
- `app/medication-schedule.tsx` — Reminder scheduling
- `app/caregiver-sharing.tsx` — Share management
- `app/_layout.tsx` — Root layout + push notification routing (handles `caregiver_message` type)
- `lib/api/hooks.ts` — React Query hooks (useRealtimeVisits, useRealtimeActiveMedications, useMyMessages, useUnreadMessageCount, etc.)
- `lib/api/mutations.ts` — Mutations (useCompleteAction, useUpdateUserProfile, useInviteCaregiver)
- `contexts/` — AuthContext (global auth state)

### Web Portal (`web-portal/`)
- `app/(protected)/` — Authenticated routes (dashboard, visits, medications, actions, ops/)
- `app/care/[patientId]/` — Caregiver views (patient detail, adherence, messages, medications, etc.)
- `app/care/[patientId]/messages/page.tsx` — Caregiver messaging (compose + sent history)
- `app/shared/` — Caregiver read-only view (no login required)
- `app/api/` — Next.js API routes (auth, email)
- `lib/api/hooks.ts` — React Query hooks (useCareMessages, useSendCareMessage, etc.)

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
| `/v1/medication-reminders` | GET, POST, PATCH, DELETE | Reminder schedules |
| `/v1/messages` | GET | Patient inbox (caregiver messages) |
| `/v1/messages/:id/read` | PATCH | Mark message as read |
| `/v1/messages/unread-count` | GET | Unread message count |
| `/v1/care/:patientId/messages` | GET, POST | Caregiver: list sent / send message (10/day limit) |
| `/v1/care/:patientId/medication-adherence` | GET | Adherence stats with confidence indicators |
| `/v1/webhooks/assemblyai` | POST | Transcription webhook |

## Security

- **CORS whitelist:** `https://lumimd.app`, `https://portal.lumimd.app`, localhost in dev, Vercel preview URLs
- **Rate limiting:** 100 req/15min (prod), 500 req/15min (dev); 5 auth attempts/15min
- **Helmet.js:** CSP, HSTS, X-Frame-Options, etc.
- **Firestore rules:** Owner-only writes; caregivers read via accepted `shares` doc
- **OpenAI:** `store: false` on all calls (no data retention)
- **Constant-time comparison:** Webhook secret validation
- **Soft deletes:** Audit trail preserved for 30 days

## Authentication Flow

1. **Mobile/Web:** Firebase Auth (email/password). JWT attached as `Authorization: Bearer`
2. **Caregiver:** Gets invited by owner → creates account → accepts share → Firestore rules grant read access
3. **Mobile↔Web handoff:** Owner creates temp code via `/v1/auth/create-handoff` (10 min TTL); web exchanges via `/v1/auth/exchange-handoff`

## Scheduled Functions (Triggers)

| Function | Frequency | Purpose |
|----------|-----------|---------|
| `checkPendingTranscriptions` | Every 5 min | Retry stuck transcriptions |
| `processAndNotifyMedicationReminders` | Every 5 min | Send due reminders |
| `medicationSafetyRecheck` | Every 15 min | Re-check med warnings |
| `processAndNotifyDueNudges` | Every 15 min | Send nudge notifications |
| `processMedicationFollowUpNudges` | Every 15 min | Send follow-up nudges for unlogged doses |
| `staleVisitSweeper` | Hourly | Delete old failed visits |
| `privacySweeper` | Daily | Purge 30-day-old soft-deleted data |
| `denormalizationSync` | On Firestore write | Sync caregiver-accessible fields |

## Development Commands

```bash
# Root install (required due to Expo/React 19 peer deps)
npm install --legacy-peer-deps

# Mobile
cd mobile && npm run ios

# Backend
cd functions && npm run build
cd functions && npm test              # Jest (104/107 suites — 3 pre-existing failures)
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

## Common Patterns

**Pagination:** Cursor-based using Firestore `startAfter`. Always pass `cursor` param for next page.

**Soft delete:** Set `deletedAt = serverTimestamp()` instead of calling `.delete()`. All queries include `.where('deletedAt', '==', null)`.

**Real-time hooks:** Mobile uses Firestore real-time listeners (not polling). Web uses React Query + listeners via SDK.

**Error handling (SDK):** Network errors, timeouts, 5xx → retryable. 401/403 → session expired. 429 → rate limit message.

**Caregiver access:** Denormalized `shareIds` array on visits/medications. Firestore rules check `shares/{ownerId_caregiverId}` status = 'accepted'.

## Key Documentation

- `docs/reference/DATABASE-SCHEMA.md` — Full Firestore schema
- `docs/TECHNICAL_OVERVIEW.md` — Architecture for non-engineers
- `docs/reports/SYSTEM-HEALTH-REPORT.md` — Current system health status
- `docs/CAREGIVER-ENHANCEMENTS-CHECKLIST.md` — Implementation checklist for caregiver portal features
- `SECURITY_AND_PRIVACY_SUMMARY.md` — Security posture and compliance
- `docs/guides/` — Quick Start, Firebase setup, deployment checklists
- `docs/architecture/` — System design docs

## Recent Changes (March 2026)

### Caregiver Portal Enhancements (deployed to `lumimd-dev`)

**Feature 2A — Adherence Confidence Indicators:**
- `GET /v1/care/:patientId/medication-adherence` now returns `confidence: { level, factors }` per-medication and overall
- Levels: `high` (>80% coverage), `medium` (30-80%), `low` (<30% or no schedule), `insufficient` (no reminders + <3 logs)
- Also returns `dataQuality: { hasSchedule, logCoverage, lastLoggedAt }`

**Feature 2B — Medication Follow-Up Nudges:**
- New `processMedicationFollowUpNudges` trigger (every 15 min) detects unlogged doses and sends follow-up nudges
- Nudge responses `took_it`/`skipped_it` auto-create medication logs with `source: 'nudge_response'`
- Respects quiet hours (9pm-8am), max 3 nudges/day, deduplication

**Feature 1 — Caregiver → Patient Messaging:**
- New `caregiverMessages` Firestore collection with 4 composite indexes
- Caregiver routes: send (POST, rate-limited 10/day) + list sent (GET, cursor pagination)
- Patient routes: inbox (GET, auto-marks read) + mark-read (PATCH) + unread count (GET)
- Push notifications on new messages (`caregiver_message` type)
- Mobile: `messages.tsx` screen (elderly-friendly, large text) + push navigation
- Web portal: `/care/[patientId]/messages` page (compose + sent history + read receipts)
- SDK: `messages` + `careMessages` namespaces in api-client

### Bug Fixes
- **Action item completion:** Fixed query key mismatch in `useCompleteAction` mutation — was invalidating `['actions', userId]` but paginated query uses `['actions', 'cursor', sessionKey, pageSize]`. Now invalidates base `['actions']` key to match all variants.

### Known Pre-existing Test Failures (3)
- `personalRNService.repositoryBridge.test.ts` — nudge dismissal counting
- `insightGenerator.repositoryBridge.test.ts` — nudge context building
- `conditionReminderService.repositoryBridge.test.ts` — condition reminder dedup
