# Visit Prompt Hardening Execution Plan

## Objective
Deepen and strengthen visit extraction quality for:
- diagnoses
- follow-up visits/tasks
- medication review context
- new/changed/stopped/continued medications

while preserving current app behavior and rollout safety.

## Progress Model
- Total work is split into 10 steps.
- Each completed step = 10% total completion.
- Status updates will use this format:
  - `Phase <N> / Step <N> complete - <X>% total completion`

## Current Status
- `Phase 5 / Step 10 complete - 100% total completion`

## Phase Plan

### Phase 1: Foundation and Data Contract (0% -> 20%)

#### Step 1 (10%) - Baseline map + execution tracker
- Status: Complete
- Deliverables:
  - Baseline architecture map for visit processing flow
  - This execution tracker with fixed progress model
- Key code surfaces:
  - `functions/src/triggers/processVisitAudio.ts`
  - `functions/src/routes/webhooks.ts`
  - `functions/src/triggers/checkPendingTranscriptions.ts`
  - `functions/src/triggers/summarizeVisit.ts`
  - `functions/src/services/visitProcessor.ts`
  - `functions/src/services/openai.ts`
  - `functions/src/services/medicationSync.ts`
  - `mobile/app/visit-detail.tsx`
  - `web-portal/app/(protected)/visits/[id]/page.tsx`
  - `web-portal/app/care/[patientId]/visits/[visitId]/page.tsx`

#### Step 2 (20%) - Define V2 extraction contract + compatibility matrix
- Status: Complete
- Deliverables:
  - V2 schema for extraction output (structured follow-ups, medication review, richer diagnosis metadata)
  - Backward compatibility mapping to existing fields (`diagnoses`, `medications`, `imaging`, `nextSteps`)
  - Type updates in shared models
- Primary files:
  - `functions/src/services/openai.ts`
  - `functions/src/services/visitProcessor.ts`
  - `packages/sdk/src/models/visit.ts`
  - `docs/features/VISIT_PROMPT_V2_CONTRACT.md`

### Phase 2: Prompt and Parser Hardening (20% -> 40%)

#### Step 3 (30%) - Split monolithic prompt into extraction + patient summary stages
- Status: Complete
- Deliverables:
  - Extraction-focused prompt (structured)
  - Summary/education prompt driven from extracted JSON (not raw transcript)
- Primary files:
  - `functions/src/services/openai.ts`

#### Step 4 (40%) - Strict schema enforcement + partial salvage path
- Status: Complete
- Deliverables:
  - Strict schema validation
  - Partial salvage behavior when one section fails
  - Parser test expansion
- Primary files:
  - `functions/src/services/openai.ts`
  - `functions/src/services/openai/jsonParser.ts`
  - `functions/src/services/__tests__/openai.test.ts`

### Phase 3: Visit Clinical Extraction Deepening (40% -> 60%)

#### Step 5 (50%) - Medication extraction expansion + normalization fixes
- Status: Complete
- Deliverables:
  - Add medication review coverage (`continuedReviewed`, review concerns)
  - Improve name extraction to avoid dose leakage into `name`
  - Maintain compatibility with sync/reminder pipeline
- Primary files:
  - `functions/src/services/openai.ts`
  - `functions/src/services/medicationSync.ts`
  - `functions/src/services/__tests__/openai.test.ts`
  - `functions/src/services/__tests__/medicationSync.test.ts`

#### Step 6 (60%) - Structured follow-up and test-order extraction
- Status: Complete
- Deliverables:
  - Add structured `followUps[]` and `testsOrdered[]`
  - Derive legacy `nextSteps[]` from structured follow-ups
  - Improve due-date reliability (`model date first`, chrono fallback)
- Primary files:
  - `functions/src/services/openai.ts`
  - `functions/src/services/visitProcessor.ts`
  - `functions/src/utils/actionDueDate.ts`

### Phase 4: Quality Instrumentation and Evaluation (60% -> 80%)

#### Step 7 (70%) - Prompt telemetry + extraction quality metrics
- Status: Complete
- Deliverables:
  - Persist prompt metadata (`promptVersion`, model, latency, validation warnings)
  - Add logging counters for field-level extraction reliability
- Primary files:
  - `functions/src/services/openai.ts`
  - `functions/src/services/visitProcessor.ts`

#### Step 8 (80%) - Regression eval harness with gold transcripts
- Status: Complete
- Deliverables:
  - Test fixtures + expected extraction labels
  - Repeatable scoring script for diagnoses/meds/follow-ups recall + precision
- Primary files:
  - `functions/src/services/__tests__/openai.test.ts`
  - `scripts/` (new evaluation script)
  - `docs/` (evaluation notes)

### Phase 5: Rollout and Surface Adoption (80% -> 100%)

#### Step 9 (90%) - Shadow mode rollout and comparison reporting
- Status: Complete
- Deliverables:
  - Dual-write/compare mode for V1 vs V2 extraction
  - Runtime diff logging for safety checks
- Primary files:
  - `functions/src/services/visitProcessor.ts`
  - `functions/src/services/openai.ts`

#### Step 10 (100%) - Promote V2 as source of truth + finalize UI adoption
- Status: Complete
- Deliverables:
  - Switch action generation to structured follow-up source of truth
  - Update web/mobile components to use richer structured fields
  - Retire legacy-only branches after validation window
- Primary files:
  - `functions/src/services/visitProcessor.ts`
  - `mobile/app/visit-detail.tsx`
  - `web-portal/app/(protected)/visits/[id]/page.tsx`
  - `web-portal/app/care/[patientId]/visits/[visitId]/page.tsx`

## Checkpoint Update Template
Use this exact format in implementation updates:

`Phase <N> / Step <N> complete - <X>% total completion`

Example:

`Phase 1 / Step 2 complete - 20% total completion`

## Phase Exit Criteria

### Exit Phase 1
- V2 contract and compatibility mapping documented and approved.

### Exit Phase 2
- Structured extraction path validates strictly and survives partial failures.

### Exit Phase 3
- Follow-up and medication extraction quality materially improved without regression in sync/action flows.

### Exit Phase 4
- Quality is measurable with reproducible eval scoring.

### Exit Phase 5
- V2 promoted safely with stable UI behavior and no production regressions.
