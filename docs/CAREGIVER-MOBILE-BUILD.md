# Caregiver Mobile Experience — Build Tracker

> **Purpose:** Self-contained document for tracking the build of the caregiver mobile experience. Feed this file + CLAUDE.md to each new context window so the assistant can pick up exactly where the last one stopped.

---

## Project Summary

Adding a caregiver experience to the existing LumiMD iOS app (single app, two experiences based on user role). The goal is **daily caregiver engagement** — the daily briefing notification is the core product. Mobile is for monitoring and quick action; the existing web portal remains for deep dives.

**Architecture:** Expo Router v6 route groups `(patient)/` and `(caregiver)/` with layout guards. Role resolved from `UserProfile.primaryRole` → `roles[]` → fallback `patient`. All caregiver data comes from existing `/v1/care/*` API endpoints.

**Key design decisions:**
- Route groups are URL-transparent in Expo Router v6 (no deep link breakage)
- Role resolution is imperative in AuthContext (not React Query — it gates navigation)
- No new backend API routes — only 2 new Cloud Function triggers (daily briefing + caregiver alerts)
- Caregiver screens nest under `patient/[patientId]/` to avoid URL conflicts with patient screens

---

## Overall Status

| Phase | Description | Status | Gate Passed |
|-------|-------------|--------|-------------|
| 1 | Auth + Routing Foundation | COMPLETE | PASS |
| 2 | Caregiver Home Screen + Daily Briefing | COMPLETE | PASS |
| 3 | Push Notifications for Caregivers | COMPLETE | PASS |
| 4 | Supporting Screens | COMPLETE | PASS |
| 5 | Polish + Daily Briefing Card | COMPLETE | PASS |

---

## Phase 1 — Auth + Routing Foundation

### Status: COMPLETE

### Tasks

| # | Task | Status | Files |
|---|------|--------|-------|
| 1a | Extend AuthContext with role resolution | DONE | `mobile/contexts/AuthContext.tsx` |
| 1b | Create `(patient)/` route group, move patient screens | DONE | `mobile/app/(patient)/_layout.tsx` + 13 moved files (including `record.tsx`) |
| 1c | Create `(caregiver)/` route group with placeholder | DONE | `mobile/app/(caregiver)/_layout.tsx`, `mobile/app/(caregiver)/index.tsx` |
| 1d | Replace root index with role router | DONE | `mobile/app/index.tsx` |
| 1e | Simplify root layout, make NotificationHandler role-aware | DONE | `mobile/app/_layout.tsx` |
| 1f | Update internal navigation paths if needed | DONE | 12 patient screen files (import path fix `../` → `../../`), 7 existing test files (import path update) |
| 1g | Write Phase 1 tests | DONE | 4 test files, 20 tests passing |

### Spec: 1a — AuthContext Role Resolution
**Modify:** `mobile/contexts/AuthContext.tsx`
- Add to `AuthContextType`: `role: 'patient' | 'caregiver' | null`, `roleLoading: boolean`
- On auth state change: fetch profile via imperative `fetch()` with `getIdToken()` (NOT React Query — it gates the navigation tree)
- Resolution order: `profile.primaryRole` → first match in `profile.roles[]` → fallback `'patient'`
- Re-resolve on AppState foreground (catches role changes made on web)
- On fetch failure: fall back to `'patient'` (never crash, never leave `role` as `null` permanently)
- Cache resolved role in AsyncStorage for instant startup on next launch

### Spec: 1b — Patient Route Group
**Create:** `mobile/app/(patient)/_layout.tsx`
- Guard: `const { role, roleLoading } = useAuth(); if (roleLoading) return <Loading />; if (role !== 'patient') return <Redirect href="/" />;`
- Contains `<Stack>` with all current patient screen definitions + their animations (copy from current root `_layout.tsx`)

**Move these files** (rename only, no content changes):
```
app/index.tsx          → app/(patient)/index.tsx
app/medications.tsx    → app/(patient)/medications.tsx
app/medication-schedule.tsx → app/(patient)/medication-schedule.tsx
app/record-visit.tsx   → app/(patient)/record-visit.tsx
app/visits.tsx         → app/(patient)/visits.tsx
app/visit-detail.tsx   → app/(patient)/visit-detail.tsx
app/actions.tsx        → app/(patient)/actions.tsx
app/health.tsx         → app/(patient)/health.tsx
app/upload-avs.tsx     → app/(patient)/upload-avs.tsx
app/messages.tsx       → app/(patient)/messages.tsx
app/caregiver-sharing.tsx → app/(patient)/caregiver-sharing.tsx
app/settings.tsx       → app/(patient)/settings.tsx
```

### Spec: 1c — Caregiver Route Group
**Create:** `mobile/app/(caregiver)/_layout.tsx`
- Guard: `if (role !== 'caregiver') return <Redirect href="/" />;`
- Stack with screen definitions for caregiver pages

**Create:** `mobile/app/(caregiver)/index.tsx`
- Placeholder: empty state with "Your patients will appear here" message
- Will be replaced with real home screen in Phase 2

### Spec: 1d — Root Role Router
**Rewrite:** `mobile/app/index.tsx`
- Thin router component (no UI beyond loading spinner)
- Logic:
  ```
  if (loading || roleLoading) → show spinner
  if (!isAuthenticated) → router.replace('/sign-in')
  if (role === 'caregiver') → router.replace('/(caregiver)/')
  else → router.replace('/(patient)/')
  ```
- Must also handle onboarding check for patient (profile.complete === false → onboarding)

### Spec: 1e — Root Layout Simplification
**Modify:** `mobile/app/_layout.tsx`
- **Keep:** providers (QueryClientProvider, AuthProvider, ErrorBoundary, ThemeProvider), font loading
- **Remove:** all patient-specific Stack.Screen definitions (medications, visits, record-visit, etc.)
- **Add:** Stack.Screen entries for `(patient)`, `(caregiver)`, and keep auth screens (sign-in, sign-up, forgot-password, onboarding)
- **NotificationHandler:** keep push token registration (shared). Make deep link routing role-aware:
  - Check `role` from `useAuth()`
  - Patient notification types (`medication_reminder`, `visit-ready`, `nudge`, `caregiver_message`) → prefix with `/(patient)/`
  - Caregiver notification types (`daily_briefing`, `missed_medication_caregiver`, etc.) → prefix with `/(caregiver)/`

### Phase 1 Tests

| Test File | What to Test |
|-----------|-------------|
| `mobile/contexts/__tests__/AuthContext.test.tsx` | Role resolution: patient default, caregiver from primaryRole, caregiver from roles array, fallback on fetch failure, re-resolve on foreground |
| `mobile/app/__tests__/RoleRouter.test.tsx` | Redirects: patient → `(patient)/`, caregiver → `(caregiver)/`, unauthenticated → sign-in |
| `mobile/app/(patient)/__tests__/layout.test.tsx` | Guard rejects caregiver role with redirect |
| `mobile/app/(caregiver)/__tests__/layout.test.tsx` | Guard rejects patient role with redirect |

### Phase 1 Review Gate

**Manual verification checklist:**
- [ ] Sign in as patient → full patient flow unchanged (home, medications, visits, actions, health, messages, settings, record-visit, upload-avs)
- [ ] Sign in as caregiver test account → caregiver placeholder screen appears
- [ ] Kill app, reopen → role persists correctly (no flash of wrong screen)
- [ ] Notification deep links still work for patient (test: medication_reminder, visit-ready, nudge, caregiver_message)
- [ ] No regressions in onboarding flow (new patient account)
- [ ] Sign out → sign in as different role → correct screen

**Adversarial review checklist:**
- [ ] Can a caregiver access patient routes by direct URL? (guards must block → redirect to `/`)
- [ ] Can a patient access caregiver routes? (guards must block)
- [ ] Profile fetch fails during role resolution → falls back to patient (no crash)
- [ ] No network on first launch → cached role from AsyncStorage or graceful fallback
- [ ] Auth state changes while role resolution is in-flight → no race condition crash
- [ ] `record.tsx` stub file — does it conflict with route groups? (delete if unused)

**Gate result:** PASS
**Notes:** All 20 new tests pass. `record.tsx` moved into `(patient)/` group (widget deep link is patient-only). 12 patient screen import paths fixed (`../` → `../../`). 7 existing test import paths updated. Pre-existing test failures (10 suites) due to `expo-apple-authentication` ESM transform issue — not caused by Phase 1 changes. NotificationHandler made role-aware with patient/caregiver notification type routing. Badge count logic conditioned on patient role (caregiver badge deferred to Phase 3). AppState mock added to jest react-native shim.
**Date completed:** 2026-03-13

---

## Phase 2 — Caregiver Home Screen + Daily Briefing

### Status: COMPLETE

### Tasks

| # | Task | Status | Files |
|---|------|--------|-------|
| 2a | Add caregiver API hooks | DONE | `mobile/lib/api/hooks.ts` |
| 2b | Build caregiver home screen | DONE | `mobile/app/(caregiver)/index.tsx` |
| 2c | Build PatientStatusCard component | DONE | `mobile/components/caregiver/PatientStatusCard.tsx` |
| 2d | Build AlertBanner component | DONE | `mobile/components/caregiver/AlertBanner.tsx` |
| 2e | Build daily briefing trigger | DONE | `functions/src/triggers/caregiverDailyBriefing.ts` |
| 2f | Register trigger in index.ts | DONE | `functions/src/index.ts` |
| 2g | Write Phase 2 tests | DONE | 5 test files, 32 tests passing |

### Spec: 2a — Caregiver API Hooks
**Modify:** `mobile/lib/api/hooks.ts`
- Follow existing patterns: `getSessionKey()` scoping, `auth().currentUser?.getIdToken()`, React Query
- Hooks to add:
  - `useCareOverview()` — `GET /v1/care/overview`, staleTime 30s
  - `useCareAlerts(patientId)` — `GET /v1/care/:patientId/alerts`, staleTime 30s
  - `useCareQuickOverview(patientId)` — `GET /v1/care/:patientId/quick-overview`, staleTime 30s
  - `useCareMedicationStatus(patientId)` — `GET /v1/care/:patientId/medication-status`, staleTime 30s
  - `useSendCareMessage()` — mutation, `POST /v1/care/:patientId/messages`, invalidates care-messages key

### Spec: 2b — Caregiver Home Screen
**Rewrite:** `mobile/app/(caregiver)/index.tsx`
- Data source: `useCareOverview()` → returns `{ patients: [...] }` with `medicationsToday`, `pendingActions`, `alerts`, `lastActive`, `latestVitals` per patient
- Layout (top to bottom):
  1. **Header** — "Good morning, {name}" greeting (time-aware) + settings gear icon
  2. **Needs Attention** — aggregated high/medium severity alerts across all patients, sorted by severity. Uses `AlertBanner` component. Each tappable → `/(caregiver)/patient/[patientId]`
  3. **Patient Status Cards** — one per patient using `PatientStatusCard`. Tap → patient detail
  4. **Empty state** — when `patients[]` is empty: "Once your patient accepts the invitation, their data will appear here"
- Pull-to-refresh on ScrollView
- Uses existing `Colors`, `spacing`, `Radius` from `components/ui`

### Spec: 2c — PatientStatusCard Component
**Create:** `mobile/components/caregiver/PatientStatusCard.tsx`
- Props: patient name, medication progress (taken/total), pending action count, last active timestamp
- Visual: Card with name header, horizontal progress bar (green fill), badge for actions, muted timestamp
- Reuses `Card` from `components/ui`

### Spec: 2d — AlertBanner Component
**Create:** `mobile/components/caregiver/AlertBanner.tsx`
- Props: alert type, severity, title, description, patient name, timestamp, onPress
- Visual: severity-colored left border (red=high, amber=medium), icon, text, pressable
- Uses `Colors.error` (red), `Colors.warning` (amber)

### Spec: 2e — Daily Briefing Trigger
**Create:** `functions/src/triggers/caregiverDailyBriefing.ts`
- Schedule: `0 * * * *` (every hour — timezone-aware check)
- Algorithm:
  1. Query `shares` where `status == 'accepted'`, group by `caregiverUserId`
  2. For each caregiver: resolve timezone from profile (default `America/Chicago`), check if current hour in their timezone == preferred briefing hour (default 8)
  3. Dedup: check `briefings/{caregiverId}/{YYYY-MM-DD}` doc → skip if exists
  4. Aggregate per patient: today's med status (taken/total) + overdue action count
  5. Build notification: title "Good morning", body "Mom took 3/4 meds. Dad has 1 overdue action." (max ~100 chars)
  6. Send via `NotificationService.sendNotifications()` with `data: { type: 'daily_briefing' }`
  7. Write dedup doc `briefings/{caregiverId}/{YYYY-MM-DD}` with `{ sentAt, patientCount }`
- Follow pattern from `functions/src/triggers/actionOverdueNotifier.ts`
- Config: `region: 'us-central1'`, `memory: '256MiB'`, `timeoutSeconds: 120`, `maxInstances: 1`

### Phase 2 Tests

| Test File | What to Test |
|-----------|-------------|
| `mobile/lib/api/__tests__/caregiverHooks.test.ts` | Each hook returns expected shape, handles errors, respects session key scoping |
| `mobile/components/caregiver/__tests__/PatientStatusCard.test.tsx` | Renders name, med progress, action count; handles zero/null data |
| `mobile/components/caregiver/__tests__/AlertBanner.test.tsx` | Renders severity colors correctly, handles empty alerts |
| `mobile/app/(caregiver)/__tests__/index.test.tsx` | Home renders overview, shows empty state when no patients, pull-to-refresh triggers refetch |
| `functions/src/triggers/__tests__/caregiverDailyBriefing.test.ts` | Timezone logic, dedup, notification content, skips outside briefing hour, handles no shares, handles no push tokens |

### Phase 2 Review Gate

**Manual verification checklist:**
- [ ] Caregiver home loads with real patient data from `lumimd-dev`
- [ ] Alerts sorted by severity (high first), correct color coding
- [ ] Patient cards show accurate med progress and action counts
- [ ] Pull-to-refresh works
- [ ] Empty state displays correctly for caregiver with no accepted shares
- [ ] Daily briefing trigger fires in dev (manually invoke via Firebase console or wait for scheduled run)
- [ ] Push notification received on caregiver device with correct summary text

**Adversarial review checklist:**
- [ ] Overview API returns partial data (some patients missing fields) → no crash, graceful fallback
- [ ] Caregiver with 10+ patients → scroll performance acceptable, API response < 3s
- [ ] Daily briefing: two triggers fire in same hour → dedup prevents double notification
- [ ] Daily briefing: caregiver has no push tokens → trigger completes without error
- [ ] Patient has no medications → card shows "No medications" not "0/0"
- [ ] Overview refetch while navigating to patient detail → no crash or stale state

**Gate result:** PASS
**Notes:** All 32 new tests pass (4 mobile suites + 1 functions suite). Hooks use `fetchWithAuth` + `getSessionKey()` pattern matching existing mobile hooks. PatientStatusCard handles null/zero medication data gracefully ("No medications" instead of "0/0"). AlertBanner filters to high+medium severity for "Needs Attention" section. Daily briefing uses `Intl.DateTimeFormat` for timezone resolution with UTC fallback. Dedup via `briefings/{caregiverId}/daily/{date}` subcollection. Trigger uses `getUserPushTokens()` from NotificationService (not raw Firestore device query). Patient detail navigation goes to `/(caregiver)/patient/[patientId]` which doesn't exist yet (Phase 4).
**Date completed:** 2026-03-13

---

## Phase 3 — Push Notifications for Caregivers

### Status: COMPLETE

### Tasks

| # | Task | Status | Files |
|---|------|--------|-------|
| 3a | Make NotificationHandler role-aware with caregiver routing | DONE | `mobile/app/_layout.tsx` |
| 3b | Build caregiverAlerts trigger | DONE | `functions/src/triggers/caregiverAlerts.ts` |
| 3c | Register trigger in index.ts | DONE | `functions/src/index.ts` |
| 3d | Write Phase 3 tests | DONE | 2 test files, 22 tests passing |

### Spec: 3a — Role-Aware Notification Routing
**Modify:** `mobile/app/_layout.tsx` (NotificationHandler)
- Check `role` from `useAuth()`
- Caregiver notification types + deep links:
  - `daily_briefing` → `/(caregiver)/`
  - `missed_medication_caregiver` → `/(caregiver)/patient/[patientId]`
  - `overdue_action_caregiver` → `/(caregiver)/patient/[patientId]`
  - `visit_ready_caregiver` → `/(caregiver)/patient/[patientId]`
- Caregiver badge count: number of high-severity alerts across all patients (from overview cache or separate fetch)
- Patient notification types unchanged (existing behavior preserved)

### Spec: 3b — Caregiver Alerts Trigger
**Create:** `functions/src/triggers/caregiverAlerts.ts`
- Schedule: every 15 min
- **Missed medication alerts:** Find medication reminders sent 2-4 hrs ago → check if medicationLog exists → if not, find caregivers via `shares` → send push: "{PatientName} may have missed their {medication} dose"
- **New visit ready:** Find visits that transitioned to `completed` in last 15 min → find caregivers via `shares` → send push: "{PatientName}'s visit summary is ready"
- Dedup: `caregiverNotifications[]` array on source document (same pattern as `actionOverdueNotifier.ts`)
- Data payload includes `patientId` for deep linking

### Phase 3 Tests

| Test File | What to Test |
|-----------|-------------|
| `mobile/app/__tests__/NotificationHandler.test.tsx` | Role-aware routing: patient types → patient screens, caregiver types → caregiver screens, unknown types ignored |
| `functions/src/triggers/__tests__/caregiverAlerts.test.ts` | Missed med detection window, dedup prevents duplicates, handles patients with no caregivers, new visit detection |

### Phase 3 Review Gate

**Manual verification checklist:**
- [ ] Trigger missed medication for test patient → caregiver receives push
- [ ] Complete a visit for test patient → caregiver receives "visit ready" push
- [ ] Tap each caregiver notification type → correct screen opens
- [ ] Badge count reflects high-severity alerts for caregiver
- [ ] Patient notifications still work correctly (no regressions)

**Adversarial review checklist:**
- [ ] Dual-role user on same device → notification routing uses role, not just type
- [ ] Medication logged just after alert fires → stale alert acceptable, but screen shows current state on open
- [ ] Caregiver has push disabled → trigger completes without error
- [ ] Patient misses 5 meds → batch into one notification or send 5? (decide and document)

**Gate result:** PASS
**Notes:** All 22 new tests pass (14 mobile NotificationHandler + 8 functions caregiverAlerts). Caregiver badge count uses `useCareOverview` cache to count high-severity alerts across all patients. Caregiver notification deep links route to `/(caregiver)/patient/[patientId]` (screen doesn't exist yet — Phase 4). Missed medication alerts batch multiple missed doses per patient into a single notification to avoid spam. Dedup via `caregiverNotifications[]` array on source documents (medicationReminders for missed meds, visits for visit-ready). Visit-ready alerts detect visits completed in last 15 minutes. Production code compiles clean (no TS errors outside test files). Pre-existing test failures (10 suites from `expo-apple-authentication` ESM) unrelated to Phase 3.
**Date completed:** 2026-03-13

---

## Phase 4 — Supporting Screens

### Status: COMPLETE

### Tasks

| # | Task | Status | Files |
|---|------|--------|-------|
| 4a | Patient detail screen | DONE | `mobile/app/(caregiver)/patient/[patientId]/index.tsx`, `mobile/app/(caregiver)/patient/[patientId]/_layout.tsx` |
| 4b | Visit list (read-only, paginated) | DONE | `mobile/app/(caregiver)/patient/[patientId]/visits.tsx` |
| 4c | Visit detail (read-only) | DONE | `mobile/app/(caregiver)/patient/[patientId]/visit-detail.tsx` |
| 4d | Medication list (read-only) | DONE | `mobile/app/(caregiver)/patient/[patientId]/medications.tsx` |
| 4e | Action items (read-only) | DONE | `mobile/app/(caregiver)/patient/[patientId]/actions.tsx` |
| 4f | Messages (conversation-style) | DONE | `mobile/app/(caregiver)/patient/[patientId]/messages.tsx` |
| 4g | Caregiver settings | DONE | `mobile/app/(caregiver)/settings.tsx` |
| 4h | Write Phase 4 tests | DONE | 4 test files, 38 tests passing |

### Spec: 4a — Patient Detail
- Uses `useCareQuickOverview(patientId)` for data
- Sections: Today's Meds (taken/skipped/pending/missed), Needs Attention alerts, Upcoming Actions, Recent Activity
- Navigation buttons to sub-screens: Visits, Medications, Actions, Messages
- Pull-to-refresh

### Spec: 4b-4e — Read-Only List Screens
- All use corresponding caregiver API hooks with cursor pagination
- **Visits:** paginated list, tap → visit detail. Shows date, provider, status
- **Visit detail:** plain-English summary first, expandable sections (diagnoses, meds, actions). Read-only
- **Medications:** active med list with today's status (taken/missed/pending). No CRUD (no FAB, no edit, no delete)
- **Actions:** pending/overdue items with type badge, due date, overdue indicator. Tap → option to message patient about it

### Spec: 4f — Messages
- Conversation-style thread: caregiver messages on right, chronologically ordered
- Text input + send button at bottom
- `useSendCareMessage()` mutation
- Rate limit display: "X messages remaining today" (from API response `remainingToday`)
- Empty state: "Send your first message to {name}"

### Spec: 4g — Caregiver Settings
- Notification preferences (daily briefing toggle, alert types)
- Briefing time picker
- Manage linked patients (list of shares with status)
- Sign out
- Patient-specific settings (web access, recording consent) are hidden

### Phase 4 Tests

| Test File | What to Test |
|-----------|-------------|
| `mobile/app/(caregiver)/patient/__tests__/[patientId].test.tsx` | Renders sections, handles missing data gracefully |
| `mobile/app/(caregiver)/patient/[patientId]/__tests__/messages.test.tsx` | Send message, rate limit display, thread ordering |
| `mobile/app/(caregiver)/patient/[patientId]/__tests__/medications.test.tsx` | Read-only: no edit/delete actions visible |
| `mobile/app/(caregiver)/patient/[patientId]/__tests__/visit-detail.test.tsx` | Summary display, expandable sections |

### Phase 4 Review Gate

**Manual verification checklist:**
- [ ] Full navigation: home → patient card → patient detail → each sub-screen → back
- [ ] Visit summary renders correctly with real data
- [ ] Medication list is read-only (no FAB, no edit, no swipe)
- [ ] Action items show overdue/pending status correctly
- [ ] Send message → appears in thread → patient receives in inbox
- [ ] Rate limit: send 10 messages, verify 11th blocked with clear message
- [ ] Settings: caregiver options render, patient options hidden

**Adversarial review checklist:**
- [ ] Caregiver cannot modify any patient data (read-only everywhere except messages)
- [ ] Patient with 100+ visits → pagination works, scroll performance OK
- [ ] Visit still processing (no summary) → graceful loading/pending state
- [ ] Message input: empty messages blocked, no XSS/injection possible
- [ ] Deep back navigation stack (home → patient → visits → detail) → back button correct at each level

**Gate result:** PASS
**Notes:** All 38 new tests pass (4 test suites: patient detail 10, visit detail 11, medications 8, messages 9). 6 new API hooks added to `mobile/lib/api/hooks.ts` (`useCareVisits`, `useCareVisitDetail`, `useCareMedications`, `useCareActions`, `useCareMessages`). Fixed `useSendCareMessage` to send `message` field instead of `body` (matching backend `req.body.message`). Patient detail screen uses `useCareQuickOverview` + `useCareMedicationStatus` for data. All list screens are fully read-only (no FAB, edit, or delete actions). Medication screen shows today's status per-med via cross-referencing `useCareMedicationStatus`. Action items screen provides "Message about this" link that pre-fills the message input. Messages screen uses conversation-style bubbles with read indicators and rate limit display. Caregiver settings shows account info, linked patients, and sign out. Collapsible sections in visit detail with diagnoses/meds/next-steps default open, follow-ups/tests collapsed. Date-string overdue comparison follows project convention (`dueDate.slice(0,10) < today`). All screens use consistent back button navigation via `router.back()`. Pre-existing test failures (10 suites from `expo-apple-authentication` ESM) unrelated to Phase 4.
**Date completed:** 2026-03-13

---

## Phase 5 — Polish + Daily Briefing Card

### Status: COMPLETE

### Tasks

| # | Task | Status | Files |
|---|------|--------|-------|
| 5a | Briefing card on caregiver home | DONE | `mobile/app/(caregiver)/index.tsx` |
| 5b | Notification preferences in settings | DONE | `mobile/app/(caregiver)/settings.tsx` |
| 5c | Role switching for dual-role users | DONE | `mobile/app/(caregiver)/settings.tsx`, `mobile/app/(patient)/settings.tsx`, `mobile/contexts/AuthContext.tsx` |

### Phase 5 Review Gate

**Manual verification checklist:**
- [ ] Briefing card shows today's digest on caregiver home
- [ ] Briefing time picker persists preference
- [ ] Dual-role user can switch patient ↔ caregiver in settings
- [ ] Full E2E: sign up caregiver on mobile → accept invite → daily briefing fires → open app → home → drill in → message → patient receives

**Adversarial review checklist:**
- [ ] Role switch while data loading → cancels in-flight queries, no stale data
- [ ] Briefing time 3 AM → respects explicit preference (not overridden by quiet hours)

**Gate result:** PASS
**Notes:** All 72 existing caregiver tests + 17 role/layout tests continue to pass. No new test suites added for Phase 5 (pure UI polish + preference persistence + context extension). Briefing card on caregiver home shows daily digest matching push notification format with per-patient med status and action counts, plus aggregated stats row. Notification preferences (briefing toggle, hour picker, alert type toggles) added to caregiver settings and persisted to user profile via `useUpdateUserProfile`. Hour picker uses bottom-sheet modal with 24-hour list. Role switching added to AuthContext (`availableRoles`, `setRoleOverride`) with AsyncStorage persistence (`lumimd:roleOverride`). Override is respected during role resolution and cleared on sign-out. "Switch to Caregiver/Patient" button appears in both patient and caregiver settings for dual-role users. `queryClient.clear()` called on switch to prevent stale data. Pre-existing test failures (10 suites from `expo-apple-authentication` ESM) unrelated to Phase 5.
**Date completed:** 2026-03-13

---

## Context Handoff

At the end of each phase (after the review gate), the assistant should generate a fresh handoff prompt tailored to the current state. Write it to `docs/CAREGIVER-MOBILE-HANDOFF.md`, overwriting the previous one. The handoff must include:

1. **Which phase to build next** and its status
2. **What changed in prior phases** — any deviations from the original spec, decisions made, edge cases discovered
3. **Files that were created/modified** in the just-completed phase (so the new context knows what exists)
4. **Open questions or concerns** surfaced during review
5. **Instruction to read** `docs/CAREGIVER-MOBILE-BUILD.md` and `CLAUDE.md` for full context

This keeps each handoff current rather than stale, and lets us course-correct between phases.

---

## Key Reference Files

| What | Where |
|------|-------|
| Project overview + all conventions | `CLAUDE.md` |
| AuthContext (modify in Phase 1) | `mobile/contexts/AuthContext.tsx` |
| Root layout (modify in Phase 1) | `mobile/app/_layout.tsx` |
| Current home screen (move in Phase 1) | `mobile/app/index.tsx` |
| Patient hooks pattern to follow | `mobile/lib/api/hooks.ts` |
| Web caregiver hooks (reference) | `web-portal/lib/api/hooks.ts` |
| UI primitives | `mobile/components/ui.tsx` (Colors, spacing, Radius, Card) |
| SDK types | `packages/sdk/src/models/user.ts`, `share.ts`, `lumibot.ts` |
| Trigger pattern to follow | `functions/src/triggers/actionOverdueNotifier.ts` |
| Notification service | `functions/src/services/notifications.ts` |
| Caregiver API routes | `functions/src/routes/care.ts` |
| Share access middleware | `functions/src/services/shareAccess.ts` |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Deep link breakage after screen moves | Route groups are URL-transparent in Expo Router v6. Test all notification types |
| Dual-role users | Default to `patient` if `primaryRole` not set. Role switch in Phase 5 |
| Caregiver signs up on mobile (patient onboarding) | Onboarding checks role — skip health/allergy steps for caregivers |
| Stale role after web-side changes | Re-resolve on AppState foreground + pull-to-refresh |
| Naming conflicts between route groups | Caregiver screens nest under `patient/[patientId]/` — no URL overlap |
| `record.tsx` stub file | Delete if unused — may conflict with route groups |
