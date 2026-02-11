# Health Data Model + HealthKit Reimplementation Plan

> Status (2026-02-11): **Deferred**. HealthKit is currently removed from the shipping app runtime.
> Prior WIP code is archived under `mobile/_archived/healthkit-v2/` and intentionally excluded from builds.
> This document is retained for a future reintroduction.

## 1) Current Health Data Model (as implemented)

### Canonical storage
- Collection: `healthLogs`
- Unified sources in one stream: `manual`, `nudge`, `quick_log`, `healthkit`
- Core fields used by app + backend:
  - `type` (bp, glucose, weight, heart_rate, oxygen_saturation, steps)
  - `value` (typed payload)
  - `source`
  - `createdAt` (reading timestamp)
  - `syncedAt` (server ingest timestamp)
  - `sourceId` (optional dedupe key)
  - `nudgeId` (optional link for LumiBot completion)

### Producers today
- Manual entry: health screen + logging modals.
- LumiBot/nudge: chat prompt responses persisted as health logs with `source: nudge`.
- HealthKit: removed from active mobile runtime and native config in this cleanup.

### API behavior to preserve
- Server-side `sourceId` dedupe.
- Special handling for steps (update when newer/higher count semantics apply).
- `recordedAt` support so imported samples preserve measurement time.

## 2) Why the prior integration became unreliable

- Authorization state and app UI state drifted; app could display connected while Health permissions were revoked.
- Sync scheduling mixed app lifecycle timers with permission checks and did not guarantee deterministic cursor advancement.
- HealthKit cursor state was local-device only and not explicitly partitioned by authenticated user.
- Error telemetry did not expose where failures happened (permission, read, transform, upload, dedupe).

## 3) Clean Reimplementation Design

### A. Scope and principles
- Rebuild HealthKit as an isolated module with explicit boundaries:
  - `permissions.ts`
  - `queries.ts`
  - `normalizers.ts`
  - `syncEngine.ts`
  - `syncStateStore.ts`
- Keep backend model unified (`healthLogs`) so manual, LumiBot, and HealthKit stay query-compatible.

### B. Per-user sync state (required)
- Store sync state under user-scoped keys:
  - `lumimd:healthkit:<uid>:enabled`
  - `lumimd:healthkit:<uid>:cursor:<metric>`
  - `lumimd:healthkit:<uid>:lastSyncAt`
- On sign-out:
  - clear all local HealthKit sync state for signed-out uid.
  - cancel active sync jobs/listeners.

### C. Permission lifecycle
- Build explicit states: `unavailable`, `notDetermined`, `authorized`, `denied`.
- On app foreground and before every sync:
  - re-check authorization.
  - if denied/revoked: disable sync flag and surface disconnected UI.
- Never rely on stale local “connected” toggles without fresh permission probe.

### D. Deterministic sync engine
- Trigger sync only from explicit events:
  - user taps Connect/Sync
  - app foreground (debounced)
  - optional periodic background task when available
- Per metric flow:
  1. Load cursor.
  2. Query HealthKit in `[cursor, now]` window.
  3. Normalize sample -> API payload.
  4. Create stable `sourceId` (metric + sample UUID/startDate/endDate).
  5. POST batch sequentially or in bounded concurrency.
  6. Advance cursor only after successful upload/ack.
- If partial failure occurs, do not advance cursor past failed window.

### E. Data quality rules
- Unit normalization before upload (single canonical unit per metric).
- Reject invalid samples (NaN, impossible values).
- Preserve original sample timestamps in `recordedAt`.
- Steps handling:
  - daily aggregate uses explicit day bucket and timezone-safe boundaries.

### F. Observability
- Add structured logs/events for each phase:
  - permissionCheck
  - queryStart/queryComplete
  - transformError
  - uploadSuccess/uploadError
  - cursorAdvance
- Include `uid`, metric, sampleCount, durationMs, and failure reason.

## 4) Rollout Plan

1. Phase 0: Keep HealthKit disabled in runtime (this change).
2. Phase 1: Implement new module behind feature flag `healthkit_v2`.
3. Phase 2: Internal dogfood with verbose telemetry.
4. Phase 3: Small TestFlight cohort; validate 7-day sync reliability and permission revocation behavior.
5. Phase 4: Gradual rollout; remove legacy compatibility paths.

## 5) Test Plan (must-pass before rollout)

- Permission tests:
  - fresh install authorize
  - revoke in Health app while LumiMD is backgrounded
  - reopen app reflects disconnected state
- Account isolation tests:
  - user A signs in and syncs
  - sign out
  - user B signs in
  - verify no user A cursor/state reused
- Sync correctness tests:
  - duplicate prevention via `sourceId`
  - cursor resumes after app restart
  - partial failure retries without data loss
- Regression tests:
  - manual and LumiBot logging unaffected
  - health details screen still renders unified stream

## 6) OTA vs native build constraints

- Requires new native build when adding/changing:
  - `react-native-health` dependency
  - iOS HealthKit entitlements
  - iOS `Info.plist` permission strings
  - Expo config plugin/native module wiring
- OTA can ship JS-only logic fixes after native capabilities are already present in installed binary.
