# Phase C P0 Smoke Checklist (`lumimd-dev`)

Date: 2026-02-11  
Owner: Product + Engineering

Purpose: close the audit-cycle P0 gate with one pass/fail artifact.

## Pass Criteria

All four loops pass:
1. Account switch reminder isolation.
2. Home partial-failure recovery.
3. Visit retry/recovery pipeline.
4. Medication snooze timing behavior.

## Run Tracker

| Loop | Result | Evidence | Notes |
|---|---|---|---|
| Account switch + reminder isolation | Partial | `npm test -w functions -- users.pushTokens.test.ts` (pass) | Automated backend coverage green; device notification behavior still requires manual verification. |
| Home partial-failure recovery | Partial | `npm test -w mobile -- home.test.tsx` (pass) | UI behavior test is green; manual recovery walkthrough still required on device. |
| Visit retry/recovery pipeline | Pass | `bash scripts/smoke-visit-pipeline.sh` (pass); `firebase functions:log --project lumimd-dev --only checkPendingTranscriptions -n 50`; `firebase functions:log --project lumimd-dev --only staleVisitSweeper -n 50`; `npm test -w functions -- visits.retry.test.ts webhooks.assemblyai.test.ts checkPendingTranscriptions.test.ts staleVisitSweeper.recovery.test.ts --runInBand` (pass) | Automated smoke now covers summarize path, retranscribe path, retry guardrails, and webhook error transition without manual tokens. |
| Medication snooze timing | Partial | `npm test -w functions -- medicationReminderService.test.ts`; `npm test -w mobile -- medication-schedule.test.tsx` (pass) | Snooze logic tests pass; end-to-end reminder timing still requires device validation. |

## 1) Account Switch + Reminder Isolation (manual/device)

1. Sign in as user A on the same device.
2. Ensure at least one due reminder exists for user A.
3. Sign out, then sign in as user B.
4. Open home, medications, and schedule.
5. Verify:
   - no user A medications/reminders are visible,
   - no user A reminder notifications fire after user B login.

Expected:
- Data and reminders are strictly user B scoped.

Evidence:
- screenshot of user B schedule,
- notification center screenshot after 5+ minutes.
- automated pre-check: `users.pushTokens.test.ts` passed on 2026-02-11.

## 2) Home Partial-Failure Recovery (manual/device)

1. Open home.
2. Trigger one failing datasource (for example, temporary API/network interruption).
3. Verify unaffected cards remain visible.
4. Tap retry/pull-to-refresh and confirm recovery.

Expected:
- No all-or-nothing home failure.
- User can recover from home without app restart.

Evidence:
- screenshot of partial-error card state,
- screenshot after successful retry.
- automated pre-check: `home.test.tsx` passed on 2026-02-11.

## 3) Visit Retry/Recovery Pipeline (terminal + backend logs)

Run `/Users/tylermcanally/LumiMD/Codebase/docs/guides/VISIT-PIPELINE-SMOKE-CHECKLIST.md` end to end.

Expected:
- retry throttle enforced,
- retry path selection is deterministic,
- webhook error path marks failed correctly,
- polling + sweeper logs show healthy recovery behavior.

Evidence:
- curl responses,
- relevant function log snippets.
- completed now:
  - `checkPendingTranscriptions` logs (2026-02-11T00:17:05Z to 2026-02-11T00:41:04Z): repeated healthy runs, no runtime errors.
  - `staleVisitSweeper` logs (2026-02-10T22:44:01Z to 2026-02-11T00:36:01Z): repeated `[sweeper] Sweep complete` with deterministic counters and no crashes.

## 4) Medication Snooze Timing (manual/device + backend)

1. Create medication reminder due within 5-10 minutes.
2. Snooze from schedule for 15 minutes.
3. Confirm no reminder sends before snooze expiry.
4. Confirm reminder becomes eligible at/after snooze expiry.

Expected:
- Snooze window is respected and deterministic.

Evidence:
- schedule screenshots before/after snooze window,
- optional backend log snippet for reminder suppression reason.
- automated pre-check: `medicationReminderService.test.ts` and `medication-schedule.test.tsx` passed on 2026-02-11.

## Sign-Off

- `No open P0 defects`: Pending
- `Ready for release freeze`: Pending
