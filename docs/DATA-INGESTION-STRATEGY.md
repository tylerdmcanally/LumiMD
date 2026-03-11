# LumiMD Data Ingestion Strategy

**Date:** March 10, 2026
**Type:** Research & Planning (no code changes)
**Status:** Proposal — Revised
**Revision:** Refocused on AVS photo intake + FHIR/Blue Button as primary paths

---

## Executive Summary

LumiMD's core value proposition — structured medical data from doctor visits — is gated behind the hardest step in the user journey: recording the appointment. Provider hesitancy, two-party consent complexity, and simple forgetfulness mean many users never record. For the target demographic (60-85 year olds), the problem is existential: an empty dashboard means no medications, no action items, no caregiver alerts, no nudges.

**The pipeline is already ready for non-audio input.** The GPT-4 extraction prompts in `visitPromptRegistry.ts` are completely text-agnostic — they don't reference audio, transcripts, or speech artifacts. The `summarizeVisitTrigger` fires on a status change to `'summarizing'` and only requires a non-empty text string. The retry endpoint already has a proven skip-transcription path (`pending` → `summarizing`). Every post-commit operation (medication safety, walkthrough, nudges, caregiver notification) is source-agnostic.

**Two approaches matter most for this demographic:**

1. **AVS Photo Intake** — Patients already receive after-visit summaries. Photograph it, upload it, done. The document contains structured data (medications with exact names/doses, diagnoses with ICD-10, vitals, follow-ups) that exceeds what audio recording captures. Zero provider involvement.

2. **FHIR / CMS Blue Button** — Pull data directly from EHRs and Medicare. Zero patient memory burden. For Medicare-age patients (~65M beneficiaries), Blue Button provides actual pharmacy fill history. HealthKit Clinical Records covers 900+ health systems on iOS with zero API cost.

### Recommended Strategy

| Phase | Approach | Impact | Effort | Timeline |
|-------|----------|--------|--------|----------|
| **1** | AVS photo/document upload | Highest — structured data patients already have | Medium | 5-7 weeks |
| **2** | Apple HealthKit Clinical Records | High — zero-friction, zero-cost for iOS users | Medium-High | 6-8 weeks |
| **3** | CMS Blue Button 2.0 | High — pharmacy fills for Medicare demographic | Medium | 5-7 weeks |
| **4** | FHIR aggregator (1up Health) | Medium-High — broadest EHR coverage | Medium | 4-6 weeks |
| **5** | Direct SMART on FHIR (Epic/Cerner) | Medium — removes aggregator cost at scale | High | 3-6 months |

---

## Why Not Voice Debrief

The original strategy proposed a post-visit voice debrief as Phase 1. On reflection, this has a fundamental problem for the 60-85 demographic: **it relies on the patient's memory**. A 75-year-old trying to recall every medication name, dose, and change after a complex appointment is exactly the failure mode LumiMD exists to solve. The AVS document is literally the answer sheet — the patient already has it in hand.

Voice debrief remains a valid supplement (e.g., "anything else you want to remember?") but should not be a primary ingestion path.

---

## The Current Pipeline (Why This Is Easier Than It Looks)

### Proven Skip-Transcription Path

The `/v1/visits/:id/retry` endpoint in `visits.ts` (lines 1112-1156) already implements the exact code path needed for non-audio visits:

```
resolveRetryPath() checks for existing transcript
  → If found: sets processingStatus = 'summarizing', status = 'processing'
  → summarizeVisitTrigger fires automatically
  → Full extraction pipeline runs (GPT-4, safety checks, walkthrough, nudges)
```

For AVS intake, we replicate this: create a visit, write OCR text to `transcriptText`, set `processingStatus: 'summarizing'`. Everything downstream is identical.

### Pipeline Flexibility (Verified)

| Component | Audio-Specific? | Evidence |
|-----------|----------------|----------|
| System prompts | No | `visitPromptRegistry.ts` lines 14-115: zero references to audio, recording, or transcript format |
| User message builder | No | `buildVisitPromptUserMessage()` line 418: `transcript` parameter is just a string label |
| Visit creation | No | `createVisitSchema` line 175: `audioUrl` and `storagePath` are both optional |
| Transcript validation | No | `visitProcessor.ts` line 297: accepts `transcriptText` OR `transcript`, just checks non-empty string |
| summarizeVisitTrigger | No | `summarizeVisit.ts` line 34: fires on `processingStatus === 'summarizing'`, no audio check |
| Post-commit operations | No | Lines 406-495: all 6 operations work on extracted data, not input source |
| AssemblyAI delete | Gracefully skips | Line 416: only runs if `transcriptionId` exists |
| Medication reconciliation | No | Line 125: works on extracted data vs. known medications |
| Medication confirmation | No | Line 327: triggered by presence of medication changes, not source |

### What's Missing for Non-Audio Input

| Component | Status | What's Needed |
|-----------|--------|--------------|
| Image picker on mobile | Not installed | Add `expo-image-picker` and/or `expo-document-picker` |
| Storage rules for images | Audio-only | Add image content type to `isValidAudioUpload()` (rename to `isValidUpload()`) |
| GPT-4 Vision | Not implemented | OpenAI client exists, model supports it, just needs vision message format |
| OCR/text extraction | Not implemented | Either GPT-4V direct or Google Document AI |
| Document upload Cloud Function | Not implemented | New trigger or API endpoint |
| Source tracking on visits | Not implemented | New `source` field on visit document |
| FHIR parsing | Not implemented | New module for FHIR R4 resources → LumiMD data model |
| Data source management | Not implemented | New `dataSources` collection for managing connections |

---

## Phase 1: AVS Photo/Document Upload

### Why First

- **Zero provider involvement** — patient already has the document
- **Highest structured data quality** — AVS contains exact medication names/doses, ICD-10 diagnoses, vitals, lab results, follow-up instructions
- **Existing pipeline reuse** — OCR text feeds directly into the GPT-4 extraction prompts
- **Serves ALL patients** — every practice provides an AVS (mandated by Promoting Interoperability)
- **Natural UX** — photograph a piece of paper is intuitive even for elderly users

### What an AVS Contains

AVS documents are mandated by the Promoting Interoperability program and typically include:

**Structured (almost always present):**
- Patient name, DOB, visit date
- Provider name, clinic, specialty
- Diagnoses addressed (often with ICD-10 codes)
- Current medication list (full reconciled list, with NEW/CHANGED/STOPPED highlighted)
- Allergies
- Vitals recorded at the visit (BP, HR, weight, temp, BMI)
- Lab results (if available)
- Orders placed (labs, imaging, referrals)
- Follow-up instructions and scheduled appointments

**Variable:**
- Assessment/plan (some systems exclude for liability)
- Screening results (PHQ-9, fall risk)
- Patient education materials

### Two OCR Approaches

**Option A: GPT-4 Vision (Recommended — Simpler Pipeline)**

Send the photo directly to GPT-4V with the existing extraction prompt. One API call does OCR + extraction simultaneously.

```
Photo upload → Firebase Storage → Cloud Function
  → GPT-4V with image + extraction system prompt
  → Structured JSON output (same schema as audio extraction)
  → Write to visit document
  → Existing pipeline takes over
```

- Cost: ~$0.05-0.15 per image (depends on resolution)
- Accuracy: 90-96% on phone photos, 95-99% on clean PDFs
- Implementation: Simplest — reuses existing OpenAI client, just adds vision message format
- The OpenAI model config is already set up (`gpt-4.1-mini` default, configurable via `OPENAI_MODEL` env var). Several services already reference `gpt-4o` as fallback. Just need to use the vision content format.

**Option B: Google Document AI OCR → GPT-4 Text Extraction (Higher Accuracy)**

Separate OCR step, then feed text to existing text-based extraction pipeline.

```
Photo upload → Firebase Storage → Cloud Function
  → Google Document AI OCR ($1.50/1K pages)
  → Extracted text string
  → Write text to visit.transcriptText
  → Set processingStatus = 'summarizing'
  → Existing pipeline takes over exactly like audio
```

- Cost: ~$0.002 per page (OCR) + GPT-4 extraction cost
- Accuracy: 97-99.5% on clean documents, 93-97% on phone photos
- Implementation: Two-step, but text extraction reuses the existing pipeline with zero changes
- Same Google Cloud as Firebase — easy auth via service account

**Recommendation: Start with Option A (GPT-4V).** Simpler pipeline, one fewer external service, good enough accuracy. If accuracy issues emerge on poor-quality photos, add Option B as a fallback or upgrade path.

### Implementation Architecture

#### Mobile (New)

**Required packages:**
- `expo-image-picker` — Camera and photo library access
- `expo-document-picker` — PDF file picker (for portal-downloaded AVS)

**New screen: `app/upload-avs.tsx`**
- Camera button: launches `expo-image-picker` with camera
- Gallery button: select existing photo
- Document button: `expo-document-picker` for PDF
- Image preview with alignment guidance ("Hold phone flat over document")
- Upload progress bar (reuse pattern from `record-visit.tsx`)
- After upload: "Processing your visit summary..." status screen

**Upload function (extend `mobile/lib/storage.ts`):**
```
Path pattern: visits/{userId}/{timestamp}.{jpg|png|pdf}
Content type: image/jpeg, image/png, application/pdf
Same progress tracking pattern as uploadAudioFile()
```

**Storage rules update (`firebase-setup/storage.rules`):**
Current `isValidAudioUpload()` checks `contentType.matches('audio/.*')`. Need to add:
- `image/jpeg`, `image/png` for photos
- `application/pdf` for downloaded AVS documents
- Consider renaming to `isValidUpload()` and adding a size limit appropriate for images (~20MB)

#### Backend (New)

**Option 1: New Cloud Function trigger**

```
processAVSDocument — onObjectFinalized for visits/{userId}/{file} with image/pdf content type
  → Generate signed URL for the uploaded file
  → Call GPT-4V with image + extraction prompt
  → Write results to visit document
  → Set processingStatus = 'completed' (or 'summarizing' if using text pipeline)
```

**Option 2: New API endpoint (simpler for MVP)**

```
POST /v1/visits/:id/process-document
  → Accept { documentUrl, documentType: 'avs_photo' | 'avs_pdf' }
  → Cloud Function processes in background
  → Returns immediately with { status: 'processing' }
  → Client polls visit status or uses real-time listener
```

**GPT-4V extraction prompt (new, in `visitPromptRegistry.ts`):**

Reuse the existing `EXTRACTION_STAGE_SYSTEM_PROMPT` with a modified preamble:

```
"You are a meticulous medical data extraction assistant.
Extract factual clinical details from this After Visit Summary document and return STRICT JSON only.
The document is a photograph or scan of a patient's visit summary from their healthcare provider."
```

The rest of the extraction instructions (medication checklist, diagnosis detection, follow-up extraction) apply identically.

**Visit document changes:**
```typescript
// New field on visit document
source: 'recording' | 'avs_photo' | 'avs_pdf' | 'fhir' | 'healthkit' | 'blue_button' | 'manual'

// Optional: store raw document URL for reference
documentUrl?: string
documentStoragePath?: string
```

#### Data Confirmation Flow

**Reuse the existing medication confirmation pattern:**

The codebase already has `medicationConfirmationStatus`, `pendingMedicationChanges`, and `confirmedMedicationChanges` on the visit document. For AVS extraction:

1. GPT-4V extracts structured data → stored as `pendingMedicationChanges`
2. Patient reviews extracted medications, diagnoses, follow-ups on a confirmation screen
3. Patient confirms or edits → data committed to individual collections
4. Medication safety checks run on confirmed data

This exact flow exists today for audio-extracted visits. For AVS, it's arguably more important since OCR accuracy varies.

#### Web Portal Upload

Add drag-and-drop upload to the patient dashboard on the web portal:
- File drop zone or click-to-upload
- Accept JPG, PNG, PDF
- Same backend processing as mobile
- Useful for patients who download AVS as PDF from their patient portal

### Expected Accuracy by Document Quality

| Source | Medication Names | Medication Doses | Diagnoses | Overall |
|--------|-----------------|-----------------|-----------|---------|
| PDF from patient portal | 95-98% | 93-97% | 93-97% | Excellent |
| Clean printed photo (good lighting) | 90-95% | 88-93% | 88-95% | Good |
| Poor quality photo | 80-90% | 75-85% | 80-90% | Needs review |
| Handwritten annotations | 40-70% | 40-60% | 50-70% | Unreliable |

**Key mitigation:** The confirmation UI lets the patient review and correct extracted data before it's committed. This makes even 80% accuracy workable — the patient just needs to fix a few errors vs. entering everything from scratch.

### What AVS Captures That Audio Recording Misses

| Data Type | Audio Recording | AVS Document |
|-----------|----------------|--------------|
| Exact medication names/doses | Fair — depends on pronunciation | Excellent — printed from EHR |
| Full medication list (not just changes) | Poor — only discusses changes | Excellent — full reconciled list |
| Vitals | Poor — rarely stated aloud | Excellent — all readings included |
| Lab results | Poor — sometimes mentioned verbally | Good — included if available |
| ICD-10 codes | None | Often included |
| Allergies | Only if discussed | Full list |
| Follow-up scheduling | Good | Good — with specific dates |
| Conversational context | Excellent | None |

**The combination of AVS photo + audio recording (when available) gives the most complete picture.** AVS provides the facts; recording provides the context. But AVS alone is dramatically better than nothing.

### Effort Estimate: 5-7 Weeks

| Task | Weeks | Notes |
|------|-------|-------|
| Mobile: expo-image-picker integration + upload UI | 1.5 | Fork record-visit.tsx patterns |
| Storage rules update + new upload paths | 0.5 | Small change |
| Backend: GPT-4V extraction function | 1.5 | New prompt + vision message format |
| Visit source tracking + document storage | 0.5 | New field + storage path |
| Confirmation UI (mobile + web) | 1 | Adapt existing medication confirmation |
| Web portal upload | 0.5 | Drag-and-drop component |
| Testing + accuracy validation | 1 | Sample AVS documents from multiple EHR systems |

---

## Phase 2: Apple HealthKit Clinical Records

### Why Second

- **Zero ongoing cost** — Apple provides the infrastructure
- **Zero patient friction** (after setup) — data flows automatically
- **Highest data quality** — FHIR R4 with RxNorm, ICD-10, LOINC codes
- **900+ health systems** — covers most major US hospitals
- **Existing code to build on** — archived HealthKit v2 module at `mobile/_archived/healthkit-v2/`
- **FHIR parser built here is reusable** for Phase 3 (Blue Button) and Phase 4 (aggregator)

### What HealthKit Clinical Records Provides

| Clinical Type | FHIR Resource | LumiMD Mapping | Completeness |
|--------------|---------------|----------------|-------------|
| `.medicationRecord` | MedicationRequest | `medications/{id}` — RxNorm coded | Excellent from Epic, good from Cerner |
| `.conditionRecord` | Condition | Visit diagnoses + conditions list | ICD-10/SNOMED coded, good |
| `.allergyRecord` | AllergyIntolerance | `users/{uid}.allergies` | Coded substances with severity |
| `.labResultRecord` | Observation (lab) | `healthLogs/{id}` | LOINC coded, values + reference ranges |
| `.vitalSignRecord` | Observation (vitals) | `healthLogs/{id}` | Clinical-grade BP, HR, weight |
| `.immunizationRecord` | Immunization | New collection or user profile | CVX codes + dates |
| `.clinicalNoteRecord` | DocumentReference | Feed into AVS pipeline (iOS 14+) | Limited availability but machine-readable |

**`.clinicalNoteRecord` is a hidden gem:** When available, it provides the actual AVS text as a FHIR DocumentReference — machine-readable, no OCR needed. This could feed directly into the Phase 1 extraction pipeline, bypassing photo/OCR entirely.

### Implementation Architecture

**Custom Expo native module (recommended over react-native-health):**

The community `react-native-health` library has inconsistent clinical records support and maintenance. A custom Swift module via the Expo Modules API gives precise control:

```
mobile/modules/healthkit-clinical/
├── ios/
│   ├── HealthKitClinicalModule.swift     # Permission + queries
│   └── FHIRParser.swift                  # FHIR JSON → LumiMD types
├── src/
│   ├── index.ts                          # JS interface
│   ├── types.ts                          # TypeScript types
│   └── useClinicalRecords.ts             # React hook
└── expo-module.config.json
```

**Build on archived code:** The sync engine architecture from `mobile/_archived/healthkit-v2/` (cursor-based incremental sync, per-user state, dedup via sourceId, permission lifecycle) applies directly. Add clinical record type queries as a new module alongside the vitals sync.

**Authorization flow:**
1. User taps "Connect Health Records" in settings
2. iOS shows HealthKit permission sheet for clinical record types
3. Separate prompt emphasizes medical record access
4. User toggles types on/off (granular)
5. App begins incremental sync

**FHIR parsing → LumiMD data model:**

Each clinical record returns `HKFHIRResource.data` as raw FHIR R4 JSON. Example MedicationRequest:
```json
{
  "resourceType": "MedicationRequest",
  "status": "active",
  "medicationCodeableConcept": {
    "coding": [{ "system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "197361", "display": "Lisinopril 10 MG Oral Tablet" }]
  },
  "dosageInstruction": [{ "text": "Take 1 tablet by mouth daily" }],
  "authoredOn": "2025-06-15"
}
```

Maps to:
```typescript
{
  name: "Lisinopril",
  dose: "10 MG",
  frequency: "daily",
  source: "healthkit_clinical",
  rxNormCode: "197361",
  active: true,
  startedAt: "2025-06-15"
}
```

**Medication reconciliation (critical):**

HealthKit provides the EHR's current medication list. LumiMD already has medications from recordings and manual entry. Must:
1. Match by RxNorm code (exact, from FHIR coding)
2. Fall back to fuzzy name matching (reuse `normalizeMedicationName()` from `medicationSafety.ts`)
3. Enrich existing records with coded data (don't duplicate)
4. Detect new medications not in LumiMD → flag for confirmation
5. Detect stopped medications → flag for review (don't auto-stop)
6. Preserve source provenance per record

**Requires native build:** Cannot ship via OTA — new HealthKit entitlements, Info.plist changes, Expo config plugin.

### App Store Review

Apple reviews clinical records access more stringently. Must demonstrate:
- Clear user benefit (displaying medications, conditions, health data to patient and caregiver)
- Appropriate usage description (`NSHealthClinicalHealthRecordsShareUsageDescription`)
- No data mining or advertising use
- LumiMD's use case (patient + caregiver health dashboard) is a well-established justification

### Effort Estimate: 6-8 Weeks

| Task | Weeks | Notes |
|------|-------|-------|
| Custom Expo native module (Swift) | 2 | Permission + clinical record queries |
| FHIR R4 parser (reusable for Phase 3-4) | 1.5 | MedicationRequest, Condition, AllergyIntolerance, Observation |
| Medication reconciliation logic | 1 | Match by RxNorm, fuzzy name, detect new/stopped |
| Consent UI + settings integration | 0.5 | Connect/disconnect, permission status display |
| Data source management (`dataSources` collection) | 0.5 | Connection tracking, sync timestamps |
| Testing + Apple review preparation | 1-1.5 | Entitlements, usage descriptions, submission |
| Apple review | 1-4 (parallel) | Overlap with other work |

---

## Phase 3: CMS Blue Button 2.0

### Why Third

- **Free API** — zero cost, operated by CMS
- **~65M Medicare beneficiaries** — likely 60-80% of LumiMD's 60-85 demographic
- **Pharmacy fill history** — not just what was prescribed, but what was actually dispensed
- **FHIR R4** — reuses parsers from Phase 2
- **3 years of claims data** — complete medication history
- **Part B claims** — outpatient visits with diagnosis codes, procedures, dates

### What Blue Button Provides

**Part D (pharmacy) claims → Medication fill history:**
- Drug name (NDC code → RxNorm via NLM API)
- Fill date, quantity dispensed, days supply
- Pharmacy name and location
- Patient cost and plan paid amount

**Part B (outpatient) claims → Visit history:**
- Date of service, provider, diagnosis codes (ICD-10)
- Procedures performed (CPT codes)
- Lab tests ordered

**Part A (inpatient) claims → Hospital stays:**
- Admission/discharge dates, diagnoses, procedures

### Integration Architecture

**OAuth 2.0 flow:**
```
Mobile: expo-auth-session or expo-web-browser
  → Open Medicare.gov authorization URL
  → Patient authenticates with Medicare.gov credentials
  → Redirect back to app via deep link (lumimd://bluebutton-callback)
  → Exchange authorization code for tokens on backend
  → Store refresh token encrypted in Firestore
```

**Periodic sync via Cloud Function:**
```
syncBlueButtonClaims — scheduled (daily or weekly)
  → For each connected user: use stored refresh token
  → Fetch new ExplanationOfBenefit resources since last sync
  → Parse Part D claims → medication records
  → Parse Part B claims → visit metadata
  → Run medication reconciliation (same as Phase 2)
  → Notify user of new data
```

**NDC → RxNorm mapping:**

Blue Button returns NDC codes (11-digit National Drug Codes). To match against LumiMD's `CANONICAL_MEDICATIONS`:
```
NLM RxNorm API: GET https://rxnav.nlm.nih.gov/REST/ndcstatus.json?ndc={ndc}
  → Returns RxNorm CUI
  → Match against CANONICAL_MEDICATIONS or ALIAS_TO_CANONICAL
```

**Sandbox for development:**
- `https://sandbox.bluebutton.cms.gov/`
- 30,000 synthetic beneficiaries with realistic claims
- Test credentials: `BBUser00000` through `BBUser29999`
- Functionally identical to production API

**Production approval:**
- Submit through CMS developer portal
- Privacy policy, terms of service, security documentation
- Timeline: 4-12 weeks for review
- No fee

### UX Concern: Medicare.gov Accounts

Many elderly Medicare beneficiaries do not have a Medicare.gov online account. Creating one requires:
- Medicare card number (or SSN)
- Account creation process on Medicare.gov

**Mitigation:** In-app guidance with step-by-step instructions. Consider a dedicated onboarding flow: "Connect your Medicare account to automatically track your medications."

### Rate Limits

- 40 requests/minute per beneficiary
- 2,000 requests/minute per application
- Sufficient for LumiMD's use case

### Effort Estimate: 5-7 Weeks

| Task | Weeks | Notes |
|------|-------|-------|
| OAuth flow (mobile + backend) | 1.5 | expo-auth-session, token exchange, encrypted storage |
| EOB parser (Part D + Part B) | 1.5 | ExplanationOfBenefit → medications, visits |
| NDC → RxNorm mapping | 0.5 | NLM API integration |
| Medication reconciliation (shared with Phase 2) | 0.5 | Incremental — code exists from Phase 2 |
| Scheduled sync Cloud Function | 0.5 | Periodic claim fetching |
| Onboarding UI + Medicare.gov guidance | 0.5 | Connection flow, help text |
| Testing (sandbox) | 0.5 | Synthetic beneficiary data |
| CMS production approval | 4-12 (parallel) | Submit early, review runs in background |

---

## Phase 4: FHIR Aggregator (1up Health)

### Why an Aggregator and Why 1up

Direct SMART on FHIR integration requires registering with each EHR vendor separately (Epic App Orchard review: 2-4 months, Cerner CODE: 2-6 weeks, each with different endpoints and quirks). An aggregator provides a single integration point.

**Aggregator comparison:**

| Aggregator | Pricing | Coverage | Patient UX | Best For | LumiMD Fit |
|------------|---------|----------|-----------|----------|-----------|
| **1up Health** | ~$0.10-0.50/user/mo + connection fee | 300+ health systems | Embedded Connect widget | Clinical EHR data | Good — affordable, clinical data |
| **Flexpa** | ~$1/connection | 200+ health plans | Flexpa Link widget | Claims/pharmacy data | Lower — Blue Button covers Medicare claims free |
| **Human API** | ~$3-8/user/mo | 400+ sources | Human Connect widget | Multi-source (EHR+lab+pharmacy) | Overkill — expensive, broad but unfocused |
| **Particle Health** | ~$2-5/user/mo enterprise | National networks | No patient widget | Clinical apps with HIPAA coverage | Poor — wrong regulatory fit for consumer app |

**1up Health is the pragmatic choice:** Cheapest per-user cost, focused on clinical EHR data (which is what we need after Blue Button covers claims), and a decent patient-facing Connect widget. Human API has broader source coverage but costs 6-16x more per user.

### What 1up Adds Beyond HealthKit + Blue Button

| Data | HealthKit Clinical Records | Blue Button 2.0 | 1up Health |
|------|--------------------------|-----------------|------------|
| Current medications | Yes (iOS + participating systems) | Fills only (2-4 week lag) | Yes (real-time from EHR) |
| Conditions/diagnoses | Yes | Yes (billing codes) | Yes (clinical codes) |
| Lab results | Yes | Limited (claims data) | Yes (full values + ranges) |
| Allergies | Yes | No | Yes |
| Clinical notes | Limited | No | Yes (DocumentReference) |
| Android support | No | Yes | Yes |
| Setup friction | Low (if already connected in Health) | Medium (Medicare.gov account) | High (portal credentials) |

**Primary value of 1up:** Android users who can't use HealthKit, and patients at health systems not yet on Apple Health Records.

### Integration Architecture

**Patient connection flow:**
```
Mobile: Open 1up Connect widget in expo-web-browser
  → Patient selects health system from directory
  → Patient authenticates with portal credentials (MyChart, etc.)
  → Widget handles SMART on FHIR handshake
  → Callback to LumiMD with user_id + connection tokens
  → Backend stores tokens, begins data fetch
```

**Data fetch + mapping:**
```
Backend: Cloud Function fetches FHIR R4 resources from 1up API
  → Reuse FHIR parsers from Phase 2 (same FHIR R4 format)
  → Medication reconciliation (shared code)
  → Store with source: 'fhir'
  → Periodic re-fetch via scheduled function
```

**BAA required:** 1up Health acts as a Business Associate. BAA must be signed before production use. Factor into timeline.

### Effort Estimate: 4-6 Weeks

| Task | Weeks | Notes |
|------|-------|-------|
| 1up Connect widget integration | 1 | expo-web-browser, callback handling |
| Backend token management + webhook handling | 1 | Store tokens, handle connection events |
| FHIR data fetching + sync | 1 | Reuse parsers from Phase 2 |
| Medication reconciliation (shared) | 0.5 | Incremental — code exists from Phase 2 |
| UI (connection management, data display) | 1 | Settings screen, connection status |
| Testing + BAA | 0.5-1.5 | BAA negotiation may take weeks (parallel) |

---

## Phase 5: Direct SMART on FHIR (Scale Play)

### When to Consider

Build this when aggregator costs become significant at scale, or when you need deeper integration with specific health systems. At ~$0.10-0.50/user/month with 1up, this becomes worth it around 10,000+ active FHIR-connected users.

### Epic on FHIR

- Register at `https://fhir.epic.com/`
- Free for patient-facing apps (Cures Act compliance)
- App Orchard review: 2-4 months
- Access tokens: 5 minutes (must refresh aggressively)
- Refresh tokens: up to 90 days
- Covers ~38% of US hospital beds

### Cerner/Oracle Health

- Register at `https://code.cerner.com/`
- Free, faster review (2-6 weeks)
- Access tokens: 5-10 minutes
- Refresh tokens: 90 days to 1 year

### Endpoint Discovery

Maintain a curated directory of FHIR server URLs for top health systems. Epic publishes a list at `https://open.epic.com/MyApps/Endpoints`. Patient selects their health system from a searchable dropdown.

Long-term, integrate national FHIR endpoint directories as they mature.

### Infrastructure Reuse

All FHIR parsers, medication reconciliation, token management, and sync logic from Phases 2-4 are directly reusable. The incremental effort is SMART on FHIR OAuth implementation + per-vendor endpoint management.

---

## Regulatory Posture (All Phases)

### HIPAA

**Key principle:** When a patient exercises their right of access and directs their own PHI to a third-party app, the receiving app does NOT become a HIPAA covered entity or business associate. Confirmed by HHS in the ONC Cures Act Final Rule preamble.

| Approach | HIPAA Applies? | Why |
|----------|---------------|-----|
| AVS photo/scan | No | Patient provides their own document |
| HealthKit Clinical Records | No | Patient-mediated, data on device |
| CMS Blue Button 2.0 | No | Patient-directed, CMS designed for consumer apps |
| FHIR via aggregator (1up) | Partial | 1up is a BA; need BAA with 1up (not with health systems) |
| FHIR direct (patient-mediated) | No | Patient exercises right of access |

### What DOES Apply

1. **FTC Health Breach Notification Rule** — 60-day breach notification, up to $50,120/violation/day
2. **FTC Act Section 5** — Unfair/deceptive practices regarding health data
3. **State health privacy laws** — Washington My Health My Data Act, CCPA/CPRA, Connecticut SB 3
4. **Apple HealthKit guidelines** — For HealthKit integration specifically
5. **CMS API terms** — For Blue Button integration

### FDA

LumiMD remains exempt under 21st Century Cures Act Section 3060 (organize/display/alert, not diagnose/treat/recommend). Adding clinical data ingestion does not change this as long as the existing guardrails stay in place:
- Never attribute outcomes to medications
- Deflect clinical questions to "your care team"
- Unsafe pattern regex on all AI-generated content
- Show data side by side, let physicians connect dots

---

## Unified Architecture

### How New Ingestion Paths Feed the Pipeline

```
                    ┌──────────────────────────────────────────────┐
                    │              INPUT SOURCES                    │
                    ├──────────┬───────────┬───────────┬───────────┤
                    │  Audio   │   AVS     │  FHIR/    │   Blue    │
                    │Recording │  Photo    │ HealthKit │  Button   │
                    └────┬─────┴────┬──────┴────┬──────┴─────┬─────┘
                         │          │           │            │
                         v          v           │            │
                    ┌─────────┐ ┌────────┐      │            │
                    │Assembly │ │ GPT-4V │      │            │
                    │   AI    │ │  OCR   │      │            │
                    └────┬────┘ └───┬────┘      │            │
                         │          │           │            │
                         v          v           │            │
                    ┌────────────────────┐      │            │
                    │   Text String      │      │            │
                    └────────┬───────────┘      │            │
                             │                  │            │
                             v                  v            v
                    ┌───────────────────────────────────────────────┐
                    │            EXTRACTION LAYER                    │
                    ├────────────────────┬──────────────────────────┤
                    │   GPT-4 Prompts    │    FHIR R4 Parser        │
                    │  (text → struct)   │  (JSON → struct)         │
                    └────────┬───────────┴──────────┬───────────────┘
                             │                      │
                             v                      v
                    ┌───────────────────────────────────────────────┐
                    │          MEDICATION RECONCILIATION             │
                    │  (match by RxNorm/name, detect new/stopped,   │
                    │   enrich existing records, flag for review)    │
                    └─────────────────────┬─────────────────────────┘
                                          │
                              ┌────────────┼────────────┐
                              v            v            v
                    ┌──────────┐  ┌──────────┐  ┌──────────────┐
                    │  User    │  │ Medication│  │   Firestore  │
                    │Confirma- │  │  Safety   │  │    Writes    │
                    │  tion    │  │  Check    │  │              │
                    └────┬─────┘  └────┬─────┘  └──────┬───────┘
                         │             │               │
                         v             v               v
                    ┌───────────────────────────────────────────────┐
                    │          POST-COMMIT OPS (parallel)            │
                    ├──────────┬──────────────┬─────────────────────┤
                    │ Denorm   │ Walkthrough  │    Nudge + Push     │
                    │  Sync    │ Generation   │    + Caregiver      │
                    └──────────┴──────────────┴─────────────────────┘
```

### Data Model Changes

**Visit document — `source` field:**
```typescript
type VisitSource =
  | 'recording'        // Audio recording (existing)
  | 'avs_photo'        // AVS photograph
  | 'avs_pdf'          // AVS PDF upload
  | 'healthkit'        // HealthKit Clinical Records
  | 'fhir'             // Direct FHIR / aggregator
  | 'blue_button'      // CMS Blue Button 2.0
  | 'manual';          // Manual entry (existing)
```

**Medication document — enriched with coded data:**
```typescript
// New optional fields on medications/{id}
rxNormCode?: string;        // From FHIR/HealthKit
ndcCode?: string;           // From Blue Button
icd10Code?: string;         // For linked diagnoses
fhirResourceId?: string;    // For deduplication on re-sync
lastSyncedAt?: string;      // For auto-syncing sources
source: 'manual' | 'visit' | 'avs' | 'healthkit' | 'fhir' | 'blue_button';
```

**New `dataSources` collection:**
```typescript
// dataSources/{id}
{
  userId: string;
  type: 'healthkit_vitals' | 'healthkit_clinical' | 'fhir' | 'blue_button';
  status: 'connected' | 'disconnected' | 'error';
  connectedAt: string;
  lastSyncAt?: string;
  syncError?: string;
  metadata: {
    // HealthKit: data types authorized
    // FHIR: issuer URL, scopes, health system name
    // Blue Button: beneficiary ID
  };
  deletedAt?: null | timestamp;  // Soft delete
}
```

### Shared FHIR Parser Module

Build once in Phase 2, reuse in Phases 3-5:

```
functions/src/services/fhir/
├── parser.ts               # Generic FHIR R4 resource parser
├── medicationMapper.ts     # MedicationRequest → LumiMD Medication
├── conditionMapper.ts      # Condition → Diagnosis/Condition record
├── observationMapper.ts    # Observation → HealthLog
├── allergyMapper.ts        # AllergyIntolerance → user allergies
├── reconciliation.ts       # Medication reconciliation logic
└── types.ts                # FHIR R4 TypeScript types
```

### Shared Medication Reconciliation

Core logic shared across all FHIR-sourced data:

```
Input: FHIR medications + existing LumiMD medications
  1. Match by RxNorm code (exact match)
  2. Match by normalized name (ALIAS_TO_CANONICAL + fuzzy)
  3. For matches: enrich existing record with coded data
  4. For new: create pending medication, flag for user confirmation
  5. For missing (in FHIR but stopped, in LumiMD but still active): flag for review
  6. Preserve source provenance on every record
```

---

## Phased Roadmap Summary

| Phase | What | When | Cumulative Coverage | Key Dependency |
|-------|------|------|-------------------|----------------|
| **1: AVS Photo** | Photo/PDF upload → GPT-4V extraction | Weeks 1-7 | All patients with AVS documents | expo-image-picker, GPT-4V |
| **2: HealthKit Clinical** | iOS clinical records → FHIR parsing | Weeks 5-13 | +iOS users at 900+ health systems | Native build, Apple review |
| **3: Blue Button** | Medicare claims → medication fills | Weeks 8-15 | +65M Medicare beneficiaries | CMS production approval |
| **4: 1up Health** | Aggregated EHR data | Weeks 12-18 | +Android users, non-HealthKit systems | BAA with 1up |
| **5: Direct FHIR** | Scale play, remove aggregator cost | Months 5-8+ | Same coverage, lower cost | Epic/Cerner app reviews |

**Phases 2 and 3 can overlap.** The FHIR parser built for HealthKit in Phase 2 is directly reused for Blue Button in Phase 3. CMS production approval runs in parallel.

### Cost at Scale (1,000 Active Users)

| Phase | Monthly Cost | Notes |
|-------|-------------|-------|
| AVS Photo | ~$5-15/mo | GPT-4V cost only (~$0.10/document, ~5 docs/user/mo avg) |
| HealthKit | $0 | On-device API, no third-party fees |
| Blue Button | $0 | Free government API |
| 1up Health | ~$100-500/mo | ~$0.10-0.50/user for connected users |
| Direct FHIR | $0 API cost | Only engineering maintenance |

**Total incremental cost:** ~$105-515/month for 1,000 users. The dominant cost is the FHIR aggregator, which is eliminable with Phase 5.

---

## Open Questions

1. **AVS format variance:** AVS documents vary significantly across EHR systems (Epic vs. Cerner vs. MEDITECH layouts). How much does this affect GPT-4V extraction? Need to test with samples from at least 5-6 major EHR systems.

2. **Medication reconciliation conflicts:** When HealthKit shows a medication that contradicts a visit recording (different dose), which wins? Recommendation: show both with provenance, let user resolve, bias toward EHR-sourced data for factual fields.

3. **HealthKit Clinical Records + AVS overlap:** If a patient uploads an AVS AND has HealthKit connected, we'll get duplicate data from two sources. Need dedup logic: prefer FHIR-coded data from HealthKit, supplement with AVS-extracted context.

4. **Caregiver notification granularity:** Notify on user-initiated events (AVS upload), summarize background syncs (HealthKit, Blue Button) in daily digest.

5. **Android strategy:** HealthKit is iOS-only. For Android: AVS photo works immediately (Phase 1), Blue Button works (Phase 3), 1up Health covers EHR data (Phase 4). Google Health Connect clinical records is the long-term Android equivalent — evaluate maturity.

6. **Offline AVS capture:** Allow photographing the AVS offline (on the way home from the doctor) and uploading when connected. Extend the existing audio upload offline pattern.
