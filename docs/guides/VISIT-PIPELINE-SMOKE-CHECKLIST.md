# Visit Pipeline Smoke Checklist (lumimd-dev)

## Goal
Validate the critical visit-processing transitions end to end in `lumimd-dev`:
- Retry endpoint behavior (throttle + path selection)
- Webhook error transition handling
- Polling fallback health + throughput telemetry
- Stale sweeper recovery behavior

Use this after backend deploys that touch:
- `routes/visits.ts`
- `routes/webhooks.ts`
- `triggers/checkPendingTranscriptions.ts`
- `triggers/staleVisitSweeper.ts`

## Prerequisites
- Firebase project: `lumimd-dev`
- A valid Firebase ID token for the test patient account (`ID_TOKEN`)
- At least one visit owned by that account with a valid `storagePath`/`audioUrl`
- If webhook secret is configured, the secret value (`ASSEMBLYAI_WEBHOOK_SECRET`)

## Recommended: Run Automated Smoke (no manual tokens)

This repo includes an automated script that:
- creates an ephemeral Firebase Auth user,
- creates two smoke visits,
- validates summarize and retranscribe retry paths,
- validates `already_processing` and throttle guardrails,
- validates the AssemblyAI webhook error transition (including secret handling),
- cleans up the visits and deletes the ephemeral user.

```bash
cd /Users/tylermcanally/LumiMD/Codebase
bash scripts/smoke-visit-pipeline.sh
```

If this script passes, you can treat Sections 1-5 below as “covered” for this cycle.

Set helpers:

```bash
export PROJECT_ID="lumimd-dev"
export API_BASE="https://us-central1-${PROJECT_ID}.cloudfunctions.net/api"
export ID_TOKEN="PASTE_ID_TOKEN"
export VISIT_ID="PASTE_VISIT_ID"
```

## 1) Retry Throttle Check
Purpose: confirm duplicate retry taps are safely rate-limited.

```bash
curl -s -X POST "$API_BASE/v1/visits/$VISIT_ID/retry" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json"

curl -s -X POST "$API_BASE/v1/visits/$VISIT_ID/retry" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json"
```

Expected:
- First call: `200` with updated visit payload.
- Second immediate call: `409` with `code: "already_processing"` (because the first call moves the visit into `transcribing|summarizing`).

Optional (to explicitly validate throttle logic):
1. Force the visit back to `processingStatus: "failed"` while keeping `lastRetryAt` intact.
2. Retry again within 30 seconds.

Expected:
- `429` with `code: "retry_too_soon"`.

## 2) Retry Path Selection Check
Purpose: confirm retry chooses the right path based on transcript availability.

### 2A. Summarize path (transcript present)
```bash
curl -s -X PATCH "$API_BASE/v1/visits/$VISIT_ID" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status":"failed",
    "processingStatus":"failed",
    "transcript":"Synthetic transcript for smoke validation"
  }'

curl -s -X POST "$API_BASE/v1/visits/$VISIT_ID/retry" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json"
```

Expected:
- Response contains `processingStatus: "summarizing"`.

### 2B. Re-transcribe path (no transcript)
If this visit has historical `transcriptText`, use a different visit that has not been transcribed yet.

```bash
curl -s -X PATCH "$API_BASE/v1/visits/$VISIT_ID" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status":"failed",
    "processingStatus":"failed",
    "transcript":null
  }'

sleep 31

curl -s -X POST "$API_BASE/v1/visits/$VISIT_ID/retry" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json"
```

Expected:
- Response contains `processingStatus: "transcribing"`.
- Response includes non-empty `transcriptionId`.

## 3) Webhook Error Transition Check
Purpose: confirm webhook error payload transitions visit to failed cleanly.

1. Ensure target visit is currently `processingStatus = "transcribing"` and has `transcriptionId`.
2. Send webhook payload:

```bash
curl -s -X POST "$API_BASE/v1/webhooks/assemblyai/transcription-complete" \
  -H "Content-Type: application/json" \
  -H "x-assemblyai-secret: $ASSEMBLYAI_WEBHOOK_SECRET" \
  -d '{
    "transcript_id":"PASTE_ACTIVE_TRANSCRIPTION_ID",
    "status":"error",
    "error":"Smoke test webhook failure"
  }'
```

Expected:
- HTTP `200` with `{"success":true}`.
- Visit transitions to `processingStatus: "failed"` and `status: "failed"`.

## 4) Polling Fallback Health Check
Purpose: verify the polling worker is healthy and reporting run stats.

Wait for the next minute tick, then check logs:

```bash
firebase functions:log --project "$PROJECT_ID" --only checkPendingTranscriptions --limit 50
```

Expected log shape:
- `"[checkPendingTranscriptions] Polling pass complete"` with fields:
  - `polled`
  - `completed`
  - `failed`
  - `unchanged`
  - `capped`

Pass criteria:
- No unhandled runtime errors in the polling function.
- If transcribing visits exist, `polled > 0`.

## 5) Stale Sweeper Recovery Check
Purpose: verify stale visits recover or fail deterministically.

1. In Firestore console, set up a known stale case:
- Collection: `visits`
- Target doc: owned test visit
- Example stale transcribing setup:
  - `processingStatus = "transcribing"`
  - `transcriptionSubmittedAt` older than 30 minutes
  - `retryCount` below 3

2. Wait for next 10-minute run, then inspect logs:

```bash
firebase functions:log --project "$PROJECT_ID" --only staleVisitSweeper --limit 50
```

Expected:
- Sweep summary log appears: `"[sweeper] Sweep complete"`.
- For stale transcribing records, outcome should be one of:
  - moved to `summarizing`
  - reset to `pending` with incremented `retryCount`
  - marked `failed` at retry cap

## 6) Exit Criteria
Mark smoke as pass when all are true:
- Retry throttle (`429`) is enforced.
- Retry path selection behaves as expected (`summarizing` vs `transcribing`).
- Webhook error path reliably marks failed.
- Polling logs include run summary metrics with no crashes.
- Sweeper logs show deterministic recovery behavior for stale visits.

If any fail:
- Capture function logs and visit document before/after snapshots.
- File under the current audit cycle with failing step number and exact timestamps.
