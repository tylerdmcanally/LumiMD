# LumiMD Data Integration Design

**Date:** March 10, 2026
**Type:** Technical Design Document
**Status:** Implemented — Phase 1 (AVS upload) and Phase 2 (action nudges) deployed to `lumimd-dev`
**Prereq:** [DATA-INGESTION-STRATEGY.md](DATA-INGESTION-STRATEGY.md) — prior session's research on pipeline flexibility and per-source tradeoffs

---

## Product Thesis

LumiMD is how families stay connected to their aging parent's healthcare.

Everything in this document serves one purpose: making it effortless for the patient and actionable for the caregiver. Every feature, data source, and integration is filtered through three questions the caregiver needs answered:

1. **What happened?** — Mom saw Dr. Johnson today. Her blood pressure is better. They started a new medication for her diabetes.
2. **What should happen next?** — Mom needs bloodwork by March 20th. Follow-up with Dr. Johnson on April 15th.
3. **Is it happening?** — Mom filled her Metformin prescription. Mom hasn't gotten her bloodwork yet (5 days overdue).

The patient's job is minimal: press record or snap a photo. Everything else is invisible infrastructure.

### Why not more?

The health data ecosystem is fragmenting fast — TEFCA, FHIR aggregators, ambient scribes, ChatGPT Health. LumiMD is not a health data platform. It doesn't compete with MyChart on data breadth or ChatGPT on AI capabilities. It does one thing no one else does: **connects a doctor visit to a caregiver who wasn't in the room, and tracks whether the plan is being followed.**

### What we build now (this document)

| Source | Patient effort | What it answers | Priority |
|---|---|---|---|
| **Audio recording** (existing) | Press record | What happened (context, reasoning, conversation) | Shipped |
| **AVS photo** | Snap a picture | What happened (exact facts: meds, vitals, diagnoses) | **Phase 1** |
| **Action item follow-through** | Nothing (automatic) | Is it happening (follow-ups completed or overdue) | **Phase 2** |

### What we defer

| Source | Why defer |
|---|---|
| Blue Button pharmacy fills | CMS production approval takes 4-12 weeks with uncertain ROI. An engaged caregiver can call and ask. Revisit if adherence tracking demand emerges. |
| HealthKit Clinical Records | Valuable but requires native build + Apple review. Revisit after Phase 2. |
| FHIR Direct / Aggregators | Ecosystem still maturing. TEFCA IAS not ready for consumer apps. Check back Q4 2026. |
| Metriport / 1up / b.well | Vendor landscape unsettled. Metriport's open-source FHIR parsing code is useful now; their hosted HIE query service isn't confirmed for patient-directed use. |

---

## Phase 1: AVS Photo/Document Upload

### What it solves

Audio recording captures what was discussed — the doctor's reasoning, the patient's questions, the conversation. But it's weak on exact values: medication names are misheard, doses are approximate, vitals are rarely stated aloud, and the full medication list (not just changes) is invisible.

The AVS document is the answer sheet. It's printed from the EHR, so it contains the exact data the recording misses. Every practice hands one out (federally mandated). The patient already has it.

| Data Type | Audio Recording | AVS Document |
|---|---|---|
| Exact medication names/doses | Fair (depends on pronunciation) | Excellent (printed from EHR) |
| Full medication list (all active meds) | Poor (only discusses changes) | Excellent (reconciled list) |
| Vitals (BP, weight, heart rate) | Poor (rarely stated aloud) | Excellent |
| Lab results | Poor (sometimes mentioned) | Good (if available from visit) |
| ICD-10 diagnosis codes | Never | Often printed |
| Allergies | Only if discussed | Full list |
| Follow-up dates | Good (verbal) | Good (with specific dates) |
| Doctor's reasoning / patient questions | Excellent | Never |

**Recording + AVS together gives the complete picture.** AVS provides the facts; recording provides the context. But AVS alone is dramatically better than nothing — and it's the safety net for visits that don't get recorded.

### UX: Integrated into the visit flow

AVS capture is not a separate feature. It's a natural follow-up to recording, and a standalone fallback when recording doesn't happen.

**After recording a visit:**
```
"Your visit is processing."
"Did you get a printed summary from your doctor?"
[Take a photo]  [Skip for now]
```

**When recording didn't happen:**
```
Home screen → "Add a visit"
  → [Record a Visit]
  → [Upload Visit Summary]
```

**The capture flow itself:**
```
Step 1: Capture
  [Take Photo] — camera opens, guidance: "Hold phone flat over the document"
  [Choose Photo] — select from gallery
  [Upload PDF] — file picker (for patient portal downloads)

Step 2: Preview
  Image preview. "Is the text readable?"
  [Retake]  [Use This]

Step 3: Processing
  "Reading your visit summary..." (progress indicator)

Step 4: Confirm
  "We found the following:"
  Visit: Mar 5 — Dr. Johnson
  Medications: Lisinopril 20mg, Metformin 500mg (NEW), Atorvastatin 20mg
  Diagnoses: Hypertension, Type 2 Diabetes
  Follow-ups: Bloodwork by Mar 20, Return visit Apr 15
  [Edit]  [Confirm All]
```

**Confirmation is mandatory.** OCR accuracy varies (80-98% depending on photo quality). The patient reviews extracted data before it's committed. This reuses the existing `medicationConfirmationStatus` flow on the visit document.

### Technical: How AVS extraction works

#### Pipeline

```
Photo/PDF upload → Firebase Storage (visits/{userId}/{timestamp}.{jpg|png|pdf})
  → POST /v1/visits/:id/process-document (new endpoint)
  → Generate signed URL for document in Storage
  → GPT-4V API call with image + existing extraction prompt
  → Structured JSON output (same schema as audio extraction)
  → Write to visit document (transcriptText + structured fields)
  → Set processingStatus = 'summarizing'
  → summarizeVisitTrigger fires → summary stage + post-commit ops
  → Patient receives confirmation prompt
  → Caregiver gets push notification
```

**Key insight from prior analysis:** The GPT-4 extraction pipeline is already format-agnostic. The prompts in `visitPromptRegistry.ts` don't reference audio or transcripts. The `summarizeVisitTrigger` fires on `processingStatus === 'summarizing'` and only requires a non-empty text string. Every post-commit operation (medication safety, walkthrough, nudges, caregiver notification) is source-agnostic. Zero changes to the core pipeline.

#### GPT-4V API call

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o',              // Vision-capable model
  store: false,                  // HIPAA: no data retention
  temperature: 0.2,
  response_format: { type: 'json_object' },
  messages: [
    {
      role: 'system',
      content: EXTRACTION_STAGE_SYSTEM_PROMPT  // Existing prompt, already format-agnostic
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: signedUrl,       // Firebase Storage signed URL (15 min TTL)
            detail: 'high'        // High-res mode for medical documents
          }
        },
        {
          type: 'text',
          text: buildVisitPromptUserMessage({
            transcript: '',       // Empty — image replaces text input
            knownMedicationText,
            canonicalGlossaryText
          })
        }
      ]
    }
  ]
});
```

**Multi-page documents:** GPT-4o accepts up to 20 images per request. For multi-page AVS:
- PDF: Split into per-page images server-side using `pdf-lib` or `sharp`
- Multiple photos: Patient captures multiple images, uploaded as array
- Send all pages as separate `image_url` content blocks in a single API call

**Cost:** ~$0.05 (single page) to ~$0.25 (5-page PDF) at `detail: 'high'`

#### Visit document changes

```typescript
// New field on visit document
source: 'recording' | 'avs_photo' | 'avs_pdf' | 'manual'

// Document reference
documentStoragePath?: string        // Path to original image/PDF in Storage
documentType?: 'avs_photo' | 'avs_pdf'
```

#### Storage rules update

Current `isValidAudioUpload()` in `firebase-setup/storage.rules` checks `contentType.matches('audio/.*')`. Rename to `isValidUpload()` and accept:
- `audio/*` (existing)
- `image/jpeg`, `image/png` (phone photos)
- `application/pdf` (downloaded AVS)
- Size limit: 20 MB for images (vs. 100 MB for audio)

#### Mobile packages needed

- `expo-image-picker` — Camera and photo library access
- `expo-document-picker` — PDF file picker

#### Same-visit merge (recording + AVS)

When a patient records audio AND uploads an AVS from the same visit:

**Detection:** Same `visitDate` (date portion) + created within 24 hours of each other + same provider (fuzzy match). Auto-merge with notification.

**Merge rules:** The recording visit document is the primary. AVS data enriches it:
- `transcriptText`: Set to OCR text from AVS (reference for re-processing)
- `medications`: AVS values win for names/doses (printed from EHR > transcribed from speech)
- `medicationReview.continued`: AVS wins (full reconciled list)
- `diagnosesDetailed`: Enrich with ICD-10 codes from AVS
- `followUps`: Union of both, dedup by task
- Conversational context, doctor reasoning, patient questions: Recording wins (AVS doesn't have these)
- `source`: Set to `'recording+avs'`

**The caregiver sees one visit, enriched by both sources.** They don't see two separate entries.

### What the caregiver sees (Phase 1)

The caregiver portal visit detail gets richer:

**Before (recording only):**
> Mom saw Dr. Johnson today. They discussed her blood pressure and made some medication changes. Started a new medication for diabetes. Follow-up in 6 weeks.

**After (recording + AVS):**
> Mom saw Dr. Johnson today. Blood pressure was 138/82 (improving). They increased her Lisinopril from 10mg to 20mg and started Metformin 500mg twice daily for newly diagnosed Type 2 Diabetes (E11.9). Her full medication list: Lisinopril 20mg, Metformin 500mg, Atorvastatin 20mg, Amlodipine 5mg. Follow-up bloodwork (HbA1c) by March 20th. Return visit April 15th.

The difference: exact values, full medication list, coded diagnoses, specific dates. That's what AVS adds.

### Effort estimate: 5-7 weeks

| Task | Weeks | Notes |
|------|-------|-------|
| Mobile: image picker + upload UI | 1.5 | Fork record-visit.tsx patterns |
| Storage rules update | 0.5 | Small change |
| Backend: GPT-4V extraction endpoint | 1.5 | New endpoint + vision message format |
| Visit source tracking + same-visit merge | 0.5 | New field + merge logic |
| Confirmation UI (mobile) | 1 | Adapt existing medication confirmation |
| Testing + accuracy validation | 1 | Sample AVS documents from multiple EHR systems |

---

## Phase 2: Action Item Follow-Through Hardening

### What it solves

Phase 1 tells the caregiver **what happened** and **what should happen next**. Phase 2 answers: **is it happening?**

LumiMD already extracts follow-ups from visits — bloodwork, referrals, return appointments, imaging, procedures — and creates action items with due dates. The caregiver already sees `overdue_action` alerts on their dashboard. But the system has two critical gaps:

1. **The patient gets no reminders.** Medication adherence has a full pipeline: reminders → dose logs → follow-up nudges → caregiver alerts. Non-medication action items have nothing. Mom's bloodwork is due in 3 days and nobody tells her.
2. **The caregiver can't see follow-through per visit.** They see a flat list of action items. They can't easily answer: "After that visit with Dr. Johnson on March 5th, did mom do everything she was supposed to?"

### The gap, concretely

| Follow-up type | Patient reminded? | Patient can log? | Caregiver alerted if overdue? |
|---|---|---|---|
| Medication doses | Yes (reminders) | Yes (dose logs + nudge responses) | Yes (missed_dose alert) |
| Bloodwork / labs | **No** | **No** | Yes (overdue_action, dashboard only) |
| Return appointments | **No** | **No** | Yes (overdue_action, dashboard only) |
| Specialist referrals | **No** | **No** | Yes (overdue_action, dashboard only) |
| Imaging / procedures | **No** | **No** | Yes (overdue_action, dashboard only) |

Phase 2 fills every "No" cell and adds proactive push notifications for the caregiver (not just passive dashboard alerts).

### How it integrates with the visit story

```
Day 0:  Visit recording + AVS → "Bloodwork (HbA1c) by March 20th"
        → Action item created: type=lab_draw, dueAt=Mar 20, visitId=xyz
        → Medication reminders auto-created for new meds (existing)

Day 17: 3 days before due date
        → Patient nudge: "You have bloodwork due by March 20th. Have you scheduled it?"
        → [Done] [Remind me later]

Day 20: Due date arrives, not marked complete
        → Patient nudge: "Your bloodwork was due today. Did you get it done?"
        → [Yes, done] [Not yet]

Day 23: 3 days overdue, still not complete
        → Caregiver push notification: "Mom's bloodwork (HbA1c) is 3 days overdue"
        → Caregiver dashboard shows high-severity alert

Day 27: 7 days overdue
        → Caregiver push notification escalation: "Mom's bloodwork is now 7 days overdue"
```

**The caregiver sees a visit follow-through checklist:**
```
Visit: Mar 5 — Dr. Johnson

Follow-through:
  ✓ Started Metformin 500mg — filled, taking daily
  ✓ Increased Lisinopril to 20mg — confirmed
  ○ Bloodwork (HbA1c) by Mar 20 — 3 days left
  ○ Return visit Apr 15 — scheduled
  ✗ Specialist referral (endocrinology) — 5 days overdue
```

### UX: Invisible to the patient (mostly)

The patient's experience barely changes:
- They already see action items on their Actions screen
- They'll now get gentle nudges as due dates approach (same style as medication follow-up nudges)
- Tapping "Done" on a nudge marks the action complete — that's it

The caregiver's experience gets substantially richer:
- Per-visit follow-through checklist on the visit detail page
- Proactive push notifications when actions go overdue (not just dashboard alerts)
- Visit detail shows overall follow-through status: "3 of 5 items completed"

### Technical: What to build

#### 1. Action item reminder nudges (new trigger)

New scheduled Cloud Function: `actionItemReminderNudges` — runs every 15 minutes (matching existing nudge cadence).

```
For each user with pending action items:
  → Find actions where dueAt is within reminder window AND not completed AND not deleted
  → Reminder schedule:
      - 3 days before due: "upcoming" nudge
      - Day of due date: "due today" nudge
      - 3 days after due: "overdue" nudge
      - 7 days after due: "overdue escalation" nudge
  → Check if nudge already sent for this action + window (prevent duplicates)
  → Respect existing rate limits (max 3 nudges/user/day, quiet hours 9pm-8am)
  → Create nudge document with:
      type: 'action_reminder'
      actionType: 'action_followup_response'
      context: { actionId, actionDescription, actionType, dueAt, visitId, daysUntilDue or daysOverdue }
      metadata: { reminderPhase: 'upcoming' | 'due_today' | 'overdue' | 'overdue_escalation' }
```

**Nudge content by phase (type-specific):**

| Phase | `lab_draw` | `specialist_referral` | `clinic_follow_up` | Generic |
|---|---|---|---|---|
| Upcoming (3 days before) | "Your bloodwork is due by Mar 20. Have you scheduled it?" | "Have you called to schedule your referral to endocrinology?" | "Your follow-up with Dr. Johnson is coming up on Apr 15." | "You have a follow-up due by {date}: {description}" |
| Due today | "Your bloodwork is due today." | "Your referral was due today." | "Your follow-up appointment is today." | "{description} is due today." |
| Overdue (3 days) | "Your bloodwork is now 3 days overdue." | "Your referral is 3 days overdue." | — | "{description} is {N} days overdue." |

**Response actions:**
- `[Done]` → marks action item `completed: true`, `completedAt: serverTimestamp()`
- `[Remind me later]` → snoozes for 24 hours (sets `snoozedUntil` on the nudge)
- `[Not yet]` → acknowledges, no state change (but tracked for caregiver visibility)

#### 2. Caregiver push notifications for overdue actions

Currently, `overdue_action` is a passive dashboard alert. Extend with proactive push notifications:

```
New trigger: actionOverdueNotifier — runs daily at 10:00 AM UTC
  → For each patient with active caregiver shares:
    → Find action items where:
        dueAt < today AND completed == false AND deletedAt == null
    → Group by caregiver
    → For actions 3+ days overdue (first notification):
        Push to caregiver: "Mom's bloodwork (HbA1c) is 3 days overdue"
    → For actions 7+ days overdue (escalation):
        Push to caregiver: "Mom's bloodwork is now 7 days overdue"
    → Dedup: check notificationHistory on action to prevent repeat notifications
        Store { caregiverId, notifiedAt, daysOverdue } array on action document
```

**New field on ActionItem:**
```typescript
caregiverNotifications?: Array<{
  caregiverId: string;
  notifiedAt: string;
  daysOverdue: number;
}>;
```

#### 3. Per-visit follow-through checklist (caregiver view)

New endpoint: `GET /v1/care/:patientId/visits/:visitId/follow-through`

Returns a unified checklist combining medication changes and action items from a single visit:

```typescript
interface VisitFollowThrough {
  visitId: string;
  visitDate: string;
  providerName?: string;
  summary: {
    total: number;
    completed: number;
    overdue: number;
    pending: number;
  };
  items: FollowThroughItem[];
}

interface FollowThroughItem {
  id: string;
  category: 'medication_started' | 'medication_changed' | 'medication_stopped' | 'action_item';
  description: string;
  status: 'completed' | 'pending' | 'overdue';
  dueAt?: string;
  completedAt?: string;
  // For medications: pulled from medication confirmation + active/inactive status
  // For actions: pulled from ActionItem.completed + dueAt
}
```

**Data sources for the checklist:**
- `visit.confirmedMedicationChanges.started` → status = med in `medications` collection with matching name + `active: true`
- `visit.confirmedMedicationChanges.changed` → status = med exists with updated dose
- `visit.confirmedMedicationChanges.stopped` → status = med with `active: false`
- `actions` collection where `visitId == visit.id` → status from `completed` + `dueAt`

**Caregiver portal UI:**
- Visit detail page gets a "Follow-Through" section below the visit summary
- Compact checklist with status icons (checkmark, clock, warning)
- Overall progress bar: "3 of 5 items complete"
- Overdue items highlighted in coral

#### 4. NudgeType and NudgeActionType extensions

```typescript
// Add to NudgeType
export type NudgeType =
  | 'condition_tracking'
  | 'medication_checkin'
  | 'introduction'
  | 'insight'
  | 'followup'
  | 'action_reminder';    // New

// Add to NudgeActionType
export type NudgeActionType =
  | /* existing values */
  | 'action_followup_response';  // New: patient confirms action item done

// Add to NudgeContext
export interface NudgeContext {
  /* existing fields */
  actionId?: string;
  actionDescription?: string;
  actionType?: FollowUpCategory;
}
```

#### 5. Nudge response handler extension

Extend `POST /v1/nudges/:id/respond` to handle `action_followup_response`:

```
When responseType === 'action_followup_response':
  → If response is 'done':
      Mark action item completed (same as existing useCompleteAction)
      Update nudge status to 'responded'
  → If response is 'remind_later':
      Set snoozedUntil = now + 24 hours
      Update nudge status to 'snoozed'
  → If response is 'not_yet':
      Update nudge status to 'responded'
      Record response for caregiver visibility
```

### What the caregiver sees (Phase 2)

**Visit detail — follow-through checklist:**
```
Visit: Mar 5 — Dr. Johnson
Follow-through: 3 of 5 complete

  ✓ Started Metformin 500mg twice daily
  ✓ Increased Lisinopril from 10mg to 20mg
  ✓ Return visit booked — Apr 15
  ○ Bloodwork (HbA1c) — due Mar 20 (3 days left)
  ✗ Endocrinology referral — 5 days overdue
```

**Dashboard alert (existing, now with push):**
```
⚠ Overdue Action Item
  "Endocrinology referral" is 5 days overdue
  [View visit →]
```

**Push notification (new):**
```
Mom's endocrinology referral is 5 days overdue
(from visit with Dr. Johnson on Mar 5)
```

### Effort estimate: 3-4 weeks

| Task | Weeks | Notes |
|------|-------|-------|
| Action item reminder nudge trigger | 1 | Fork medicationFollowUpNudges pattern, type-specific content |
| Nudge response handler for action items | 0.5 | Extend existing respond endpoint |
| Caregiver push notifications for overdue actions | 0.5 | New daily trigger + push notification |
| Per-visit follow-through endpoint | 0.5 | New endpoint, aggregates meds + actions |
| Caregiver portal: follow-through UI | 0.5 | Checklist on visit detail page |
| Mobile: nudge card for action reminders | 0.5 | NudgeCard extension + response handling |
| Testing | 0.5 | All action types, timing windows, dedup |

---

## Data Model Changes Summary

### New fields on `visits/{id}`

```typescript
source: 'recording' | 'avs_photo' | 'avs_pdf' | 'recording+avs' | 'manual';
documentStoragePath?: string;
documentType?: 'avs_photo' | 'avs_pdf';
```

### New fields on `actions/{id}`

```typescript
// Caregiver notification tracking (Phase 2)
caregiverNotifications?: Array<{
  caregiverId: string;
  notifiedAt: string;
  daysOverdue: number;
}>;
```

### New NudgeType and NudgeActionType values

```typescript
// NudgeType addition
'action_reminder'  // Patient-facing action item reminders

// NudgeActionType addition
'action_followup_response'  // Patient confirms action item done/not yet

// NudgeContext additions
actionId?: string;
actionDescription?: string;
actionType?: FollowUpCategory;
```

### New API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/visits/:id/process-document` | POST | Trigger GPT-4V extraction on uploaded AVS |
| `/v1/care/:patientId/visits/:visitId/follow-through` | GET | Per-visit follow-through checklist |

### New scheduled triggers

| Trigger | Frequency | Description |
|---------|-----------|-------------|
| `actionItemReminderNudges` | Every 15 min | Patient nudges for upcoming/overdue action items |
| `actionOverdueNotifier` | Daily 10 AM UTC | Caregiver push for overdue actions |

---

## Deferred: Future Enrichment Layer

These sources are not in scope for Phase 1-2 but the architecture accommodates them. The `source` field on visits and medication matching logic are designed to be extended.

### Blue Button Pharmacy Fills (revisit if needed)

**Value:** Free CMS API providing pharmacy dispensing records for ~65M Medicare beneficiaries. Answers "did mom fill the prescription?"

**Why defer:** CMS production access requires 4-12 week approval process (application, demo, privacy review). ROI is uncertain — an engaged caregiver managing their parent's health via the app can call and ask if they picked up the med. Claims are 2-4 weeks delayed. Revisit if users report medication adherence tracking as a top unmet need.

### Apple HealthKit Clinical Records (Phase 3 candidate)

**Value:** Coded medications, conditions, allergies, labs from EHR. Zero ongoing patient effort after setup. iOS only. Reuse archived HealthKit v2 sync engine architecture.

**Caregiver questions it answers:** "What happened" (enriches visit with EHR data), "What should happen" (surfaces conditions and pending orders).

**Why defer:** Requires custom Expo native module (Swift), native build, Apple review for clinical data entitlements. 6-8 week effort. Ship after core flow is proven.

### TEFCA Individual Access Services (Phase 4+ candidate)

**Value:** Single patient identity verification → records pulled from all TEFCA-participating providers nationwide. The long-term replacement for per-system connections.

**Why defer:** Still rolling out (2025-2026). Coverage incomplete. Consumer app access path not fully defined. HealthEx and Health Gorilla are live but commercial. Metriport is open-source and TEFCA-ready but unclear on patient-directed use. Check back Q4 2026.

### Metriport open-source FHIR code (use now for parsing)

**Value:** Apache 2.0 code for FHIR R4 parsing, C-CDA→FHIR conversion, deduplication, medical code crosswalking. Useful for processing HealthKit data when that phase ships.

**Why not use their hosted service:** Designed for provider-facing use (requires "Facility" representing a care setting). Patient-directed access via HIE networks not confirmed for consumer apps.

---

## Guiding Principles

1. **The patient's job is minimal.** Press record or snap a photo. Everything else is invisible.
2. **The caregiver sees answers, not data.** "Mom completed her bloodwork" — not a database of action items with status codes.
3. **Every feature must answer one of the three questions.** What happened? What should happen? Is it happening? If it doesn't clearly serve one of these, it doesn't belong.
4. **No feature should make the patient's experience more complex.** Nudges are gentle and dismissable. Action items are tracked automatically. The patient never manages data connections or configurations.
5. **The visit is the anchor.** All data connects back to doctor visits. Action items trace to the visit that created them. Medication changes trace to the visit that prescribed them. LumiMD is not a general health record — it's the visit story and its follow-through.
6. **Build for the 75-year-old.** If it works for them, it works for everyone. The moment a feature requires technical sophistication from the patient, it's wrong.
