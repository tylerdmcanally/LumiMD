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
| `shares/{ownerId_cgId}` | Caregiver access (pending/accepted/revoked, includes `caregiverName`) |
| `shareInvites/{token}` | Pending invite tokens (includes optional `caregiverName`) |
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
- `routes/care.ts` — Caregiver route aggregator + multi-patient overview
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
- `routes/care/healthLogs.ts` — Patient health logs for caregiver view
- `routes/care/exportSummary.ts` — Printable care summary export
- `routes/shares.ts` — Share CRUD, invite system, `resolveCaregiverName()` helper (profile → auth → invite label → email fallback)
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
- `app/caregiver-sharing.tsx` — Share management (invite with name, shows caregiver names)
- `app/_layout.tsx` — Root layout + push notification routing (handles `caregiver_message` type)
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
- `app/shared/` — Caregiver read-only view (no login required)
- `app/api/` — Next.js API routes (auth, email)
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

**Cache-Control for mutable data:** Use `Cache-Control: private, no-cache` (NOT `max-age`). React Native's `fetch` respects HTTP cache headers, so `max-age` causes stale reads after mutations even when React Query triggers a refetch.

**Pagination:** Cursor-based using Firestore `startAfter`. Always pass `cursor` param for next page.

**Soft delete:** Set `deletedAt = serverTimestamp()` instead of calling `.delete()`. All queries include `.where('deletedAt', '==', null)`.

**Real-time hooks:** Mobile uses Firestore real-time listeners (not polling). Web uses React Query + listeners via SDK.

**Error handling (SDK):** Network errors, timeouts, 5xx → retryable. 401/403 → session expired. 429 → rate limit message.

**Caregiver access:** Firestore rules check `shares/{ownerId_caregiverId}` status = 'accepted'.

**Date-only overdue checks:** Always compare dates as `dueDate.toISOString().slice(0, 10) < todayDateStr` (NOT `dueDate < now`). Datetime comparison causes items due today to show as overdue once server time passes the stored timestamp.

**Soft-delete at query level:** Never use `includeDeleted: true` unless the endpoint specifically needs deleted records. Let the repository's `buildUserQuery` add `where('deletedAt', '==', null)` at the Firestore level rather than filtering in memory.

**z-index layers:** Dialogs use `z-modal` (500). Select/popover content must use `z-[510]` or higher to render above dialog overlays.

## Key Documentation

- `docs/reference/DATABASE-SCHEMA.md` — Full Firestore schema
- `docs/TECHNICAL_OVERVIEW.md` — Architecture for non-engineers
- `docs/reports/SYSTEM-HEALTH-REPORT.md` — Current system health status
- `docs/CAREGIVER-ENHANCEMENTS-CHECKLIST.md` — Implementation checklist for caregiver portal features
- `SECURITY_AND_PRIVACY_SUMMARY.md` — Security posture and compliance
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

### Known Pre-existing Test Failures (3)
- `personalRNService.repositoryBridge.test.ts` — nudge dismissal counting
- `insightGenerator.repositoryBridge.test.ts` — nudge context building
- `conditionReminderService.repositoryBridge.test.ts` — condition reminder dedup
