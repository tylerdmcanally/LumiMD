# LumiMD External Developer Overview

> **Audience:** Outside developers performing code review or technical due diligence  
> **Purpose:** Provide a concise map of the codebase, runtime architecture, and review focus areas  
> **Last Updated:** January 2026

---

## 1. What This Repo Contains

LumiMD is a healthcare visit recording and medication management product. This monorepo includes:

- **Mobile app**: Expo + React Native (primary user experience)
- **Web portal**: Next.js (caregiver and management views)
- **Backend**: Firebase Cloud Functions (Express API, triggers, scheduled jobs)
- **Shared SDK**: TypeScript types in `packages/sdk`
- **Firebase setup**: Firestore/Storage rules and TTL configs

---

## 2. Repository Map

```
Codebase/
├── functions/        # Cloud Functions (Express API + triggers)
├── mobile/           # Expo React Native app
├── web-portal/       # Next.js web app
├── packages/sdk/     # Shared TypeScript types
├── firebase-setup/   # Firestore + Storage security rules
├── docs/             # Documentation hub
└── scripts/          # Utility scripts (local tooling)
```

Key entry points:
- `functions/src/index.ts` – Express API and scheduled jobs registration
- `functions/src/routes/` – REST endpoints
- `functions/src/services/` – Core business logic (AI, meds, nudges)
- `mobile/app/` – Expo Router screens
- `web-portal/app/` – Next.js App Router pages

---

## 3. Runtime Architecture (High-Level)

```
Mobile/Web → Firebase Auth → Express API (Cloud Functions)
         └── Firestore/Storage
         └── AssemblyAI (transcription)
         └── OpenAI (summarization)
```

Backend is a serverless monolith with modular routes/services. Trigger-based processing is used for visit audio workflows and scheduled reminders.

---

## 4. Core User Flows (Code Pointers)

1. **Visit Recording & Summarization**
   - Mobile upload → `functions/src/routes/visits.ts`
   - Trigger → `functions/src/triggers/processVisitAudio.ts`
   - Transcription → `functions/src/services/assemblyai.ts`
   - Summarization → `functions/src/services/openai.ts`

2. **Medication Sync & Reminders**
   - Sync meds → `functions/src/services/medicationSync.ts`
   - Reminders → `functions/src/services/medicationReminderService.ts`
   - Reminder API → `functions/src/routes/medicationReminders.ts`

3. **Caregiver Sharing**
   - Invite flow → `functions/src/routes/shares.ts`
   - Web portal invite UI → `web-portal/app/invite/page.tsx`

---

## 5. API Surface

API base URL: `https://us-central1-lumimd-dev.cloudfunctions.net/api`

Primary endpoints are mounted in `functions/src/index.ts`:

- `/v1/visits`, `/v1/actions`, `/v1/meds`
- `/v1/medication-reminders`, `/v1/medication-logs`
- `/v1/nudges`, `/v1/health-logs`
- `/v1/users`, `/v1/shares`
- `/v1/insights`, `/v1/medical-context`, `/v1/care`

For full reference, see `functions/openapi.yaml`.

---

## 6. Data Model Summary (Firestore)

Key collections:
- `users` – Profiles and preferences
- `visits` – Audio, transcript, summary, AI output
- `medications` – Current medication list
- `medicationReminders` – Reminder schedule and status
- `actions` – Action items from visits
- `nudges` – AI-driven check-ins
- `shares` – Caregiver access grants
- `healthLogs` – Vitals/symptom logs

See `docs/reference/DATABASE-SCHEMA.md` for field-level detail.

---

## 7. Local Setup (Reviewer-Friendly)

```bash
# From repo root
npm install --legacy-peer-deps

# Backend
cd functions && npm install && npm run serve

# Web
cd web-portal && npm install && npm run dev

# Mobile
cd mobile && npm install && npx expo start
```

Environment variables:
- `functions/.env`
- `mobile/.env`
- `web-portal/.env.local`

See `docs/guides/QUICK-START.md` for details.

---

## 8. Testing

- `functions`: `npm test`
- `web-portal`: `npm test`
- `mobile`: `npm test`

No centralized CI is enforced yet; tests are run per-package.

---

## 9. Deployment Overview

- **Functions**: `cd functions && npm run build && firebase deploy --only functions`
- **Web portal**: Vercel deployment (auto preview on PR)
- **Mobile**: EAS builds for TestFlight/App Store

See `docs/guides/DEPLOYMENT_CHECKLIST.md` and `docs/guides/TESTFLIGHT-DEPLOYMENT.md`.

---

## 10. Review Focus Areas

Suggested code review attention for external developers:

- **Security**: auth rules, sharing permissions, token handling
- **PHI/PII handling**: storage, logging, error traces
- **AI pipeline**: retry logic, failure handling, cost controls
- **Medication safety**: AI and rule-based checks, sync edge cases
- **Scheduled jobs**: reminder cadence, idempotency, race conditions
- **Performance**: cold start impact, large Firestore queries

For known debt and risks, see `docs/TECHNICAL_OVERVIEW.md` and `docs/SECURITY_AUDIT.md`.
