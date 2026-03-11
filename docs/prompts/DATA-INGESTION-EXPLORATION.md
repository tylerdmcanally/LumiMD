# LumiMD Data Ingestion — Deep Exploration Prompt

## Context

You are working on LumiMD, a consumer health app for elderly patients (60-85). Read `CLAUDE.md` at the repo root for full project context. Read `docs/DATA-INGESTION-STRATEGY.md` for the strategy document produced in a prior session — it covers the phased roadmap, pipeline flexibility analysis, and per-approach tradeoffs. This prompt picks up where that document left off.

## Background

LumiMD currently ingests data via audio recording only: patient records a doctor visit → AssemblyAI transcription → GPT-4 extraction → structured medical data (diagnoses, medications, action items, follow-ups). We're expanding to support multiple ingestion sources: AVS photo/document upload, Apple HealthKit Clinical Records, CMS Blue Button 2.0, and FHIR direct/aggregator integration.

A critical finding from the prior session: **the GPT-4 extraction pipeline is already format-agnostic.** The prompts in `visitPromptRegistry.ts` don't reference audio or transcripts. The `summarizeVisitTrigger` fires on a status change to `'summarizing'` and only requires a non-empty text string. The retry endpoint already has a proven skip-transcription path. Every post-commit operation (medication safety, walkthrough, nudges, caregiver notification) is source-agnostic.

## What This Session Needs to Explore

We need to go deep on three questions, in this order:

### 1. HOW is data pulled from each source?

For each ingestion source, map out the complete technical flow — from the moment the patient initiates the action to the moment data lands in a usable format on our backend. Be specific about protocols, auth flows, API calls, and data formats.

**Sources to cover:**

- **AVS Photo** — Camera capture → image upload → OCR/GPT-4V → structured text. What's the exact API call to GPT-4V with an image? How do we handle multi-page documents? What about PDFs downloaded from patient portals vs. phone photos?

- **Apple HealthKit Clinical Records** — Patient connects health system in Apple Health → app requests authorization → `HKClinicalRecord` queries → FHIR R4 JSON on device → upload to backend. How does incremental sync work? What's the query pattern for each clinical type? How do we handle the native Swift ↔ React Native bridge in Expo SDK 54?

- **CMS Blue Button 2.0** — OAuth with Medicare.gov → token exchange → FHIR R4 API calls → ExplanationOfBenefit resources. What's the exact OAuth flow for a mobile app? How do we parse Part D claims into medication records? What does the refresh token lifecycle look like for ongoing sync?

- **FHIR Direct (SMART on FHIR)** — Patient selects health system → SMART launch → OAuth with EHR portal → FHIR R4 resource fetch. How does endpoint discovery work? What are the per-vendor differences between Epic and Cerner? How do we handle the 5-minute access token window?

### 2. WHAT data comes back from each source?

For each source, enumerate the exact data fields we receive and how they map to LumiMD's existing data model. Use the schema in `docs/reference/DATABASE-SCHEMA.md` and the SDK types in `packages/sdk/src/models/` as reference.

**For each data source, create a field-level mapping:**
- What FHIR resources / fields / codes do we get?
- Which LumiMD collection does each map to? (`visits`, `medications`, `actions`, `healthLogs`, `users`)
- What's the data quality? (coded vs. free text, completeness, accuracy)
- What's missing compared to a full visit recording?
- What's BETTER than a visit recording?

**Pay special attention to:**
- Medication data — name, dose, frequency, RxNorm code, NDC code, active/inactive status, prescriber, fill date
- Diagnosis/condition data — name, ICD-10, SNOMED, status (new/chronic/resolved), onset date
- Lab results — test name, LOINC code, value, units, reference range, interpretation
- Vitals — type, value, clinical-grade vs. patient-reported
- Allergies — substance, reaction, severity, coded vs. free text

### 3. HOW do we integrate data from multiple sources into a consolidated patient record?

This is the hardest and most important question. A patient might:
- Record a visit AND photograph their AVS from the same appointment
- Have HealthKit syncing medications from their EHR while also having visit-extracted medications
- Get a Blue Button medication fill that confirms (or contradicts) a visit-extracted prescription
- Have the same medication appear from 3 different sources with slightly different names/doses

**Design the data integration layer:**

- **Multi-source visit consolidation** — When a patient records a visit AND uploads an AVS from the same appointment, how do we merge these into a single coherent visit document? Which source wins for which fields? How do we detect that two inputs are from the same appointment?

- **Medication reconciliation across sources** — A patient has Lisinopril from a visit recording, "LISINOPRIL 10MG TAB" from HealthKit (RxNorm coded), and an NDC-coded fill from Blue Button. How do we recognize these as the same medication? What's the matching algorithm? How do we handle conflicts (e.g., visit says 10mg, HealthKit says 20mg — which is current)?

- **Source provenance and trust hierarchy** — When sources disagree, which do we trust? Proposed hierarchy: FHIR/HealthKit (EHR-sourced, coded) > Blue Button (claims, coded but delayed) > AVS photo (OCR, may have errors) > Audio recording (transcription + NLP, most error-prone for exact values) > Manual entry. Is this right? When should we override it?

- **Deduplication strategy** — How do we prevent the same medication/diagnosis/action from appearing multiple times? Match by RxNorm code? Fuzzy name? Time window? What's the dedup key for each data type?

- **Conflict resolution UX** — When sources disagree, what does the patient see? Do we show a "review conflicts" screen? Auto-resolve with trust hierarchy and show a notification? How does the caregiver portal surface discrepancies?

- **Temporal alignment** — Blue Button claims are 2-4 weeks delayed. HealthKit updates in minutes. Audio recording is real-time. How do we handle a scenario where the visit recording says "started Metformin" but Blue Button won't show the fill for 2 weeks? Do we show it as "prescribed but not yet filled"?

## Key Files to Read

Before starting analysis, read these files to understand the current system:

**Pipeline & extraction:**
- `functions/src/services/openai/visitPromptRegistry.ts` — GPT-4 prompts (format-agnostic)
- `functions/src/services/visitProcessor.ts` — Visit processing orchestration
- `functions/src/services/openai.ts` — OpenAI service (GPT-4 calls)
- `functions/src/triggers/summarizeVisit.ts` — Trigger that fires extraction
- `functions/src/routes/visits.ts` — Visit CRUD + retry endpoint with skip-transcription path

**Safety & reconciliation:**
- `functions/src/services/medicationSafety.ts` — Drug interactions, canonical medication database, `normalizeMedicationName()`, `ALIAS_TO_CANONICAL` mapping
- `functions/src/services/visitProcessor.ts` lines 125-212 — `reconcileContinuedMedications()`

**Data model:**
- `packages/sdk/src/models/visit.ts` — Visit type with medication confirmation fields
- `packages/sdk/src/models/medication.ts` — Medication type
- `packages/sdk/src/models/action.ts` — Action item type
- `packages/sdk/src/models/user.ts` — User profile (allergies, medical history)
- `docs/reference/DATABASE-SCHEMA.md` — Full Firestore schema

**Existing infrastructure:**
- `mobile/lib/storage.ts` — Firebase Storage upload pattern
- `firebase-setup/storage.rules` — Storage security rules (currently audio-only)
- `functions/src/config.ts` — OpenAI config (model configurable, vision-ready)
- `mobile/_archived/healthkit-v2/` — Archived HealthKit sync engine (cursor-based sync, dedup, permissions)
- `docs/features/HEALTHKIT_REIMPLEMENTATION_PLAN.md` — HealthKit architecture blueprint

**Strategy doc:**
- `docs/DATA-INGESTION-STRATEGY.md` — Full strategy with phased roadmap, technical deep dives, architecture diagrams

## Deliverable

A technical design document (`docs/DATA-INTEGRATION-DESIGN.md`) that covers:

1. **Per-source data pull mechanics** — Exact technical flow for each source (AVS, HealthKit, Blue Button, FHIR direct)
2. **Per-source data field mapping** — What comes back, field by field, mapped to LumiMD collections
3. **Multi-source integration design** — The reconciliation engine: matching, dedup, conflict resolution, trust hierarchy
4. **Consolidated visit model** — How a single visit document looks when enriched by multiple sources
5. **UX implications** — What the patient and caregiver see when data arrives from multiple sources, how conflicts surface, how confirmation works

Do not write implementation code. This is a design document. But be specific enough that an engineer could implement from it — name exact fields, collections, algorithms, and data structures.
