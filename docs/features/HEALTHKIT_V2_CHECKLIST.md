# HealthKit V2 Implementation Checklist (Deferred)

Status (2026-02-11): **Deferred**.

- HealthKit is intentionally removed from the active mobile runtime and native config.
- Prior WIP code is archived under:
  - `mobile/_archived/healthkit-v2/`
  - `mobile/_archived/plugins/withHealthKit.js`

Use this checklist when HealthKit is reintroduced.

## Ship Gates (must-pass)
- [ ] No duplicate imports for the same HealthKit sample (`sourceId` idempotent).
- [ ] No cross-account sync state leakage after sign-out/sign-in account switch.
- [ ] Revoked permissions are reflected in app state on next foreground.
- [ ] Cursor only advances after successful upload of the covered window.
- [ ] Manual and LumiBot logging flows remain unchanged.
- [ ] Sync failures never block core navigation (home, meds, visits).

## Phase 1: Foundation (JS-only)
- [ ] Implement isolated module boundaries (permissions/queries/normalizers/sync engine/state store).
- [ ] Feature flag gate (default OFF).
- [ ] Per-user local sync state keys + sign-out cleanup hooks.

## Phase 2: Permission + State Reliability
- [ ] Permission probe states: `unavailable`, `notDetermined`, `authorized`, `denied`.
- [ ] Re-check permissions on app foreground and before every sync.
- [ ] If permission is revoked, force disconnected UI/state (do not show “connected” based on stale local flags).

## Phase 3: Deterministic Sync Engine
- [ ] Single-flight sync lock per user.
- [ ] Per-metric cursor windows (`[cursor, now]`) with bounded retries.
- [ ] Stable `sourceId` generation strategy (metric + UUID + timestamps).
- [ ] Cursor advancement only on successful upload/ack.
- [ ] Stage-level structured logs (permission, query, transform, upload, cursor advance).

## Phase 4: Native Reintroduction (requires new build)
- [ ] Add/restore native dependency (HealthKit bridge).
- [ ] Add iOS HealthKit entitlements + Info.plist permission strings.
- [ ] Add Expo config plugin/native wiring.

## Phase 5: Internal Validation (TestFlight)
- [ ] Account switch test (A -> sign out -> B) with no state bleed.
- [ ] Permission revoke/restore test.
- [ ] Offline/online retry test.
- [ ] 7-day reliability soak (imports remain current and deduped).

## Notes
- OTA can ship JS-only logic updates only after the installed binary already includes HealthKit native support.
- Native capability changes require an EAS build + TestFlight distribution.
