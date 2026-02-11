# Core Feature Flow Walkthroughs

## Walkthrough 1

Feature: Account Lifecycle and Isolation
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 11/15
Status: Needs hardening

What worked:
- Push-token registration enforces one-device/one-owner behavior by removing stale tokens across users using token and optional `deviceId` matching.
- Logout path removes all tokens server-side and clears local notification state (scheduled, delivered, badge) before sign-out.
- Mobile launch runs best-effort cleanup for orphaned medication reminders and orphaned nudges.

What failed or is risky:
- React Query cache is global and not explicitly cleared on auth transitions; several SDK query keys are not user-scoped.
- Push token local storage key usage is split between `lumimd:lastExpoPushToken` and `lumimd:pushToken`, which can leave stale local token state paths.
- No explicit test coverage for account switch + token reassignment + stale reminder isolation behavior.

User impact:
- High confidence that wrong-account reminder leakage is much improved.
- Residual risk remains for stale cached data surfacing briefly after account switch, especially in non-realtime query paths.

Fixes (ranked):
- [P0] Clear/invalidate user-scoped query caches on auth state changes and scope remaining shared query keys by user/session.
- [P1] Normalize push-token local storage to one key path used by settings/auth/notifications.
- [P1] Add backend and mobile integration tests for account switch, token rotation (`previousToken` + `deviceId`), and logout cleanup.

Progress update (2026-02-10):
- Completed: auth transition cache clear in mobile auth context.
- Completed: push-token storage key normalization helpers with legacy-key migration.
- Completed: backend + mobile tests for account switch, token rotation payloads, logout cleanup, and collection-group fallback cleanup.

Acceptance criteria for "fixed":
- Switching A->B on the same device never shows A data/reminders after B login.
- Query cache contains no user A keyed data after user B login.
- Automated tests cover token migration, unregister-all on logout, and no cross-account reminder sends.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/users.ts:298`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/users.ts:315`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/users.ts:494`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/contexts/AuthContext.tsx:75`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/notifications.ts:23`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/settings.tsx:20`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/_layout.tsx:17`
- `/Users/tylermcanally/LumiMD/Codebase/packages/sdk/src/hooks/index.ts:21`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/medicationReminders.ts:366`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/nudges.ts:610`

## Walkthrough 2

Feature: Daily Home Loop
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 10/15
Status: Needs hardening

What worked:
- Home quick stats are driven by realtime user-scoped listeners for visits/actions/medications.
- Medication schedule data is refreshed on app foreground and invalidated when medications change.
- Primary CTA (record visit) and LumiBot section remain available on home.

What failed or is risky:
- Quick Overview fails as a single block: if any one of actions/visits/medications/profile errors, all overview cards are replaced by one generic error message.
- Home has no pull-to-refresh or explicit retry action, despite messaging that implies refresh.
- Home card counts are sourced from realtime Firestore hooks, while detail screens use API hooks with non-user-scoped keys, creating transient mismatch risk.
- Health snapshot card does not surface fetch errors distinctly (error can look like no-data state).

User impact:
- Users can still start a visit, but home overview can feel broken during partial outages and offers weak recovery affordances.
- Increased chance of trust erosion if card counts and destination-screen counts temporarily diverge.

Fixes (ranked):
- [P0] Make home resilient to partial failures: render each card independently and only degrade failed card(s), not whole section.
- [P0] Scope medication schedule/reminders and shared SDK query keys by user/session (or clear all on auth transition).
- [P1] Add home pull-to-refresh and explicit retry CTA tied to `refetch` of failed queries.
- [P1] Add explicit error state for health snapshot card separate from true empty state.
- [P2] Add product telemetry for `home_load_partial_failure`, `home_load_full_failure`, and per-card load latency.

Acceptance criteria for "fixed":
- One failing home datasource does not hide other healthy cards.
- User can manually refresh from home and recover without app restart.
- Card counts match destination screens after refresh and across account switches.
- Dashboard remains accessible when any optional data source fails.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/index.tsx:46`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/index.tsx:212`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/index.tsx:288`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/index.tsx:266`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/api/hooks.ts:40`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/api/hooks.ts:151`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/api/hooks.ts:416`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/_layout.tsx:154`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/actions.tsx:50`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/visits.tsx:46`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/medications.tsx:74`
- `/Users/tylermcanally/LumiMD/Codebase/packages/sdk/src/hooks/index.ts:21`

## Walkthrough 3

Feature: Visit Capture to Summary Delivery
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 12/15
Status: Needs hardening

What worked:
- Visit capture handles permission, interruption, and max-duration cases with clear user feedback.
- Pipeline has explicit stage transitions and resilient fallbacks: storage trigger -> webhook/polling -> summarization trigger.
- Retry path is available from visit detail and backend enforces retry pacing.
- Summarization writes core output + actions in a batch, and non-critical post-commit failures do not roll back completed summaries.
- Scheduled stale sweeper recovers stuck transcribing/summarizing states.

What failed or is risky:
- Visit detail has no explicit error/empty fallback when fetch fails; if `visit` is absent after load, UI can appear blank except header.
- If audio upload succeeds but visit creation fails, uploaded storage object is not cleaned up (orphaned file risk).
- Polling fallback checks only a capped batch (`limit(10)`) each minute, which can slow recovery under load.
- Test coverage is narrow for this flow (primarily `processVisitAudio`), with no explicit tests for webhook/polling/sweeper/retry endpoint interactions.

User impact:
- Core flow is mostly reliable and recoverable.
- During API failure or backlog spikes, users may see delayed or unclear recovery states.

Fixes (ranked):
- [P0] Add explicit non-loading/error fallback in visit detail with retry action when `visit` fetch fails.
- [P1] Add cleanup for uploaded audio when visit document creation fails after upload.
- [P1] Increase/partition transcription polling throughput beyond fixed `limit(10)`.
- [P1] Add integration tests for webhook + polling + stale sweeper + retry transitions.

Acceptance criteria for "fixed":
- Visit detail always shows either data, loading, or actionable error (never blank state).
- Failed create-after-upload attempts do not leave orphaned audio files.
- Backlogged transcriptions continue progressing without starvation.
- Integration tests validate state transitions through `pending -> transcribing -> summarizing -> completed|failed`.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/record-visit.tsx:154`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/record-visit.tsx:172`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/visit-detail.tsx:153`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/visit-detail.tsx:296`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/visits.ts:539`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/triggers/processVisitAudio.ts:103`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/webhooks.ts:53`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/triggers/checkPendingTranscriptions.ts:37`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/triggers/summarizeVisit.ts:34`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/services/visitProcessor.ts:62`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/triggers/staleVisitSweeper.ts:164`

## Walkthrough 4

Feature: Medication Adherence Loop
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 10/15
Status: Needs hardening

What worked:
- Medication create/update paths keep reminders in sync (auto-create defaults, name/dose/frequency propagation).
- Stop/delete paths cascade cleanup to reminders and nudges.
- Today schedule computes taken/skipped/pending/overdue with user-timezone handling and date-guard checks.
- Reminder scheduler is timezone-aware and has duplicate suppression (`lastSentAt`, lock window, taken/skipped log suppression).
- Mobile schedule screen supports pull-to-refresh and clear status actions.

What failed or is risky:
- Snooze behavior is not end-to-end: mobile snooze calls API only, API stores `snoozed` log, but reminder processor suppression checks only `taken|skipped`; `snoozeMinutes` is not honored in send suppression logic.
- `medicationSchedule` and `medicationReminders` query keys are global (not user-scoped), which can allow transient stale state on account switch.
- Mark endpoints are non-idempotent; repeated taps create duplicate logs for the same dose/time.

User impact:
- Core taken/skip loop works.
- Snooze can feel unreliable/inconsistent with user expectation, especially for 15 vs 60 minute snoozes.
- Account-switch edge cases can temporarily show stale schedule/reminder state.

Fixes (ranked):
- [P0] Implement true snooze semantics in reminder send logic (respect `snoozeUntil` per medication/time) or schedule deterministic local reminder + suppress server sends until expiry.
- [P0] Scope medication schedule/reminder query keys by user/session (or clear cache on auth transition).
- [P1] Add idempotency guard for mark/mark-batch per `medicationId + scheduledTime + scheduledDate`.
- [P1] Add tests for snooze timing, duplicate suppression, and account-switch cache isolation.

Acceptance criteria for "fixed":
- Snoozing for 15/30/60 reliably delays reminders by exactly that window.
- No stale medication schedule/reminder data appears after account switch.
- Repeated mark taps do not create duplicate logs for the same intended dose.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/medication-schedule.tsx:92`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/notifications.ts:218`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/api/hooks.ts:416`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/api/hooks.ts:344`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/medications.ts:276`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/medications.ts:535`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/medications.ts:846`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/medications.ts:1063`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/medications.ts:1226`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/services/medicationReminderService.ts:271`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/services/medicationReminderService.ts:314`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/index.ts:224`

## Walkthrough 5

Feature: LumiBot Engagement Loop
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 11/15
Status: Needs hardening

What worked:
- LumiBot renders only when nudges exist, keeping home focused while still surfacing proactive guidance.
- Nudge responses support structured options and free-text interpretation with AI, including follow-up generation.
- Nudge notification pipeline enforces quiet hours, daily caps, and token hygiene.
- Condition/medication generation includes baseline dedupe and spacing logic to reduce nudge clustering.

What failed or is risky:
- Follow-up priority mapping drift: generated nudge type is `followup`, but notification priority map keyed `follow_up`, reducing intended follow-up prioritization under daily limits.
- Realtime mobile filter excluded due `snoozed` nudges, so snoozed items could fail to resurface in-app until backend status mutation occurred.
- Dedupe checks treated only `pending|active` as “existing,” allowing duplicate sequences when prior nudges were `snoozed`.
- SDK `NudgeType` model drift (missing `followup`) created type/contract mismatch risk between backend and mobile/web consumers.

User impact:
- Core LumiBot loop is functional, but response quality and trust can degrade when follow-ups are deprioritized or snoozed nudges don’t reappear as expected.
- Duplicate sequence risk increases perceived nudge spam for users who snooze rather than dismiss.

Fixes (ranked):
- [P0] Align nudge type contracts and notification priority mapping for follow-up nudges.
- [P0] Ensure due snoozed nudges re-enter visible queue in realtime client filtering.
- [P1] Include `snoozed` status in dedupe/active checks for generation and Personal RN gating.
- [P1] Add targeted tests for nudge priority ordering and snoozed reactivation visibility.
- [P2] Add product telemetry for nudge lifecycle (`shown`, `snoozed`, `dismissed`, `responded`, `followup_created`).

Acceptance criteria for "fixed":
- `followup` nudges are always treated as highest-priority nudges in send arbitration.
- Snoozed nudges reliably resurface after `snoozedUntil` elapses without requiring app restart.
- Snoozed outstanding nudges prevent duplicate generation for same condition/medication sequence.
- Shared SDK/backend nudge enums remain in lockstep.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/mobile/lib/api/hooks.ts:250`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/components/lumibot/LumiBotContainer.tsx:49`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/nudges.ts:185`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/nudges.ts:355`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/services/lumibotAnalyzer.ts:42`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/services/lumibotAnalyzer.ts:94`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/services/nudgeNotificationService.ts:40`
- `/Users/tylermcanally/LumiMD/Codebase/packages/sdk/src/models/lumibot.ts:7`

## Walkthrough 6

Feature: Health Log Loop (manual + LumiBot)
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 11/15
Status: Needs hardening

What worked:
- Manual logging flow is straightforward and supports BP, glucose, and weight with immediate UX confirmation.
- Health logs are unified across manual and LumiBot sources in a single collection and surfaced in one screen.
- Safety checks and symptom screening are integrated in log creation, with follow-up/escalation hooks for elevated readings.
- Health log API supports deduplication for source IDs and step-count updates.

What failed or is risky:
- Trend-insight pipeline bug: trend preprocessing read `data.data` instead of `data.value`, which can suppress expected insight generation.
- Health screen lacked explicit API-error state, allowing fetch failures to appear as “no data yet.”
- Health logs and summaries still rely on generic SDK query keys; cache clearing now mitigates account switching, but key-level session scoping remains a long-term hardening item.
- No product telemetry currently captures health-log funnel drops (open -> log -> save -> follow-up).

User impact:
- Core logging works, but users can lose trust when failed fetches look like empty state or when trend nudges don’t appear despite sufficient data.

Fixes (ranked):
- [P0] Correct trend analysis preprocessing to use stored `value` payload.
- [P0] Add explicit health-screen load-failure state with retry affordance.
- [P1] Add targeted tests for trend insight trigger conditions and dedupe/update behavior.
- [P1] Add session-scoped health query keys in shared hooks (or maintain strict cache clear invariants).
- [P2] Add telemetry for health-log completion and trend insight generation outcomes.

Acceptance criteria for "fixed":
- Eligible BP/glucose/weight patterns produce expected insight nudges.
- Health screen distinguishes loading, error, and true-empty states.
- Cross-account switch does not surface stale health logs/summaries.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/health.tsx:204`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/health.tsx:395`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/healthLogs.ts:113`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/healthLogs.ts:137`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/healthLogs.ts:307`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/services/trendAnalyzer.ts:27`
- `/Users/tylermcanally/LumiMD/Codebase/packages/sdk/src/hooks/index.ts:30`

## Walkthrough 7

Feature: Caregiver Sharing and Care Dashboard Loop
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 10/15
Status: Needs hardening

What worked:
- Share and care routes consistently enforce authenticated access checks before returning patient data.
- Token-based invite flow supports secure acceptance with email verification and caregiver role assignment.
- Care dashboard and patient detail surfaces combine medication, action, visit, and alert signals into one caregiver workspace.

What failed or is risky:
- Action due-date drift: caregiver routes mixed `dueDate` and canonical `dueAt`, suppressing overdue-action detection and export due-date correctness.
- Invite-email drift: legacy invites use `inviteeEmail`, while newer routes use `caregiverEmail`; compatibility gaps can block older invite links.
- Care dashboard “Needs Attention” panel used hooks inside a dynamic `.map`, which risks hook-order runtime failures when shared-patient count changes.
- Web portal query cache previously persisted across auth-user transitions, increasing stale cross-account data risk.
- Mobile caregiver-sharing screen is still mock-data-driven but exposed from settings as a production flow.

User impact:
- Caregivers can miss overdue action risk signals and experience unstable dashboard behavior in account/share edge cases.
- Some invitation links can fail for valid users when field-version mismatches occur.
- Mobile users can enter a caregiver-sharing screen that does not reflect live backend state.

Fixes (ranked):
- [P0] Normalize caregiver action due-date handling to canonical `dueAt` across quick overview, alerts helpers, and export payloads.
- [P0] Replace hook-in-loop alert fetching with a single `useQueries` pattern to keep hook ordering stable.
- [P0] Add backward-compatible invite email resolution (`caregiverEmail` + `inviteeEmail`) for invite-info and token acceptance paths.
- [P1] Apply caregiver-email fallback in care overview share lookup and backfill missing `caregiverUserId` when possible.
- [P1] Clear web query cache when auth user changes to prevent stale caregiver/patient data leakage.
- [P1] Replace or hide mobile mock caregiver-sharing flow until it is API-backed.

Acceptance criteria for "fixed":
- Legacy and new invite links both render recipient email and can be accepted by the matching account.
- Overdue actions consistently appear in caregiver quick overview/alerts when `dueAt` is in the past.
- Care dashboard remains stable when shared-patient count changes during refreshes.
- Switching caregiver accounts on web does not display previous account patient data.
- Mobile caregiver-sharing entry reflects real invite/share state or is explicitly gated.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/actions.ts:29`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/care.ts:22`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/care.ts:278`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/care.ts:1871`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/shares.ts:31`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/shares.ts:834`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/routes/shares.ts:1085`
- `/Users/tylermcanally/LumiMD/Codebase/web-portal/app/care/page.tsx:161`
- `/Users/tylermcanally/LumiMD/Codebase/web-portal/components/providers/query-provider.tsx:33`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/settings.tsx:294`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/caregiver-sharing.tsx:14`

## Walkthrough 8

Feature: Failure-Recovery and Resilience Sweep
Owner: Product + Engineering
Date: 2026-02-10
Score (0-15): 9/15
Status: At risk

What worked:
- Global app-level ErrorBoundary exists with query cache reset capability.
- Most detail screens (visits/actions/medications/schedule) include pull-to-refresh and basic error affordances.
- Backend has multiple resilience layers for visit processing (webhook + polling + stale sweeper + retry endpoint).

What failed or is risky:
- Home quick overview is all-or-nothing: any single source error hides all overview cards.
- Home has no explicit retry/pull-to-refresh affordance despite being primary recovery entry point.
- Visit detail does not render actionable fallback when load fails and `visit` is undefined after loading.
- Mixed realtime + non-user-scoped API cache keys increase stale-state risk after auth transitions.

User impact:
- Partial failures can still degrade core navigation confidence and create “dashboard feels broken” experiences.
- Recovery path quality is inconsistent between root/home and detail screens.

Fixes (ranked):
- [P0] Refactor home overview to per-card failure isolation so one data failure does not blank the section.
- [P0] Add explicit home-level retry control (and/or pull-to-refresh) that refetches all critical home queries.
- [P0] Add visit-detail explicit error state with retry and back-home action when fetch fails.
- [P1] Align query key scoping across SDK/mobile hooks to prevent cross-session stale reads.
- [P1] Add telemetry for partial/full dashboard failure and recovery attempts.

Acceptance criteria for "fixed":
- One failing datasource no longer blocks other home cards.
- Users can always retry from home and from visit detail without app restart.
- Account transitions do not leak stale state into badges/cards/schedule.

Evidence references:
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/index.tsx:212`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/index.tsx:288`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/index.tsx:266`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/visit-detail.tsx:296`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/_layout.tsx:17`
- `/Users/tylermcanally/LumiMD/Codebase/mobile/app/_layout.tsx:191`
- `/Users/tylermcanally/LumiMD/Codebase/packages/sdk/src/hooks/index.ts:21`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/triggers/checkPendingTranscriptions.ts:27`
- `/Users/tylermcanally/LumiMD/Codebase/functions/src/triggers/staleVisitSweeper.ts:164`
