# PostVisit.ai-Inspired Enhancements

## Background

Competitive analysis of [PostVisit.ai](https://postvisit.ai) — an AI-powered post-visit companion built by cardiologist Michal Nedoszytko (3rd place, Anthropic hackathon). PostVisit is a web-only platform that turns visit transcripts into patient-friendly guidance with a persistent AI assistant.

This document captures the filtered, pressure-tested set of features and patterns worth adapting to LumiMD. Each item passed the bar of: (1) integrates cleanly with our existing architecture, (2) solves a real user problem, not feature-for-feature copying.

## What PostVisit.ai Does Well

1. **Persistent context-aware AI chat** — right-side panel always visible, suggested questions change per page
2. **"Ask" buttons on every data section** — one tap sends that specific context to the AI
3. **Expandable SOAP sections** — accordion pattern keeps visit page scannable
4. **Next Actions as checkboxes** — complete tasks right on the visit page
5. **Evidence-based reference library** — auto-curated clinical guidelines matched to patient conditions
6. **Connected device integration** — Apple Watch, Fitbit, Garmin, etc. feeding vitals
7. **Lab PDF upload + AI extraction** — drag-drop lab reports, AI plots individual values as trends
8. **Dual-party recording consent** — prominent yellow consent card before recording

## Where LumiMD Is Already Stronger

- **Dual web portals** — both a patient portal (dashboard, visits, meds CRUD, health charts, actions, sharing) and a caregiver portal (multi-patient overview, messaging, adherence, tasks). Auto-routes users to the correct view based on account type.
- **Medication safety** — drug interaction checking, allergy alerts, duplicate therapy detection
- **Proactive nudge system** — push notifications, medication follow-ups, scheduled reminders
- **Native iOS app** — offline-capable recording, push notifications, device calendar integration
- **Medication adherence** — dose logging, reminder scheduling, adherence stats with confidence indicators
- **Patient web portal features** — visit folder organization, bulk actions, calendar heatmap for actions, provider reports export, medication CRUD with safety warnings, health insights
- **Post-visit walkthrough** — LumiBot v2 Phase 2 already guides patients through "what happened, what changed, what's next" with suggested Q&A. PostVisit's per-section "Ask" buttons solve a similar problem differently.
- **Visit summary structure** — we already surface med changes, action items, diagnoses, and education as distinct sections. PostVisit's "Quick Summary" and "Recommendations" are handled by our existing summary + walkthrough.

## What We Cut (and Why)

| Proposed | Decision | Reason |
|----------|----------|--------|
| Plain-English Quick Summary (5.1) | **Cut** | Walkthrough "What Happened" step + existing summary covers this. Adding another summary is redundant. |
| Doctor's Recommendations List (5.2) | **Cut** | We already surface med changes, action items, and follow-ups — same data, different format. Adding a GPT-4 field risks inconsistency with existing extraction. |
| Post-Visit Dashboard Card (5.5) | **Cut** | Push notifications + "Recent Visits" glanceable card already guide patients to processed visits. More dashboard clutter isn't the answer. |
| Per-Section "Ask LumiBot" Buttons (5.4) | **Modified** | Visual clutter + API cost concerns. Simplified to a more prominent walkthrough entry point (see below). |
| Condensed Table View (7.3) | **Cut** | Most caregivers manage 1-2 patients. Table view solves a problem that barely exists. |
| At a Glance Summary Card (7.4) | **Modified** | Patient detail already has Health Snapshot + Med Progress at the top. Merged into richer patient cards approach (see below). |
| Activity Timeline (7.5) | **Modified** | Full timeline is over-engineered. Simplified to a "Last active" indicator. |
| Demo Mode (7.6) | **Cut** | Using real data for demos. Not worth the infrastructure. |
| Patient Portal Web Enhancements (7.7) | **Modified** | Reframed: if iOS gets inline checkboxes, web visit detail should too. But the bigger question is lightweight iOS CRUD (see Strategic section). |

---

## Approved Enhancements

### Phase 5: iOS Enhancements ✅ (Completed 2026-03-09)

#### 5.1 — Inline Action Item Checkboxes on Visit Detail ✅

**Problem:** Action items extracted from a visit are shown in an expandable section on visit-detail, but completing them requires navigating to the Actions screen.

**Implementation:**
- In the "Follow-ups & Action Items" section of `visit-detail.tsx`, add a completion checkbox to each item
- Tap checkbox → call `useCompleteAction` mutation → check animation → strikethrough
- Keep the existing Actions screen for the full list/history — this is a convenience shortcut

**Files to modify:**
- `mobile/app/visit-detail.tsx` — add checkbox + mutation to action items section

**Effort:** Low (mutation already exists)

#### 5.2 — Prominent "Review with LumiBot" Button ✅

**Problem:** The walkthrough Q&A system (Phase 2) is powerful but the "Review with LumiBot" button after dismissal isn't prominent enough. PostVisit solves this with per-section "Ask" buttons, but that adds clutter and API cost.

**Simpler approach:**
- Make the "Review with LumiBot" button a sticky floating pill at the bottom of visit-detail (always visible while scrolling)
- Styled as a warm, inviting affordance — not a standard button buried in the page
- Tapping opens the existing walkthrough bottom-sheet with Q&A
- No new API endpoints, no per-section buttons, no additional LLM calls

**Files to modify:**
- `mobile/app/visit-detail.tsx` — convert existing button to sticky floating pill

**Effort:** Low (UI change only)

#### 5.3 — Recording Consent Enhancement ✅

**Problem:** PostVisit's explicit dual-party consent card is a stronger trust signal and legal safeguard.

**Implementation:**
- On `record-visit.tsx`, show a consent card in the idle state:
  - Warm background (coral/yellow)
  - Text: "Please confirm that everyone in the room knows this visit is being recorded."
  - Link to Privacy Policy
  - CTA: "Everyone Consents — Start Recording"
- Two-party consent states: show every time
- One-party consent states: show once, then dismissible via local storage

**Files to modify:**
- `mobile/app/record-visit.tsx` — add consent card to idle state

**Effort:** Low (UI-only)

---

### Phase 6: Trusted Resource Links (iOS + Web) ✅ (Completed 2026-03-09)

#### 6.1 — MedlinePlus Links for Medications and Conditions ✅

**Problem:** We display medication names and education content from GPT-4 extraction (`purpose`, `sideEffects`, `whenToCallDoctor`), but don't link to trusted external sources. Medications added manually or from older visits may lack education data.

**Simplified approach (no mapping file):**
- Add a "Learn more" link on medication and condition displays
- Conditions: resolved to direct MedlinePlus topic pages via NLM Health Topics API. Mobile calls API directly; web uses `/api/medlineplus` proxy (302 redirect)
- Medications: contextual NLM search (appends "medication" to query, surfaces drug info page first)
- No mapping file to maintain — API + search handles all medications and conditions
- Works across: visit-detail, medications screen, caregiver medication view, web portal

**Files to modify:**
- `mobile/app/visit-detail.tsx` — add link to medication and diagnosis items
- `mobile/app/medications.tsx` — add link to medication detail
- `web-portal/app/(protected)/visits/[id]/page.tsx` — add link
- `web-portal/app/(protected)/medications/page.tsx` — add link
- `web-portal/app/care/[patientId]/medications/page.tsx` — add link

**Effort:** Low (utility function + link component, no mapping maintenance)
**LLM cost:** None

---

### Phase 7: Caregiver Dashboard — Richer Patient Cards ✅ (Completed 2026-03-09)

> Instead of three separate additions (promote alerts, inline vitals, at-a-glance summary), consolidate into one change: make the existing patient cards more information-dense.

#### 7.1 — Enriched Patient Cards with Vitals + Last Active ✅

**Problem:** Patient cards currently show med progress, action count, and alert count. Caregivers want to see "is Mom's blood pressure okay?" and "is Mom using the app?" without clicking into sub-pages. Meanwhile, the Health Overview section at the bottom shows per-patient status that overlaps with what the cards could show.

**Implementation:**
- Add a vitals row to each patient card: last BP, last glucose or weight, with alert-level color coding
- Add a "Last active: 2 hours ago" indicator (last health log, dose log, or nudge response timestamp)
- Move Health Overview data into the cards → remove the separate Health Overview section to avoid duplication
- Keep the "Needs Attention" sidebar as-is (it works in the 2-column desktop layout)

**Data source:** Extend `/v1/care/overview` response to include `latestVitals` and `lastActiveAt` per patient.

**Files to modify:**
- `web-portal/app/care/page.tsx` — extend patient card, remove Health Overview section
- `functions/src/routes/care.ts` — extend overview response

**Effort:** Medium
**LLM cost:** None

#### 7.2 — Inline Action Checkboxes on Web Visit Detail ✅

**Mirror of iOS Phase 5.1 for the patient web portal.**

- Add completion checkboxes to action items on `web-portal/app/(protected)/visits/[id]/page.tsx`
- Same pattern: tap → mutation → strikethrough

**Files to modify:**
- `web-portal/app/(protected)/visits/[id]/page.tsx`

**Effort:** Low

---

### Strategic: Lightweight iOS CRUD

> The biggest insight from this analysis isn't a PostVisit feature — it's a gap in our own architecture.

#### The Problem

Patients manage medications, action items, and visit metadata on the web portal. The iOS app is primarily read + record. This means a patient who records a visit on their phone, sees an incorrect medication extracted, can't fix it without going to a laptop.

#### Current State Audit

| Capability | API Support | SDK Client Method | Mobile Mutation Hook | Mobile UI |
|-----------|-------------|-------------------|---------------------|-----------|
| **Add medication** | `POST /v1/medications` | `api.medications.create()` | ❌ Missing | ❌ None |
| **Edit medication** | `PATCH /v1/medications/:id` | `api.medications.update()` | ❌ Missing | ❌ None |
| **Stop/delete medication** | `DELETE /v1/medications/:id` | `api.medications.delete()` | ❌ Missing | ❌ None |
| **Create action item** | `POST /v1/actions` | `api.actions.create()` | ❌ Missing | ❌ None |
| **Edit action item** | `PATCH /v1/actions/:id` | `api.actions.update()` | ❌ Missing | ❌ None |
| **Complete action item** | `PATCH /v1/actions/:id` | `api.actions.update()` | ✅ `useCompleteAction` | ✅ Checkbox |
| **Medication reminders** | Full CRUD | All methods | ✅ All hooks | ✅ Full UI |
| **Health log entry** | `POST /v1/health-logs` | `api.healthLogs.create()` | ✅ `useCreateHealthLog` | ✅ Modal forms |

**Key finding:** The entire API + SDK layer already supports all CRUD operations. We only need mutation hooks in `mobile/lib/api/mutations.ts` and UI components. Zero backend work.

#### What to Build (and What NOT to)

**Build — critical-path editing:**
1. Edit medication dose/frequency — "That dose is wrong, it's 20mg not 10mg"
2. Add a medication the AI missed — "I'm also taking Vitamin D"
3. Stop a medication — "I stopped taking this last week"
4. Add a manual action item — "I need to schedule a blood test"

**Don't build — web-only workflows:**
- Visit folder organization
- Bulk operations (multi-select delete)
- Visit metadata editing (provider, specialty, location, notes)
- Full medication form with all fields (simplified mobile form)
- Action item editing (completing + creating covers the use cases)

#### Implementation: Step by Step

##### S.1 — New Mutation Hooks

**File: `mobile/lib/api/mutations.ts`**

Add 4 new hooks alongside the existing 4:

```typescript
// Medications
useCreateMedication    — POST /v1/medications
  params: { name, dose?, frequency?, status? }
  invalidates: ['medications']

useUpdateMedication    — PATCH /v1/medications/:id
  params: { name?, dose?, frequency?, status? }
  invalidates: ['medications']

useDeleteMedication    — DELETE /v1/medications/:id
  invalidates: ['medications']

// Actions
useCreateAction        — POST /v1/actions
  params: { description, dueDate?, type?, notes? }
  invalidates: ['actions']
```

All 4 use existing SDK client methods (`api.medications.create()`, etc.) — no API client changes needed.

**Effort:** Low (4 hooks, same pattern as existing `useCompleteAction`)

##### S.2 — Edit Medication Bottom Sheet

**New component: `mobile/components/EditMedicationSheet.tsx`**

Triggered from: expanded medication card on `medications.tsx` (new "Edit" button)

**Form fields (simplified — not full web form):**
- Medication name (text input, pre-filled)
- Dose (text input, pre-filled — e.g., "20mg")
- Frequency (text input, pre-filled — e.g., "Once daily")
- Status toggle: Active / Stopped

**Behavior:**
- Opens as a bottom sheet (half-screen, same pattern as existing `ReminderTimePickerModal`)
- Pre-fills from current medication data
- "Save" calls `useUpdateMedication` → closes sheet → card updates
- "Stop Medication" calls `useUpdateMedication` with `status: 'inactive'` + confirmation alert
- Validation: name required, other fields optional

**UX consideration for elderly users:**
- Large input fields with clear labels
- No dropdowns — plain text inputs (dose format varies too much for structured input)
- Save button is full-width, prominent
- Cancel is a text link, not competing with Save

##### S.3 — Add Medication Bottom Sheet

**New component: `mobile/components/AddMedicationSheet.tsx`**

Triggered from: new "+" floating action button on `medications.tsx` (same position pattern as health screen FAB)

**Form fields:**
- Medication name (text input, required)
- Dose (text input, optional — "e.g., 20mg")
- Frequency (text input, optional — "e.g., Once daily with food")

**Behavior:**
- Opens as a bottom sheet
- "Add" calls `useCreateMedication` with `status: 'active'`, `source: 'manual'`
- After adding: option to set a reminder (navigates to reminder picker — already exists)
- Query invalidation refreshes the medication list

**Note:** The web portal medication form has additional fields (reason, prescribedBy, startDate, notes). The mobile form intentionally omits these for simplicity — users can add details on web if needed.

##### S.4 — Stop/Delete Medication

**On the medications screen**, add to the expanded medication card:
- "Stop Medication" button (for active meds) — sets `status: 'inactive'` via `useUpdateMedication`
- Confirmation: "Stop taking [medication name]? This will move it to your inactive list."
- For manually-added medications, also show "Delete" option — calls `useDeleteMedication` (soft delete)
- Visit-extracted medications can be stopped but not deleted (they're part of the visit record)

##### S.5 — Add Action Item

**New component: `mobile/components/AddActionSheet.tsx`**

Triggered from: new "+" button in the header or a FAB on `actions.tsx`

**Form fields:**
- Description (text input, required — "What do you need to do?")
- Due date (date picker, optional)

**Behavior:**
- Opens as a bottom sheet
- "Add" calls `useCreateAction` with `source: 'manual'`
- After adding: offer to add to device calendar (existing calendar integration)
- Appears in the pending list immediately via query invalidation

**Note:** No priority or type fields on mobile — these are set automatically (`type: 'manual'`, priority inferred from due date proximity). Full editing available on web.

##### S.6 — Visit Detail: Edit Extracted Medications

**On `mobile/app/visit-detail.tsx`**, in the medications section:
- Add a small "Edit" link next to each extracted medication (started/changed)
- Tapping opens `EditMedicationSheet` pre-filled with the medication data
- This lets patients fix incorrect doses or names right where they see them
- The edit updates the medication in the `medications` collection (not the visit extraction — the visit record stays as-is for audit)

#### Files Summary

| File | Changes |
|------|---------|
| `mobile/lib/api/mutations.ts` | Add `useCreateMedication`, `useUpdateMedication`, `useDeleteMedication`, `useCreateAction` |
| `mobile/app/medications.tsx` | Add FAB for "Add", Edit/Stop buttons on expanded cards |
| `mobile/app/actions.tsx` | Add "+" button for creating action items |
| `mobile/app/visit-detail.tsx` | Add "Edit" link on extracted medications |
| New: `mobile/components/EditMedicationSheet.tsx` | Bottom sheet form (name, dose, frequency, status) |
| New: `mobile/components/AddMedicationSheet.tsx` | Bottom sheet form (name, dose, frequency) |
| New: `mobile/components/AddActionSheet.tsx` | Bottom sheet form (description, due date) |

#### Effort Breakdown

| Step | Effort | Why |
|------|--------|-----|
| S.1 Mutation hooks | Low | 4 hooks, same pattern as existing |
| S.2 Edit Medication Sheet | Medium | New component, but follows existing modal patterns |
| S.3 Add Medication Sheet | Medium | Similar to S.2, slightly simpler |
| S.4 Stop/Delete | Low | Button + confirmation alert, uses S.1 hooks |
| S.5 Add Action Sheet | Low-Med | Simpler form than medication |
| S.6 Visit Detail Edit | Low | Wires existing sheet to a new trigger |
| **Total** | **Medium-High** | **~1 dedicated session** |

#### Execution Order

1. **S.1 first** — mutation hooks are the foundation
2. **S.2 + S.4 together** — edit and stop/delete share the same screen (medications.tsx)
3. **S.3 next** — add medication, also on medications.tsx
4. **S.5** — add action, on actions.tsx
5. **S.6 last** — wires visit-detail to the edit sheet built in S.2

#### What NOT to Port (Web-Only Stays Web-Only)

| Feature | Why it stays on web |
|---------|-------------------|
| Visit folders/tags | Organization workflow, not quick editing |
| Bulk select + delete | Power-user feature, needs multi-select UI |
| Visit metadata (provider, specialty, location) | Rarely edited, not urgent |
| Medication full form (reason, prescribedBy, startDate, notes) | Nice-to-have fields, not critical-path |
| Action item editing (change description, due date) | Completing + creating covers the mobile use cases |
| Export/print summaries | Desktop workflow |

---

## Future Roadmap (Phase 8 — Higher Effort)

> Ideas worth tracking but not scheduled until the above is complete.

### 8.1 — Apple HealthKit Integration
Eliminates manual vitals logging. Plan exists at `docs/features/HEALTHKIT_REIMPLEMENTATION_PLAN.md`. **Effort:** High.

### 8.2 — Lab Report Upload + AI Extraction
Camera capture → GPT-4 Vision → structured lab values → health log trends. **Effort:** High. **LLM cost:** GPT-4V per upload.

### 8.3 — Medical Term Explainer (Tap-to-Define)
During GPT-4 extraction, generate glossary of medical terms. Highlight on visit-detail with tap-to-define. Zero additional LLM calls. **Effort:** Medium.

### 8.4 — Conversational Health History
"Ask LumiBot anything" across all patient data. Per-question LLM calls with strict guardrails. **Effort:** High.

### 8.5 — Connected Services Catalog
Apple Health, Epic MyChart, CVS, Quest, Aetna integrations. Requires partnerships + compliance. **Effort:** Very high.

---

## Implementation Priority

| Priority | Item | Effort | Platform | Status |
|----------|------|--------|----------|--------|
| 1 | 5.1 Inline Action Checkboxes (iOS) | Low | iOS | ✅ Done |
| 2 | 5.2 Prominent "Review with LumiBot" pill | Low | iOS | ✅ Done |
| 3 | 5.3 Recording Consent Enhancement | Low | iOS | ✅ Done |
| 4 | 6.1 MedlinePlus Links (search URL, no mapping) | Low | iOS + Web | ✅ Done |
| 5 | 7.1 Enriched Patient Cards (vitals + last active) | Medium | Web | ✅ Done |
| 6 | 7.2 Inline Action Checkboxes (Web) | Low | Web | ✅ Done |
| 7 | Strategic: Lightweight iOS CRUD | Medium-High | iOS | ✅ Done |
| 8+ | Phase 8 backlog | High | Various | ⬜ Backlog |

## Execution Notes

### Batching Strategy
- **iOS batch 1 (5.1 + 5.2 + 5.3):** All low effort, all touch `visit-detail.tsx` or `record-visit.tsx`. Single session.
- **Cross-platform (6.1):** MedlinePlus links across iOS + web. Single session after iOS batch 1.
- **Web batch (7.1 + 7.2):** Enriched patient cards + web inline checkboxes. Single session.
- **iOS batch 2 (Strategic CRUD):** Larger effort. Dedicated session — medication editing first, then action items.

### Parallelization
- iOS batch 1 and web batch are fully independent — can run in parallel
- Phase 6 bridges both — do after either batch
- Strategic iOS CRUD is independent of all web work

### Dependencies
- 7.2 (web checkboxes) shares the same pattern as 5.1 (iOS checkboxes) — do iOS first to establish the pattern
- Strategic CRUD depends on understanding current API mutations — read existing `mutations.ts` before starting
- Phase 8 items are backlog — don't schedule until Phases 5-7 + Strategic are complete
