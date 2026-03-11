# LumiMD Data Integration — Build Prompt

## Context

You are working on LumiMD, a consumer health app for elderly patients (55+) and their caregivers. Read `CLAUDE.md` at the repo root for full project context. Read the following documents in order before starting work:

1. `docs/DATA-INGESTION-STRATEGY.md` — Prior research: pipeline flexibility analysis, per-source tradeoffs, phased roadmap
2. `docs/DATA-INTEGRATION-DESIGN.md` — The design document you'll be implementing from. Contains the product thesis, technical architecture, UX flows, and field-level specifications.

## Product Thesis

**LumiMD is how families stay connected to their aging parent's healthcare.**

The caregiver needs three questions answered:
1. **What happened?** — What was discussed, decided, and diagnosed at the visit.
2. **What should happen next?** — Follow-ups, bloodwork, referrals, medication changes to execute.
3. **Is it happening?** — Did mom fill the prescription? Get the bloodwork? Complete the follow-up?

The patient's job is minimal: press record or snap a photo. Everything else is invisible infrastructure.

## What This Session Builds

Two phases of work. Each can be broken into sub-tasks. Implement Phase 1 fully before starting Phase 2.

---

### Phase 1: AVS Photo/Document Upload

**Goal:** A patient can photograph their After Visit Summary (or upload a PDF) and get the same structured visit data as an audio recording — medications, diagnoses, vitals, follow-ups, action items — with a confirmation step before data is committed.

#### Key files to read before building

**Existing pipeline (understand, don't modify unless necessary):**
- `functions/src/services/openai/visitPromptRegistry.ts` — Extraction prompts (already format-agnostic)
- `functions/src/services/visitProcessor.ts` — Visit processing orchestration
- `functions/src/services/openai.ts` — OpenAI service (add vision support here)
- `functions/src/triggers/summarizeVisit.ts` — Trigger that fires on `processingStatus === 'summarizing'`
- `functions/src/routes/visits.ts` — Visit CRUD (add process-document endpoint here)
- `functions/src/services/medicationSafety.ts` — Drug interactions, `normalizeMedicationName()`

**Existing patterns to reuse:**
- `mobile/lib/storage.ts` — Firebase Storage upload pattern (fork for image/PDF upload)
- `mobile/app/record-visit.tsx` — Recording UI (fork for AVS capture UI patterns)
- `firebase-setup/storage.rules` — Storage security rules (update for image/PDF content types)
- `packages/sdk/src/models/visit.ts` — Visit type (add `source`, `documentStoragePath`, `documentType` fields)

**Existing confirmation flow (reuse):**
- Visit documents already have `medicationConfirmationStatus`, `pendingMedicationChanges`, `confirmedMedicationChanges` — reuse this pattern for AVS extraction confirmation.

#### What to build (in order)

**1. SDK type updates**
- Add `source` field to Visit type: `'recording' | 'avs_photo' | 'avs_pdf' | 'recording+avs' | 'manual'`
- Add `documentStoragePath?: string` and `documentType?: 'avs_photo' | 'avs_pdf'` to Visit type
- Add new source values to any validation schemas

**2. Storage rules update**
- Rename `isValidAudioUpload()` to `isValidUpload()` in `firebase-setup/storage.rules`
- Add `image/jpeg`, `image/png`, `application/pdf` to allowed content types
- Add 20MB size limit for image/PDF (keep 100MB for audio)

**3. Backend: GPT-4V extraction**
- Add vision message support to the OpenAI service (`functions/src/services/openai.ts`)
  - New method: `extractFromDocument(signedUrl: string, options?: { knownMedications?: string[] })`
  - Uses `gpt-4o` model with `detail: 'high'` for medical document accuracy
  - Sends image as `image_url` content block alongside existing extraction system prompt
  - Returns same `VisitSummaryResult` type as `summarizeTranscript()`
  - Multi-page support: accept array of signed URLs, send as multiple image_url blocks
  - `store: false` on all calls (HIPAA compliance, matching existing pattern)
- Add new endpoint: `POST /v1/visits/:id/process-document`
  - Validates: visit exists, owned by requesting user, has `documentStoragePath`
  - Generates signed URL for the document in Firebase Storage
  - If single image → call `extractFromDocument()` directly
  - If PDF → split into page images server-side, then call with array
  - Write extracted text to `visit.transcriptText` (preserved for reference/reprocessing)
  - Write structured data to visit fields
  - Set `processingStatus = 'summarizing'` → triggers existing pipeline
  - Return `{ status: 'processing' }`

**4. Mobile: AVS capture and upload**
- Install `expo-image-picker` and `expo-document-picker`
- New screen: `app/upload-avs.tsx`
  - Camera capture with guidance text ("Hold phone flat over the document")
  - Gallery selection
  - PDF file picker
  - Image preview with retake option
  - Upload progress (reuse pattern from record-visit.tsx and storage.ts)
  - Processing status screen
- Extend `mobile/lib/storage.ts` with `uploadDocumentFile()` function
  - Same pattern as `uploadAudioFile()` but for image/PDF content types
  - Storage path: `visits/{userId}/{timestamp}.{jpg|png|pdf}`
- Update home screen to show "Upload Visit Summary" option alongside "Record Visit"
- After recording completes: show prompt "Did you get a printed summary?" with photo option

**5. Confirmation UI**
- After extraction completes, show confirmation screen (mobile) with:
  - Extracted medications (checkboxes, editable)
  - Extracted diagnoses (checkboxes, editable)
  - Extracted follow-ups (checkboxes, editable)
  - Extracted vitals
  - [Edit] and [Confirm All] buttons
- Reuse existing `medicationConfirmationStatus` flow
- On confirm: commit data to individual collections (medications, actions), run medication safety checks
- On edit: allow inline corrections before committing

**6. Same-visit merge logic**
- When creating a visit from AVS, check for existing visits with same `visitDate` (date portion) created within 24 hours
- If match found with `source: 'recording'`:
  - Merge AVS data into existing visit (AVS wins for factual fields, recording wins for context)
  - Set `source: 'recording+avs'`
  - Don't create a duplicate visit
- If no match: create new visit with `source: 'avs_photo'` or `'avs_pdf'`

**7. Caregiver notification**
- Existing push notification pipeline handles this — no changes needed
- Verify the caregiver portal visit detail page renders AVS-enriched visits correctly (all fields are already in the Visit type)

#### Testing

- Test with at least 5 AVS documents from different EHR systems (Epic MyChart, Cerner, MEDITECH)
- Test phone photos in good lighting, poor lighting, and at an angle
- Test PDF uploads from patient portal downloads
- Test multi-page documents
- Test same-visit merge (record audio, then upload AVS for same date)
- Verify medication safety checks run on AVS-extracted medications
- Verify caregiver portal displays enriched visit data correctly

---

### Phase 2: Action Item Follow-Through Hardening

**Goal:** Non-medication action items (bloodwork, referrals, appointments, imaging) get the same follow-through pipeline as medications: patient nudges before/on/after due date, automatic completion tracking, and proactive caregiver push notifications when items go overdue.

#### Key files to read before building

**Existing nudge infrastructure (understand the pattern, then extend):**
- `functions/src/triggers/medicationFollowUpNudges.ts` — Template for the new trigger (rate limits, quiet hours, dedup, nudge creation)
- `functions/src/services/nudgeNotificationService.ts` — Nudge delivery, priority map, push notification sending
- `functions/src/routes/nudges.ts` — Nudge CRUD + response handler (extend for `action_followup_response`)
- `packages/sdk/src/models/lumibot.ts` — Nudge type, NudgeActionType, NudgeContext (add new values)

**Existing action item infrastructure:**
- `packages/sdk/src/models/action.ts` — ActionItem type, FollowUpCategory, category labels
- `packages/sdk/src/models/visit.ts` — FollowUpCategory type definition (`lab_draw`, `specialist_referral`, `clinic_follow_up`, etc.)
- `functions/src/routes/care/alerts.ts` — Existing `overdue_action` alert logic (lines 193-222, extend with push notifications)
- `functions/src/services/visitProcessor.ts` — How action items are created from visit follow-ups

**Caregiver notification patterns:**
- `functions/src/services/nudgeNotificationService.ts` — Push notification sending
- `functions/src/routes/care/summary.ts` — Patient summary (add follow-through stats)

#### What to build (in order)

**1. SDK type updates**
- Add `'action_reminder'` to `NudgeType` in `packages/sdk/src/models/lumibot.ts`
- Add `'action_followup_response'` to `NudgeActionType`
- Add `actionId`, `actionDescription`, `actionType` to `NudgeContext`
- Add `caregiverNotifications` array to ActionItem type (tracks which caregivers were notified and when)

**2. Action item reminder nudge trigger**
- New trigger: `functions/src/triggers/actionItemReminderNudges.ts`
  - Scheduled every 15 minutes (matching existing nudge cadence)
  - Finds pending action items with `dueAt` within reminder window
  - Reminder phases: 3 days before, day of, 3 days after, 7 days after
  - Creates nudge with `type: 'action_reminder'`, `actionType: 'action_followup_response'`
  - Type-specific nudge content (different messages for `lab_draw` vs `specialist_referral` vs `clinic_follow_up`)
  - Dedup: check if nudge already sent for this action + phase combination
  - Respect existing limits: max 3 nudges/user/day, quiet hours 9pm-8am (user timezone)
  - Priority: `action_reminder` should be priority 2 (between medication follow-ups at 3 and condition tracking at 1)

**3. Nudge response handler for action items**
- Extend `POST /v1/nudges/:id/respond` to handle `action_followup_response`:
  - Response `'done'` → mark action item `completed: true`, `completedAt: serverTimestamp()`
  - Response `'remind_later'` → snooze nudge for 24 hours
  - Response `'not_yet'` → acknowledge, record for caregiver visibility
- Mobile: extend NudgeCard to render `action_reminder` type with [Done] [Remind me later] [Not yet] buttons

**4. Caregiver push notifications for overdue actions**
- New trigger: `functions/src/triggers/actionOverdueNotifier.ts`
  - Scheduled daily at 10:00 AM UTC
  - Finds overdue, incomplete, non-deleted action items for patients with active caregiver shares
  - Notification at 3 days overdue (first alert) and 7 days overdue (escalation)
  - Dedup via `caregiverNotifications` array on action document
  - Push notification content includes action description, days overdue, source visit context
  - Uses existing push notification infrastructure from `nudgeNotificationService.ts`

**5. Per-visit follow-through endpoint**
- New endpoint: `GET /v1/care/:patientId/visits/:visitId/follow-through`
  - Returns unified checklist: medication changes (from visit's `confirmedMedicationChanges`) + action items (from `actions` collection where `visitId` matches)
  - Each item has status: `completed`, `pending`, or `overdue`
  - Summary: `{ total, completed, overdue, pending }`
  - Cache-Control: `private, no-cache`

**6. Caregiver portal: follow-through UI**
- Add "Follow-Through" section to web portal visit detail page (`web-portal/app/care/[patientId]/visits/`)
  - Compact checklist with status icons
  - Progress bar: "3 of 5 items complete"
  - Overdue items in coral highlight
  - "View all actions" link to actions page
- Update patient summary/overview to include follow-through stats per recent visit

**7. Mobile: action reminder nudge card**
- Extend NudgeCard component to handle `action_reminder` type
- Show action description, due date context, type-specific icon
- Response buttons: [Done] [Remind me later] [Not yet]
- On "Done" tap: optimistic UI update, call nudge respond endpoint

#### Testing

- Test all FollowUpCategory types: `lab_draw`, `specialist_referral`, `clinic_follow_up`, `imaging_appointment`, `procedure`, `other`
- Test reminder timing: verify nudges at 3 days before, day of, 3 days after, 7 days after
- Test dedup: same action should not generate duplicate nudges for same phase
- Test rate limiting: max 3 nudges/user/day respected when action + medication nudges compete
- Test quiet hours: no nudges between 9pm-8am user time
- Test nudge responses: "Done" marks action complete, "Remind later" snoozes 24h
- Test caregiver push: notifications at 3 and 7 days overdue, no repeats
- Test follow-through endpoint: combines medication changes + action items from single visit
- Test follow-through with recording+AVS merged visit (both sources contribute items)

---

## Important Implementation Notes

### Don't break the existing pipeline
The audio recording pipeline is production and working. Phase 1 extends it (adds a new input path) but should not modify the existing `summarizeTranscript()` method or `summarizeVisitTrigger` logic. Add new methods alongside existing ones.

### Reuse existing patterns
- Storage upload: fork `uploadAudioFile()`, don't rewrite
- Confirmation flow: reuse `medicationConfirmationStatus` pattern
- Push notifications: reuse existing caregiver notification pipeline
- Soft deletes: all new collections use `deletedAt` pattern
- Cache-Control: all new GET endpoints use `Cache-Control: private, no-cache`
- Error handling: follow existing SDK patterns (retry on 5xx, session expired on 401/403)

### Medical guardrails apply
- Never attribute health outcomes to medications
- Show data side by side — let the physician connect the dots
- All AI-generated content passes through unsafe pattern regex
- Deflect clinical questions to "your care team"
- AVS extraction should extract facts, not generate medical advice

### The patient experience is sacred
- No new settings or configuration for the patient beyond the photo capture flow
- Action item nudges are gentle and dismissable — same feel as medication follow-up nudges
- No new screens for the patient; nudges appear in the existing nudge flow

### The visit is the anchor
- All data connects back to visits. Action items trace to the visit that created them.
- The follow-through checklist on the visit detail page is the caregiver's primary tool for answering "is it happening?"
- Don't create floating data (actions without visit context, nudges without action context)
- The caregiver sees a timeline of visits with follow-through status, not a database of health records

## Key Architecture Decisions Already Made

These were decided in the design phase. Don't revisit unless you find a blocking technical issue:

1. **GPT-4V for AVS extraction** (not Google Document AI). Simpler pipeline, one fewer vendor, reuses existing OpenAI infrastructure. If accuracy issues emerge on poor photos, flag for discussion.
2. **Same-visit merge by date + provider**, not by asking the patient. Auto-merge with notification, not a "link these visits" UI.
3. **Fork medicationFollowUpNudges for action items**, don't generalize the trigger. Medication follow-ups and action item reminders have different timing, content, and response handling. Keep them as separate triggers that share the same rate limiting and delivery infrastructure.
4. **4-phase reminder schedule** (3 days before, day of, 3 days after, 7 days after). Enough touchpoints without being annoying. The daily rate limit (3 nudges/user/day) naturally throttles when multiple actions are due simultaneously.
5. **Caregiver push at 3 and 7 days overdue**, not on the due date. Give the patient time to act. The caregiver sees dashboard alerts immediately but only gets proactive push after the grace period.
6. **Per-visit follow-through, not a standalone dashboard.** The checklist lives on the visit detail page, not a separate "follow-through" screen. The visit is the anchor — the caregiver thinks in visits, not action item lists.
