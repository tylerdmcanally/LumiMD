# Caregiver Portal Enhancements — Implementation Checklist

## Feature 2A: Adherence Confidence Indicators
- [x] 2A.1 — Enhance `functions/src/routes/care/medicationAdherence.ts` with confidence computation
- [x] 2A.2 — Build & verify backend compiles (`cd functions && npm run build`)

## Feature 2B: Medication Follow-Up Nudges
- [x] 2B.1 — Create `functions/src/triggers/medicationFollowUpNudges.ts` (scheduled function)
- [x] 2B.2 — Export new trigger in `functions/src/index.ts`
- [x] 2B.3 — Add `medication_followup` to nudge priority map in `nudgeNotificationService.ts`
- [x] 2B.4 — Verify `MedicationLogDomainService` has `createLog()` method, add if missing
- [x] 2B.5 — Enhance nudge response handler in `functions/src/routes/nudges.ts` (add `took_it`/`skipped_it`)
- [x] 2B.6 — Build & verify backend compiles

## Feature 1: Caregiver → Patient Messaging
- [x] 1.1 — Create `functions/src/routes/care/messages.ts` (caregiver send + list routes)
- [x] 1.2 — Create `functions/src/routes/messages.ts` (patient inbox + mark-read routes)
- [x] 1.3 — Register new routes in `functions/src/index.ts`
- [x] 1.4 — Add SDK methods in `packages/sdk/src/api-client.ts` (care.messages + messages)
- [x] 1.5 — Add mobile hooks in `mobile/lib/api/hooks.ts`
- [x] 1.6 — Create `mobile/app/messages.tsx` (patient messages screen)
- [x] 1.7 — Handle push notification navigation in `mobile/app/_layout.tsx`
- [x] 1.8 — Create web portal messaging page
- [x] 1.9 — Add Firestore indexes to `firestore.indexes.json`
- [x] 1.10 — Build & verify all packages compile

## Final Verification
- [x] F.1 — `cd functions && npm run build` passes
- [x] F.2 — Run existing smoke tests (104/107 suites pass — 3 pre-existing failures unrelated to our changes)
