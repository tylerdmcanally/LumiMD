# Core Feature Flow Audit: Execution Status

Date: 2026-02-11
Owner: Product + Engineering
Source docs:
- `/Users/tylermcanally/LumiMD/Codebase/docs/features/CORE_FEATURE_FLOW_AUDIT_PLAN.md`
- `/Users/tylermcanally/LumiMD/Codebase/docs/features/CORE_FEATURE_FLOW_WALKTHROUGHS.md`

## Status by Walkthrough

### 1) Account Lifecycle and Isolation
- [x] P0 cache clear on auth user transition.
- [x] P1 push-token local storage normalization (single canonical key + migration).
- [x] P1 backend/mobile coverage for account switch + token rotation + logout cleanup.
- [x] Additional backend fallback-path test for push-token cleanup when collection-group lookup fails.
Status: Complete for current scope.

### 2) Daily Home Loop
- [x] P0 per-card failure isolation (no all-or-nothing quick overview failure).
- [x] P0 session-scoped medication schedule/reminder query keys plus auth cache-clear guardrail.
- [x] P1 pull-to-refresh + retry affordances wired to refetch.
- [x] P1 explicit error state for health snapshot card.
- [~] P2 telemetry depth expanded internally (partial/full failure + recovery events present), but production transport remains disabled for PHI safety.
Status: P0/P1 complete, P2 deferred for production rollout.

### 3) Visit Capture to Summary Delivery
- [x] P0 visit-detail explicit error fallback + retry + back-home action.
- [x] P1 cleanup of uploaded audio on create-after-upload failure.
- [x] P1 polling throughput hardening (`limit(25)` with paging up to `MAX_VISITS_PER_RUN`).
- [x] P1 orchestration coverage added for webhook route, polling decision logic, stale sweeper recovery helpers, and retry endpoint transitions.
Status: P0/P1 complete.

### 4) Medication Adherence Loop
- [x] P0 true snooze semantics in reminder processor using `snoozed` logs and `snoozeUntil`.
- [x] P0 user/session-scoped medication schedule/reminder query keys.
- [x] P1 idempotent upsert behavior for mark/mark-batch paths.
- [x] P1 route-level tests for repeated mark calls and duplicate mark-batch input suppression.
- [~] P1 account-switch cache-isolation scenarios can still be expanded in medication-focused tests.
Status: P0 complete, P1 complete for core idempotency scope.

### 5) LumiBot Engagement Loop
- [x] P0 nudge type contract alignment (`followup`) + notification priority mapping compatibility.
- [x] P0 due snoozed nudges re-enter realtime visible queue.
- [x] P1 include `snoozed` in dedupe/active checks for generation/gating.
- [x] P1 targeted tests for priority ordering and snoozed reactivation visibility.
- [~] P2 lifecycle telemetry (`shown/snoozed/dismissed/responded/followup_created`) deferred pending HIPAA-safe analytics posture and BAA confirmation.
Status: P0/P1 complete, P2 deferred.

### 6) Health Log Loop
- [x] P0 trend preprocessing corrected to use stored `value` payload.
- [x] P0 explicit health-screen load-failure state + retry affordance.
- [x] P1 targeted tests for trend insight triggers and dedupe behavior.
- [x] P1 session-scoped health query keys in mobile hooks.
- [~] P2 telemetry for health-log funnel + trend-generation outcomes deferred pending HIPAA-safe analytics posture and BAA confirmation.
Status: P0/P1 complete, P2 deferred.

### 7) Caregiver Sharing and Care Dashboard Loop
- [x] P0 due-date handling normalized to canonical `dueAt` for action risk surfacing/exports.
- [x] P0 hook-in-loop risk removed with stable `useQueries` pattern.
- [x] P0 backward-compatible invite email resolution (`caregiverEmail` + `inviteeEmail`).
- [x] P1 web query cache clear on auth-user transitions.
- [x] P1 mobile caregiver-sharing flow now API-backed (not mock).
- [x] P1 caregiver share fallback/backfill regression coverage added for legacy email-only share docs.
Status: P0/P1 complete.

### 8) Failure-Recovery and Resilience Sweep
- [x] P0 home failure isolation and recovery controls.
- [x] P0 visit-detail load-failure fallback and recovery actions.
- [x] P1 query-key scoping + auth-transition cache clear guardrails.
- [x] P1 dashboard failure/recovery telemetry events implemented.
Status: Complete for current scope.

## Remaining Work Plan

### Phase A: Close Remaining P1 Test Gaps
1. [x] Add route-level tests for medication mark idempotency:
   - Repeat `POST /v1/meds/schedule/mark` on same dose/time/date does not create duplicates.
   - Duplicate entries inside `mark-batch` are ignored and response reports `duplicateInputsIgnored`.
2. [x] Add integration-style visit pipeline tests for orchestration edges:
   - webhook-complete -> summarize transition.
   - polling fallback decision coverage remains in trigger tests.
   - stale sweeper recovery + retry endpoint interaction.
3. [x] Add caregiver legacy-data regression fixtures:
   - invite acceptance using `inviteeEmail`-only docs.
   - care overview lookup when `caregiverUserId` missing but `caregiverEmail` present.

### Phase B: P2 Observability Decision (deferred this cycle)
Decision date: 2026-02-11
1. [x] Do not ship third-party analytics/consumer tracking SDKs in PHI-facing flows.
2. [x] Keep `EXPO_PUBLIC_ANALYTICS_ENABLED` disabled in production builds.
3. [x] Defer expanded product telemetry until HIPAA/BAA posture is finalized.
4. [ ] Re-open after compliance sign-off with a first-party, PHI-safe event model.

### Phase C: Final Audit Closure
1. [~] Run smoke across top P0 loops:
   - account switch/reminder isolation,
   - home recovery from partial failure,
   - visit retry recovery,
   - medication snooze timing.
   Progress: automated pre-check suites passed and live `lumimd-dev` polling/sweeper logs verified; device/manual checks still pending.
2. [ ] Re-score walkthroughs and mark residual items either:
   - fixed,
   - deferred with explicit risk acceptance.
3. [ ] Freeze release checklist for backend deploy + mobile build.

## Proposed “Done” Gate for This Cycle
- [x] All remaining P1 tests in Phase A merged and green.
- [ ] No open P0 defects.
- [x] P2 telemetry explicitly risk-accepted/deferred for this cycle.
- [~] Manual smoke checklist in progress on `lumimd-dev` (automated + backend log checks complete; device checks pending).
