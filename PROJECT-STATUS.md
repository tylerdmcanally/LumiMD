# LumiMD Project Status & Development Primer

**Last Updated:** November 10, 2025  
**Status Snapshot:** Mobile app and web portal both live against `lumimd-dev`; error resilience and cross-platform sync verified. Remaining work is hardening (offline/push) and launch polish.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Current Status](#current-status)
4. [Roadmap & Remaining Work](#roadmap--remaining-work)
5. [Operational Checklists](#operational-checklists)
6. [Key File Locations](#key-file-locations)
7. [Environment & Secrets](#environment--secrets)
8. [Quick Start Commands](#quick-start-commands)
9. [Known Gaps & Follow-Ups](#known-gaps--follow-ups)
10. [Appendix](#appendix)

---

## 📖 Project Overview

### Vision
LumiMD helps patients capture medical visits, transform them into action plans, and stay coordinated with caregivers.

- Record visits on iOS
- Auto-generate summaries, diagnoses, and action items via AI
- Track medication history and changes
- Manage everything in a rich web console

### Product Strategy

- **Mobile (primary):** Fast recording workflow, glanceable dashboard, lightweight review.
- **Web (companion):** Full CRUD on visits, meds, actions, allergies, tags/folders.
- **Shared auth:** One-click mobile→web handoff using Firebase custom tokens.

### Tech Stack

| Area | Stack |
| --- | --- |
| Mobile | Expo 54 (React Native), Expo Router, TanStack Query, AsyncStorage |
| Web | Next.js 14 app router, Tailwind v4 + shadcn/ui, TanStack Query |
| Backend | Firebase Auth, Firestore, Storage, Cloud Functions (Node 18 + Express) |
| AI Pipeline | AssemblyAI (transcription) + OpenAI GPT-4 (structured summaries) |
| Tooling | TypeScript end-to-end, ESLint, Prettier, React Query Devtools |

---

## ✅ Current Status

### Platform Readiness

- **Mobile app**
  - Recording → upload → AI summary flow stable with retries.
  - Dashboard, visits, medications, action items screens wrapped in global `ErrorBoundary`.
  - AsyncStorage persists “ready to review” state; TanStack Query refetches on focus.
  - Medication cards show accurate start/stop dates (fixed invalid timestamp issue).
  - API client hardened with timeout + exponential backoff.

- **Web portal**
  - Next.js 14 app configured with Tailwind v4 theme matching mobile brand.
  - Auth guard, sidebar/mobile nav, dashboard metrics, visit/med/action tables all live.
  - CRUD for visits (including provider/location/specialty, delete), medications (manual add/edit/delete, visit mentions), action items (create/complete/delete), allergies (profile).
  - Tooltips render AI education blurbs (diagnosis/med medicationEducation data).
  - Sign-in supports email/password and mobile handoff.
  - Medications/visits/actions sync bi-directionally with mobile via Firestore listeners; rules corrected (`/medications/{id}`).

- **Backend & Functions**
  - `/v1/users` routes added for allergy/tag profile management.
  - `/v1/actions` create/delete + validation shipped.
  - `/v1/visits` extended for provider/location/specialty/visitDate/tags/folders + delete cascade (audio + actions).
  - `medicationSync` stores `nameLower` for idempotent updates.
  - OpenAI prompt yields `diagnosisEducation` & `medicationEducation`, stored in visits.

### Build & Tooling

- `npm run build` succeeds for web portal (resolved Suspense warnings by removing `useSearchParams` SSR usage).
- Expo Metro clean; `npm install` stable after pinning `react-dom@19.1.0`.
- Duplicate root docs removed to reduce confusion (single source under `/docs/**` and this file).

---

## 🗺️ Roadmap & Remaining Work

### Beta Hardening (Highest Priority)

- [ ] **Offline/poor network QA** on mobile (TanStack Query cache strategy, optimistic UI).
- [ ] **Long-recording soak tests** (10–15 min, spot-check AssemblyAI + OpenAI throughput).
- [ ] **Background resiliency** (ensure recording/upload safe on app backgrounding).
- [ ] **App Store assets** (icon, splash, screenshots) and TestFlight metadata.

### Nice-to-Have Before Public Beta

- [ ] Optional visit archive/hide affordance for failed uploads.
- [ ] Additional dashboard insights on web (charts, trend lines).
- [ ] Google OAuth (deferred per stakeholder direction).

### Post-Beta / Phase 2

- Push notifications (visit processed, new action item, med change).
- Caregiver sharing with granular permissions.
- Expanded analytics (engagement, adherence insights).

---

## ✅ Operational Checklists

### Smoke Tests (mobile)

- [x] Sign-up/sign-in/sign-out
- [x] Record visit, watch status progress (processing → summarizing → ready)
- [x] View summary + transcript + action list in visit detail
- [x] Toggle action complete/incomplete without API validation errors
- [x] Confirm “ready to review” badge respects AsyncStorage persisted state
- [x] Medications list renders accurate status and dates
- [x] Settings screen navigates and error boundaries recover gracefully

### Smoke Tests (web)

- [x] Email/password sign-in
- [x] Auth handoff from mobile deep link
- [x] Dashboard metrics reflect real Firestore counts
- [x] Visits table filters/sorts; visit detail editable + delete works
- [x] Medications table manual entries + visit mentions linking
- [x] Action items CRUD operations synced with mobile
- [x] Allergies stored on profile and visible across components
- [x] Sign-out button (desktop + mobile nav)

### Backend

- [x] Cloud Functions deploy cleanly (`firebase deploy --only functions`)
- [x] Firestore/Storage rules deploy (`firebase deploy --only firestore:rules,storage:rules`)
- [x] Medication endpoint timestamp serialization (ISO) verified
- [x] Security: ownership enforced across visits/actions/medications/users

---

## 📁 Key File Locations

```
.
├── docs/                     # All long-form docs & guides
├── mobile/                   # Expo app (iOS-first)
│   ├── app/                  # Screens (Expo Router)
│   ├── components/           # Shared UI (HeroBanner, ErrorBoundary,…)
│   └── lib/                  # Firebase, API client, hooks
├── web-portal/               # Next.js 14 app
│   ├── app/                  # App router pages/layouts
│   ├── components/           # Sidebar, tables, shadcn/ui wrappers
│   └── lib/                  # Firebase client, React Query hooks
├── functions/                # Firebase Cloud Functions (TypeScript)
│   ├── routes/               # REST endpoints
│   ├── services/             # AI pipeline & medication sync
│   └── triggers/             # Gen-2 background jobs
└── firebase-setup/           # Rules, TTL scripts, setup docs
```

---

## 🔐 Environment & Secrets

Environment files are checked into `.gitignore`. Keep the following in sync:

### Mobile (`mobile/.env`)

```
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyDjKsGysDYn8zWjcze3VYNYJbEcqHUicKk
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=lumimd-dev.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=lumimd-dev
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=lumimd-dev.firebasestorage.app
EXPO_PUBLIC_FIREBASE_SENDER_ID=355816267177
EXPO_PUBLIC_FIREBASE_APP_ID=1:355816267177:ios:f8e8a8a94cfeaaf7a178b8
EXPO_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
```

### Web (`web-portal/.env.local`)

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDjKsGysDYn8zWjcze3VYNYJbEcqHUicKk
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=lumimd-dev.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=lumimd-dev
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=lumimd-dev.firebasestorage.app
NEXT_PUBLIC_FIREBASE_SENDER_ID=355816267177
NEXT_PUBLIC_FIREBASE_APP_ID=1:355816267177:ios:f8e8a8a94cfeaaf7a178b8
NEXT_PUBLIC_API_BASE_URL=https://us-central1-lumimd-dev.cloudfunctions.net/api
```

**Do not commit these files.** Both clients point at the same dev project so data stays in sync.

---

## ⚙️ Quick Start Commands

```bash
# Mobile (Expo)
cd mobile
npm install
npm run ios        # or npm run android / npm start

# Web portal (Next.js)
cd web-portal
npm install
npm run dev        # http://localhost:3000 by default
npm run build      # to verify production bundle

# Backend (Firebase Functions)
cd functions
npm install
npm run build
firebase deploy --only functions
firebase deploy --only firestore:rules,storage:rules
```

---

## 🐛 Known Gaps & Follow-Ups

- Offline usage not yet validated (TanStack Query `staleTime/gcTime` tuned for freshness; need explicit offline UX).
- No push notification plumbing (Expo + FCM) — slated for post-beta.
- Visit archive/hide pattern still conceptual.
- App Store assets + privacy policy outstanding.
- Optional Google OAuth support deferred per stakeholder.

---

## 📎 Appendix

### Related Documentation (all under `docs/`)

- `guides/Dev Guide.md` – master product & UX spec
- `guides/APP-STORE-READINESS.md` – launch checklist
- `guides/SEAMLESS-AUTH-README.md` – custom token handoff flow
- `guides/MOBILE-SETUP.md` – Expo troubleshooting
- `playbooks/READY-TO-VIEW.md` – visit status handling
- `roadmaps/ROBUSTNESS-ROADMAP.md` – resilience backlog
- `reference/TESTING-RESULTS.md` – latest QA matrix

### Team Working Agreements

- Prefer native mobile UX with web for advanced management.
- Keep Firebase project `lumimd-dev` as integration source of truth until prod project exists.
- Wrap risky screens in `ErrorBoundary`; log to console until Sentry/Crashlytics chosen.
- Use absolute paths when invoking tools in Cursor (per environment note).

---

**Next milestone:** Run beta QA suite (long recordings + offline), assemble App Store/TestFlight assets, and prepare push notification backlog.