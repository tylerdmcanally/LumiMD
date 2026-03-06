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
| `nudges/{id}` | AI health check-in prompts |
| `healthLogs/{id}` | Vitals / symptoms |
| `medicationReminders/{id}` | Reminder schedules with times + timezone |
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
- `routes/webhooks.ts` — AssemblyAI webhook receiver
- `services/openai.ts` — GPT-4 summarization (52KB, 4-stage prompts)
- `services/assemblyai.ts` — Transcription polling
- `services/medicationSafety.ts` — Drug interaction checker (local CANONICAL_MEDICATIONS + optional RxNav)
- `services/visitProcessor.ts` — Orchestrates the full processing pipeline
- `services/denormalizationSync.ts` — Keeps caregiver-accessible fields in sync
- `services/repositories/` — Firestore data access (query building, pagination, soft-delete filtering)
- `services/domain/` — Domain service layer (VisitDomainService, MedicationDomainService, etc.)
- `triggers/` — Scheduled Cloud Functions (processVisitAudio, checkPendingTranscriptions, medicationSafetyRecheck, staleVisitSweeper, etc.)

### Mobile (`mobile/`)
- `app/index.tsx` — Home dashboard
- `app/record-visit.tsx` — Audio recording (max 2 hours)
- `app/visit-detail.tsx` — Visit summary view
- `app/medications.tsx` — Medication management
- `app/actions.tsx` — Action items
- `app/health.tsx` — Health log
- `app/medication-schedule.tsx` — Reminder scheduling
- `app/caregiver-sharing.tsx` — Share management
- `lib/api/hooks.tsx` — React Query hooks (useRealtimeVisits, useRealtimeActiveMedications, etc.)
- `contexts/` — AuthContext (global auth state)

### Web Portal (`web-portal/`)
- `app/(protected)/` — Authenticated routes (dashboard, visits, medications, actions, ops/)
- `app/shared/` — Caregiver read-only view (no login required)
- `app/api/` — Next.js API routes (auth, email)
- `lib/hooks/` — Custom React Query hooks

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
| `/v1/nudges` | GET, PATCH | Health check-ins |
| `/v1/health-logs` | GET, POST | Vitals/symptoms |
| `/v1/medication-reminders` | GET, POST, PATCH, DELETE | Reminder schedules |
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
firebase deploy --only functions

# Web portal
cd web-portal && npm run dev

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
- `SECURITY_AND_PRIVACY_SUMMARY.md` — Security posture and compliance
- `docs/guides/` — Quick Start, Firebase setup, deployment checklists
- `docs/architecture/` — System design docs
