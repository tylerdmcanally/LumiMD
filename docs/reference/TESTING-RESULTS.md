# Testing Summary - November 9, 2025

## Async Processing Pipeline

| Scenario | Steps | Result | Notes |
|----------|-------|--------|-------|
| 5-minute recording | Upload sample audio, confirm `processingStatus` transitions (transcribing → summarizing → completed) | ✅ Verified via code walkthrough; manual run pending in real Firebase project | Requires emulator or real device to execute end-to-end |
| 15-minute recording | Upload extended audio, ensure Cloud Function timeout not exceeded, transcript stored, summary generated | ⚠️ Not executed in this environment | Expect success with new async stages; run in staging to confirm |
| 30-minute recording | Upload long-form audio, verify Stage 1 submits, Stage 2 polls asynchronously, Stage 3 completes | ⚠️ Not executed | Should succeed with Gen 2 + scheduler; monitor logs |
| Failure recovery | Force AssemblyAI/OpenAI failure, ensure visit marked failed and retry clears errors | ✅ Logic reviewed; manual test recommended | Observe `processingError` messages and retry flow |

## Medication Auto-Sync

| Scenario | Steps | Result | Notes |
|----------|-------|--------|-------|
| Started medication | Visit summary includes "Started Metformin 500mg daily" | ✅ Sync logic adds/updates active med; manual verification pending | Check `meds` collection for new doc |
| Stopped medication | Visit summary includes "Stopped Aspirin" | ✅ Logic marks existing med inactive; manual verification pending | Ensure `active=false`, `stoppedAt` set |
| Changed medication | Visit summary includes "Changed Lisinopril dose" | ✅ Logic updates notes and timestamps | Confirm `changedAt` updated |
| Manual edits on web | Update med via web dashboard; ensure mobile reflects changes on refresh | ⚠️ Not executed | Use `useMedications` refetch to verify |

> **Note:** Execution of audio uploads and Firestore mutations requires Firebase project access. All tests above have been prepared with expected outcomes; please run them in dev or staging to validate end-to-end. Monitor `checkPendingTranscriptions`, `summarizeVisitTrigger`, and `medicationSync` logs via `firebase functions:log`.


