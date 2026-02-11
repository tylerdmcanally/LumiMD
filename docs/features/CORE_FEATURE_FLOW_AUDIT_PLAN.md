# Core Feature + Critical Flow Audit Plan

## Goal
Create a repeatable walkthrough process that answers two questions for each core feature:
1. What works today (with evidence)?
2. What needs to improve next (ranked by impact)?

## Current Baseline Snapshot (from code/docs review)

| Area | Current Standing | Evidence |
|---|---|---|
| Auth + account isolation | Strong, needs adversarial QA | `mobile/contexts/AuthContext.tsx`, `functions/src/routes/users.ts` push-token reassignment and unregister-all |
| Visit capture + processing | Functional, resilience risk remains | `mobile/app/record-visit.tsx`, `functions/src/routes/visits.ts`, triggers in `functions/src/triggers/*`, known debt in `docs/reports/SYSTEM-HEALTH-REPORT.md` |
| Medications + schedule/reminders | Functional, high user-impact surface | `mobile/app/medications.tsx`, `mobile/app/medication-schedule.tsx`, `functions/src/routes/medications.ts`, `functions/src/routes/medicationReminders.ts`, scheduled job in `functions/src/index.ts` |
| LumiBot nudges/check-ins | Functional and strategic, needs strict scope + metrics | `mobile/components/lumibot/LumiBotContainer.tsx`, `functions/src/routes/nudges.ts`, nudge schedulers in `functions/src/index.ts` |
| Health logs (manual + LumiBot) | Functional after HealthKit removal | `mobile/app/health.tsx`, `functions/src/routes/healthLogs.ts` |
| Caregiver sharing + care data | Present, needs end-to-end validation | `functions/src/routes/shares.ts`, `functions/src/routes/care.ts`, caregiver screens/routes |
| Notification reliability | Strong controls, needs regression coverage | `mobile/lib/notifications.ts`, `functions/src/routes/users.ts`, scheduler jobs in `functions/src/index.ts` |
| Observability + product analytics | Gap | mostly `console`/`functions.logger`; no product telemetry events found in first-party source |

## Execution Format

For each feature, run one 45-60 minute walkthrough using the same structure.

1. Scope and success criteria
2. Happy path demo (patient and caregiver if applicable)
3. Failure path tests (network, auth, missing data, duplicate actions)
4. Data integrity checks (Firestore docs, ownership, timestamp correctness)
5. Notification checks (correct user/device, no stale state)
6. UX quality checks (clarity, latency, recovery actions)
7. Evidence capture (screenshots/log snippets/endpoint responses)
8. Outcome score + fix list

## Scoring Rubric

Score each feature 0-3 per dimension (max 15):
1. Reliability
2. Data correctness
3. Account isolation/security
4. UX clarity/recovery
5. Observability

Status labels:
- 13-15: `Healthy`
- 10-12: `Needs hardening`
- 0-9: `At risk`

## Critical Flow Walkthrough Order

### 1) Account Lifecycle and Isolation (P0)
- Sign up -> sign in -> sign out -> sign in as different user on same device.
- Verify no cross-account data in visits/actions/meds/health logs.
- Verify no stale notifications/reminders from previous account.
- Verify push token ownership migration works as expected.

### 2) Daily Home Loop (P0)
- Open app -> assess quick overview -> act on next task.
- Validate card counts/statuses match backend truth.
- Validate home remains accessible during partial API/sync failures.

### 3) Visit Capture to Summary Delivery (P0)
- Record short and long visit, upload, process, and review detail screen.
- Validate processing state transitions (`pending` -> `transcribing` -> `summarizing` -> `completed|failed`).
- Validate retry behavior and duplicate-prevention expectations.

### 4) Medication Adherence Loop (P0)
- Create/edit/stop medication; add reminder times.
- Walk today schedule: taken, skipped, snoozed, mark-all.
- Validate reminder firing window and status updates.
- Validate stopped/deleted meds clear related nudges/reminders.

### 5) LumiBot Engagement Loop (P1 strategic)
- Verify nudge creation, surfacing, response handling, and smart follow-up/skip logic.
- Verify each nudge type maps to a core outcome (med adherence, action completion, health log capture).
- Verify no nudge spam and clear dismissal/snooze behavior.

### 6) Health Log Loop (manual + LumiBot) (P1)
- Create manual logs and nudge-driven logs.
- Verify unified display on health screen and home summary.
- Validate trend/alert behaviors do not block core navigation.

### 7) Caregiver Sharing and Care Dashboard Loop (P1)
- Invite caregiver (existing + non-existing account cases), accept invite, revoke access.
- Validate caregiver can access only authorized patient data.
- Validate portal reads med adherence/alerts consistently with mobile source data.

### 8) Failure-Recovery and Resilience Sweep (P0 gate)
- Simulate API failures, timeout, offline, and partial backend errors.
- Verify app never dead-ends; always provides a recovery path.
- Verify no cascading failure from one subsystem (e.g., sync failure blocking dashboard).

## Output Artifact Per Walkthrough

Use this template for every feature:

```
Feature:
Owner:
Date:
Score (0-15):
Status:

What worked:
- ...

What failed or is risky:
- ...

User impact:
- ...

Fixes (ranked):
- [P0] ...
- [P1] ...
- [P2] ...

Acceptance criteria for "fixed":
- ...
```

## Improvement Prioritization Rules

1. Fix anything causing wrong-user data/reminders first.
2. Then fix any issue that blocks primary loops (record visit, take meds, view dashboard).
3. Then reduce silent failures (missing alerts/telemetry/retry gaps).
4. Then polish UX and speed.
5. Only then add net-new feature scope.

## Two-Sprint Recommended Execution

### Sprint A (Stability)
1. Run flows 1-4 and 8.
2. Ship all P0 defects found.
3. Add missing guardrails/tests for account isolation + med reminders.

### Sprint B (Experience + Strategic)
1. Run flows 5-7.
2. Tighten LumiBot scope to core outcomes only.
3. Defer expanded product telemetry until HIPAA/BAA posture is finalized; rely on operational logs for this cycle.

## Definition of Done for this audit cycle

1. All 8 walkthroughs completed with artifacts.
2. Every P0 issue either fixed or explicitly risk-accepted.
3. A ranked backlog exists with owner + target release.
4. Regression checklist exists for the top 4 P0 loops.
5. Telemetry/analytics decision is explicitly documented (shipped or deferred with compliance rationale).
