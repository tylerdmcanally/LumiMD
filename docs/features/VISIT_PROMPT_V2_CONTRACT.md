# Visit Prompt V2 Contract

## Purpose
Define the new structured extraction contract for visit processing while preserving backward compatibility with existing app fields.

## Contract Status
- Version: `v2.0`
- Current runtime mode: dual-compatible (`v1_legacy` and `v2_structured`)
- Source implementation:
  - `functions/src/services/openai.ts`
  - `functions/src/services/visitProcessor.ts`
  - `packages/sdk/src/models/visit.ts`

## V2 Structured Fields
- `extractionVersion: "v1_legacy" | "v2_structured"`
- `diagnosesDetailed: DiagnosisDetail[]`
- `testsOrdered: OrderedTestItem[]`
- `followUps: FollowUpItem[]`
- `medicationReview: MedicationReviewSummary`
- `promptMeta: VisitPromptMeta`

### DiagnosisDetail
- `name` (required)
- `status` (optional): `new | chronic | resolved | suspected | history`
- `confidence` (optional): `high | medium | low`
- `evidence` (optional)

### OrderedTestItem
- `name` (required)
- `category` (required): `imaging | lab | cardiac | pulmonary | gi | procedure | other`
- `status` (optional): `ordered | recommended | scheduled`
- `timeframe` (optional)
- `reason` (optional)
- `evidence` (optional)
- `confidence` (optional): `high | medium | low`

### FollowUpItem
- `type` (required): `clinic_follow_up | return_to_clinic | nurse_visit | lab_draw | imaging_appointment | stress_test | cardiac_testing | specialist_referral | medication_review | contact_clinic | procedure | other`
- `task` (required)
- `timeframe` (optional)
- `dueAt` (optional, ISO timestamp)
- `details` (optional)
- `evidence` (optional)
- `confidence` (optional): `high | medium | low`

### MedicationReviewSummary
- `reviewed` (required, boolean)
- `continued` (required array; may be empty)
- `continuedReviewed` (required array; mirrors continued meds for review-specific UI use)
- `adherenceConcerns` (required array; may be empty)
- `reviewConcerns` (required array; may be empty; includes adherence/tolerance concerns)
- `sideEffectsDiscussed` (required array; may be empty)
- `followUpNeeded` (required, boolean)
- `notes` (required array; may be empty)

### VisitPromptMeta
- `promptVersion` (required)
- `schemaVersion` (required)
- `responseFormat` (required): `json_object`
- `model` (required)
- `latencyMs` (optional)
- `extractionLatencyMs` (optional)
- `summaryLatencyMs` (optional)
- `validationWarnings` (optional array)
- `fallbackUsed` (optional boolean)

## Backward Compatibility Mapping
The app currently relies on legacy fields. V2 is mapped to legacy when legacy is missing.

| Legacy Field | Primary Source | Fallback Source |
| --- | --- | --- |
| `diagnoses[]` | LLM `diagnoses[]` | `diagnosesDetailed[].name` |
| `imaging[]` | LLM `imaging[]` | `testsOrdered[].name` |
| `nextSteps[]` | LLM `nextSteps[]` | formatted `followUps[]` |

## Legacy Next Step Formatting
When derived from `followUps[]`:
- Use `"<task> — <timeframe>"` when `timeframe` exists.
- Else use `"<task> — by <YYYY-MM-DD>"` when `dueAt` exists.
- Else use `"<task>"`.

## Persistence Contract
Visit documents now persist both:
- legacy fields (`diagnoses`, `imaging`, `nextSteps`, etc.)
- structured V2 fields (`diagnosesDetailed`, `testsOrdered`, `followUps`, `medicationReview`, `promptMeta`)

This enables incremental UI and prompt rollout without breaking current features.
