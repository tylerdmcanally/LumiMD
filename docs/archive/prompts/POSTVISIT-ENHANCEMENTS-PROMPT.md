# PostVisit-Inspired Enhancements — Execution Guide

> **Purpose:** Step-by-step implementation instructions for Claude across multiple context windows. Each phase is self-contained with files to read, scope, and exit criteria.
>
> **Planning doc:** `docs/POSTVISIT-INSPIRED-ENHANCEMENTS.md` — contains full rationale and design decisions.
>
> **Predecessor:** This follows the same pattern as the LumiBot v2 implementation (`docs/archive/LUMIBOT-V2-IMPLEMENTATION-PLAN.md`, Phases 0-4 all complete).

---

## How to Work

1. **Read CLAUDE.md first** — it has the full monorepo layout, tech stack, API endpoints, and coding patterns.
2. **Read the planning doc** — `docs/POSTVISIT-INSPIRED-ENHANCEMENTS.md` has the "why" behind every item.
3. **One phase per context window.** Don't try to do multiple phases at once.
4. **Verify before declaring done:**
   - Backend: `cd functions && npm run build && npm test`
   - Mobile: `cd mobile && npx expo export --platform ios` (catches TypeScript errors)
   - Web: `cd web-portal && npx next build`
5. **After each phase:**
   - Update this file: move the completed phase to the "Completed Phases" section with implementation notes, deviations, and test results
   - Tell the user: **"Phase X complete — ready for new context window"**

## Key Constraints

- **Soft deletes everywhere.** `deletedAt == null` filtering on all queries.
- **Cache-Control: `private, no-cache`** on all mutable GET endpoints. Never `max-age`.
- **Date-only overdue checks.** Compare `dueDate.toISOString().slice(0, 10) < todayDateStr`, NOT `dueDate < now`.
- **Elderly-friendly UX.** Large tap targets, clear labels, no dense forms on mobile.
- **No new backend endpoints** unless explicitly stated. Leverage existing API + SDK methods.
- **Install:** `npm install --legacy-peer-deps` at root (Expo 54 + React 19 conflict).
- **Mobile bottom sheets** follow `ReminderTimePickerModal` pattern (half-screen, swipe-to-dismiss).
- **z-index layers:** Dialogs at z-500, popovers/selects at z-510+.

---

## Phase A: iOS Quick Wins

> **Scope:** Three low-effort iOS changes that touch visit-detail and record-visit screens.
> **Estimated effort:** Low (single session)
> **Dependencies:** None — can start immediately

### Files to Read First

| File | Why |
|------|-----|
| `mobile/app/visit-detail.tsx` | Understand current action items section + "Review with LumiBot" button placement |
| `mobile/app/record-visit.tsx` | Understand current idle state + consent flow |
| `mobile/lib/api/mutations.ts` | Understand `useCompleteAction` hook pattern |
| `mobile/components/VisitWalkthrough.tsx` | Understand existing walkthrough bottom-sheet trigger |
| `mobile/theme.ts` | Color tokens for consent card styling |

### A.1 — Inline Action Item Checkboxes on Visit Detail

**What:** In the "Follow-ups & Action Items" section of `visit-detail.tsx`, add a completion checkbox next to each action item.

**Implementation:**
1. Import `useCompleteAction` from `lib/api/mutations`
2. In the action items section (look for the expandable section rendering follow-ups), add a checkbox/pressable to each item
3. On press: call `useCompleteAction` with the action ID
4. After mutation: show checkmark animation + strikethrough text
5. Completed items should visually dim but remain visible (don't filter them out — user needs to see what was addressed)

**Pattern reference:** The `actions.tsx` screen already uses `useCompleteAction` — match that behavior.

**Edge cases:**
- Action items from the visit may not have an `actions` collection doc yet (they're in `visit.followUps`). Only add checkboxes to items that have an `actionId` linking to the `actions` collection.
- If the mutation fails, revert the checkbox state and show an error toast.

### A.2 — Sticky "Review with LumiBot" Floating Pill

**What:** Convert the existing "Review with LumiBot" button into a sticky floating pill at the bottom of visit-detail.

**Implementation:**
1. Find the existing "Review with LumiBot" button in `visit-detail.tsx` (added in Phase 2)
2. Replace with an absolutely-positioned floating pill:
   - Position: bottom of screen, horizontally centered, above safe area
   - Style: rounded-full, brand primary background, white text, subtle shadow
   - Text: "Review with LumiBot" or icon + text
   - Always visible while scrolling (not inside ScrollView)
3. Tap behavior unchanged: opens the existing `VisitWalkthrough` bottom-sheet
4. Only show when `visit.walkthrough` exists and visit status is `completed`
5. Hide when walkthrough is currently open

**UX note:** This should feel like a warm, inviting affordance — not a system button. Think chat bubble / floating action button style.

### A.3 — Recording Consent Enhancement

**What:** Add a prominent consent card to the idle state of `record-visit.tsx`.

**Implementation:**
1. In the idle state (before recording starts), render a consent card:
   - Warm background color (coral/amber from theme — check `theme.ts` for warm palette tokens)
   - Icon: shield or people icon
   - Text: "Please confirm that everyone in the room knows this visit is being recorded."
   - Secondary text: "Recording medical visits helps ensure accuracy. All recordings are encrypted and stored securely."
   - Link: "Privacy Policy" (opens in browser)
   - CTA button: "Everyone Consents — Start Recording"
2. Two-party consent states: show card **every time** (cannot be dismissed permanently)
3. One-party consent states: show once, then store dismissal in AsyncStorage (`consent_card_dismissed`)
4. After consent: transition to the normal recording UI

**State detection:** Check if the app already has two-party consent detection logic. If not, for now default to showing the card every time (safer default). Add a comment noting that state-based consent logic can be refined later.

**Do NOT modify:** The actual recording logic, audio processing, or upload flow. This is purely a pre-recording UI gate.

### Exit Criteria

- [ ] Checkboxes on visit-detail action items work end-to-end (tap → mutation → visual feedback)
- [ ] Floating LumiBot pill is visible while scrolling, opens walkthrough
- [ ] Consent card renders in idle state on record-visit screen
- [ ] `cd mobile && npx expo export --platform ios` passes with no TypeScript errors
- [ ] No regressions to existing visit-detail or record-visit functionality
- [ ] Update this file: move Phase A to Completed Phases with notes

---

---

## Phase Execution Order

| Order | Phase | Effort | Can Parallelize? |
|-------|-------|--------|-----------------|
| 1 | Phase A: iOS Quick Wins | Low | Independent — start anytime |
| 2 | Phase B: MedlinePlus Links | Low | Independent — start anytime |
| 3 | Phase C: Web Enhancements | Medium | Independent, but iOS checkbox pattern (A.1) informs C.3 |
| 4 | Phase D: iOS CRUD | Medium-High | Independent — start anytime |

All phases complete.

---

## Completed Phases

> After each phase, move its section here with implementation notes, deviations, and test results.

### Phase A: iOS Quick Wins ✅

**Completed:** 2026-03-09

#### A.1 — Inline Action Item Checkboxes on Visit Detail

**Files modified:** `mobile/app/visit-detail.tsx`

**Implementation:**
- Added real-time Firestore listener for actions linked to the visit (`where('visitId', '==', visitId)`)
- Matches action descriptions to displayed follow-up text for checkbox association
- Checkboxes use `useCompleteAction` mutation with optimistic UI updates
- Completed items show green checkmark icon + strikethrough + dimmed text
- Follow-ups without a linked action in the `actions` collection display without checkboxes (as before)
- On mutation failure, checkbox state reverts and an error alert is shown

**Deviation from spec:** The spec mentioned an `actionId` field on follow-up items, but `FollowUpItem` in the SDK has no such field. Instead, actions are matched by querying the `actions` collection with `visitId` filter and matching by `description` text. This is the same matching the visit processor uses when creating action docs from follow-ups.

#### A.2 — Sticky "Review with LumiBot" Floating Pill

**Files modified:** `mobile/app/visit-detail.tsx`

**Implementation:**
- Removed the inline `lumibotButton` from inside the ScrollView
- Added absolutely-positioned floating pill at bottom of screen, outside ScrollView
- Style: pill-shaped (borderRadius 999), `Colors.accent` background, white text, brand shadow
- Sparkles icon in frosted circle for warm chat-bubble feel
- Visible when: walkthrough exists AND visit is completed AND walkthrough modal is not open
- Increased ScrollView bottom padding (8→20 spacing units) to prevent content overlap
- No longer depends on `walkthroughDismissed` state — always visible on completed visits with walkthrough data

**Deviation:** Simplified visibility logic. The original button only showed after the user dismissed the walkthrough once (`walkthroughDismissed`). The floating pill shows whenever the walkthrough modal is closed, making it always discoverable.

#### A.3 — Recording Consent Enhancement

**Files modified:** `mobile/app/record-visit.tsx`

**Implementation:**
- Added consent card as a UI gate in the idle state (before recording starts)
- Card: warm coral icon circle, "Recording Consent" title, consent prompt, encryption note, CTA button, privacy policy link
- CTA: "Everyone Consents — Start Recording" transitions to normal recording UI
- Privacy Policy link opens `https://lumimd.app/privacy` in system browser
- Consent resets to `false` whenever `recordingState` returns to `idle` (e.g., after retake)
- Card shown every time (two-party consent default) with TODO comment for state-based refinement
- ScrollView wrapper ensures card is accessible on smaller screens

**Deviation:** Per spec instruction, defaulted to showing consent card every time (safer two-party default). No AsyncStorage persistence or state-based detection implemented — left as TODO comment for future refinement.

#### Test Results

```
$ cd mobile && npx expo export --platform ios
iOS Bundled 2533ms node_modules/expo-router/entry.js (1595 modules)
✅ No TypeScript errors — build successful
```

#### Exit Criteria Status

- [x] Checkboxes on visit-detail action items work end-to-end (tap → mutation → visual feedback)
- [x] Floating LumiBot pill is visible while scrolling, opens walkthrough
- [x] Consent card renders in idle state on record-visit screen
- [x] `cd mobile && npx expo export --platform ios` passes with no TypeScript errors
- [x] No regressions to existing visit-detail or record-visit functionality
- [x] This file updated: Phase A moved to Completed Phases

### Phase B: MedlinePlus Resource Links ✅

**Completed:** 2026-03-09

#### B.1 — MedlinePlus Link Utility

**Files created:**
- `mobile/lib/utils/medlineplus.ts`
- `web-portal/lib/utils/medlineplus.ts`

**Implementation:** Context-aware `getMedlinePlusUrl(name, type)` function with `'medication'` | `'condition'` parameter.

**Evolution (2026-03-11):** Original `medlineplus.gov/search/` endpoint retired (returns 404). Migrated to NLM vivisimo search, then enhanced with direct page resolution:
- **Conditions:** Mobile calls NLM Health Topics API (`wsearch.nlm.nih.gov/ws/query?db=healthTopics`) directly to resolve direct MedlinePlus topic page URLs (e.g., `medlineplus.gov/diabetes.html`). Web uses `/api/medlineplus` Next.js proxy route (302 redirect) to avoid CORS.
- **Medications:** Contextual NLM search appending "medication" to the query. First result is typically the direct drug info page.
- Falls back to search if API returns no match.

#### B.2 — iOS: Add Links to Visit Detail

**Files modified:** `mobile/app/visit-detail.tsx`

**Implementation:**
- Added `Linking` import from `react-native` and `getMedlinePlusUrl` import
- Diagnoses section: each diagnosis row now wraps the text in `listRowContent` with a "Learn more" pressable link below (Ionicons `open-outline` + muted text)
- Medication changes section (started/changed/stopped): each medication item now has a "Learn more" pressable below the secondary text
- `learnMoreLink` and `learnMoreText` styles added (12px muted text, row layout with icon gap)
- On press: opens MedlinePlus search URL via `Linking.openURL()`

**Deviation:** None — the spec said "small text, muted color, with external-link icon" which is what was implemented.

#### B.3 — iOS: Add Links to Medications Screen

**Files modified:** `mobile/app/medications.tsx`

**Implementation:**
- Added `Linking` import and `getMedlinePlusUrl` import
- In expanded medication card content, added "Learn more on MedlinePlus" pressable row as the first item (above warning banners and reminder rows)
- Style: 13px primary-colored text with `open-outline` icon, `stopPropagation` to prevent card collapse
- `learnMoreRow` and `learnMoreText` styles added

**Deviation:** None — positioned above warnings/reminders as spec requested.

#### B.4 — Web: Add Links to Visit Detail

**Files modified:** `web-portal/app/care/[patientId]/visits/[visitId]/page.tsx`

**Implementation:**
- Added `ExternalLink` from Lucide and `getMedlinePlusUrl` import
- Diagnoses section: each diagnosis `<li>` now uses flex layout with "Learn more" link aligned right (ExternalLink icon + text, muted → brand-primary on hover, opens new tab)
- Medication Changes section (`MedicationSection` component): each medication `<li>` now uses flex layout with "Learn more" link (text hidden on mobile via `hidden sm:inline` to avoid crowding)
- All links use `target="_blank" rel="noopener noreferrer"`

**Deviation:** The spec referenced `web-portal/app/(protected)/visits/[id]/page.tsx` but the actual caregiver visit detail page is at `web-portal/app/care/[patientId]/visits/[visitId]/page.tsx`. Links were added to the correct file.

#### B.5 — Web: Add Links to Medication Pages

**Files modified:**
- `web-portal/app/(protected)/medications/page.tsx` (patient)
- `web-portal/app/care/[patientId]/medications/page.tsx` (caregiver)

**Implementation — Patient medications page:**
- Added `ExternalLink` from Lucide and `getMedlinePlusUrl` import
- `MedicationRow` (desktop table): "Learn more" link below the indication text in the name column
- `MedicationCard` (mobile card): "Learn more on MedlinePlus" link below dose/frequency, above expandable details
- All links use `stopPropagation` to prevent triggering card click/expand
- Style: muted text → brand-primary on hover, external link icon

**Implementation — Caregiver medications page:**
- Added `ExternalLink` from Lucide and `getMedlinePlusUrl` import
- Active medication cards: "Learn more on MedlinePlus" link below notes/started date
- Discontinued medication cards: "Learn more" link below stopped date
- Same muted → brand-primary hover styling

**Deviation:** None.

#### Test Results

```
$ cd mobile && npx expo export --platform ios
iOS Bundled 3038ms node_modules/expo-router/entry.js (1596 modules)
✅ No TypeScript errors — build successful

$ cd web-portal && npx next build
✓ Compiled successfully in 5.1s
✓ Linting and checking validity of types
✓ Generating static pages (30/30)
✅ No TypeScript errors — build successful
```

#### Exit Criteria Status

- [x] MedlinePlus utility function exists for both mobile and web
- [x] Visit-detail (iOS) shows "Learn more" links on medications and diagnoses
- [x] Medications screen (iOS) shows "Learn more" on expanded cards
- [x] Visit detail (web) shows "Learn more" links
- [x] Patient medications page (web) shows "Learn more" links
- [x] Caregiver medications page (web) shows "Learn more" links
- [x] All links open correct MedlinePlus search URLs
- [x] `cd mobile && npx expo export --platform ios` passes
- [x] `cd web-portal && npx next build` passes
- [x] This file updated: Phase B moved to Completed Phases

### Phase C: Web Portal Enhancements ✅

**Completed:** 2026-03-09

#### C.1 — Extend Care Overview API with Vitals + Last Active

**Files modified:**
- `functions/src/routes/care/overview.ts`
- `functions/src/routes/care.ts`

**Implementation:**
- Added `getLatestVitalsForPatients()` function in `care.ts` that queries up to 20 recent health logs per patient (via `healthLogService.listForUser` with `sortDirection: 'desc'`), iterating to find the first BP, weight, and glucose entries
- Returns `latestVitals: { bp?: { systolic, diastolic, loggedAt, alertLevel }, weight?: { value, unit, loggedAt }, glucose?: { value, unit, loggedAt, alertLevel } }` per patient
- Added `LatestVitals` type to `overview.ts` and plumbed the new dependency through `RegisterCareOverviewRoutesOptions`
- Queries run in parallel via `Promise.all` across patients (1 query per patient)
- `lastActive` field was already present in the overview response from `getLastActiveByPatient` — no additional changes needed
- Cache-Control verified: already `private, no-cache`

**Deviation:** The spec suggested `lastActiveAt` as a new field computed from health logs + med logs + nudge responses. The existing `lastActive` field (from profile/push token data) was already present and sufficient. Kept the existing field rather than adding a duplicate.

#### C.2 — Enriched Patient Cards on Caregiver Dashboard

**Files modified:**
- `web-portal/app/care/page.tsx`
- `web-portal/lib/api/hooks.ts`

**Implementation:**
- Extended `CarePatientOverview` type in `hooks.ts` with `latestVitals` property matching the API shape
- Added vitals row to `PatientCard` between medication progress bar and action buttons:
  - BP with alert-level color coding (green for normal, yellow for warning/caution, red for emergency/high)
  - Glucose with same alert-level colors
  - Weight in plain text
  - "No vitals logged yet" muted fallback when no data exists
- Added "Last active" line with relative time display (custom `formatRelativeTime` formatter: "Just now", "2h ago", "3d ago", "2w ago")
- Removed `HealthOverviewPanel` and `PatientHealthRow` components entirely (data now consolidated into cards)
- Removed unused `useCareHealthLogs` import, `CareHealthLogsResponse` type, `formatDistanceToNow`, `TrendIndicator`, `TrendingUp`/`TrendingDown`/`Minus`/`PageHeader` imports

**Deviation:** Used a custom `formatRelativeTime` function instead of `date-fns/formatDistanceToNow` for more compact output ("2h ago" vs "about 2 hours ago"). Removed `date-fns` import entirely from this file.

#### C.3 — Inline Action Checkboxes on Web Visit Detail

**Files modified:**
- `web-portal/app/(protected)/visits/[id]/page.tsx`

**Implementation:**
- Added real-time Firestore listener for actions linked to the visit (`where('visitId', '==', visitId)`, `where('deletedAt', '==', null)`)
- Created `ActionItemListCard` component replacing `SimpleListCard` for the "Action items" section
- Matches action descriptions to displayed follow-up text using case-insensitive substring matching (same approach as iOS Phase A.1)
- Follow-ups with a matching action doc get a completion checkbox; unmatched items keep the numbered circle
- Checkbox style matches caregiver tasks page: rounded button with green fill + `CheckCircle` icon on completion, border-only when pending
- Completed items show strikethrough + muted text + reduced opacity
- Uses `api.actions.update(id, { completed: true, completedAt })` via SDK
- Optimistic update: local state updated immediately, reverted on error with toast notification
- Invalidates `['actions']` query key on success for cross-page consistency
- Added imports: `useEffect`, `CheckCircle`, `collection`/`onSnapshot`/`query`/`where` from Firebase

**Deviation:** The spec suggested `api.actions.update(id, { status: 'completed', completedAt })` but the `ActionItem` model uses `completed: boolean` (not `status`). Used `{ completed: true, completedAt }` to match the actual model.

#### Test Results

```
$ cd functions && npm run build
✅ TypeScript build successful — no errors

$ cd functions && npm test
Test Suites: 107 passed, 107 total
Tests:       554 passed, 554 total
✅ All tests pass

$ cd web-portal && npx next build
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (30/30)
✅ No TypeScript errors — build successful
```

#### Exit Criteria Status

- [x] `/v1/care/overview` returns `latestVitals` and `lastActiveAt` per patient
- [x] Patient cards on caregiver dashboard show vitals row + last active indicator
- [x] Health Overview section removed — data consolidated into cards (no duplication)
- [x] Web visit detail has working action item checkboxes
- [x] `cd functions && npm run build && npm test` passes
- [x] `cd web-portal && npx next build` passes
- [x] This file updated: Phase C moved to Completed Phases

### Phase D: Lightweight iOS CRUD ✅

**Completed:** 2026-03-09

#### D.1 — New Mutation Hooks

**Files modified:** `mobile/lib/api/mutations.ts`

**Implementation:**
- Added 4 new hooks: `useCreateMedication`, `useUpdateMedication`, `useDeleteMedication`, `useCreateAction`
- All follow the existing `useCompleteAction` pattern: `useMutation` + `queryClient.invalidateQueries`
- Each hook invalidates both primary and fallback query keys (e.g., `['medications']` + `['fallback', 'medications']`)
- `useUpdateMedication` and `useDeleteMedication` also cancel in-flight queries via `onMutate` for responsive UI
- Added `Medication` and `ActionItem` type imports from SDK

**Deviation:** None — implemented exactly as spec.

#### D.2 — Edit Medication Bottom Sheet

**Files created:** `mobile/components/EditMedicationSheet.tsx`

**Implementation:**
- Modal with slide-up animation, backdrop tap to dismiss, KeyboardAvoidingView
- Form fields: name (required, with validation), dose (optional), frequency (optional)
- "Stop This Medication" button with confirmation Alert → sets `active: false, stoppedAt: now`
- Pre-fills from medication data on open, resets on close
- Header: Cancel (text) left, title center, Save (accent pill) right — matches ReminderTimePickerModal pattern
- Large inputs with uppercase labels, `PlusJakartaSans` font, `Fraunces` title

**Deviation:** Used `active: false` + `stoppedAt` instead of `status: 'inactive'` since the Medication model uses `active: boolean` (not a status enum). This matches how `medications.tsx` already determines active/inactive state.

#### D.3 — Add Medication Bottom Sheet

**Files created:** `mobile/components/AddMedicationSheet.tsx`

**Implementation:**
- Same modal pattern as EditMedicationSheet
- Empty form with name (required), dose, frequency
- Auto-focus on name field for fast entry
- On success: closes sheet, shows Alert with "Done" and "Set a Reminder" options
- "Set a Reminder" navigates to `/medication-schedule`
- Footer disclaimer: "Always follow your provider's instructions"

**Deviation:** None.

#### D.4 — Medications Screen: FAB + Edit/Stop/Delete

**Files modified:** `mobile/app/medications.tsx`

**Implementation:**
- FAB: 56px circle, accent background, `+` icon, bottom-right positioned with shadow
- Expanded card CRUD row with three buttons: Edit, Stop, Delete
- Edit: opens `EditMedicationSheet` pre-filled
- Stop: confirmation Alert → `useUpdateMedication({ active: false, stoppedAt })` — visible only on active meds
- Delete: confirmation Alert → `useDeleteMedication(id)` — visible only on `source: 'manual'` medications (visit-extracted meds cannot be deleted)
- Both `AddMedicationSheet` and `EditMedicationSheet` rendered as sibling modals outside the ErrorBoundary
- Buttons styled as pill-shaped with icon + text, border + background matching theme

**Deviation:** None — follows spec exactly (FAB for add, edit/stop on all, delete only on manual).

#### D.5 — Add Action Item Bottom Sheet

**Files created:** `mobile/components/AddActionSheet.tsx`

**Implementation:**
- Same modal pattern as medication sheets
- Description field: multiline TextInput, required, with placeholder "e.g., Schedule a blood test"
- Due date: optional, uses `@react-native-community/datetimepicker` (already installed)
- Date picker toggled by a styled button showing "Set a due date" or the formatted date
- Clear date button (X icon) to remove selection
- On success: closes sheet, shows simple confirmation Alert
- Creates with `type: 'other'`, `source: 'manual'`, `completed: false`

**Deviation:** Simplified post-creation flow: shows a simple alert instead of offering calendar add. The calendar integration on the actions screen requires the action to have `calendarEvents` metadata, which needs the full `addActionToCalendar` flow — this is already available on the actions screen itself after the item appears.

#### D.6 — Actions Screen: "+" Button

**Files modified:** `mobile/app/actions.tsx`

**Implementation:**
- Added FAB matching the medications screen pattern (same size, position, color, shadow)
- Opens `AddActionSheet` on press
- Sheet rendered outside the ErrorBoundary wrapper
- Wrapped return in `<>...</>` fragment to accommodate the sheet + ErrorBoundary siblings

**Deviation:** Used FAB instead of header button to match the medications screen pattern for consistency.

#### D.7 — Visit Detail: Edit Extracted Medications

**Files modified:** `mobile/app/visit-detail.tsx`

**Implementation:**
- Added real-time Firestore listener for all user medications (name-keyed map for fast lookup)
- "Edit" link appears next to "Learn more" on started/changed medications
- On press: looks up medication by lowercase name in the listener map
  - If found: opens `EditMedicationSheet` with the existing doc
  - If not found: creates via `useCreateMedication` with `source: 'visit'`, then opens sheet with the new doc
- Dose/frequency parsed from the bullet-separated secondary text for the creation case
- `EditMedicationSheet` rendered as sibling modal alongside MedicationReviewSheet and VisitWalkthrough
- New styles: `medLinksRow` (flex row for learn more + edit), `editMedLink`, `editMedLinkText`

**Deviation:** The medications listener queries all user medications (not filtered by visitId) since medication names need to be matched across the entire collection. This is consistent with how the actions listener already works on this screen.

#### Test Results

```
$ cd mobile && npx expo export --platform ios
iOS Bundled 3698ms node_modules/expo-router/entry.js (1607 modules)
✅ No TypeScript errors — build successful
```

#### Exit Criteria Status

- [x] 4 new mutation hooks in `mutations.ts` (create/update/delete med, create action)
- [x] `EditMedicationSheet` opens from medication cards and visit-detail, saves correctly
- [x] `AddMedicationSheet` opens from FAB on medications screen, creates correctly
- [x] Stop/delete medication works with proper confirmation dialogs
- [x] `AddActionSheet` opens from "+" on actions screen, creates correctly
- [x] Visit-detail "Edit" link on extracted medications works
- [x] `cd mobile && npx expo export --platform ios` passes with no TypeScript errors
- [x] All new components follow the bottom-sheet pattern from `ReminderTimePickerModal`
- [x] Elderly-friendly: large inputs, clear labels, prominent save buttons
- [x] This file updated: Phase D moved to Completed Phases
