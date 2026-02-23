# LumiMD Reviewer Remediation Overview

## Purpose
This document tracks remediation progress against the external code review so we can walk through fixes with the reviewer.

## Reviewer Quick Read (High-Level)
- Cross-check result (2026-02-23): all original review findings are now mapped and addressed (`16/16`).
- Current risk posture: no open remediation gaps remain in the original P0/P1 scope.
- Detailed implementation and test evidence remains below for deep dive review.

| Focus Area | Original Review Items | High-Level Outcome |
|---|---|---|
| Patient safety and security controls | `#1, #2, #3, #5, #14` | Reminder timing safety, caregiver authorization, sanitization hardening, centralized auth guards, and transactional boundaries are implemented with route/service coverage and regression tests. |
| Data integrity and lifecycle | `#9, #13` | Denormalization sync + scheduled backfill (owner + caregiver + medication fields) and soft-delete/restore/retention/audit workflows are in place. |
| Scale and performance | `#6, #7, #8, #11, #12, #16` | Cursor pagination, share-access caching, compression, N+1 query reductions, index coverage guardrails, and response cache headers are implemented across key read surfaces. |
| Architecture and maintainability | `#4, #10, #15` | Repository/domain boundaries are established, large route files are modularized, and service layer separation is in place across remediation-scope paths. |

## Suggested Reviewer Walkthrough (30-45 Minutes)
1. Validate patient safety and authorization paths.
   Key checks: medication timing preference + backfill ops status, caregiver read access to shared visit data, and centralized auth guard behavior.
2. Validate data consistency and deletion lifecycle behavior.
   Key checks: denormalization sync/backfill behavior and soft-delete plus restore-audit workflows.
3. Validate scale/performance controls.
   Key checks: pagination headers (`X-Has-More`, `X-Next-Cursor`), cache headers (`Cache-Control`), share lookup caching, and compression middleware.
4. Validate architectural refactor outcomes.
   Key checks: route modularization boundaries and repository/domain mediation for data access.

## Quick Verification Commands
- `npm run test:remediation-guardrails` (in `functions/`)
- `TMPDIR=/Users/tylermcanally/LumiMD/Codebase/functions/.tmp npx jest src/routes/__tests__ --no-cache` (in `functions/`)
- `npm run build` (in `functions/`, `web-portal/`, and `packages/sdk/`) and `npx tsc --noEmit` (in `mobile/`)

## Current Build State
- Backend TypeScript build: passing (`npm run build` in `functions/`).
- Web portal production build: passing (`npm run build` in `web-portal/`).
- Web portal test suite: passing (`npm test` in `web-portal/`).
- Mobile TypeScript check: passing (`npx tsc --noEmit` in `mobile/`).
- Shared SDK build: passing (`npm run build` in `packages/sdk/`).
- Mobile test suite: passing (`npm test` in `mobile/`).
- Newly added authorization tests: passing (`npm test -- visits.access.test.ts` in `functions/`).
- Share invite transaction tests: passing (`npm test -- shares.invites.test.ts` in `functions/`).
- Visit processor post-commit transaction-state tests: passing (`npm test -- visitProcessor.caregiverAutoShare.test.ts` in `functions/`).
- Visit post-commit recovery service tests: passing (`npm test -- visitPostCommitRecoveryService.test.ts` in `functions/`).
- Post-commit recovery domain migration tests: passing (`npm test -- src/services/__tests__/visitPostCommitRecoveryService.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` in `functions/`).
- Patient medical context repository bridge tests: passing (`npm test -- src/services/__tests__/patientMedicalContext.repositoryBridge.test.ts` in `functions/`).
- Notifications repository bridge tests: passing (`npm test -- src/services/__tests__/notifications.repositoryBridge.test.ts` in `functions/`).
- Medication safety repository bridge tests: passing (`npm test -- src/services/__tests__/medicationSafety.repositoryBridge.test.ts` in `functions/`).
- Medication safety AI cache repository bridge tests: passing (`npm test -- src/services/repositories/medicationSafetyCache/__tests__/FirestoreMedicationSafetyCacheRepository.test.ts src/services/__tests__/medicationSafetyAI.repositoryBridge.test.ts` in `functions/`).
- External drug-data cache repository bridge tests: passing (`npm test -- src/services/repositories/externalDrugSafetyCache/__tests__/FirestoreExternalDrugSafetyCacheRepository.test.ts src/services/__tests__/externalDrugData.repositoryBridge.test.ts src/services/__tests__/externalDrugData.test.ts` in `functions/`).
- Soft-delete retention repository bridge tests: passing (`npm test -- src/services/repositories/softDeleteRetention/__tests__/FirestoreSoftDeleteRetentionRepository.test.ts src/services/__tests__/softDeleteRetentionService.repositoryBridge.test.ts src/services/__tests__/softDeleteRetentionService.test.ts` in `functions/`).
- Restore-audit repository bridge tests: passing (`npm test -- src/services/repositories/restoreAudit/__tests__/FirestoreRestoreAuditRepository.test.ts src/services/__tests__/restoreAuditService.repositoryBridge.test.ts src/routes/__tests__/users.restoreAudit.test.ts` in `functions/`).
- Medication-sync repository bridge tests: passing (`npm test -- src/services/repositories/medicationSync/__tests__/FirestoreMedicationSyncRepository.test.ts src/services/__tests__/medicationSync.repositoryBridge.test.ts src/services/__tests__/medicationSync.test.ts` in `functions/`).
- Caregiver-email log repository tests: passing (`npm test -- src/services/repositories/caregiverEmailLogs/__tests__/FirestoreCaregiverEmailLogRepository.test.ts` in `functions/`).
- Visit action-sync repository tests: passing (`npm test -- src/services/repositories/visitActionSync/__tests__/FirestoreVisitActionSyncRepository.test.ts` in `functions/`).
- Visit post-commit escalation operator route tests: passing (`npm test -- visits.postCommitEscalations.test.ts` in `functions/`).
- Visit post-commit escalation reporting service tests: passing (`npm test -- postCommitEscalationReportingService.test.ts` in `functions/`).
- Medication reminder timing tests: passing (`npm test -- medicationReminderService.test.ts` in `functions/`).
- Medication reminder timing backfill ops status route tests: passing (`npm test -- src/routes/__tests__/medicationReminders.opsStatus.test.ts` in `functions/`).
- Maintenance-state repository bridge tests: passing (`npm test -- src/services/repositories/maintenanceState/__tests__/FirestoreMaintenanceStateRepository.test.ts src/services/__tests__/medicationReminderService.test.ts` in `functions/`).
- Care overview batching tests: passing (`npm test -- care.overview.test.ts` in `functions/`).
- Care summary query-reuse tests: passing (`npm test -- care.summary.test.ts` in `functions/`).
- Care medication-status query-reuse tests: passing (`npm test -- care.medicationStatus.test.ts` in `functions/`).
- Care quick-overview query-optimization tests: passing (`npm test -- care.quickOverview.test.ts` in `functions/`).
- Care alerts query-reuse tests: passing (`npm test -- care.alerts.test.ts` in `functions/`).
- Care aggregate filter tests: passing (`npm test -- care.aggregateFilters.test.ts` in `functions/`).
- Care share-cache tests: passing (`npm test -- care.acceptedSharesFallback.test.ts` in `functions/`).
- Input sanitization utility tests: passing (`npm test -- inputSanitization.test.ts` in `functions/`).
- Medication delete cascade transaction test: passing (`npm test -- medications.deleteCascade.test.ts` in `functions/`).
- Medication reminder travel-timezone processor tests: passing (`npm test -- medicationReminderService.process.test.ts` in `functions/`).
- Medication reminder processor repository bridge tests: passing (`npm test -- src/services/repositories/medicationReminderProcessing/__tests__/FirestoreMedicationReminderProcessingRepository.test.ts src/services/__tests__/medicationReminderService.repositoryBridge.test.ts` in `functions/`).
- Actions sanitization route tests: passing (`npm test -- actions.sanitization.test.ts` in `functions/`).
- Visits sanitization route tests: passing (`npm test -- visits.sanitization.test.ts` in `functions/`).
- Health logs sanitization route tests: passing (`npm test -- healthLogs.sanitization.test.ts` in `functions/`).
- Nudges sanitization route tests: passing (`npm test -- nudges.sanitization.test.ts` in `functions/`).
- Medication logs sanitization route tests: passing (`npm test -- medicationLogs.sanitization.test.ts` in `functions/`).
- Medication reminder debug notification sanitization tests: passing (`npm test -- src/routes/__tests__/medicationReminders.debugSanitization.test.ts` in `functions/`).
- Nudges debug route sanitization tests: passing (`npm test -- src/routes/__tests__/nudgesDebug.sanitization.test.ts` in `functions/`).
- Actions pagination route tests: passing (`npm test -- actions.pagination.test.ts` in `functions/`).
- Visits pagination route tests: passing (`npm test -- visits.pagination.test.ts` in `functions/`).
- Medications pagination route tests: passing (`npm test -- medications.pagination.test.ts` in `functions/`).
- Care pagination route tests: passing (`npm test -- care.pagination.test.ts` in `functions/`).
- Users profile sanitization route tests: passing (`npm test -- users.profileSanitization.test.ts` in `functions/`).
- Actions soft-delete route tests: passing (`npm test -- actions.softDelete.test.ts` in `functions/`).
- Health logs soft-delete route tests: passing (`npm test -- healthLogs.softDelete.test.ts` in `functions/`).
- Care tasks soft-delete route tests: passing (`npm test -- care.tasks.softDelete.test.ts` in `functions/`).
- Medication reminders soft-delete route tests: passing (`npm test -- medicationReminders.softDelete.test.ts` in `functions/`).
- Visits restore route tests: passing (`npm test -- visits.restore.test.ts` in `functions/`).
- Medications restore route tests: passing (`npm test -- medications.restore.test.ts` in `functions/`).
- Soft-delete retention service tests: passing (`npm test -- softDeleteRetentionService.test.ts` in `functions/`).
- Users restore-audit operator route tests: passing (`npm test -- users.restoreAudit.test.ts` in `functions/`).
- Users caregivers list route tests: passing (`npm test -- users.caregiversList.test.ts` in `functions/`).
- Users caregiver-revoke route tests: passing (`npm test -- users.caregiverRevoke.test.ts` in `functions/`).
- Users delete-account route tests: passing (`npm test -- users.deleteAccount.test.ts` in `functions/`).
- Nudges history route tests: passing (`npm test -- nudges.history.test.ts` in `functions/`).
- Care visit metadata sanitization route tests: passing (`npm test -- care.visitMetadata.sanitization.test.ts` in `functions/`).
- Domain service foundation tests: passing (`npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` in `functions/`).
- Actions domain/read migration tests: passing (`npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts src/routes/__tests__/actions.pagination.test.ts src/routes/__tests__/actions.softDelete.test.ts src/routes/__tests__/actions.sanitization.test.ts` in `functions/`).
- Patient context aggregator repository bridge tests: passing (`npm test -- src/services/__tests__/patientContextAggregator.repositoryBridge.test.ts src/services/__tests__/personalRNService.repositoryBridge.test.ts src/services/__tests__/conditionReminderService.repositoryBridge.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` in `functions/`).
- Nudge notification repository bridge tests: passing (`npm test -- src/services/__tests__/nudgeNotificationService.test.ts src/services/__tests__/nudgeNotificationService.processing.test.ts src/services/__tests__/nudgeNotificationService.repositoryBridge.test.ts` in `functions/`).
- Share access domain migration tests: passing (`npm test -- src/services/__tests__/domainServices.test.ts src/routes/__tests__/care.acceptedSharesFallback.test.ts src/routes/__tests__/visits.access.test.ts src/routes/__tests__/shares.invites.test.ts` in `functions/`).
- Denormalization sync/backfill service tests: passing (`npm test -- src/services/__tests__/denormalizationSync.test.ts src/services/__tests__/denormalizationBackfill.test.ts` in `functions/`).
- Denormalization sync repository bridge tests: passing (`npm test -- src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts src/services/__tests__/denormalizationSync.repositoryBridge.test.ts` in `functions/`).
- Remediation CI guardrail command: passing (`npm run test:remediation-guardrails` in `functions/`).
- Full routes regression suite: passing (`TMPDIR=/Users/tylermcanally/LumiMD/Codebase/functions/.tmp npx jest src/routes/__tests__ --no-cache` in `functions/`, `160/160`).

## Total Remediation Completion (as of 2026-02-23)
- **100% complete** (weighted across 16 review items).
- Weighting method:
  - `Addressed` = 100%
  - `Not started` = 0%
- Current item mix:
  - `Addressed`: 16
  - `In progress`: 0
  - `Not started`: 0

## Progress Snapshot (as of 2026-02-23)

| # | Review Item | Status | Notes |
|---|---|---|---|
| 1 | Medication timing + travel safety | Addressed (P0 scope) | Anchor/local timing policy + scheduled backfill are in place; processor tests cover east->west, west->east, and DST-boundary behavior; operators have explicit backfill status endpoint + UI visibility (`GET /v1/medication-reminders/ops/timing-backfill-status`, `/ops/medication-reminders`); and reminder timing preference controls are now exposed in both web and mobile create/update UX (`Automatic`, `Follow current timezone`, `Keep fixed timezone`). |
| 2 | API authorization gap | Addressed (P0 scope) | Caregiver read access now uses a shared access helper across `/v1/care/*` and `GET /v1/visits/:id`. |
| 3 | Input sanitization | Addressed (Closeout scope) | Shared sanitizer coverage now includes high-risk write surfaces and array-field follow-through on visits (`diagnoses`, `imaging`, `nextSteps`, `tags`, `folders`) with regression tests (`visits.sanitization.test.ts`). |
| 4 | Repository layer | Addressed (Closeout scope) | Route/service data access is repository/domain mediated across remediation scope; remaining Firestore query orchestration is confined to repository adapters and intentional infrastructure maintenance wrappers with contract coverage. |
| 5 | Centralized authorization | Addressed (Phase 1 scope) | Shared authorization guards now cover caregiver access (`care`), visit read/write access (`visits` via `visitAccess`), operator-only endpoint gating (`ensureOperatorAccessOrReject`), operator cross-user restore reason gating (`ensureOperatorRestoreReasonOrReject`), owner/deleted-resource checks (`ensureResourceOwnerAccessOrReject`), and non-response ownership predicates (`hasResourceOwnerAccess`) across actions, medication reminders, medications, nudges (including debug analyze flow), health logs, care patient-visit/task ownership checks, share invite/share read/status-transition access, users caregiver-revoke owner checks (`DELETE /v1/users/me/caregivers/:id`), medication schedule batch marking, medication-log creation ownership checks (`POST /v1/medication-logs`), centralized debug-write access control in `nudgesDebug` (operator-gated outside emulator), and shared invite-email/caregiver-fallback access checks in share accept flows (`POST /v1/shares/accept-invite`, `POST /v1/shares/accept/:token`). |
| 6 | Pagination | Addressed (Closeout scope) | Cursor pagination + header contract (`X-Has-More`, `X-Next-Cursor`) now covers `actions`, `visits`, `meds`, caregiver patient-resource lists, and share read surfaces (`/v1/shares`, `/v1/shares/invites`, `/v1/shares/my-invites`) with route regression tests. |
| 7 | Cache share lookups | Addressed (Closeout scope) | 5-minute accepted-share/access cache is in place with mutation invalidation coverage on share accept/revoke paths and cache-specific regression tests on fallback/invalidation behavior. |
| 8 | Response compression | Addressed (Closeout scope) | Express compression middleware is enabled on Functions API (`threshold=1024`, `level=6`) for response-size/bandwidth reduction. |
| 9 | Denormalization sync strategy | Addressed (Closeout scope) | Trigger + scheduled backfill strategy now covers owner fields, caregiver email fields (`caregiverUserId`-linked shares/invites), and medication reminder fields, with persisted cursor state, dry-run controls, repository bridges, and CI contract/index guardrails. |
| 10 | God object route file | Addressed (Phase 1 scope) | Completed modular split for caregiver endpoints and medication endpoints: `care.ts` is composition-focused and `medications.ts` is now a small composition root with route logic moved into dedicated modules. |
| 11 | N+1 caregiver dashboard queries | Addressed (Phase 1 scope) | `/care/overview` batched; patient-detail endpoints now include query-count/latency guardrails (including `medication-status` and `export/summary`), `/alerts` reuses a single medications snapshot (deduped med read), patient-detail read paths now exclude soft-deleted records (`summary`/`quick-overview`/`alerts`/`trends`), caregiver paginated patient-resource lists now enforce `deletedAt == null` with deleted-cursor rejection (medications/actions/visits), caregiver dashboards no longer fan out per-patient `/alerts`, and patient detail page no longer double-fetches daily med status or separate upcoming-action/med-change endpoints. |
| 12 | Missing indexes | Addressed (Phase 1 scope) | Added caregiver composites for `caregiverNotes`/`careTasks`, visits composites for post-commit recovery/escalations, plus Phase 1 follow-through composites for `healthLogs(userId, sourceId, createdAt)`, `medicationReminders(userId, enabled|medicationId)`, `medicationLogs(userId, medicationId, loggedAt|createdAt)`, `actions(visitId, userId)`, `actions(userId, completed, deletedAt)`, and `medications(userId, active)`. |
| 13 | Soft delete strategy | Addressed (Closeout scope) | Soft-delete lifecycle (delete, restore, retention purge, audit/triage tooling) is implemented for core clinical resources (`visits`, `medications`, `actions`, `healthLogs`, reminders/task surfaces) with operator reason controls for cross-user restores. |
| 14 | Transaction boundaries | Addressed (P0 scope) | Share accept/revoke atomicity done; medication delete/stop cascades batch dependent deletes; visit processing now persists explicit post-commit success/partial-failure state markers, dedupe markers, and a scheduled retry path covering all post-commit side effects with per-operation backoff/attempt ceilings, escalation logging, operator lifecycle endpoints, external incident webhook delivery, and operator UI wiring. |
| 15 | Service layer boundaries | Addressed (Closeout scope) | Domain/service boundaries are fully established across route and helper-service surfaces; long-tail infrastructure flows are repository-backed and contract-tested, with remaining work limited to telemetry tuning rather than architectural gaps. |
| 16 | Response cache headers | Addressed (Phase 1 scope) | Added private cache headers for caregiver overview/summary/quick-overview plus alerts, medication-status, medication-adherence, upcoming-actions, trends, med-changes, `export/summary`, and paginated caregiver patient-resource reads (`medications`, `actions`, `visits`, single `visit` summary, `notes`, `tasks`, `health-logs`). Phase 3 follow-through now also covers non-care authenticated reads: `/v1/shares`, `/v1/shares/invites`, `/v1/shares/:id`, `/v1/shares/my-invites`, `/v1/medication-reminders`, `/v1/medication-logs`, `/v1/medication-logs/summary`, `/v1/nudges`, and `/v1/nudges/history`. |

## Completed in This Iteration

### EK) Remediation closeout: denormalization caregiver-email policy expansion
- Change:
  - Expanded denormalization strategy for user profile writes to reconcile caregiver-linked duplicated email fields:
    - added caregiver-email change resolver (`resolveCaregiverEmailDenormalizationUpdate(...)`)
    - added caregiver-field sync flow (`syncShareCaregiverDenormalizedFields(...)`) for `shares` and `shareInvites` by `caregiverUserId`
  - Expanded scheduled denormalization backfill to reconcile `caregiverEmail` via `caregiverUserId` lookup in addition to owner fields and reminder medication fields.
  - Extended denormalization repository contract/adapter coverage for caregiver-user query surfaces.
- Files:
  - `functions/src/services/denormalizationSync.ts`
  - `functions/src/triggers/denormalizationSync.ts`
  - `functions/src/services/repositories/denormalization/DenormalizationSyncRepository.ts`
  - `functions/src/services/repositories/denormalization/FirestoreDenormalizationSyncRepository.ts`
  - `functions/src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts`
  - `functions/src/services/__tests__/denormalizationSync.test.ts`
  - `functions/src/services/__tests__/denormalizationSync.repositoryBridge.test.ts`
  - `functions/src/services/__tests__/denormalizationBackfill.test.ts`
- Validation:
  - `npm test -- src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts src/services/__tests__/denormalizationSync.test.ts src/services/__tests__/denormalizationSync.repositoryBridge.test.ts src/services/__tests__/denormalizationBackfill.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EJ) Remediation closeout: visits array-field sanitization follow-through
- Change:
  - Added explicit sanitization/normalization for visits patch array fields before persistence:
    - `diagnoses`
    - `imaging`
    - `nextSteps`
    - `tags`
    - `folders`
  - Added focused regression coverage for sanitized dedupe/trim/HTML-stripping behavior.
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/__tests__/visits.sanitization.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/visits.sanitization.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EI) Phase 1 follow-through: share-surface cursor pagination expansion
- Change:
  - Added optional cursor pagination (`limit`, `cursor`) with `X-Has-More` and `X-Next-Cursor` headers for:
    - `GET /v1/shares`
    - `GET /v1/shares/invites`
    - `GET /v1/shares/my-invites`
  - Added deterministic ordering (`createdAt desc`, then `id`) before cursor slicing so pagination remains stable across mixed incoming/outgoing share datasets and deduped invite views.
  - Added cursor validation handling for invalid share/invite cursors (`400 validation_failed`).
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EH) Post-Phase 4 backlog slice: denormalization sync repository hardening (slice 2)
- Change:
  - Extended denormalization sync repository coverage to scheduled backfill orchestration by adding:
    - cursor-based page reads (`listCollectionPage(...)`)
    - lookup-by-id hydration for users/medications (`getLookupDocsByIds(...)`)
  - Migrated scheduled backfill helpers in `denormalizationSync` off direct collection/getAll calls to repository-backed operations:
    - `runOwnerFieldBackfillPage(...)`
    - `runReminderFieldBackfillPage(...)`
    - `backfillDenormalizedFields(...)`
  - Added focused repository + bridge coverage for backfill wiring.
- Files:
  - `functions/src/services/repositories/denormalization/DenormalizationSyncRepository.ts`
  - `functions/src/services/repositories/denormalization/FirestoreDenormalizationSyncRepository.ts`
  - `functions/src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts`
  - `functions/src/services/denormalizationSync.ts`
  - `functions/src/services/__tests__/denormalizationSync.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts src/services/__tests__/denormalizationSync.repositoryBridge.test.ts src/services/__tests__/denormalizationSync.test.ts src/services/__tests__/denormalizationBackfill.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EG) Post-Phase 4 backlog slice: denormalization sync repository hardening (slice 1)
- Change:
  - Added denormalization sync repository contract and Firestore adapter:
    - `DenormalizationSyncRepository`
    - `FirestoreDenormalizationSyncRepository`
  - Migrated trigger-sync denormalization paths in `denormalizationSync` to repository-backed reads/writes for:
    - owner field propagation to `shares` and `shareInvites`
    - medication field propagation to `medicationReminders`
  - Kept scheduled backfill paging path unchanged for a follow-up slice, while hardening the high-frequency trigger sync paths first.
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts`
    - `functions/src/services/__tests__/denormalizationSync.repositoryBridge.test.ts`
- Files:
  - `functions/src/services/repositories/denormalization/DenormalizationSyncRepository.ts`
  - `functions/src/services/repositories/denormalization/FirestoreDenormalizationSyncRepository.ts`
  - `functions/src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts`
  - `functions/src/services/denormalizationSync.ts`
  - `functions/src/services/__tests__/denormalizationSync.repositoryBridge.test.ts`
  - `functions/src/services/repositories/index.ts`
- Validation:
  - `npm test -- src/services/repositories/denormalization/__tests__/FirestoreDenormalizationSyncRepository.test.ts src/services/__tests__/denormalizationSync.repositoryBridge.test.ts src/services/__tests__/denormalizationSync.test.ts src/services/__tests__/denormalizationBackfill.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EF) Post-Phase 4 backlog slice: medication-reminder processor repository hardening (slice 2)
- Change:
  - Extended medication-reminder processing repository with timing-backfill and retention-purge operations:
    - `listTimingBackfillPage(...)`
    - `listSoftDeletedByCutoff(...)`
    - `deleteReminderIds(...)`
  - Migrated `medicationReminderService` direct reminders-collection backfill/purge paths to repository-backed methods in:
    - `backfillMedicationReminderTimingPolicy(...)`
    - `purgeSoftDeletedMedicationReminders(...)`
  - Added focused repository + bridge coverage for the new methods and service wiring.
- Files:
  - `functions/src/services/repositories/medicationReminderProcessing/MedicationReminderProcessingRepository.ts`
  - `functions/src/services/repositories/medicationReminderProcessing/FirestoreMedicationReminderProcessingRepository.ts`
  - `functions/src/services/repositories/medicationReminderProcessing/__tests__/FirestoreMedicationReminderProcessingRepository.test.ts`
  - `functions/src/services/medicationReminderService.ts`
  - `functions/src/services/__tests__/medicationReminderService.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/medicationReminderProcessing/__tests__/FirestoreMedicationReminderProcessingRepository.test.ts src/services/__tests__/medicationReminderService.repositoryBridge.test.ts src/services/__tests__/medicationReminderService.test.ts src/services/__tests__/medicationReminderService.process.test.ts src/routes/__tests__/medicationReminders.opsStatus.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EE) Post-Phase 4 backlog slice: medication-reminder processor repository hardening (slice 1)
- Change:
  - Added medication-reminder processing repository contract and Firestore adapter:
    - `MedicationReminderProcessingRepository`
    - `FirestoreMedicationReminderProcessingRepository`
  - Migrated `processAndNotifyMedicationReminders(...)` core processor read/write dependencies from direct Firestore calls to repository-backed access for:
    - enabled reminder reads
    - user timezone lookups
    - medication state checks (active/deleted)
    - send-lock acquisition
    - per-user medication-log range reads
    - reminder update writes (single + batched)
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/medicationReminderProcessing/__tests__/FirestoreMedicationReminderProcessingRepository.test.ts`
    - `functions/src/services/__tests__/medicationReminderService.repositoryBridge.test.ts`
- Files:
  - `functions/src/services/repositories/medicationReminderProcessing/MedicationReminderProcessingRepository.ts`
  - `functions/src/services/repositories/medicationReminderProcessing/FirestoreMedicationReminderProcessingRepository.ts`
  - `functions/src/services/repositories/medicationReminderProcessing/__tests__/FirestoreMedicationReminderProcessingRepository.test.ts`
  - `functions/src/services/medicationReminderService.ts`
  - `functions/src/services/__tests__/medicationReminderService.repositoryBridge.test.ts`
  - `functions/src/services/repositories/index.ts`
- Validation:
  - `npm test -- src/services/repositories/medicationReminderProcessing/__tests__/FirestoreMedicationReminderProcessingRepository.test.ts src/services/__tests__/medicationReminderService.repositoryBridge.test.ts src/services/__tests__/medicationReminderService.test.ts src/services/__tests__/medicationReminderService.process.test.ts src/routes/__tests__/medicationReminders.opsStatus.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### ED) Post-Phase 4 backlog slice: visit-processor action-sync repository hardening
- Change:
  - Added dedicated visit action-sync repository contract and Firestore adapter:
    - `VisitActionSyncRepository`
    - `FirestoreVisitActionSyncRepository`
  - Migrated `visitProcessor` action replacement flow to repository-backed orchestration:
    - replaced direct `actions` collection query + doc creation logic in `summarizeVisit(...)`
    - preserved single-batch atomic behavior by passing existing visit batch into repository `replaceForVisit(...)`
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/visitActionSync/__tests__/FirestoreVisitActionSyncRepository.test.ts`
    - `functions/src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts` (injected repository assertion)
- Files:
  - `functions/src/services/repositories/visitActionSync/VisitActionSyncRepository.ts`
  - `functions/src/services/repositories/visitActionSync/FirestoreVisitActionSyncRepository.ts`
  - `functions/src/services/repositories/visitActionSync/__tests__/FirestoreVisitActionSyncRepository.test.ts`
  - `functions/src/services/visitProcessor.ts`
  - `functions/src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts`
  - `functions/src/services/repositories/index.ts`
- Validation:
  - `npm test -- src/services/repositories/visitActionSync/__tests__/FirestoreVisitActionSyncRepository.test.ts src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts src/services/__tests__/visitPostCommitRecoveryService.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EC) Post-Phase 4 backlog slice: caregiver-email log repository hardening
- Change:
  - Added caregiver-email log repository contract and Firestore adapter:
    - `CaregiverEmailLogRepository`
    - `FirestoreCaregiverEmailLogRepository`
  - Migrated `caregiverEmailService` default log writes from direct `caregiverEmailLog` collection access to repository-backed dependency wiring.
  - Added focused repository coverage:
    - `functions/src/services/repositories/caregiverEmailLogs/__tests__/FirestoreCaregiverEmailLogRepository.test.ts`
- Files:
  - `functions/src/services/repositories/caregiverEmailLogs/CaregiverEmailLogRepository.ts`
  - `functions/src/services/repositories/caregiverEmailLogs/FirestoreCaregiverEmailLogRepository.ts`
  - `functions/src/services/repositories/caregiverEmailLogs/__tests__/FirestoreCaregiverEmailLogRepository.test.ts`
  - `functions/src/services/caregiverEmailService.ts`
  - `functions/src/services/repositories/index.ts`
- Validation:
  - `npm test -- src/services/repositories/caregiverEmailLogs/__tests__/FirestoreCaregiverEmailLogRepository.test.ts src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts src/services/__tests__/visitPostCommitRecoveryService.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EB) Post-Phase 4 backlog slice: medication-sync repository hardening (slice 2)
- Change:
  - Extended medication-sync repository contract/adapter to include medication write paths:
    - `create(...)`
    - `updateById(...)`
  - Migrated `medicationSync` direct medication writes in `upsertMedication(...)` to repository-backed calls for:
    - existing medication updates
    - new medication document creation
  - Completed side-effect repository wiring for nudge/reminder list/delete/create paths and hardened repository tests to support Firestore `'in'` query semantics.
  - Expanded bridge assertions to verify repository-backed medication updates.
- Files:
  - `functions/src/services/repositories/medicationSync/MedicationSyncRepository.ts`
  - `functions/src/services/repositories/medicationSync/FirestoreMedicationSyncRepository.ts`
  - `functions/src/services/medicationSync.ts`
  - `functions/src/services/repositories/medicationSync/__tests__/FirestoreMedicationSyncRepository.test.ts`
  - `functions/src/services/__tests__/medicationSync.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/medicationSync/__tests__/FirestoreMedicationSyncRepository.test.ts src/services/__tests__/medicationSync.repositoryBridge.test.ts src/services/__tests__/medicationSync.test.ts src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts src/services/__tests__/visitPostCommitRecoveryService.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### EA) Post-Phase 4 backlog slice: medication-sync lookup repository hardening (slice 1)
- Change:
  - Added medication-sync repository contract and Firestore adapter for lookup/list reads:
    - `MedicationSyncRepository`
    - `FirestoreMedicationSyncRepository`
  - Migrated medication-sync lookup/list read paths to repository-backed dependencies:
    - warm-cache user-med list in `syncMedicationsFromSummary(...)`
    - canonical/nameLower lookup reads in `getMedicationDoc(...)`
  - Added dependency wiring for medication-sync repository injection in sync flows.
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/medicationSync/__tests__/FirestoreMedicationSyncRepository.test.ts`
    - `functions/src/services/__tests__/medicationSync.repositoryBridge.test.ts`
- Files:
  - `functions/src/services/repositories/medicationSync/MedicationSyncRepository.ts`
  - `functions/src/services/repositories/medicationSync/FirestoreMedicationSyncRepository.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/medicationSync.ts`
  - `functions/src/services/repositories/medicationSync/__tests__/FirestoreMedicationSyncRepository.test.ts`
  - `functions/src/services/__tests__/medicationSync.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/medicationSync/__tests__/FirestoreMedicationSyncRepository.test.ts src/services/__tests__/medicationSync.repositoryBridge.test.ts src/services/__tests__/medicationSync.test.ts src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts src/services/__tests__/visitPostCommitRecoveryService.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### DZ) Post-Phase 4 backlog slice: restore-audit append-write repository hardening
- Change:
  - Added restore-audit repository contract and Firestore adapter:
    - `RestoreAuditRepository`
    - `FirestoreRestoreAuditRepository`
  - Migrated `recordRestoreAuditEvent(...)` from direct `restoreAuditLogs` collection `.add(...)` calls to repository-backed event creation with dependency injection.
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/restoreAudit/__tests__/FirestoreRestoreAuditRepository.test.ts`
    - `functions/src/services/__tests__/restoreAuditService.repositoryBridge.test.ts`
- Files:
  - `functions/src/services/repositories/restoreAudit/RestoreAuditRepository.ts`
  - `functions/src/services/repositories/restoreAudit/FirestoreRestoreAuditRepository.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/restoreAuditService.ts`
  - `functions/src/services/repositories/restoreAudit/__tests__/FirestoreRestoreAuditRepository.test.ts`
  - `functions/src/services/__tests__/restoreAuditService.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/restoreAudit/__tests__/FirestoreRestoreAuditRepository.test.ts src/services/__tests__/restoreAuditService.repositoryBridge.test.ts src/routes/__tests__/users.restoreAudit.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/visits.restore.test.ts src/routes/__tests__/healthLogs.softDelete.test.ts src/routes/__tests__/actions.softDelete.test.ts src/routes/__tests__/care.tasks.softDelete.test.ts src/routes/__tests__/medicationReminders.softDelete.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### DY) Post-Phase 4 backlog slice: soft-delete retention repository hardening
- Change:
  - Added soft-delete retention repository contract and Firestore adapter:
    - `SoftDeleteRetentionRepository`
    - `FirestoreSoftDeleteRetentionRepository`
  - Migrated `purgeSoftDeletedCollections(...)` off direct collection scan/delete calls to repository-backed list/purge methods with dependency injection.
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/softDeleteRetention/__tests__/FirestoreSoftDeleteRetentionRepository.test.ts`
    - `functions/src/services/__tests__/softDeleteRetentionService.repositoryBridge.test.ts`
- Files:
  - `functions/src/services/repositories/softDeleteRetention/SoftDeleteRetentionRepository.ts`
  - `functions/src/services/repositories/softDeleteRetention/FirestoreSoftDeleteRetentionRepository.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/softDeleteRetentionService.ts`
  - `functions/src/services/repositories/softDeleteRetention/__tests__/FirestoreSoftDeleteRetentionRepository.test.ts`
  - `functions/src/services/__tests__/softDeleteRetentionService.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/softDeleteRetention/__tests__/FirestoreSoftDeleteRetentionRepository.test.ts src/services/__tests__/softDeleteRetentionService.repositoryBridge.test.ts src/services/__tests__/softDeleteRetentionService.test.ts src/routes/__tests__/actions.softDelete.test.ts src/routes/__tests__/healthLogs.softDelete.test.ts src/routes/__tests__/care.tasks.softDelete.test.ts src/routes/__tests__/medicationReminders.softDelete.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/visits.restore.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### DX) Post-Phase 4 backlog slice: external drug-data cache repository hardening
- Change:
  - Added external drug-safety cache repository contract and Firestore adapter for `medicationSafetyExternalCache`:
    - `ExternalDrugSafetyCacheRepository`
    - `FirestoreExternalDrugSafetyCacheRepository`
  - Migrated `externalDrugData` cache read/write paths to repository-backed dependencies:
    - cache lookup (`getCachedResult`) -> `getByUserAndCacheKey`
    - cache write (`cacheResult`) -> `setByUserAndCacheKey`
  - Added dependency-injected cache/fetch overrides for deterministic bridge testing and reduced direct infrastructure coupling in `runExternalSafetyChecks(...)`.
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/externalDrugSafetyCache/__tests__/FirestoreExternalDrugSafetyCacheRepository.test.ts`
    - `functions/src/services/__tests__/externalDrugData.repositoryBridge.test.ts`
- Files:
  - `functions/src/services/repositories/externalDrugSafetyCache/ExternalDrugSafetyCacheRepository.ts`
  - `functions/src/services/repositories/externalDrugSafetyCache/FirestoreExternalDrugSafetyCacheRepository.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/externalDrugData.ts`
  - `functions/src/services/repositories/externalDrugSafetyCache/__tests__/FirestoreExternalDrugSafetyCacheRepository.test.ts`
  - `functions/src/services/__tests__/externalDrugData.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/externalDrugSafetyCache/__tests__/FirestoreExternalDrugSafetyCacheRepository.test.ts src/services/__tests__/externalDrugData.repositoryBridge.test.ts src/services/__tests__/externalDrugData.test.ts src/services/repositories/medicationSafetyCache/__tests__/FirestoreMedicationSafetyCacheRepository.test.ts src/services/__tests__/medicationSafetyAI.repositoryBridge.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### DW) Post-Phase 4 backlog slice: medication-safety AI cache repository hardening
- Change:
  - Added cache repository contract and Firestore adapter for `medicationSafetyCache`:
    - `MedicationSafetyCacheRepository`
    - `FirestoreMedicationSafetyCacheRepository`
  - Migrated `medicationSafetyAI` cache orchestration off direct collection calls:
    - cache lookup path (`getCachedResult`) now uses repository read (`getByUserAndCacheKey`)
    - cache write path (`cacheResult`) now uses repository write (`setByUserAndCacheKey`)
    - cache purge path (`clearMedicationSafetyCacheForUser`) now uses repository list/delete operations (`listByUser`, `deleteByIds`)
  - Added focused repository + bridge coverage:
    - `functions/src/services/repositories/medicationSafetyCache/__tests__/FirestoreMedicationSafetyCacheRepository.test.ts`
    - `functions/src/services/__tests__/medicationSafetyAI.repositoryBridge.test.ts`
- Files:
  - `functions/src/services/repositories/medicationSafetyCache/MedicationSafetyCacheRepository.ts`
  - `functions/src/services/repositories/medicationSafetyCache/FirestoreMedicationSafetyCacheRepository.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/medicationSafetyAI.ts`
  - `functions/src/services/repositories/medicationSafetyCache/__tests__/FirestoreMedicationSafetyCacheRepository.test.ts`
  - `functions/src/services/__tests__/medicationSafetyAI.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/repositories/medicationSafetyCache/__tests__/FirestoreMedicationSafetyCacheRepository.test.ts src/services/__tests__/medicationSafetyAI.repositoryBridge.test.ts src/services/__tests__/medicationSafety.repositoryBridge.test.ts src/routes/__tests__/medications.core.test.ts src/routes/__tests__/medications.deleteCascade.test.ts src/routes/__tests__/medications.restore.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### DV) Post-Phase 4 backlog slice: medication reminder maintenance-state repository hardening
- Change:
  - Added infrastructure repository contract and Firestore adapter for `systemMaintenance` state docs:
    - `MaintenanceStateRepository`
    - `FirestoreMaintenanceStateRepository`
  - Migrated medication reminder timing-backfill state reads/writes in:
    - `getMedicationReminderTimingBackfillStatus(...)`
    - `backfillMedicationReminderTimingPolicy(...)`
  - Backfill/status now resolve `maintenanceStateRepository` through dependency wiring, removing direct `systemMaintenance` collection coupling from reminder service orchestration paths.
  - Added targeted repository/service regression coverage:
    - `functions/src/services/repositories/maintenanceState/__tests__/FirestoreMaintenanceStateRepository.test.ts`
    - `functions/src/services/__tests__/medicationReminderService.test.ts` (injected maintenance-state repository status read)
- Files:
  - `functions/src/services/repositories/maintenanceState/MaintenanceStateRepository.ts`
  - `functions/src/services/repositories/maintenanceState/FirestoreMaintenanceStateRepository.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/medicationReminderService.ts`
  - `functions/src/services/__tests__/medicationReminderService.test.ts`
  - `functions/src/services/repositories/maintenanceState/__tests__/FirestoreMaintenanceStateRepository.test.ts`
- Validation:
  - `npm test -- src/services/repositories/maintenanceState/__tests__/FirestoreMaintenanceStateRepository.test.ts src/services/__tests__/medicationReminderService.test.ts src/routes/__tests__/medicationReminders.opsStatus.test.ts src/services/__tests__/medicationReminderService.process.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`

### Bundle A follow-through: medication timing ops visibility + debug-path sanitization
- Change:
  - Added operator-facing medication reminder timing backfill status endpoint with stale/error detection:
    - `GET /v1/medication-reminders/ops/timing-backfill-status`
  - Added operator web portal status page for reminder timing backfill:
    - `GET /ops/medication-reminders`
    - linked from `/ops/escalations` and `/ops/restore-audit`
  - Added web reminder timing preference controls to create/update flows:
    - `Automatic` (server applies criticality defaults)
    - `Follow current timezone` (`local`)
    - `Keep fixed timezone` (`anchor`)
  - Added mobile reminder timing preference controls to create/update flows with matching policy options and anchored-timezone context.
  - Extended shared SDK reminder model/request types to include timing policy fields (`timingMode`, `anchorTimezone`, `criticality`).
  - Backfill state now captures run lifecycle metadata (`lastRunStartedAt`, `lastRunFinishedAt`, `lastRunStatus`, `lastRunErrorAt`, `lastRunErrorMessage`) for operational monitoring.
  - Sanitized remaining debug free-text medication fields in:
    - `POST /v1/medication-reminders/debug/test-notify`
    - `POST /v1/nudges/debug/create`
    - `POST /v1/nudges/debug/create-sequence`
    - `POST /v1/nudges/debug/test-condition`
- Files:
  - `functions/src/services/medicationReminderService.ts`
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/routes/nudgesDebug.ts`
  - `functions/src/routes/__tests__/medicationReminders.opsStatus.test.ts`
  - `functions/src/routes/__tests__/medicationReminders.debugSanitization.test.ts`
  - `functions/src/routes/__tests__/nudgesDebug.sanitization.test.ts`
  - `web-portal/app/(protected)/ops/medication-reminders/page.tsx`
  - `web-portal/lib/api/hooks.ts`
  - `web-portal/components/medications/ReminderDialog.tsx`
  - `web-portal/app/(protected)/ops/escalations/page.tsx`
  - `web-portal/app/(protected)/ops/restore-audit/page.tsx`
  - `packages/sdk/src/models/lumibot.ts`
  - `mobile/components/ReminderTimePickerModal.tsx`
  - `mobile/app/medications.tsx`
- Validation:
  - `npm test -- src/routes/__tests__/medicationReminders.opsStatus.test.ts src/services/__tests__/medicationReminderService.test.ts src/services/__tests__/medicationReminderService.process.test.ts`
  - `npm test -- src/routes/__tests__/medicationReminders.debugSanitization.test.ts src/routes/__tests__/nudgesDebug.sanitization.test.ts src/routes/__tests__/medicationReminders.softDelete.test.ts src/routes/__tests__/nudgesDebug.access.test.ts`
  - `npm run build`
  - `npm run test:remediation-guardrails`
  - `npm run build` (in `web-portal/`)
  - `npm test` (in `web-portal/`)
  - `npm run build` (in `packages/sdk/`)
  - `npx tsc --noEmit` (in `mobile/`)
  - `npm test` (in `mobile/`)

### A) Caregiver read access for visits endpoint
- Change:
  - Updated visits route authorization so `GET /v1/visits/:id` allows:
    - owner access, or
    - accepted caregiver share access.
  - Added legacy email fallback for accepted shares missing `caregiverUserId`, with backfill.
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/__tests__/visits.access.test.ts`
- Validation:
  - Owner read allowed.
  - Accepted caregiver read allowed.
  - Legacy email fallback read allowed + `caregiverUserId` backfill.
  - Non-owner/no-share read denied (403).

### B) Transaction hardening for share accept/revoke flows
- Change:
  - Updated share invite acceptance/revocation paths to batch coupled writes so related document updates commit atomically.
  - Included legacy caregiver-id migration path in `/accept-invite` as an atomic set+delete batch.
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
- Validation:
  - Legacy token acceptance creates/updates canonical share and invite state consistently.
  - `/accept-invite` path accepts valid token and persists both invite/share updates.
  - Revoke flow updates invite + canonical share status together for accepted invitations.

### C) Travel-safe medication reminder timing policy
- Change:
  - Added reminder timing policy fields (`timingMode`, `anchorTimezone`, `criticality`) and timezone validation in reminder create/update flows.
  - Updated reminder processor to evaluate each reminder in its effective timezone (local vs anchor) instead of only current profile timezone.
  - Added shared timing utility with high-risk medication classification for default anchor behavior.
- Files:
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/services/medicationReminderService.ts`
  - `functions/src/utils/medicationReminderTiming.ts`
  - `functions/src/services/__tests__/medicationReminderService.test.ts`
- Validation:
  - Local reminders evaluate in current user timezone.
  - Anchor reminders evaluate in anchor timezone.
  - Invalid anchor timezones fall back safely and are normalized for future runs.

### D) Care overview N+1 query reduction
- Change:
  - Refactored `/v1/care/overview` to batch patient profile, medication, reminder, medication log, and action reads by patient ID chunks.
  - Eliminated duplicate medication-status recomputation in overview alert generation.
  - Added profile-driven `lastActive` reuse with push-token fallback to reduce subcollection reads.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.overview.test.ts`
- Validation:
  - Multi-patient overview response remains correct for medication status, pending actions, and alerts.
  - Route test verifies medication logs are fetched with a batched query for multiple patients (`medicationLogsGets === 1` in harness).

### E) Reminder timing backfill migration scheduler
- Change:
  - Added a scheduled Cloud Function (`every 2 hours`) to backfill legacy reminder timing metadata (`timingMode`, `anchorTimezone`, `criticality`) in paged chunks with persisted cursor state.
  - Added reusable timing metadata normalization helper to compute idempotent updates for legacy documents.
- Files:
  - `functions/src/services/medicationReminderService.ts`
  - `functions/src/index.ts`
  - `functions/src/services/__tests__/medicationReminderService.test.ts`
- Validation:
  - Unit tests cover legacy time-sensitive defaulting, no-op when already normalized, stale anchor cleanup for local reminders, and invalid anchor normalization.
  - Functions TypeScript build and targeted route/service test suite pass.

### F) Care endpoint duplicate-query elimination (summary, medication-status, alerts)
- Change:
  - Refactored `getTodaysMedicationStatus` to accept optional pre-fetched timezone/snapshots (medications, reminders, logs) so endpoints can reuse in-flight reads.
  - Refactored `GET /v1/care/:patientId/summary` to reuse already-fetched active medication snapshot + profile timezone when computing medication status.
  - Refactored `GET /v1/care/:patientId/medication-status` to reuse already-fetched meds/reminders/logs for the response summary instead of issuing a second full medication-status query set.
  - Refactored `GET /v1/care/:patientId/alerts` to reuse already-fetched reminders and the 7-day medication logs snapshot for missed-dose checks (eliminating a separate today-log query).
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.summary.test.ts`
  - `functions/src/routes/__tests__/care.medicationStatus.test.ts`
  - `functions/src/routes/__tests__/care.alerts.test.ts`
- Validation:
  - Summary route test confirms expected payload and verifies actions query executes once (`actionsGets === 1` in harness).
  - Medication-status route test confirms summary correctness and verifies no duplicate reads (`usersDocGets`, `medicationsGets`, `medicationRemindersGets`, `medicationLogsGets` all equal `1`).
  - Alerts route test confirms 7-day logs are reused for missed-dose checks (`medicationLogsGets === 1`).

### G) Share lookup caching for caregiver access
- Change:
  - Added 5-minute in-memory cache in care routes for:
    - accepted shares list per caregiver (`getAcceptedSharesForCaregiver`)
    - patient access decision per caregiver/patient pair (`validateCaregiverAccess`)
  - Added explicit cache invalidation hooks in share mutation endpoints (accept/revoke) so cached access entries do not remain stale after writes.
  - Added test utility to clear cache between tests.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/__tests__/care.acceptedSharesFallback.test.ts`
  - `functions/src/routes/__tests__/care.overview.test.ts`
  - `functions/src/routes/__tests__/care.summary.test.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
- Validation:
  - Repeated caregiver accepted-share lookup returns cached result without additional Firestore reads in test harness.
  - Invite acceptance path invalidates cached empty share-list state and returns fresh accepted-share data on next lookup.
  - Related caregiver route tests remain green with cache reset between tests.

### H) Response cache headers rollout (care read endpoints)
- Change:
  - Added `Cache-Control` headers for authenticated caregiver read endpoints:
    - `GET /v1/care/overview` -> `private, max-age=60`
    - `GET /v1/care/:patientId/summary` -> `private, max-age=30`
    - `GET /v1/care/:patientId/quick-overview` -> `private, max-age=30`
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.overview.test.ts`
  - `functions/src/routes/__tests__/care.summary.test.ts`
- Validation:
  - Overview and summary route tests assert expected cache header values.
  - TypeScript build and targeted regression suite remain passing.

### I) Response compression middleware rollout
- Change:
  - Added global Express response compression middleware in Cloud Functions API with:
    - `threshold: 1024`
    - `level: 6`
- Files:
  - `functions/src/index.ts`
  - `functions/package.json`
- Validation:
  - Functions TypeScript build passes with middleware wiring.
  - Targeted caregiver/share regression suite remains green after middleware addition.

### J) Added missing caregiver query indexes
- Change:
  - Added Firestore composite indexes to cover caregiver note/task list queries used in care routes:
    - `caregiverNotes(caregiverId, patientId, updatedAt desc)`
    - `careTasks(patientId, caregiverId, createdAt desc)`
    - `careTasks(patientId, caregiverId, status, createdAt desc)`
- Files:
  - `firestore.indexes.json`
  - `functions/src/routes/care.ts`
- Validation:
  - Index definitions now match current caregiver query patterns in task/note endpoints.

### K) Input sanitization hardening (phase 1)
- Change:
  - Added shared sanitization utilities:
    - `sanitizePlainText` (strip script/style/html tags, trim/normalize, max-length bound)
    - `escapeHtml` (safe HTML interpolation)
  - Applied sanitization to high-risk write paths:
    - share invite creation (`message`) and invite-email HTML rendering
    - visits text fields (`notes`, `summary`, provider metadata fields)
    - medications text fields (`name`, `dose`, `frequency`, `notes`, safety-check payload)
    - caregiver notes/tasks text fields (`note`, task `title`, task `description`)
- Files:
  - `functions/src/utils/inputSanitization.ts`
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/care.ts`
  - `functions/src/utils/__tests__/inputSanitization.test.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
- Validation:
  - Utility tests verify stripping/truncation/escaping behavior.
  - Share invite route test verifies sanitized `ownerName` and `message` persistence on `/invite`.
  - Targeted regression suite and TypeScript build pass after rollout.

### L) Medication reminder travel-timezone processor tests
- Change:
  - Added processor-level tests for travel timing behavior in reminder notification scheduling:
    - at `9:00 PM America/Los_Angeles`, only local-timed reminders are due (anchor `America/New_York` reminder is not)
    - when `America/New_York` reaches `9:00 PM` while user remains in Los Angeles, anchor-timed reminders are due and local-timed are not
    - at `9:00 PM America/New_York`, only local-timed reminders are due after west->east travel (anchor `America/Los_Angeles` reminder is not)
    - when `America/Los_Angeles` reaches `9:00 PM` while user remains in New York, anchor-timed reminders are due and local-timed are not
    - on DST transition day, anchor reminder evaluation remains pinned to anchor timezone (`America/Phoenix`) even after local timezone shift (`America/New_York`)
- Files:
  - `functions/src/services/__tests__/medicationReminderService.process.test.ts`
  - `functions/src/services/medicationReminderService.ts`
- Validation:
  - Travel + DST tests pass and verify reminder payload timezone metadata (`evaluationTimezone`) matches expected policy.

### M) Medication cascade transaction hardening
- Change:
  - Added shared batched-delete helper in medications route.
  - `DELETE /v1/meds/:id` now deletes medication + dependent reminders + nudges in one batched delete set (chunked fallback for very large sets).
  - “Stop medication” path now batches reminder and nudge cleanup in one delete set.
- Files:
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/__tests__/medications.deleteCascade.test.ts`
- Validation:
  - Route test verifies single batch commit for medication+reminder+nudge cascade under normal size.
  - Regression suite and build remain passing.

### N) Input sanitization hardening (phase 1b - actions)
- Change:
  - Applied shared text sanitization to actions write paths:
    - `POST /v1/actions` sanitizes `description` and `notes`
    - `PATCH /v1/actions/:id` sanitizes `description` and `notes` and rejects updates where sanitized description becomes empty
  - Added max-length bounds in action schemas for free-text fields.
- Files:
  - `functions/src/routes/actions.ts`
  - `functions/src/routes/__tests__/actions.sanitization.test.ts`
- Validation:
  - Route tests verify XSS-tag/script stripping on create and empty-after-sanitize rejection on update.
  - Regression suite and TypeScript build remain passing.

### O) Input sanitization hardening (phase 1c - health logs, nudges, medication logs)
- Change:
  - Applied sanitization to additional free-text backend write paths:
    - `POST /v1/health-logs` sanitizes symptom-check/med-compliance text fields and symptom arrays before safety screening and persistence.
    - `POST /v1/nudges/:id/respond` sanitizes `note` and `sideEffects`.
    - `POST /v1/nudges/:id/respond-text` sanitizes user free-text before AI interpretation/persistence and rejects empty-after-sanitize payloads.
    - `POST /v1/medication-logs` sanitizes `medicationName` and rejects empty-after-sanitize payloads.
- Files:
  - `functions/src/routes/healthLogs.ts`
  - `functions/src/routes/nudges.ts`
  - `functions/src/routes/medicationLogs.ts`
  - `functions/src/routes/__tests__/healthLogs.sanitization.test.ts`
  - `functions/src/routes/__tests__/nudges.sanitization.test.ts`
  - `functions/src/routes/__tests__/medicationLogs.sanitization.test.ts`
- Validation:
  - New route tests pass for each endpoint.
  - Combined sanitization regression suite (`inputSanitization`, actions, health logs, nudges, medication logs) passes.
  - Functions TypeScript build remains passing.

### P) Pagination rollout (phase 1 - actions)
- Change:
  - Added optional cursor pagination to `GET /v1/actions`:
    - query params: `limit`, `cursor`
    - response headers: `X-Has-More`, `X-Next-Cursor`
  - Preserved backward compatibility by keeping full-list behavior when pagination params are not provided.
  - Added request validation for invalid `limit` and cursor ownership/existence checks.
- Files:
  - `functions/src/routes/actions.ts`
  - `functions/src/routes/__tests__/actions.pagination.test.ts`
- Validation:
  - Route tests verify:
    - legacy full-list behavior
    - paged first-page response + cursor header
    - second-page traversal via cursor
    - invalid limit/cursor rejection
  - Functions TypeScript build remains passing.

### Q) Pagination rollout (phase 2 - visits and medications)
- Change:
  - Added optional cursor pagination to:
    - `GET /v1/visits` (retains existing `sort` support)
    - `GET /v1/meds`
  - Added query params: `limit`, `cursor`.
  - Added response headers: `X-Has-More`, `X-Next-Cursor`.
  - Preserved backward compatibility by keeping full-list behavior when pagination params are omitted.
  - Added request validation for invalid `limit` and cursor ownership/existence checks.
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/__tests__/visits.pagination.test.ts`
  - `functions/src/routes/__tests__/medications.pagination.test.ts`
- Validation:
  - Route tests verify:
    - legacy full-list behavior
    - paged first-page response + cursor header
    - second-page traversal via cursor
    - invalid limit/cursor rejection
    - visits `sort=asc` behavior under cursor paging
  - Related regression tests (`visits.access`, `medications.deleteCascade`, `actions.pagination`) pass.
  - Functions TypeScript build remains passing.

### R) Pagination rollout (phase 3 - caregiver patient lists)
- Change:
  - Added optional cursor pagination to caregiver patient list endpoints:
    - `GET /v1/care/:patientId/medications`
    - `GET /v1/care/:patientId/visits`
  - Added query params: `limit`, `cursor`.
  - Added response headers: `X-Has-More`, `X-Next-Cursor`.
  - Preserved backward compatibility by keeping full-list behavior when pagination params are omitted.
  - Added request validation for invalid `limit` and cursor ownership/existence checks (must belong to target patient).
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - Care route tests verify:
    - paged first-page response + cursor headers
    - cursor traversal for follow-on pages
    - invalid limit and cursor rejection
    - caregiver access guard still enforced in paged endpoints
  - Care and pagination regression suite remains passing.
  - Functions TypeScript build remains passing.

### S) Pagination rollout (phase 4 - caregiver actions and notes)
- Change:
  - Added optional cursor pagination to:
    - `GET /v1/care/:patientId/actions`
    - `GET /v1/care/:patientId/notes`
  - Added query params: `limit`, `cursor`.
  - Added response headers: `X-Has-More`, `X-Next-Cursor`.
  - Added cursor ownership validation:
    - actions cursor must belong to target patient
    - notes cursor must belong to target caregiver+patient pair
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - Extended care pagination tests verify actions/notes paging and invalid cursor rejection.
  - Care and pagination regression suite remains passing.
  - Functions TypeScript build remains passing.

### T) Pagination rollout (phase 5 - caregiver tasks)
- Change:
  - Added optional cursor pagination to `GET /v1/care/:patientId/tasks`.
  - Added query params: `limit`, `cursor`.
  - Added response headers: `X-Has-More`, `X-Next-Cursor`.
  - Preserved existing `summary` semantics by computing summary metrics from the full filtered task set while returning a paged `tasks` list.
  - Added cursor ownership validation for caregiver+patient and status-filter compatibility.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - Extended care pagination tests verify task paging, invalid cursor rejection, and summary correctness under pagination.
  - Care and pagination regression suite remains passing.
  - Functions TypeScript build remains passing.

### U) Pagination rollout (phase 6 - caregiver health logs)
- Change:
  - Added optional cursor pagination to `GET /v1/care/:patientId/health-logs`.
  - Added query params: `limit`, `cursor` (existing `days` and `type` filters preserved).
  - Added response headers: `X-Has-More`, `X-Next-Cursor`.
  - Added cursor ownership/type/date-window validation for safe traversal.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - Extended care pagination tests verify health-log paging and invalid cursor rejection.
  - Care and pagination regression suite remains passing.
  - Functions TypeScript build remains passing.

### V) Input sanitization hardening (phase 1d - user profile updates)
- Change:
  - Updated `/v1/users/me` patch sanitization to use shared plain-text sanitizer for profile fields instead of trim-only normalization.
  - Applied to:
    - `firstName`, `lastName`, `dateOfBirth`
    - `allergies`, `medicalHistory`, `tags`, `folders` array entries
  - Preserved existing behavior for empty-after-sanitize values:
    - scalar fields normalize to empty string
    - array fields normalize to empty array
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/routes/__tests__/users.profileSanitization.test.ts`
- Validation:
  - New users profile sanitization tests verify script/tag stripping, deduped array normalization, and empty-after-sanitize behavior.
  - Existing users route suites (`users.analyticsConsent`, `users.pushTokens`) remain passing.
  - Functions TypeScript build remains passing.

### W) Soft delete rollout (phase 1 - actions)
- Change:
  - Converted `DELETE /v1/actions/:id` from hard delete to soft delete:
    - writes `deletedAt` and `deletedBy`
  - Updated action read/update/list behavior:
    - `GET /v1/actions` excludes soft-deleted records
    - `GET /v1/actions/:id` returns `404` for soft-deleted records
    - `PATCH /v1/actions/:id` returns `404` for soft-deleted records
- Files:
  - `functions/src/routes/actions.ts`
  - `functions/src/routes/__tests__/actions.softDelete.test.ts`
- Validation:
  - New soft-delete tests verify logical delete persistence and read/update exclusion.
  - Existing actions pagination/sanitization tests remain passing.
  - Functions TypeScript build remains passing.

### X) Soft delete rollout (phase 2 - visits, medications, health logs, care tasks)
- Change:
  - Converted additional delete endpoints from hard delete to soft delete:
    - `DELETE /v1/visits/:id`
    - `DELETE /v1/meds/:id`
    - `DELETE /v1/health-logs/:id`
    - `DELETE /v1/care/:patientId/tasks/:taskId`
  - Added `deletedAt` / `deletedBy` initialization on create paths for newly-created visits, medications, reminders, health logs, and care tasks.
  - Updated read/list/update/retry/share flows to treat soft-deleted resources as not found where applicable.
  - Updated caregiver patient health-log and task list queries to exclude soft-deleted records.
  - Updated medication delete behavior to:
    - soft-delete medication
    - soft-disable related reminders
    - dismiss active medication nudges
  - Added composite indexes for new `deletedAt` query patterns across:
    - `visits`, `medications`, `actions`, `healthLogs`, `careTasks`
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/healthLogs.ts`
  - `functions/src/routes/care.ts`
  - `firestore.indexes.json`
  - `functions/src/routes/__tests__/visits.pagination.test.ts`
  - `functions/src/routes/__tests__/medications.pagination.test.ts`
  - `functions/src/routes/__tests__/medications.deleteCascade.test.ts`
  - `functions/src/routes/__tests__/healthLogs.softDelete.test.ts`
  - `functions/src/routes/__tests__/care.tasks.softDelete.test.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - New route tests pass for health-log and care-task soft-delete behavior.
  - Updated visit/medication pagination harnesses pass with `deletedAt == null` filters.
  - Updated medication delete cascade test verifies soft-delete/disable semantics.
  - Full backend route suite passes and Functions TypeScript build passes.

### Y) Soft delete rollout (phase 3 - medication reminders + retention purge)
- Change:
  - Converted reminder-specific delete behavior from hard delete to soft delete:
    - `DELETE /v1/medication-reminders/:id` now writes `enabled=false`, `deletedAt`, `deletedBy`.
  - Updated reminder list and mutation semantics:
    - `GET /v1/medication-reminders` excludes soft-deleted reminders.
    - `PUT /v1/medication-reminders/:id` returns `404` for soft-deleted reminders.
    - `POST /v1/medication-reminders` now allows recreation when only soft-deleted reminders exist for the same medication.
    - New reminders initialize `deletedAt: null`, `deletedBy: null`.
  - Converted orphan reminder cleanup to soft-delete:
    - `POST /v1/medication-reminders/cleanup-orphans` now soft-deletes orphaned reminders instead of hard deleting.
  - Updated reminder processor orphan handling:
    - orphaned reminders are soft-disabled (`enabled=false`, `deletedAt`, `deletedBy=system actor`) rather than removed.
  - Added retention purge implementation:
    - new service `purgeSoftDeletedMedicationReminders(...)` purges reminders older than retention threshold (default 90 days).
    - new daily scheduler export `purgeDeletedMedicationReminders` in `functions/src/index.ts`.
- Files:
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/services/medicationReminderService.ts`
  - `functions/src/index.ts`
  - `functions/src/routes/__tests__/medicationReminders.softDelete.test.ts`
  - `functions/src/services/__tests__/medicationReminderService.process.test.ts`
- Validation:
  - New route tests verify reminder soft-delete behavior, recreation with deleted duplicates, and orphan cleanup soft-delete behavior.
  - Service tests verify orphan reminders are soft-disabled (not hard deleted) and retention purge removes only expired soft-deleted reminders.
  - Combined backend route + reminder service suite passes (`93/93`) and Functions TypeScript build passes.

### Z) Soft delete rollout (phase 4 - restore workflows + unified retention purge)
- Change:
  - Added restore endpoints for soft-deleted resources:
    - `POST /v1/actions/:id/restore`
    - `POST /v1/visits/:id/restore` (restores visit + related soft-deleted visit actions)
    - `POST /v1/meds/:id/restore` (restores medication + reminders from the same delete event)
    - `POST /v1/health-logs/:id/restore`
    - `POST /v1/care/:patientId/tasks/:taskId/restore`
    - `POST /v1/medication-reminders/:id/restore` (requires active/available medication)
  - Added `not_deleted` conflict guards on restore routes to prevent accidental no-op restore calls.
  - Added unified retention purge service for all soft-deleted collections:
    - actions, visits, medications, healthLogs, medicationReminders, careTasks
  - Wired a daily scheduler (`purgeSoftDeletedData`) to run unified retention purge.
- Files:
  - `functions/src/routes/actions.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/healthLogs.ts`
  - `functions/src/routes/care.ts`
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/services/softDeleteRetentionService.ts`
  - `functions/src/index.ts`
  - `functions/src/routes/__tests__/actions.softDelete.test.ts`
  - `functions/src/routes/__tests__/healthLogs.softDelete.test.ts`
  - `functions/src/routes/__tests__/care.tasks.softDelete.test.ts`
  - `functions/src/routes/__tests__/medicationReminders.softDelete.test.ts`
  - `functions/src/routes/__tests__/visits.restore.test.ts`
  - `functions/src/routes/__tests__/medications.restore.test.ts`
  - `functions/src/services/__tests__/softDeleteRetentionService.test.ts`
- Validation:
  - New restore tests pass for visits and medications.
  - Existing soft-delete tests now include restore behavior assertions for actions, health logs, care tasks, and medication reminders.
  - New retention service tests verify cutoff + page-size behavior.
  - Combined backend route + service suite passes (`101/101`) and Functions TypeScript build passes.

### AA) Care dashboard alert fan-out elimination (web)
- Change:
  - Updated caregiver dashboard `NeedsAttentionPanel` to derive alert cards from the already-batched `GET /v1/care/overview` response instead of issuing one `GET /v1/care/:patientId/alerts` request per patient.
  - Updated caregiver `PatientCard` alert counters to use overview-provided alerts instead of issuing per-patient `useCareAlerts(...)` calls.
  - This removes per-patient alerts API fan-out from the caregiver list screen while preserving existing urgent/high/medium visual prioritization.
- Files:
  - `web-portal/app/care/page.tsx`
- Validation:
  - `web-portal` production build passes (`npm run build`).
  - Dashboard alert UI still renders prioritized alert cards/counts from overview data.

### AB) Quick-overview medication log query reduction
- Change:
  - Refactored `GET /v1/care/:patientId/quick-overview` to prefetch and reuse today medication snapshots (medications, reminders, logs, timezone) when computing `todaysMeds`.
  - Added conditional week-log fallback for activity cards:
    - if today has at least 5 medication logs, no extra week-log query is made.
    - if today has fewer than 5 logs, route fetches week logs once to fill activity.
  - Maintained response contract (`needsAttention`, `todaysMeds`, `recentActivity`, `healthSnapshot`).
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.quickOverview.test.ts`
- Validation:
  - New route tests verify:
    - single medication-log query when today logs are sufficient
    - fallback second query only when needed
  - Care route regression suite remains passing and Functions TypeScript build passes.

### AC) Patient detail med-status fan-out elimination (web)
- Change:
  - Extended `GET /v1/care/:patientId/quick-overview` response to include:
    - `date`
    - `upcomingActions` summary/list
    - `recentMedicationChanges` summary/list
  - Updated care patient detail page to use quick-overview as the single source for:
    - daily med summary/date
    - upcoming actions card data
    - recent medication changes card data
  - Removed duplicate patient-detail fetches for:
    - `GET /v1/care/:patientId/medication-status`
    - `GET /v1/care/:patientId/upcoming-actions`
    - `GET /v1/care/:patientId/med-changes`
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.quickOverview.test.ts`
  - `web-portal/lib/api/hooks.ts`
  - `web-portal/app/care/[patientId]/page.tsx`
- Validation:
  - Quick-overview tests now assert `date` output contract.
  - Functions care regression suite remains passing.
  - `web-portal` production build passes (`npm run build`).

### AD) Aggregate endpoint hardening (`trends`, `med-changes`, `upcoming-actions`)
- Change:
  - `GET /v1/care/:patientId/trends` now:
    - runs health/actions/visit/med-log reads concurrently for lower tail latency
    - computes adherence streak via daily pre-grouping instead of repeated per-day filtering
    - excludes soft-deleted actions/visits from aggregate metrics
  - `GET /v1/care/:patientId/med-changes` now excludes soft-deleted medications.
  - `GET /v1/care/:patientId/upcoming-actions` now excludes soft-deleted actions.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.aggregateFilters.test.ts`
- Validation:
  - New route tests verify deleted med/action/visit records are excluded from aggregate endpoint responses.
  - Functions care regression suite remains passing and Functions TypeScript build passes.
  - `web-portal` production build passes after endpoint contract updates.

### AE) Shared caregiver access service unification (`care` + `visits`)
- Change:
  - Extracted caregiver accepted-share lookup + cache/backfill logic into a shared service (`shareAccess`).
  - Updated `care` routes to use the shared service for caregiver access validation and accepted-share retrieval.
  - Updated `GET /v1/visits/:id` read authorization to use the same shared helper (`owner OR accepted caregiver`).
  - Updated share mutation cache invalidation to import from shared service directly (removes route-to-route coupling).
- Files:
  - `functions/src/services/shareAccess.ts`
  - `functions/src/routes/care.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/__tests__/visits.access.test.ts`
- Validation:
  - `npm test -- visits.access.test.ts`
  - `npm test -- care.acceptedSharesFallback.test.ts`
  - `npm test -- shares.invites.test.ts`
  - `npm test -- src/routes/__tests__/care`
  - `npm run build` (Functions)

### AF) Patient-detail perf guardrails expansion + alerts med-query dedupe
- Change:
  - Added patient-detail performance guardrail logging (`queryCount`, `elapsedMs`, budget comparisons) for:
    - `GET /v1/care/:patientId/summary`
    - `GET /v1/care/:patientId/quick-overview`
    - `GET /v1/care/:patientId/alerts`
    - `GET /v1/care/:patientId/trends`
    - `GET /v1/care/:patientId/medication-adherence`
    - `GET /v1/care/:patientId/med-changes`
    - `GET /v1/care/:patientId/upcoming-actions`
  - Refactored `GET /v1/care/:patientId/alerts` to reuse one medications snapshot for:
    - missed-dose status computation, and
    - medication-change alert generation
    eliminating the duplicate medications read path in this endpoint.
  - Expanded trends aggregate endpoint test guardrails to assert single-query behavior for core trend collections (`healthLogs`, `actions`, `visits`, `medicationLogs`).
  - Expanded query-count assertions for patient-detail endpoints:
    - summary and quick-overview per-collection query budgets
    - med-changes/upcoming-actions bounded single-read assertions
    - medication-adherence primary path + createdAt->loggedAt fallback path query budgets
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.alerts.test.ts`
  - `functions/src/routes/__tests__/care.aggregateFilters.test.ts`
  - `functions/src/routes/__tests__/care.summary.test.ts`
  - `functions/src/routes/__tests__/care.quickOverview.test.ts`
- Validation:
  - `npm test -- care.alerts.test.ts`
  - `npm test -- care.quickOverview.test.ts`
  - `npm test -- care.summary.test.ts`
  - `npm test -- care.aggregateFilters.test.ts`
  - `npm test -- src/routes/__tests__/care`
  - `npm run build` (Functions)

### AG) Visit processor post-commit transaction-state hardening
- Change:
  - Added explicit post-commit state lifecycle fields to visit summarization so non-atomic side effects are tracked on the visit document:
    - `postCommitStatus` (`pending`, `completed`, `partial_failure`)
    - `postCommitFailedOperations`
    - `postCommitLastAttemptAt`
    - `postCommitCompletedAt`
    - `postCommitCompletedOperations`
    - `postCommitOperationAttempts`
    - `postCommitOperationNextRetryAt`
    - `postCommitEscalatedAt`
  - Visit writes now clear stale post-commit fields when processing starts, then persist final post-commit outcome after `Promise.allSettled` side effects complete.
  - Partial post-commit failures (for example medication sync failure while summary write succeeds) are now persisted for operator visibility and future retry workflows.
- Files:
  - `functions/src/services/visitProcessor.ts`
  - `functions/src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts`
- Validation:
  - `npm test -- visitProcessor.caregiverAutoShare.test.ts`
  - `npm run build` (Functions)

### AH) Scheduled recovery for post-commit visit failures + dedupe guards
- Change:
  - Added a post-commit operation registry and recovery orchestration for:
    - `syncMedications`
    - `deleteTranscript`
    - `lumibotAnalysis`
    - `pushNotification`
    - `caregiverEmails`
  - Added `postCommitCompletedOperations` markers to dedupe retries and skip already-completed side effects.
  - Added `processVisitPostCommitRecoveries` service to:
    - scan visits with `processingStatus=completed`, `postCommitStatus=partial_failure`, and `postCommitRetryEligible=true`
    - retry failed post-commit operations
    - enforce per-operation max-attempt ceilings and exponential backoff via stored retry metadata
    - mark recovered visits `postCommitStatus=completed`
    - keep unresolved visits in `partial_failure` with updated failed-operation list and retry eligibility
    - clear stale failed-operation lists when all listed failures were already marked completed
    - emit escalation logs and set `postCommitEscalatedAt` when repeated failures hit alert threshold
  - Added scheduled function `retryVisitPostCommitOperations` (every 30 minutes, UTC) to run this reconciliation workflow.
  - Added Firestore composite index for the recovery query (`processingStatus`, `postCommitStatus`, `postCommitRetryEligible`, `postCommitLastAttemptAt`).
- Files:
  - `functions/src/services/visitPostCommitOperations.ts`
  - `functions/src/services/visitPostCommitRecoveryService.ts`
  - `functions/src/services/__tests__/visitPostCommitRecoveryService.test.ts`
  - `functions/src/index.ts`
  - `firestore.indexes.json`
- Validation:
  - `npm test -- visitPostCommitRecoveryService.test.ts`
  - `npm test -- visitProcessor.caregiverAutoShare.test.ts`
  - `npm run build` (Functions)

### AI) Operator escalation reporting + acknowledgment workflow
- Change:
  - Added operator access gating (`admin`/`operator`/`support` claims or `OPERATOR_UIDS` allowlist) for incident endpoints.
  - Added operator incident-reporting endpoint:
    - `GET /v1/visits/ops/post-commit-escalations`
    - paginated list of escalated visits with failed/completed operations, attempt counts, next retry windows, and escalation acknowledgment metadata.
  - Added operator acknowledgment endpoint:
    - `POST /v1/visits/ops/post-commit-escalations/:id/acknowledge`
    - records `postCommitEscalationAcknowledgedAt`, `postCommitEscalationAcknowledgedBy`, and optional note.
  - Added operator incident lifecycle controls:
    - `POST /v1/visits/ops/post-commit-escalations/:id/resolve`
    - `POST /v1/visits/ops/post-commit-escalations/:id/reopen`
    - records/clears resolution metadata (`postCommitEscalationResolvedAt`, `postCommitEscalationResolvedBy`, `postCommitEscalationResolutionNote`).
  - Added Firestore composite index for escalation reporting query (`postCommitStatus`, `postCommitEscalatedAt desc`).
- Files:
  - `functions/src/middlewares/auth.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/__tests__/visits.postCommitEscalations.test.ts`
  - `firestore.indexes.json`
- Validation:
  - `npm test -- visits.postCommitEscalations.test.ts`
  - `npm test -- visits.access.test.ts`
  - `npm run build` (Functions)

### AJ) Hourly escalation reporting for incident visibility
- Change:
  - Added `reportPostCommitEscalations` reporting service to scan escalated post-commit failures and classify:
    - unacknowledged escalations
    - acknowledged escalations
    - sample unacknowledged visit IDs for triage
  - Added hourly scheduler `reportVisitPostCommitEscalations` that runs this report and emits:
    - alert-level logs when unacknowledged escalations are present
    - informational logs when no unacknowledged escalations remain
- Files:
  - `functions/src/services/postCommitEscalationReportingService.ts`
  - `functions/src/services/__tests__/postCommitEscalationReportingService.test.ts`
  - `functions/src/index.ts`
- Validation:
  - `npm test -- postCommitEscalationReportingService.test.ts`
  - `npm run build` (Functions)

### AK) External incident destination + operator UI escalation wiring
- Change:
  - Added optional external incident dispatch for post-commit escalation reports using environment-configured webhook settings:
    - `POST_COMMIT_ESCALATION_WEBHOOK_URL`
    - `POST_COMMIT_ESCALATION_WEBHOOK_TOKEN` (optional bearer)
    - `POST_COMMIT_ESCALATION_WEBHOOK_TIMEOUT_MS` (optional)
  - Reporting service now posts structured escalation payloads when unacknowledged escalations are present and logs non-blocking delivery failures.
  - Added operator UI integration in web portal:
    - new protected route: `GET /ops/escalations`
    - list + pagination controls for `GET /v1/visits/ops/post-commit-escalations`
    - acknowledge/resolve/reopen actions wired to operator endpoints
    - operator-aware navigation entry (`Ops`) for users with operator claims/allowlist.
- Files:
  - `functions/src/config.ts`
  - `functions/src/services/postCommitEscalationReportingService.ts`
  - `functions/src/services/__tests__/postCommitEscalationReportingService.test.ts`
  - `web-portal/lib/hooks/useOperatorAccess.ts`
  - `web-portal/lib/api/hooks.ts`
  - `web-portal/app/(protected)/ops/escalations/page.tsx`
  - `web-portal/components/layout/TopNavigation.tsx`
  - `web-portal/components/layout/Sidebar.tsx`
  - `web-portal/components/layout/MobileSidebarDrawer.tsx`
- Validation:
  - `npm test -- postCommitEscalationReportingService.test.ts` (Functions)
  - `npm test -- visits.postCommitEscalations.test.ts` (Functions)
  - `npm run build` (Functions)
  - `npm test` (web-portal)
  - `npm run build` (web-portal)

### AL) Soft-delete phase 5 backend: restore audit trail + operator guardrails
- Change:
  - Added shared restore audit service and collection (`restoreAuditLogs`) with normalized restore event payloads:
    - resource type/id
    - owner user id
    - actor user id/category (`owner`/`operator`/`delegate`)
    - optional restore reason
    - metadata
    - created timestamp
  - Wired restore audit writes into restore endpoints for:
    - actions
    - visits
    - medications
    - health logs
    - medication reminders
    - care tasks
  - Added operator cross-user restore guardrail:
    - operator restores for another user now require a restore reason.
  - Added operator-facing restore audit endpoint:
    - `GET /v1/users/ops/restore-audit`
    - supports limit/cursor and optional filters (`resourceType`, `ownerUserId`, `actorUserId`).
    - operator access enforced (`admin`/`operator`/`support` claims or `OPERATOR_UIDS` allowlist).
- Files:
  - `functions/src/services/restoreAuditService.ts`
  - `functions/src/routes/actions.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/healthLogs.ts`
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/routes/care.ts`
  - `functions/src/routes/users.ts`
  - `functions/src/routes/__tests__/users.restoreAudit.test.ts`
  - `functions/src/routes/__tests__/visits.restore.test.ts`
  - `functions/src/routes/__tests__/medications.restore.test.ts`
- Validation:
  - `npm test -- visits.restore.test.ts medications.restore.test.ts users.restoreAudit.test.ts actions.softDelete.test.ts healthLogs.softDelete.test.ts medicationReminders.softDelete.test.ts care.tasks.softDelete.test.ts` (Functions)
  - `npm test -- healthLogs.softDelete.test.ts users.restoreAudit.test.ts` (Functions)
  - `npm run build` (Functions)

### AM) Soft-delete phase 5 web follow-on: operator restore-audit workflow
- Change:
  - Added protected operator UI route for restore audit review:
    - `GET /ops/restore-audit`
  - Added operator-specific workflow controls:
    - filter controls (`resourceType`, `ownerUserId`, `actorUserId`)
    - page-level CSV export for loaded restore audit events
    - escalation deep-link for restored visits (`/ops/escalations?visitId=...`)
    - periodic refresh + cursor pagination controls
  - Tightened frontend access behavior:
    - restore-audit query now executes only after operator-access checks pass.
  - Added escalation page deep-link filter handling:
    - `visitId` query param filters escalation cards and provides one-click clear.
- Files:
  - `web-portal/app/(protected)/ops/restore-audit/page.tsx`
  - `web-portal/app/(protected)/ops/escalations/page.tsx`
  - `web-portal/lib/api/hooks.ts`
  - `web-portal/lib/hooks/useOperatorAccess.ts`
- Validation:
  - `npm run build` (web-portal)
  - `npm test` (web-portal)
  - `npm test -- users.restoreAudit.test.ts visits.restore.test.ts medications.restore.test.ts` (Functions)

### AN) Phase 1 bundle 2: SDK/mobile cursor pagination follow-through
- Change:
  - Added cursor-aware page contracts to shared SDK API client:
    - `CursorPage<T>` response type
    - `listPage(...)` methods for visits/actions/medications
    - header parsing for `X-Has-More` and `X-Next-Cursor`
  - Added shared SDK infinite cursor hooks:
    - `useInfiniteVisits`
    - `useInfiniteActionItems`
    - `useInfiniteMedications`
  - Added mobile paginated wrappers with session-scoped query keys:
    - `usePaginatedVisits`
    - `usePaginatedActionItems`
    - `usePaginatedMedications`
  - Updated high-volume mobile list screens to use cursor pagination and explicit load-more controls:
    - visits
    - actions
    - medications
  - Updated mobile visits/actions tests for new paginated hook contracts.
  - Added SDK cursor pagination regression tests for page-boundary and cursor propagation behavior:
    - header metadata parsing (`X-Has-More`, `X-Next-Cursor`)
    - terminal-page fallback when headers are absent
    - no stale cursor leakage across sequential list requests
  - Completed web caregiver API consumer sweep for high-volume list views with cursor paging + load-more UX:
    - patient visits
    - patient action items
    - patient medications
    - patient-detail care task panel
- Files:
  - `packages/sdk/src/api-client.ts`
  - `packages/sdk/src/hooks/index.ts`
  - `packages/sdk/package.json`
  - `packages/sdk/tests/api-client.pagination.test.mjs`
  - `mobile/lib/api/hooks.ts`
  - `mobile/app/visits.tsx`
  - `mobile/app/actions.tsx`
  - `mobile/app/medications.tsx`
  - `mobile/__tests__/visits.test.tsx`
  - `mobile/__tests__/actions.test.tsx`
  - `web-portal/lib/api/hooks.ts`
  - `web-portal/app/care/[patientId]/visits/page.tsx`
  - `web-portal/app/care/[patientId]/actions/page.tsx`
  - `web-portal/app/care/[patientId]/medications/page.tsx`
  - `web-portal/app/care/[patientId]/page.tsx`
- Validation:
  - `npm test` (packages/sdk)
  - `npm run build` (packages/sdk)
  - `npx tsc --noEmit` (mobile)
  - `npm test` (mobile)
  - `npm test -- actions.pagination.test.ts visits.pagination.test.ts medications.pagination.test.ts care.pagination.test.ts` (functions)
  - `npm test` (web-portal)
  - `npm run build` (web-portal)
  - `npm run build` (functions)

### AO) Phase 1 bundle 3 completion: authorization centralization + `care.ts` modularization
- Change:
  - Added reusable caregiver access guard middleware helper:
    - `ensureCaregiverAccessOrReject(caregiverId, patientId, res, options?)`
    - supports optional endpoint-specific forbidden message and forbidden-status side effects.
  - Replaced repeated inline `validateCaregiverAccess(...)` branches across caregiver patient endpoints in `care.ts` with shared guard calls.
  - Continued route modularization by extracting care task endpoints from `care.ts` into a dedicated module and registering them through the parent router:
    - `GET /v1/care/:patientId/tasks`
    - `POST /v1/care/:patientId/tasks`
    - `PATCH /v1/care/:patientId/tasks/:taskId`
    - `DELETE /v1/care/:patientId/tasks/:taskId`
    - `POST /v1/care/:patientId/tasks/:taskId/restore`
  - Extracted caregiver note endpoints into a dedicated module and registered them through the parent router:
    - `GET /v1/care/:patientId/notes`
    - `PUT /v1/care/:patientId/visits/:visitId/note`
    - `DELETE /v1/care/:patientId/visits/:visitId/note`
  - Extended shared authorization guards to `visits.ts` with a reusable middleware module:
    - `ensureVisitReadAccessOrReject` for owner-or-accepted-caregiver visit reads
    - `ensureVisitOwnerAccessOrReject` for owner/operator visit write checks
    - Applied across `GET /v1/visits/:id`, `PATCH /v1/visits/:id`, `DELETE /v1/visits/:id`, `POST /v1/visits/:id/retry`, `POST /v1/visits/:id/share-with-caregivers`, and `POST /v1/visits/:id/restore`.
  - Extracted caregiver health-log endpoint into a dedicated module and registered via parent care router:
    - `GET /v1/care/:patientId/health-logs`
  - Preserved route behavior for:
    - standard forbidden payload (`You do not have access to this patient's data`)
    - existing `Access denied` payloads on aggregate/task-oriented endpoints
    - perf-tracker `statusCode = 403` bookkeeping where applicable.
- Files:
  - `functions/src/middlewares/caregiverAccess.ts`
  - `functions/src/middlewares/visitAccess.ts`
  - `functions/src/middlewares/__tests__/visitAccess.test.ts`
  - `functions/src/routes/care/tasks.ts`
  - `functions/src/routes/care/notes.ts`
  - `functions/src/routes/care/healthLogs.ts`
  - `functions/src/routes/care.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/middlewares/__tests__/caregiverAccess.test.ts`
- Validation:
  - `npm test -- src/middlewares/__tests__/visitAccess.test.ts src/middlewares/__tests__/caregiverAccess.test.ts visits.access.test.ts visits.restore.test.ts visits.retry.test.ts care.pagination.test.ts care.quickOverview.test.ts care.summary.test.ts care.alerts.test.ts care.overview.test.ts care.aggregateFilters.test.ts care.medicationStatus.test.ts care.acceptedSharesFallback.test.ts care.tasks.softDelete.test.ts` (functions)
  - `npm run build` (functions)

### AP) Phase 1 follow-through: restore-audit triage persistence + authorization sweep + legacy metadata sanitization
- Change:
  - Added persisted restore-audit triage state across backend + ops tooling:
    - restore audit events now initialize `triageStatus`, `triageNote`, `triageUpdatedAt`, `triageUpdatedBy`
    - operator restore-audit list API now supports triage-status filtering
    - new operator triage update endpoint: `PATCH /v1/users/ops/restore-audit/:id/triage`
    - ops web UI now supports triage filtering/editing and CSV export of triage fields
  - Extended owner/deleted-resource authorization centralization with shared middleware:
    - new `ensureResourceOwnerAccessOrReject(...)` helper + middleware tests
    - migrated duplicated access checks in `actions`, `medicationReminders`, `medications`, and `nudges`
  - Closed remaining backend sanitization gap for caregiver visit metadata editing:
    - `PATCH /v1/care/:patientId/visits/:visitId` now sanitizes `provider`, `specialty`, and `location` with shared text sanitizer and max-length bounds.
  - Continued `care.ts` modularization by extracting caregiver visit-metadata route registration to a dedicated module:
    - `functions/src/routes/care/visitMetadata.ts`
    - preserves `PATCH /v1/care/:patientId/visits/:visitId` behavior while reducing parent router surface area.
  - Continued `care.ts` modularization by extracting caregiver medication-adherence route registration to a dedicated module:
    - `functions/src/routes/care/medicationAdherence.ts`
    - preserves `GET /v1/care/:patientId/medication-adherence` behavior and query/perf instrumentation.
  - Continued `care.ts` modularization by extracting caregiver quick-overview and alerts route registration to dedicated modules:
    - `functions/src/routes/care/quickOverview.ts`
    - `functions/src/routes/care/alerts.ts`
    - preserves:
      - `GET /v1/care/:patientId/quick-overview` behavior, cache headers, and query/perf fallback instrumentation
      - `GET /v1/care/:patientId/alerts` behavior and query/perf instrumentation.
  - Continued `care.ts` modularization by extracting caregiver medication-change and upcoming-actions route registration to dedicated modules:
    - `functions/src/routes/care/medicationChanges.ts`
    - `functions/src/routes/care/upcomingActions.ts`
    - preserves:
      - `GET /v1/care/:patientId/med-changes` behavior and soft-delete filtering
      - `GET /v1/care/:patientId/upcoming-actions` behavior and soft-delete filtering/sorting.
- Files:
  - `functions/src/services/restoreAuditService.ts`
  - `functions/src/routes/users.ts`
  - `web-portal/lib/api/hooks.ts`
  - `web-portal/app/(protected)/ops/restore-audit/page.tsx`
  - `functions/src/middlewares/resourceAccess.ts`
  - `functions/src/middlewares/__tests__/resourceAccess.test.ts`
  - `functions/src/routes/actions.ts`
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/nudges.ts`
  - `functions/src/routes/care.ts`
  - `functions/src/routes/care/visitMetadata.ts`
  - `functions/src/routes/care/medicationAdherence.ts`
  - `functions/src/routes/care/quickOverview.ts`
  - `functions/src/routes/care/alerts.ts`
  - `functions/src/routes/care/medicationChanges.ts`
  - `functions/src/routes/care/upcomingActions.ts`
  - `functions/src/routes/__tests__/care.visitMetadata.sanitization.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.restoreAudit.test.ts src/middlewares/__tests__/resourceAccess.test.ts src/routes/__tests__/actions.softDelete.test.ts src/routes/__tests__/medicationReminders.softDelete.test.ts src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/medications.deleteCascade.test.ts src/routes/__tests__/visits.access.test.ts` (functions)
  - `npm test -- src/routes/__tests__/care.visitMetadata.sanitization.test.ts src/routes/__tests__/care.pagination.test.ts src/routes/__tests__/care.tasks.softDelete.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions)
  - `npm run build` (functions)

### AQ) Phase 1 follow-through: `care.ts` modularization completion sweep
- Change:
  - Completed extraction of remaining inline caregiver route domains from `care.ts` into dedicated modules:
    - `overview`
    - patient resource listing/detail (`medications`, `actions`, `visits`, `visits/:visitId`)
    - `medication-status`
    - `summary`
    - `export/summary`
  - `care.ts` now serves as router composition + shared helper surface (no direct `careRouter.get/post/patch/delete` handlers).
  - Continued preserving route contracts by dependency-injecting shared helpers/perf trackers into new modules.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/care/overview.ts`
  - `functions/src/routes/care/patientResources.ts`
  - `functions/src/routes/care/medicationStatus.ts`
  - `functions/src/routes/care/summary.ts`
  - `functions/src/routes/care/exportSummary.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care*.test.ts` (functions)
  - `npm run build` (functions)

### AR) Phase 1 architecture follow-through: `medications.ts` schedule/compliance modularization kickoff
- Change:
  - Extracted medication schedule/compliance route domain from `medications.ts` into a dedicated module:
    - `GET /v1/meds/schedule/today`
    - `POST /v1/meds/schedule/mark`
    - `POST /v1/meds/schedule/mark-batch`
    - `POST /v1/meds/schedule/snooze`
    - `GET /v1/meds/compliance`
  - Preserved behavior by dependency-injecting existing schedule helper functions (`timezone/day-boundary resolution`, `dose-key/log-date handling`, and completion-log upsert helpers) into module registration.
  - Reduced `medications.ts` surface from the prior monolith by moving the highest-churn schedule endpoints into `routes/medications/schedule.ts`.
- Files:
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/medications/schedule.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.scheduleToday.test.ts src/routes/__tests__/medications.scheduleMark.test.ts src/routes/__tests__/medications.pagination.test.ts src/routes/__tests__/medications.deleteCascade.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions)
  - `npm run build` (functions)

### AS) Phase 1 architecture follow-through: `medications.ts` query/lifecycle modularization
- Change:
  - Extracted medication query + lifecycle route groups into dedicated modules:
    - `GET /v1/meds`
    - `GET /v1/meds/:id`
    - `DELETE /v1/meds/:id`
    - `POST /v1/meds/:id/restore`
  - Preserved behavior and response contracts by reusing existing ownership checks, pagination/cursor semantics, soft-delete cascade logic, and restore-audit recording.
  - `medications.ts` now registers specialized route modules (`query`, `lifecycle`, `schedule`) as part of a composition-first split.
- Files:
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/medications/query.ts`
  - `functions/src/routes/medications/lifecycle.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.pagination.test.ts src/routes/__tests__/medications.deleteCascade.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/medications.scheduleToday.test.ts src/routes/__tests__/medications.scheduleMark.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions)
  - `npm run build` (functions)

### AT) Phase 1 architecture follow-through: `medications.ts` core write/safety modularization
- Change:
  - Extracted the remaining medication core write/safety route group into a dedicated module:
    - `POST /v1/meds`
    - `PATCH /v1/meds/:id`
    - `POST /v1/meds/:id/acknowledge-warnings`
    - `POST /v1/meds/safety-check`
  - `medications.ts` now composes module registrations (`query`, `core`, `lifecycle`, `schedule`) with route logic moved out of the parent file.
- Files:
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/medications/core.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.pagination.test.ts src/routes/__tests__/medications.deleteCascade.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/medications.scheduleToday.test.ts src/routes/__tests__/medications.scheduleMark.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions)
  - `npm run build` (functions)

### AU) Phase 1 architecture follow-through: `medications.ts` helper extraction + core-route regression coverage
- Change:
  - Extracted shared medication route helper logic into `routes/medications/helpers.ts`:
    - default reminder-time mapping
    - user timezone resolution
    - day-boundary/time parsing helpers
    - completion-log lookup/upsert helpers for schedule idempotency
  - Reduced parent `medications.ts` to a composition-only router registration file (~52 lines).
  - Added focused core-route regression tests for:
    - `POST /v1/meds`
    - `PATCH /v1/meds/:id`
    - `POST /v1/meds/:id/acknowledge-warnings`
    - `POST /v1/meds/safety-check`
- Files:
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/medications/helpers.ts`
  - `functions/src/routes/__tests__/medications.core.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.core.test.ts src/routes/__tests__/medications.pagination.test.ts src/routes/__tests__/medications.deleteCascade.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/medications.scheduleToday.test.ts src/routes/__tests__/medications.scheduleMark.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### AV) Phase 1 authorization follow-through: health logs guard centralization
- Change:
  - Replaced inline owner/operator authorization checks in health logs delete/restore endpoints with shared guard middleware:
    - `ensureResourceOwnerAccessOrReject(...)`
  - Preserved endpoint-specific semantics:
    - delete forbidden message (`You do not have permission to delete this health log`)
    - restore forbidden message (`You do not have permission to restore this health log`)
    - operator cross-user restore still requires explicit reason.
- Files:
  - `functions/src/routes/healthLogs.ts`
- Validation:
  - `npm test -- src/routes/__tests__/healthLogs.softDelete.test.ts src/routes/__tests__/healthLogs.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### AW) Phase 1 authorization follow-through: care visit-ownership guard centralization
- Change:
  - Replaced inline patient-visit ownership checks with shared guard middleware in caregiver route modules:
    - caregiver notes visit note upsert path
    - caregiver visit metadata update path
    - caregiver single-visit summary path
  - Preserved existing endpoint semantics by keeping not-found masking for unauthorized single-visit summary reads and visit-not-in-patient checks.
- Files:
  - `functions/src/routes/care/notes.ts`
  - `functions/src/routes/care/visitMetadata.ts`
  - `functions/src/routes/care/patientResources.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.visitMetadata.sanitization.test.ts src/routes/__tests__/care.pagination.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### AX) Phase 1 authorization follow-through: share owner/participant guard centralization
- Change:
  - Added shared participant-access helper:
    - `ensureResourceParticipantAccessOrReject(...)`
  - Replaced inline share authorization checks with shared middleware in routes:
    - owner check for `PATCH /v1/shares/invites/:id`
    - participant (owner/caregiver) check for `GET /v1/shares/:id`
    - owner check for `PATCH /v1/shares/revoke/:token`
  - Preserved endpoint-specific not-found/forbidden response messages.
- Files:
  - `functions/src/middlewares/resourceAccess.ts`
  - `functions/src/middlewares/__tests__/resourceAccess.test.ts`
  - `functions/src/routes/shares.ts`
- Validation:
  - `npm test -- src/middlewares/__tests__/resourceAccess.test.ts src/routes/__tests__/shares.invites.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### AY) Phase 1 authorization follow-through: care task ownership guard centralization
- Change:
  - Replaced repeated inline caregiver/patient task ownership checks with shared guard middleware in caregiver task routes:
    - `PATCH /v1/care/:patientId/tasks/:taskId`
    - `DELETE /v1/care/:patientId/tasks/:taskId`
    - `POST /v1/care/:patientId/tasks/:taskId/restore`
  - Preserved existing behavior for:
    - caregiver access gate (`Access denied`)
    - soft-deleted task handling (`not_found`)
    - operator cross-user restore reason requirements.
- Files:
  - `functions/src/routes/care/tasks.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.tasks.softDelete.test.ts src/routes/__tests__/care.pagination.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### AZ) Phase 1 authorization follow-through: operator-only guard centralization
- Change:
  - Added shared operator guard helper:
    - `ensureOperatorAccessOrReject(...)`
  - Replaced repeated inline operator gate checks in:
    - `GET /v1/visits/ops/post-commit-escalations`
    - `POST /v1/visits/ops/post-commit-escalations/:id/acknowledge`
    - `POST /v1/visits/ops/post-commit-escalations/:id/resolve`
    - `POST /v1/visits/ops/post-commit-escalations/:id/reopen`
    - `GET /v1/users/ops/restore-audit`
    - `PATCH /v1/users/ops/restore-audit/:id/triage`
- Files:
  - `functions/src/middlewares/auth.ts`
  - `functions/src/middlewares/__tests__/auth.operatorAccess.test.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/users.ts`
- Validation:
  - `npm test -- src/middlewares/__tests__/auth.operatorAccess.test.ts src/routes/__tests__/visits.postCommitEscalations.test.ts src/routes/__tests__/users.restoreAudit.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### BA) Phase 1 authorization follow-through: cross-user restore reason guard centralization
- Change:
  - Added shared operator restore helper:
    - `ensureOperatorRestoreReasonOrReject(...)`
  - Replaced duplicated operator cross-user restore reason checks in:
    - `POST /v1/actions/:id/restore`
    - `POST /v1/visits/:id/restore`
    - `POST /v1/meds/:id/restore`
    - `POST /v1/medication-reminders/:id/restore`
    - `POST /v1/health-logs/:id/restore`
    - `POST /v1/care/:patientId/tasks/:taskId/restore`
  - Preserved existing response semantics (`400 reason_required`) and owner/operator access behavior.
- Files:
  - `functions/src/middlewares/auth.ts`
  - `functions/src/middlewares/__tests__/auth.operatorAccess.test.ts`
  - `functions/src/routes/actions.ts`
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/medications/lifecycle.ts`
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/routes/healthLogs.ts`
  - `functions/src/routes/care/tasks.ts`
- Validation:
  - `npm test -- src/middlewares/__tests__/auth.operatorAccess.test.ts src/routes/__tests__/visits.restore.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/healthLogs.softDelete.test.ts src/routes/__tests__/care.tasks.softDelete.test.ts src/routes/__tests__/actions.softDelete.test.ts src/routes/__tests__/medicationReminders.softDelete.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### BB) Phase 1 performance follow-through: caregiver cache-control header expansion
- Change:
  - Added cache headers to additional safe caregiver read endpoints:
    - `GET /v1/care/:patientId/alerts` -> `private, max-age=30`
    - `GET /v1/care/:patientId/medication-status` -> `private, max-age=30`
    - `GET /v1/care/:patientId/upcoming-actions` -> `private, max-age=30`
    - `GET /v1/care/:patientId/trends` -> `private, max-age=60`
    - `GET /v1/care/:patientId/med-changes` -> `private, max-age=60`
  - Added route-level assertions to ensure cache header policy remains stable.
- Files:
  - `functions/src/routes/care/alerts.ts`
  - `functions/src/routes/care/medicationStatus.ts`
  - `functions/src/routes/care/upcomingActions.ts`
  - `functions/src/routes/care/trends.ts`
  - `functions/src/routes/care/medicationChanges.ts`
  - `functions/src/routes/__tests__/care.alerts.test.ts`
  - `functions/src/routes/__tests__/care.medicationStatus.test.ts`
  - `functions/src/routes/__tests__/care.aggregateFilters.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.alerts.test.ts src/routes/__tests__/care.medicationStatus.test.ts src/routes/__tests__/care.aggregateFilters.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `113/113`)
  - `npm run build` (functions)

### BC) Phase 1 authorization follow-through: owner predicate extraction for non-response flows
- Change:
  - Added shared helper:
    - `hasResourceOwnerAccess(...)`
  - Replaced remaining inline owner checks in:
    - `POST /v1/meds/schedule/mark-batch` (per-dose forbidden error path)
    - `POST /v1/nudges/debug/analyze-visit` (owner-only debug visit analysis)
  - Preserved endpoint behavior (`forbidden` response semantics and per-dose error collection).
- Files:
  - `functions/src/middlewares/resourceAccess.ts`
  - `functions/src/middlewares/__tests__/resourceAccess.test.ts`
  - `functions/src/routes/medications/schedule.ts`
  - `functions/src/routes/nudgesDebug.ts`
  - `functions/src/routes/__tests__/medications.scheduleMark.test.ts`
- Validation:
  - `npm test -- src/middlewares/__tests__/resourceAccess.test.ts src/routes/__tests__/medications.scheduleMark.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `114/114`)
  - `npm run build` (functions)

### BD) Phase 1 performance follow-through: medication-status guardrail instrumentation
- Change:
  - Added patient-detail perf guardrail instrumentation (`queryCount`, `elapsedMs`, budget checks) to:
    - `GET /v1/care/:patientId/medication-status`
  - Wired `medication-status` into care-router guardrail budget registry and endpoint tracker factory.
  - Kept existing query reuse behavior and cache header semantics unchanged.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/care/medicationStatus.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.medicationStatus.test.ts src/routes/__tests__/care.quickOverview.test.ts src/routes/__tests__/care.summary.test.ts src/routes/__tests__/care.overview.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `114/114`)
  - `npm run build` (functions)

### BE) Phase 1 index follow-through: query-inventory composites
- Change:
  - Added missing Firestore composite indexes for current high-frequency query patterns:
    - `healthLogs(userId, sourceId, createdAt desc)`
    - `medicationReminders(userId, enabled)`
    - `medicationReminders(userId, medicationId)`
    - `medicationLogs(userId, medicationId, loggedAt desc)`
    - `medicationLogs(userId, medicationId, createdAt desc)`
    - `actions(visitId, userId)`
  - Kept existing caregiver, soft-delete, and post-commit escalation composites intact.
- Files:
  - `firestore.indexes.json`
- Validation:
  - `npm test -- src/routes/__tests__` (functions, `114/114`)
  - `npm run build` (functions)

### BF) Phase 1 data-consistency follow-through: soft-delete filtering on caregiver detail reads
- Change:
  - Excluded soft-deleted records from additional caregiver detail endpoints:
    - `GET /v1/care/:patientId/summary` now excludes deleted actions and selects latest non-deleted visit
    - `GET /v1/care/:patientId/quick-overview` now excludes deleted health logs and deleted visits in activity/needs-attention
    - `GET /v1/care/:patientId/alerts` now excludes deleted actions/health logs/medications
    - `GET /v1/care/:patientId/trends` now excludes deleted health logs
  - Preserved existing response contracts and cache/header behavior.
- Files:
  - `functions/src/routes/care/summary.ts`
  - `functions/src/routes/care/quickOverview.ts`
  - `functions/src/routes/care/alerts.ts`
  - `functions/src/routes/care/trends.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.summary.test.ts src/routes/__tests__/care.quickOverview.test.ts src/routes/__tests__/care.alerts.test.ts src/routes/__tests__/care.aggregateFilters.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `114/114`)
  - `npm run build` (functions)

### BG) Phase 1 authorization follow-through: share-accept owner predicate centralization
- Change:
  - Replaced remaining inline caregiver owner predicate in direct share acceptance flow with shared helper:
    - `hasResourceOwnerAccess(..., { ownerField: 'caregiverUserId' })`
  - Preserved existing legacy email fallback + caregiver ID migration behavior in `/v1/shares/accept-invite`.
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/middlewares/resourceAccess.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/middlewares/__tests__/resourceAccess.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `114/114`)
  - `npm run build` (functions)

### BH) Phase 1 performance/cache follow-through: caregiver paginated resource read hardening
- Change:
  - Hardened caregiver paginated patient-resource routes to keep soft-delete behavior and pagination cursors consistent:
    - `GET /v1/care/:patientId/medications` uses `deletedAt == null` and rejects deleted cursor docs.
    - `GET /v1/care/:patientId/actions` uses `deletedAt == null` and rejects deleted cursor docs.
    - `GET /v1/care/:patientId/visits` uses `deletedAt == null` and rejects deleted cursor docs.
  - Expanded private response caching for safe caregiver list/read endpoints:
    - `GET /v1/care/:patientId/medications` -> `private, max-age=30`
    - `GET /v1/care/:patientId/actions` -> `private, max-age=30`
    - `GET /v1/care/:patientId/visits` -> `private, max-age=30`
    - `GET /v1/care/:patientId/visits/:visitId` -> `private, max-age=30`
    - `GET /v1/care/:patientId/notes` -> `private, max-age=30`
    - `GET /v1/care/:patientId/tasks` -> `private, max-age=30`
    - `GET /v1/care/:patientId/health-logs` -> `private, max-age=30`
  - Added regression assertions for new cache headers and deleted-cursor rejection paths in care pagination tests.
- Files:
  - `functions/src/routes/care/patientResources.ts`
  - `functions/src/routes/care/notes.ts`
  - `functions/src/routes/care/tasks.ts`
  - `functions/src/routes/care/healthLogs.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.pagination.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `117/117`)
  - `npm run build` (functions)

### BI) Phase 1 cache-policy follow-through: medication-adherence endpoint
- Change:
  - Added private cache header policy to:
    - `GET /v1/care/:patientId/medication-adherence` -> `private, max-age=30`
  - Added route test assertions to keep cache policy pinned for both:
    - primary `createdAt` medication-log query path
    - fallback `loggedAt` medication-log query path
- Files:
  - `functions/src/routes/care/medicationAdherence.ts`
  - `functions/src/routes/__tests__/care.aggregateFilters.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.aggregateFilters.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `117/117`)
  - `npm run build` (functions)

### BJ) Phase 1 authorization follow-through: share status transition owner checks
- Change:
  - Replaced inline identity comparisons in `PATCH /v1/shares/:id` with shared owner predicate helper usage:
    - owner revoke path now uses `hasResourceOwnerAccess(..., { ownerField: 'ownerId' })`
    - caregiver accept path now uses `hasResourceOwnerAccess(..., { ownerField: 'caregiverUserId' })`
  - Added direct route coverage for share status transitions:
    - owner can revoke
    - caregiver can accept pending share
    - non-participant receives `invalid_transition`
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `120/120`)
  - `npm run build` (functions)

### BK) Phase 1 data-consistency/cache follow-through: caregiver export summary reads
- Change:
  - Hardened `GET /v1/care/:patientId/export/summary` read consistency:
    - visits query now excludes soft-deleted visits (`deletedAt == null`)
    - pending actions query now excludes soft-deleted actions (`deletedAt == null`)
  - Added private cache header for export summary response:
    - `Cache-Control: private, max-age=30`
  - Added export-summary route coverage in care pagination tests:
    - verifies deleted visits/actions are excluded from summary totals
    - verifies cache header policy
  - Hardened `parseActionDueAt(...)` to safely handle environments where mocked `admin.firestore.Timestamp` is non-constructor (test/runtime robustness).
- Files:
  - `functions/src/routes/care/exportSummary.ts`
  - `functions/src/routes/care.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.pagination.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `121/121`)
  - `npm run build` (functions)

### BL) Phase 1 authorization follow-through: users caregiver revoke owner checks
- Change:
  - Replaced inline owner checks in `DELETE /v1/users/me/caregivers/:id` with shared owner predicate helper usage:
    - share ownership checks now use `hasResourceOwnerAccess(..., { ownerField: 'ownerId' })`
    - invite ownership checks now use `hasResourceOwnerAccess(..., { ownerField: 'ownerId' })`
  - Added focused route coverage for:
    - owner revokes canonical share by id
    - owner revokes pending invite by id
    - non-owner receives `not_found`
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/routes/__tests__/users.caregiverRevoke.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.caregiverRevoke.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BM) Phase 1 performance follow-through: export-summary guardrails
- Change:
  - Added patient-detail perf guardrail instrumentation to:
    - `GET /v1/care/:patientId/export/summary`
  - Wired endpoint into care perf budget registry (`queryCount` + `elapsedMs` tracking with warning thresholds).
  - Added per-route query accounting on export-summary reads (profile, visits, medications, actions) while preserving response contract and cache header behavior.
  - Added query-count assertions in caregiver pagination/export-summary route tests to guard against duplicate visits/medications/actions reads.
- Files:
  - `functions/src/routes/care.ts`
  - `functions/src/routes/care/exportSummary.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.pagination.test.ts src/routes/__tests__/care.summary.test.ts src/routes/__tests__/care.quickOverview.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BN) Phase 1 index follow-through: export-summary and soft-delete query shapes
- Change:
  - Added missing Firestore composites for recently exercised query combinations:
    - `actions(userId, completed, deletedAt)`
    - `medications(userId, active)`
  - Purpose:
    - support export-summary and caregiver/read consistency paths that combine completion or activity filters with soft-delete/ownership predicates.
- Files:
  - `firestore.indexes.json`
- Validation:
  - `jq empty firestore.indexes.json`
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BO) Phase 2 foundation: repository + domain scaffolding kickoff
- Change:
  - Added shared repository contracts for medications and visits:
    - `MedicationRepository`
    - `VisitRepository`
  - Added Firestore repository adapters with shared cursor-page behavior:
    - limit normalization
    - owner/deleted cursor validation
    - `hasMore` + `nextCursor` output contract
  - Added domain-service scaffolding:
    - `MedicationDomainService`
    - `VisitDomainService`
    - domain composition container for dependency wiring
  - Added focused unit coverage for service behavior and container wiring.
- Files:
  - `functions/src/services/repositories/common/pagination.ts`
  - `functions/src/services/repositories/common/errors.ts`
  - `functions/src/services/repositories/medications/MedicationRepository.ts`
  - `functions/src/services/repositories/medications/FirestoreMedicationRepository.ts`
  - `functions/src/services/repositories/visits/VisitRepository.ts`
  - `functions/src/services/repositories/visits/FirestoreVisitRepository.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/domain/medications/MedicationDomainService.ts`
  - `functions/src/services/domain/visits/VisitDomainService.ts`
  - `functions/src/services/domain/serviceContainer.ts`
  - `functions/src/services/domain/index.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BP) Phase 2 medications read slice: query endpoints migrated to domain/repository layer
- Change:
  - Migrated medications read/query endpoints to use `MedicationDomainService` + `MedicationRepository`:
    - `GET /v1/meds`
    - `GET /v1/meds/:id`
  - Preserved existing behavior:
    - backward-compatible full-list response when pagination is not requested
    - cursor pagination headers (`X-Has-More`, `X-Next-Cursor`) when pagination is requested
    - cursor ownership/deleted-record validation semantics (`validation_failed` on invalid cursor)
    - medication response shape and timestamp normalization
  - Added repository support for paginated and non-paginated user medication reads with explicit sort-field support (`name` / `createdAt`) to keep route parity.
- Files:
  - `functions/src/routes/medications.ts`
  - `functions/src/routes/medications/query.ts`
  - `functions/src/services/domain/medications/MedicationDomainService.ts`
  - `functions/src/services/repositories/medications/MedicationRepository.ts`
  - `functions/src/services/repositories/medications/FirestoreMedicationRepository.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/medications.pagination.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.pagination.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BQ) Phase 2 visits read slice: query/read endpoints migrated to domain/repository layer
- Change:
  - Migrated visits read/query endpoints to use `VisitDomainService` + `VisitRepository`:
    - `GET /v1/visits`
    - `GET /v1/visits/:id`
  - Preserved existing behavior:
    - backward-compatible full-list response when pagination is not requested
    - cursor pagination headers (`X-Has-More`, `X-Next-Cursor`) when pagination is requested
    - cursor ownership/deleted-record validation semantics (`validation_failed` on invalid cursor)
    - caregiver/owner read authorization semantics on visit detail via existing `ensureVisitReadAccessOrReject` guard
    - visit response shape and timestamp normalization
  - Added repository support for paginated and non-paginated user visit reads with consistent `createdAt` sorting semantics.
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/services/domain/visits/VisitDomainService.ts`
  - `functions/src/services/repositories/visits/VisitRepository.ts`
  - `functions/src/services/repositories/visits/FirestoreVisitRepository.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/visits.pagination.test.ts`
  - `functions/src/routes/__tests__/visits.access.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/visits.pagination.test.ts src/routes/__tests__/visits.access.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BR) Phase 2 medications lifecycle slice (partial): domain-routed ownership/deleted-state reads
- Change:
  - Migrated medication lifecycle route ownership/deleted-state resource reads to `MedicationDomainService`:
    - `DELETE /v1/meds/:id`
    - `POST /v1/meds/:id/restore`
  - Preserved existing behavior:
    - soft-delete cascade batch updates across medication/reminders/nudges
    - restore batch semantics + reminder delete-event matching
    - operator cross-user restore reason guardrail and restore audit flow
- Files:
  - `functions/src/routes/medications/lifecycle.ts`
  - `functions/src/services/domain/medications/MedicationDomainService.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/routes/__tests__/medications.deleteCascade.test.ts`
  - `functions/src/routes/__tests__/medications.restore.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.deleteCascade.test.ts src/routes/__tests__/medications.restore.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BS) Phase 2 visits write/lifecycle slice (partial): domain-routed ownership/existence reads
- Change:
  - Migrated visit ownership/existence resource reads to `VisitDomainService` in write/lifecycle endpoints:
    - `PATCH /v1/visits/:id`
    - `DELETE /v1/visits/:id`
    - `POST /v1/visits/:id/restore`
    - `POST /v1/visits/:id/retry`
    - `POST /v1/visits/:id/share-with-caregivers`
  - Preserved existing behavior:
    - owner/caregiver/operator authorization semantics
    - retry throttling and retry path selection behavior
    - soft-delete/restore batch behavior for visits/actions
    - visit-share readiness and email-send flow behavior
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/services/domain/visits/VisitDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/routes/__tests__/visits.pagination.test.ts`
  - `functions/src/routes/__tests__/visits.access.test.ts`
  - `functions/src/routes/__tests__/visits.restore.test.ts`
  - `functions/src/routes/__tests__/visits.retry.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/visits.pagination.test.ts src/routes/__tests__/visits.access.test.ts src/routes/__tests__/visits.restore.test.ts src/routes/__tests__/visits.retry.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BT) Phase 2 medications core write slice (partial): domain-routed ownership/existence reads
- Change:
  - Migrated medication ownership/existence resource reads to `MedicationDomainService` in core write endpoints:
    - `PATCH /v1/meds/:id`
    - `POST /v1/meds/:id/acknowledge-warnings`
  - Preserved existing behavior:
    - update-path medication safety checks and warning severity handling
    - reminder name/dose/frequency sync behavior
    - warning acknowledgment behavior and timestamp updates
- Files:
  - `functions/src/routes/medications/core.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/services/domain/medications/MedicationDomainService.ts`
  - `functions/src/routes/__tests__/medications.core.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.core.test.ts src/routes/__tests__/medications.restore.test.ts src/routes/__tests__/medications.deleteCascade.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BU) Phase 2 medications core write slice (continued): repository/domain-routed medication document mutations
- Change:
  - Migrated medication document mutation writes to repository/domain methods in:
    - `POST /v1/meds`
    - `PATCH /v1/meds/:id`
    - `POST /v1/meds/:id/acknowledge-warnings`
  - Preserved existing behavior:
    - AI safety-check flow and warning severity gating
    - reminder sync logic and frequency-change behavior
    - response shape/timestamp normalization and warning acknowledgment payloads
- Files:
  - `functions/src/routes/medications/core.ts`
  - `functions/src/services/domain/medications/MedicationDomainService.ts`
  - `functions/src/services/repositories/medications/MedicationRepository.ts`
  - `functions/src/services/repositories/medications/FirestoreMedicationRepository.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/medications.core.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.core.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BV) Phase 2 visits write slice (continued): domain-routed escalation mutation writes
- Change:
  - Migrated visit escalation mutation writes to `VisitDomainService.updateRecord(...)` in:
    - `POST /v1/visits/ops/post-commit-escalations/:id/acknowledge`
    - `POST /v1/visits/ops/post-commit-escalations/:id/resolve`
    - `POST /v1/visits/ops/post-commit-escalations/:id/reopen`
  - Preserved existing behavior:
    - operator-only authorization checks
    - escalation-state conflict validation (`not_escalated`)
    - escalation metadata write/delete semantics and response payload contracts
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/routes/__tests__/visits.postCommitEscalations.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/visits.postCommitEscalations.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BW) Phase 2 visits write slice (complete): repository/domain-routed delete/restore cascades
- Change:
  - Migrated visit delete/restore batch mutations to repository/domain methods:
    - `DELETE /v1/visits/:id`
    - `POST /v1/visits/:id/restore`
  - Preserved existing behavior:
    - owner/operator access and cross-user restore reason guardrails
    - restore audit metadata payloads
    - related action soft-delete/restore behavior and response contracts
- Files:
  - `functions/src/routes/visits.ts`
  - `functions/src/services/domain/visits/VisitDomainService.ts`
  - `functions/src/services/repositories/visits/VisitRepository.ts`
  - `functions/src/services/repositories/visits/FirestoreVisitRepository.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/visits.restore.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts src/routes/__tests__/visits.restore.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BX) Phase 2 medications write slice (complete): repository/domain-routed reminder/nudge and lifecycle cascades
- Change:
  - Migrated remaining medication side-effect writes to repository/domain methods:
    - `POST /v1/meds` auto-reminder creation
    - `PATCH /v1/meds/:id` reminder metadata sync, frequency-driven reminder updates/disable, and stop cascades
    - `DELETE /v1/meds/:id` medication/reminder/nudge soft-delete cascade
    - `POST /v1/meds/:id/restore` medication/reminder restore cascade
  - Preserved existing behavior:
    - safety-check and warning handling
    - reminder timing-policy assignment
    - lifecycle restore/audit semantics and operator guardrails
- Files:
  - `functions/src/routes/medications/core.ts`
  - `functions/src/routes/medications/lifecycle.ts`
  - `functions/src/routes/medications.ts`
  - `functions/src/services/domain/medications/MedicationDomainService.ts`
  - `functions/src/services/repositories/medications/MedicationRepository.ts`
  - `functions/src/services/repositories/medications/FirestoreMedicationRepository.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/medications.core.test.ts`
  - `functions/src/routes/__tests__/medications.deleteCascade.test.ts`
  - `functions/src/routes/__tests__/medications.restore.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medications.core.test.ts src/routes/__tests__/medications.deleteCascade.test.ts src/routes/__tests__/medications.restore.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BY) Phase 3 denormalization sync chunk 1: trigger-backed field synchronization foundation
- Change:
  - Added trigger-backed denormalization sync for high-risk duplicated fields:
    - `users/{userId}` writes now sync `ownerName`/`ownerEmail` across owned `shares` and `shareInvites`.
    - `medications/{medicationId}` writes now sync `medicationName`/`medicationDose` across related `medicationReminders`.
  - Added a shared denormalization sync service with deterministic field-change resolution and batched Firestore update helpers.
  - Exported the new triggers from the Functions entrypoint.
- Files:
  - `functions/src/triggers/denormalizationSync.ts`
  - `functions/src/services/denormalizationSync.ts`
  - `functions/src/services/__tests__/denormalizationSync.test.ts`
  - `functions/src/index.ts`
- Validation:
  - `npm test -- src/services/__tests__/denormalizationSync.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### BZ) Phase 3 denormalization sync chunk 2: scheduled backfill/repair with dry-run controls
- Change:
  - Added a scheduled denormalization backfill runner (`backfillDenormalizedFieldSync`) that pages through stale denormalized records for:
    - `shares` owner fields
    - `shareInvites` owner fields
    - `medicationReminders` medication fields
  - Added persisted cursor/run state in `systemMaintenance/denormalizationFieldBackfill` with per-run processed/updated metrics and completion markers.
  - Added dry-run and tuning controls:
    - `DENORMALIZATION_BACKFILL_DRY_RUN=true|1` to collect metrics without mutating docs/cursors
    - `DENORMALIZATION_BACKFILL_PAGE_SIZE=<positive int>` for page-size tuning
  - Added dedicated backfill tests for full stale-record repair, cursor continuation across paged runs, and dry-run no-mutation behavior.
- Files:
  - `functions/src/services/denormalizationSync.ts`
  - `functions/src/services/__tests__/denormalizationBackfill.test.ts`
  - `functions/src/index.ts`
- Validation:
  - `npm test -- src/services/__tests__/denormalizationSync.test.ts src/services/__tests__/denormalizationBackfill.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### CA) Phase 3 denormalization/refactor chunk 3: CI guardrails for index/query drift and contracts
- Change:
  - Added Firestore index guardrail script (`verify:index-guardrails`) that:
    - verifies required composite indexes used by high-frequency query paths
    - fails on duplicate index definitions
  - Added contract test guardrails:
    - `test:denormalization-contract` for denormalization sync/backfill behavior
    - `test:repository-contract` for domain/repository container contracts
    - aggregate guardrail command `test:remediation-guardrails`
  - Wired guardrail command into PR CI (`pr-check.yml`) so these checks run on pull requests.
- Files:
  - `functions/scripts/verify-firestore-index-guardrails.js`
  - `functions/package.json`
  - `.github/workflows/pr-check.yml`
- Validation:
  - `npm run test:remediation-guardrails` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### CB) Phase 3 chunk 4 (slice 1): actions repository/domain full-route migration
- Change:
  - Added actions repository/domain scaffolding:
    - `ActionRepository` contract
    - `FirestoreActionRepository` adapter
    - `ActionDomainService`
    - container wiring (`actionRepository`, `actionService`)
  - Migrated actions read and write/lifecycle endpoints to domain/repository boundaries:
    - `GET /v1/actions`
    - `GET /v1/actions/:id`
    - `POST /v1/actions`
    - `PATCH /v1/actions/:id`
    - `DELETE /v1/actions/:id`
    - `POST /v1/actions/:id/restore`
  - Preserved existing route behavior:
    - pagination headers/cursor validation
    - owner/operator guardrails, audit flow, and response shape
  - Expanded service tests to cover action-domain service/container contracts.
- Files:
  - `functions/src/services/repositories/actions/ActionRepository.ts`
  - `functions/src/services/repositories/actions/FirestoreActionRepository.ts`
  - `functions/src/services/domain/actions/ActionDomainService.ts`
  - `functions/src/services/domain/serviceContainer.ts`
  - `functions/src/routes/actions.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts src/routes/__tests__/actions.pagination.test.ts src/routes/__tests__/actions.softDelete.test.ts src/routes/__tests__/actions.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)

### CC) Phase 3 chunk 4 (slice 2): healthLogs repository/domain migration
- Change:
  - Added health-log repository/domain scaffolding:
    - `HealthLogRepository` contract
    - `FirestoreHealthLogRepository` adapter
    - `HealthLogDomainService`
    - container wiring (`healthLogRepository`, `healthLogService`)
  - Migrated health-log route flows to domain/repository boundaries:
    - `GET /v1/health-logs`
    - `GET /v1/health-logs/summary`
    - `GET /v1/health-logs/export`
    - `DELETE /v1/health-logs/:id`
    - `POST /v1/health-logs/:id/restore`
    - create-path source-id dedupe lookup/update/create persistence
  - Preserved existing route behavior:
    - symptom/safety sanitization flow
    - dedupe semantics for source-linked records
    - trend-analysis and follow-up side effects
    - owner/operator restore guardrails + audit behavior
  - Expanded service tests to cover health-log domain service/container contracts.
- Files:
  - `functions/src/services/repositories/healthLogs/HealthLogRepository.ts`
  - `functions/src/services/repositories/healthLogs/FirestoreHealthLogRepository.ts`
  - `functions/src/services/domain/healthLogs/HealthLogDomainService.ts`
  - `functions/src/services/domain/serviceContainer.ts`
  - `functions/src/routes/healthLogs.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/healthLogs.softDelete.test.ts`
  - `functions/src/routes/__tests__/healthLogs.sanitization.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts src/routes/__tests__/healthLogs.softDelete.test.ts src/routes/__tests__/healthLogs.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CD) Phase 3 chunk 4 (slice 3): caregiver patient-resource/upcoming-action read migration
- Change:
  - Migrated caregiver patient-resource read endpoints to domain/repository boundaries:
    - `GET /v1/care/:patientId/medications`
    - `GET /v1/care/:patientId/actions`
    - `GET /v1/care/:patientId/visits`
    - `GET /v1/care/:patientId/visits/:visitId`
  - Migrated `GET /v1/care/:patientId/upcoming-actions` to domain-backed action reads.
  - Preserved route behavior:
    - caregiver access guards
    - cursor validation and pagination response headers
    - soft-delete/completed filtering and upcoming-actions summary semantics
    - cache-control headers and patient-visit detail response shape
- Files:
  - `functions/src/routes/care/patientResources.ts`
  - `functions/src/routes/care/upcomingActions.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.pagination.test.ts src/routes/__tests__/care.aggregateFilters.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CE) Phase 3 chunk 4 (slice 4): care summary/export aggregate read migration
- Change:
  - Migrated care aggregate read endpoints to domain/repository boundaries:
    - `GET /v1/care/:patientId/summary`
    - `GET /v1/care/:patientId/export/summary`
  - Preserved route behavior:
    - caregiver access guards and cache-control headers
    - summary alert calculation and medication-status reuse semantics
    - export summary filtering semantics (exclude soft-deleted visits/actions, include active medications)
    - response shape contracts
- Files:
  - `functions/src/routes/care/summary.ts`
  - `functions/src/routes/care/exportSummary.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.summary.test.ts src/routes/__tests__/care.pagination.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CF) Phase 3 chunk 4 (slice 5): care quick-overview/trends aggregate read migration
- Change:
  - Migrated care dashboard aggregate read endpoints to domain/repository boundaries:
    - `GET /v1/care/:patientId/quick-overview`
    - `GET /v1/care/:patientId/trends`
  - Preserved route behavior:
    - caregiver access guards
    - quick-overview medication-log query optimization/fallback behavior
    - soft-delete filtering in trends/actions/visit coverage metrics
    - cache-control headers and response shape contracts
- Files:
  - `functions/src/routes/care/quickOverview.ts`
  - `functions/src/routes/care/trends.ts`
- Validation:
  - `npm test -- src/routes/__tests__/care.quickOverview.test.ts src/routes/__tests__/care.aggregateFilters.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CG) Phase 3 chunk 4 (slice 6): caregiver health-log + med-change read migration
- Change:
  - Migrated caregiver health-log route reads to domain/repository boundaries with cursor-page parity:
    - `GET /v1/care/:patientId/health-logs`
  - Migrated caregiver med-change medication reads to medication domain/repository boundaries:
    - `GET /v1/care/:patientId/med-changes`
  - Preserved route behavior:
    - caregiver access guards
    - cursor validation and pagination response headers for caregiver health-log route
    - soft-delete filtering and change-window semantics for med-change responses
    - cache-control headers and response shape contracts
- Files:
  - `functions/src/routes/care/healthLogs.ts`
  - `functions/src/routes/care/medicationChanges.ts`
  - `functions/src/services/domain/healthLogs/HealthLogDomainService.ts`
  - `functions/src/services/repositories/healthLogs/HealthLogRepository.ts`
  - `functions/src/services/repositories/healthLogs/FirestoreHealthLogRepository.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts src/routes/__tests__/care.aggregateFilters.test.ts src/routes/__tests__/care.medicationStatus.test.ts src/routes/__tests__/care.pagination.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CH) Phase 3 chunk 4 (slice 7): caregiver notes/tasks/visit-metadata route migration
- Change:
  - Added repository/domain coverage for caregiver notes/tasks:
    - `CaregiverNoteRepository` + `FirestoreCaregiverNoteRepository`
    - `CareTaskRepository` + `FirestoreCareTaskRepository`
    - `CaregiverNoteDomainService` + `CareTaskDomainService`
    - container wiring and contract-test expansion
  - Migrated care route modules to repository/domain boundaries:
    - `GET /v1/care/:patientId/notes`
    - `PUT /v1/care/:patientId/visits/:visitId/note`
    - `DELETE /v1/care/:patientId/visits/:visitId/note`
    - `GET/POST/PATCH/DELETE/POST restore /v1/care/:patientId/tasks...`
    - `PATCH /v1/care/:patientId/visits/:visitId` (visit metadata)
  - Preserved route behavior:
    - caregiver access and owner checks
    - cursor validation semantics for notes/tasks list routes
    - task summary/count semantics under pagination
    - soft-delete/restore response contracts and restore-audit flow
    - metadata sanitization response contracts
- Files:
  - `functions/src/routes/care/notes.ts`
  - `functions/src/routes/care/tasks.ts`
  - `functions/src/routes/care/visitMetadata.ts`
  - `functions/src/services/repositories/caregiverNotes/CaregiverNoteRepository.ts`
  - `functions/src/services/repositories/caregiverNotes/FirestoreCaregiverNoteRepository.ts`
  - `functions/src/services/repositories/careTasks/CareTaskRepository.ts`
  - `functions/src/services/repositories/careTasks/FirestoreCareTaskRepository.ts`
  - `functions/src/services/domain/caregiverNotes/CaregiverNoteDomainService.ts`
  - `functions/src/services/domain/careTasks/CareTaskDomainService.ts`
  - `functions/src/services/domain/serviceContainer.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts src/routes/__tests__/care.pagination.test.ts src/routes/__tests__/care.tasks.softDelete.test.ts src/routes/__tests__/care.visitMetadata.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `124/124`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CI) Phase 3 chunk 4 (slice 8): non-care authenticated read cache-header expansion
- Change:
  - Added private cache headers to non-care authenticated read endpoints:
    - `GET /v1/shares` -> `private, max-age=30`
    - `GET /v1/shares/invites` -> `private, max-age=30`
    - `GET /v1/shares/:id` -> `private, max-age=30`
    - `GET /v1/shares/my-invites` -> `private, max-age=30`
    - `GET /v1/medication-reminders` -> `private, max-age=30`
    - `GET /v1/medication-logs` -> `private, max-age=30`
    - `GET /v1/medication-logs/summary` -> `private, max-age=60`
    - `GET /v1/nudges` -> `private, max-age=30`
    - `GET /v1/nudges/history` -> `private, max-age=30`
  - Added/updated route coverage to assert cache headers for share list/invite/detail/list-my-invites and medication reminder list responses.
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/routes/medicationLogs.ts`
  - `functions/src/routes/nudges.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
  - `functions/src/routes/__tests__/medicationReminders.softDelete.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/routes/__tests__/medicationReminders.softDelete.test.ts src/routes/__tests__/medicationLogs.sanitization.test.ts src/routes/__tests__/nudges.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `126/126`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CJ) Phase 3 chunk 4 (slice 9): medication-log write authorization hardening
- Change:
  - Hardened `POST /v1/medication-logs` to require shared owner authorization against the source medication record before persisting a log entry.
  - Added regression coverage to reject cross-user medication-log writes.
- Files:
  - `functions/src/routes/medicationLogs.ts`
  - `functions/src/routes/__tests__/medicationLogs.sanitization.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medicationLogs.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `132/132`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CK) Phase 3 chunk 4 (slice 10): nudges debug write authorization centralization
- Change:
  - Added a shared debug-write access guard in `nudgesDebug` (`ensureDebugWriteAccessOrReject`) and replaced repeated inline checks across:
    - `POST /v1/nudges/debug/create`
    - `POST /v1/nudges/debug/create-sequence`
    - `POST /v1/nudges/debug/test-condition`
    - `POST /v1/nudges/debug/analyze-visit`
    - `DELETE /v1/nudges/debug/clear`
  - Guard behavior:
    - blocks debug writes when debug mode is disabled
    - requires operator access outside emulator (via `ensureOperatorAccessOrReject`)
    - preserves emulator-local write access for development workflows
  - Added focused access-control route tests for debug-write gating behavior.
- Files:
  - `functions/src/routes/nudgesDebug.ts`
  - `functions/src/routes/__tests__/nudgesDebug.access.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/nudgesDebug.access.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `132/132`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CL) Phase 3 chunk 4 (slice 11): shares accept-flow authorization centralization
- Change:
  - Added shared invite-email access guard (`ensureInviteEmailMatchOrReject`) and shared direct-share accept eligibility resolver (`resolveShareAcceptAccess`) to remove duplicated inline access checks in share acceptance routes.
  - Applied shared authorization helpers in:
    - `POST /v1/shares/accept-invite`
    - `POST /v1/shares/accept/:token`
  - Added mismatch-path regression coverage for:
    - token invite email mismatch (`email_mismatch`)
    - direct-share fallback denial when caller is neither caregiver-id match nor email match (`forbidden`)
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `132/132`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CM) Phase 3 closeout
- Change:
  - Closed the remaining explicit Phase 3 chunk-4 auth-centralization target by completing non-care write-heavy follow-through:
    - medication-log create owner guard
    - nudges-debug centralized debug-write guard + operator gate outside emulator
    - shares accept-flow centralized invite-email and caregiver-fallback guards
  - Kept full route regression/build/guardrail baselines green after closeout.
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/routes/__tests__/nudgesDebug.access.test.ts src/routes/__tests__/medicationLogs.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `132/132`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CN) Post-Phase 3 backlog slice: medicalContext repository/service boundary migration
- Change:
  - Added `PatientContextRepository` + `FirestorePatientContextRepository`.
  - Added `PatientContextDomainService` and container wiring (`patientContextRepository`, `patientContextService`).
  - Migrated `medicalContext` route to domain-backed access:
    - `GET /v1/medical-context/conditions`
    - `PATCH /v1/medical-context/conditions/:id`
  - Added route regression coverage for empty-state responses, timestamp serialization, invalid status validation, and update not-found/success branches.
- Files:
  - `functions/src/services/repositories/patientContexts/PatientContextRepository.ts`
  - `functions/src/services/repositories/patientContexts/FirestorePatientContextRepository.ts`
  - `functions/src/services/domain/patientContexts/PatientContextDomainService.ts`
  - `functions/src/services/domain/serviceContainer.ts`
  - `functions/src/services/domain/index.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/routes/medicalContext.ts`
  - `functions/src/routes/__tests__/medicalContext.routes.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medicalContext.routes.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `138/138`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CO) Post-Phase 3 backlog slice: shares read-surface repository/service migration
- Change:
  - Added `ShareRepository` + `FirestoreShareRepository`.
  - Added `ShareDomainService`.
  - Migrated `shares` read routes to domain-backed access while preserving cache headers and response contracts:
    - `GET /v1/shares`
    - `GET /v1/shares/invites`
    - `GET /v1/shares/:id`
    - `GET /v1/shares/my-invites`
  - Added share domain unit coverage for list/get forwarding and legacy+current invite deduplication behavior.
- Files:
  - `functions/src/services/repositories/shares/ShareRepository.ts`
  - `functions/src/services/repositories/shares/FirestoreShareRepository.ts`
  - `functions/src/services/domain/shares/ShareDomainService.ts`
  - `functions/src/services/domain/index.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/routes/shares.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `138/138`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CP) Post-Phase 3 backlog slice: shares write-transition repository/service migration
- Change:
  - Extended `ShareRepository`/`FirestoreShareRepository` mutation coverage with:
    - share update-by-id
    - invite lookup-by-id
    - atomic invite revoke + accepted-share revoke cascade
  - Extended `ShareDomainService` with:
    - share status transition orchestration (`owner revoke` / `caregiver accept`)
    - owner-scoped invite revoke orchestration with not-found/forbidden outcomes
  - Migrated write-transition routes to domain-backed mutation orchestration:
    - `PATCH /v1/shares/:id`
    - `PATCH /v1/shares/revoke/:token`
  - Added share-domain unit tests for transition/revoke outcome paths.
  - Stabilized time-sensitive caregiver pagination test fixture by setting an in-progress task due date to far-future to avoid date rollover drift in overdue-summary assertions.
- Files:
  - `functions/src/services/repositories/shares/ShareRepository.ts`
  - `functions/src/services/repositories/shares/FirestoreShareRepository.ts`
  - `functions/src/services/domain/shares/ShareDomainService.ts`
  - `functions/src/routes/shares.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/routes/__tests__/care.pagination.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__/care.pagination.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `138/138`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CQ) Post-Phase 3 backlog slice: shares invite-accept mutation migration
- Change:
  - Extended `ShareRepository`/`FirestoreShareRepository` invite mutation support with:
    - invite update-by-id
    - atomic invite-accept + share-write helper (`acceptInviteAndSetShare`)
  - Extended `ShareDomainService` invite mutation helpers with:
    - invite read-by-id
    - invite update helper
    - invite-accept + share-write orchestration wrapper
  - Migrated invite-token acceptance write paths to domain-backed helper methods while preserving existing email-match validation, expiry handling, and response contracts:
    - `POST /v1/shares/accept-invite` (shareInvite token branch)
    - `POST /v1/shares/accept/:token`
  - Added share-domain unit coverage for invite read/update + accept/share write forwarding.
- Files:
  - `functions/src/services/repositories/shares/ShareRepository.ts`
  - `functions/src/services/repositories/shares/FirestoreShareRepository.ts`
  - `functions/src/services/domain/shares/ShareDomainService.ts`
  - `functions/src/routes/shares.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `138/138`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CR) Post-Phase 3 backlog slice: shares invite-management repository/service migration
- Change:
  - Migrated remaining invite-management route paths from direct Firestore access to `ShareDomainService` helpers:
    - `PATCH /v1/shares/invites/:id`
    - `GET /v1/shares/invite-info/:token`
  - Added invite-management route coverage for:
    - owner invite-cancel success
    - non-owner invite-cancel forbidden
    - pending invite-info success
    - expired invite-info response
  - Hardened share domain contract tests with a complete repository stub helper for the expanded `ShareRepository` interface.
  - Fixed `FirestoreShareRepository.setShare(...)` typing branch behavior to preserve merge semantics and satisfy strict TypeScript overloads.
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/routes/__tests__/shares.invites.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/repositories/shares/FirestoreShareRepository.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `142/142`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CS) Post-Phase 3 backlog slice: shares user-domain dependency closeout
- Change:
  - Removed remaining direct `users` Firestore coupling from `shares` routes by routing owner-profile reads and caregiver-role upserts through `UserDomainService` + `UserRepository`.
  - Extended user repository/domain contracts with `ensureCaregiverRole(...)` and migrated all share acceptance paths to use domain-backed caregiver role assignment.
  - Updated repository contract test scaffolding to include the new user-domain method.
- Files:
  - `functions/src/routes/shares.ts`
  - `functions/src/services/repositories/users/UserRepository.ts`
  - `functions/src/services/repositories/users/FirestoreUserRepository.ts`
  - `functions/src/services/domain/users/UserDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/shares.invites.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `142/142`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CT) Phase 4 chunk 1 slice: auth handoff repository/service boundary migration
- Change:
  - Added `AuthHandoffRepository` + `FirestoreAuthHandoffRepository`.
  - Added `AuthHandoffDomainService`.
  - Migrated auth handoff routes to domain-backed persistence/transaction orchestration while preserving response contracts:
    - `POST /v1/auth/create-handoff`
    - `POST /v1/auth/exchange-handoff`
  - Added focused auth handoff route coverage for create success and exchange invalid/used/expired/success outcomes.
- Files:
  - `functions/src/routes/auth.ts`
  - `functions/src/routes/__tests__/auth.handoff.test.ts`
  - `functions/src/services/repositories/authHandoffs/AuthHandoffRepository.ts`
  - `functions/src/services/repositories/authHandoffs/FirestoreAuthHandoffRepository.ts`
  - `functions/src/services/domain/authHandoffs/AuthHandoffDomainService.ts`
  - `functions/src/services/domain/index.ts`
  - `functions/src/services/repositories/index.ts`
- Validation:
  - `npm test -- src/routes/__tests__/auth.handoff.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `147/147`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CU) Phase 4 chunk 1 slice: users `/me` profile repository/service migration (partial)
- Change:
  - Extended `UserRepository` + `UserDomainService` with profile lifecycle helpers:
    - `ensureExists(...)`
    - `upsertById(...)`
  - Migrated `users` profile bootstrap/read and non-legal update paths to domain-backed repository calls while preserving legal-assent transaction behavior and response contracts:
    - `GET /v1/users/me`
    - `PATCH /v1/users/me` (non-legal-assent write path)
  - Added user-domain contract coverage for new helper forwarding behavior and updated service-container repository override contracts.
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/services/repositories/users/UserRepository.ts`
  - `functions/src/services/repositories/users/FirestoreUserRepository.ts`
  - `functions/src/services/domain/users/UserDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.profileSanitization.test.ts src/routes/__tests__/users.analyticsConsent.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `147/147`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CV) Phase 4 chunk 1 slice: users operator restore-audit repository/service migration
- Change:
  - Extended `UserRepository` + `UserDomainService` with restore-audit methods:
    - `listRestoreAuditEvents(...)`
    - `updateRestoreAuditTriage(...)`
  - Migrated operator restore-audit routes to domain-backed repository calls while preserving response contracts and cursor-validation behavior:
    - `GET /v1/users/ops/restore-audit`
    - `PATCH /v1/users/ops/restore-audit/:id/triage`
  - Expanded user-domain contract coverage for restore-audit method forwarding and updated service-container user repository contract overrides.
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/services/repositories/users/UserRepository.ts`
  - `functions/src/services/repositories/users/FirestoreUserRepository.ts`
  - `functions/src/services/domain/users/UserDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/users.restoreAudit.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.restoreAudit.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `147/147`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CW) Phase 4 chunk 1 slice: users `/me/export` repository/service migration
- Change:
  - Extended `UserRepository` + `UserDomainService` with `getExportData(...)` for consolidated account-export reads.
  - Migrated `GET /v1/users/me/export` to domain-backed repository reads while preserving payload contracts for:
    - user profile metadata
    - visits/actions/medications/shares arrays
    - analytics-consent/legal-assent state + audit event partitions
  - Expanded user-domain contract coverage for export forwarding behavior and updated service-container repository override contracts.
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/services/repositories/users/UserRepository.ts`
  - `functions/src/services/repositories/users/FirestoreUserRepository.ts`
  - `functions/src/services/domain/users/UserDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/users.analyticsConsent.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.analyticsConsent.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `147/147`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CX) Phase 4 chunk 1 slice: users caregiver-management repository/service migration
- Change:
  - Migrated caregiver-management routes to domain-backed service boundaries using `UserDomainService` + `ShareDomainService`:
    - `GET /v1/users/me/caregivers`
    - `DELETE /v1/users/me/caregivers/:id`
  - Preserved revoke semantics (`revokedAt` + `updatedAt` on share revokes) while removing direct route-level Firestore coupling.
  - Added focused caregiver-list route coverage for:
    - accepted-share + pending-invite composition
    - invitee-email fallback behavior
    - `autoShareWithCaregivers` defaulting when user profile is absent.
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/routes/__tests__/users.caregiversList.test.ts`
  - `functions/src/routes/__tests__/users.caregiverRevoke.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.caregiversList.test.ts src/routes/__tests__/users.caregiverRevoke.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `149/149`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CY) Phase 4 chunk 1 slice: users legal-assent transaction repository/service migration
- Change:
  - Extended `UserRepository` + `UserDomainService` with `applyLegalAssent(...)`.
  - Migrated `PATCH /v1/users/me` legal-assent transaction path into repository-layer transaction orchestration while preserving:
    - profile merge behavior
    - consent change detection logic
    - immutable legal-assent audit event writes.
  - Expanded user-domain contract coverage for legal-assent forwarding behavior.
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/services/repositories/users/UserRepository.ts`
  - `functions/src/services/repositories/users/FirestoreUserRepository.ts`
  - `functions/src/services/domain/users/UserDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
  - `functions/src/routes/__tests__/users.analyticsConsent.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.analyticsConsent.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `149/149`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### CZ) Phase 4 chunk 1 slice: users account-delete repository/service migration
- Change:
  - Extended `UserRepository` + `UserDomainService` with account data purge support (`deleteAccountData`).
  - Migrated `DELETE /v1/users/me` route to domain-backed account data purges while preserving:
    - legacy email-candidate handling for orphaned records
    - Firebase Auth user deletion
    - response payload contract (`deletedDocuments` count).
  - Added focused route regression coverage for successful account delete flow (data purge + auth delete).
- Files:
  - `functions/src/routes/users.ts`
  - `functions/src/routes/__tests__/users.deleteAccount.test.ts`
  - `functions/src/services/repositories/users/UserRepository.ts`
  - `functions/src/services/repositories/users/FirestoreUserRepository.ts`
  - `functions/src/services/domain/users/UserDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/users.deleteAccount.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `150/150`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DA) Phase 4 chunk 2 slice: nudges read/ownership repository-service migration (initial)
- Change:
  - Added `NudgeRepository` + `FirestoreNudgeRepository`.
  - Added `NudgeDomainService`.
  - Migrated nudges read/ownership surfaces to repository/domain boundaries:
    - `GET /v1/nudges/history`
    - nudge ownership reads in:
      - `PATCH /v1/nudges/:id`
      - `POST /v1/nudges/:id/respond`
      - `POST /v1/nudges/:id/respond-text`
  - Added focused history route regression coverage for cache headers, status filtering/sorting, and limit capping.
- Files:
  - `functions/src/routes/nudges.ts`
  - `functions/src/routes/__tests__/nudges.history.test.ts`
  - `functions/src/services/repositories/nudges/NudgeRepository.ts`
  - `functions/src/services/repositories/nudges/FirestoreNudgeRepository.ts`
  - `functions/src/services/domain/nudges/NudgeDomainService.ts`
  - `functions/src/services/domain/index.ts`
  - `functions/src/services/repositories/index.ts`
- Validation:
  - `npm test -- src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/nudges.history.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `152/152`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DB) Phase 4 chunk 2 slice: nudges write/cleanup repository-service migration
- Change:
  - Expanded `NudgeDomainService` wrappers to expose repository-backed write/query helpers used by route write flows:
    - `listByUserAndStatuses(...)`
    - `listByUserAndSequence(...)`
    - `createRecord(...)`
    - `dismissByIds(...)`
  - Migrated remaining route-level Firestore writes/queries in `nudges` to domain-backed calls:
    - smart sequence dismiss + concerning follow-up creation in `POST /v1/nudges/:id/respond`
    - AI follow-up creation in `POST /v1/nudges/:id/respond-text`
    - orphan cleanup logic in `POST /v1/nudges/cleanup-orphans` (with medication reads via `MedicationDomainService`).
  - Added focused route coverage for nudges write paths:
    - positive response dismisses remaining sequence nudges
    - concerning response creates follow-up nudge
    - cleanup-orphans dismisses only orphaned medication nudges.
- Files:
  - `functions/src/routes/nudges.ts`
  - `functions/src/routes/__tests__/nudges.writePaths.test.ts`
  - `functions/src/services/domain/nudges/NudgeDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/nudges.history.test.ts src/routes/__tests__/nudges.writePaths.test.ts` (functions)
  - `npm test -- src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `155/155`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DC) Phase 4 chunk 2 slice: nudges active/patch repository-service migration
- Change:
  - Extended nudges repository/domain contracts with active-list and status mutation methods:
    - `listActiveByUser(...)`
    - `completeById(...)`
    - `snoozeById(...)`
    - `dismissById(...)` (domain helper over bulk dismiss).
  - Migrated remaining `nudges` route internals to repository/domain methods for:
    - `GET /v1/nudges` (due pending/snoozed activation + active sorting/limit behavior preserved)
    - `PATCH /v1/nudges/:id` completed/snoozed/dismissed mutation paths.
  - Added focused route coverage for active-route activation behavior and patch mutation transitions, including forbidden non-owner checks.
- Files:
  - `functions/src/routes/nudges.ts`
  - `functions/src/routes/__tests__/nudges.activePatch.test.ts`
  - `functions/src/services/repositories/nudges/NudgeRepository.ts`
  - `functions/src/services/repositories/nudges/FirestoreNudgeRepository.ts`
  - `functions/src/services/domain/nudges/NudgeDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/routes/__tests__/nudges.activePatch.test.ts src/routes/__tests__/nudges.writePaths.test.ts src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/nudges.history.test.ts` (functions)
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DD) Phase 4 chunk 2 slice: nudge-completion write boundary cleanup (nudges + health logs)
- Change:
  - Replaced remaining direct `completeNudge(...)` calls in nudges response routes with `NudgeDomainService.completeById(...)`:
    - `POST /v1/nudges/:id/respond`
    - `POST /v1/nudges/:id/respond-text`
  - Routed health-log-triggered nudge completion through nudges repository/domain methods:
    - `POST /v1/health-logs` completion write when `nudgeId` is present.
  - Updated nudges sanitization/write-path route tests to assert persisted `responseValue` payloads from repository-backed completion writes.
- Files:
  - `functions/src/routes/nudges.ts`
  - `functions/src/routes/healthLogs.ts`
  - `functions/src/routes/__tests__/nudges.sanitization.test.ts`
  - `functions/src/routes/__tests__/nudges.writePaths.test.ts`
  - `functions/src/services/repositories/nudges/NudgeRepository.ts`
  - `functions/src/services/repositories/nudges/FirestoreNudgeRepository.ts`
  - `functions/src/services/domain/nudges/NudgeDomainService.ts`
- Validation:
  - `npm test -- src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/nudges.writePaths.test.ts src/routes/__tests__/nudges.activePatch.test.ts src/routes/__tests__/nudges.history.test.ts` (functions)
  - `npm test -- src/routes/__tests__/healthLogs.sanitization.test.ts src/routes/__tests__/healthLogs.softDelete.test.ts` (functions)
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DE) Phase 4 chunk 2 slice: `lumibotAnalyzer` repository bridge for core nudge operations
- Change:
  - Bridged core nudge operations in `lumibotAnalyzer` to nudges repository/domain methods:
    - `getActiveNudgesForUser` -> `NudgeDomainService.listActiveByUser(...)`
    - `completeNudge` -> `NudgeDomainService.completeById(...)`
    - `snoozeNudge` -> `NudgeDomainService.snoozeById(...)`
    - `dismissNudge` -> `NudgeDomainService.dismissById(...)`
    - internal `createNudge` helper -> `NudgeDomainService.createRecord(...)`
  - Added focused analyzer bridge coverage for:
    - active pending/snoozed activation and active sort behavior
    - complete/snooze/dismiss mutation paths
    - follow-up creation through repository-backed nudge create path.
- Files:
  - `functions/src/services/lumibotAnalyzer.ts`
  - `functions/src/services/__tests__/lumibotAnalyzer.repositoryBridge.test.ts`
  - `functions/src/services/repositories/nudges/NudgeRepository.ts`
  - `functions/src/services/repositories/nudges/FirestoreNudgeRepository.ts`
  - `functions/src/services/domain/nudges/NudgeDomainService.ts`
- Validation:
  - `npm test -- src/services/__tests__/lumibotAnalyzer.repositoryBridge.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__/nudges.activePatch.test.ts src/routes/__tests__/nudges.writePaths.test.ts src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/nudges.history.test.ts src/routes/__tests__/healthLogs.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DF) Phase 4 chunk 2 slice: `lumibotAnalyzer` helper-query repository migration
- Change:
  - Extended nudges repository/domain contracts with analyzer helper query methods:
    - `hasByUserConditionAndStatuses(...)`
    - `hasByUserMedicationNameAndStatuses(...)`
    - `listByUserStatusesScheduledBetween(...)`
    - `hasRecentInsightByPattern(...)`
  - Migrated remaining analyzer helper nudge queries to repository/domain methods:
    - condition-existing checks used by sequence generation
    - medication-existing checks used by sequence generation
    - scheduled conflict reads for nudge slot selection
    - per-condition active nudge precheck inside visit analysis
    - insight dedupe precheck before creating insight nudges.
  - Removed remaining direct `collection('nudges')` accesses from `lumibotAnalyzer`.
- Files:
  - `functions/src/services/lumibotAnalyzer.ts`
  - `functions/src/services/repositories/nudges/NudgeRepository.ts`
  - `functions/src/services/repositories/nudges/FirestoreNudgeRepository.ts`
  - `functions/src/services/domain/nudges/NudgeDomainService.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/services/__tests__/lumibotAnalyzer.repositoryBridge.test.ts` (functions)
  - `npm test -- src/routes/__tests__/nudges.activePatch.test.ts src/routes/__tests__/nudges.writePaths.test.ts src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/nudges.history.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DG) Phase 4 chunk 2 slice: `nudgeNotificationService` repository/service migration
- Change:
  - Extended nudges repository/domain contracts with notification-processing operations:
    - `listDuePendingForNotification(...)`
    - `countByUserNotificationSentBetween(...)`
    - `acquireNotificationSendLock(...)`
    - `markNotificationProcessed(...)`
    - `backfillPendingNotificationSentField(...)`
  - Migrated nudge-notification service to use nudges domain/repository data access for:
    - due pending nudge fetch
    - per-user daily sent count
    - send-lock acquisition
    - notification processed/sent/skip updates
    - legacy `notificationSent` backfill.
  - Added focused processing regression coverage for notify/skip/backfill flows:
    - successful notify path marks sent + clears lock
    - no-token path marks skip
    - backfill delegates to domain method.
- Files:
  - `functions/src/services/nudgeNotificationService.ts`
  - `functions/src/services/repositories/nudges/NudgeRepository.ts`
  - `functions/src/services/repositories/nudges/FirestoreNudgeRepository.ts`
  - `functions/src/services/domain/nudges/NudgeDomainService.ts`
  - `functions/src/services/__tests__/nudgeNotificationService.processing.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/nudgeNotificationService.test.ts src/services/__tests__/nudgeNotificationService.processing.test.ts src/services/__tests__/domainServices.test.ts` (functions)
  - `npm test -- src/routes/__tests__/nudges.activePatch.test.ts src/routes/__tests__/nudges.writePaths.test.ts src/routes/__tests__/nudges.sanitization.test.ts src/routes/__tests__/nudges.history.test.ts src/routes/__tests__/healthLogs.sanitization.test.ts` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DH) Phase 4 chunk 3 slice: `insightGenerator` repository/service migration
- Change:
  - Added an `insights` repository/service boundary for cached insight lifecycle in `users/{userId}/insights`:
    - `InsightRepository` + `FirestoreInsightRepository`
    - `InsightDomainService`
    - repository methods:
      - `hasActiveByUser(...)`
      - `listActiveByUser(...)`
      - `replaceForUser(...)`
  - Migrated `InsightGeneratorService` cached insight flows to domain-backed access:
    - generation check (`needsInsightGeneration`)
    - cached read (`getCachedInsights`)
    - cached replace write (`storeInsights`)
  - Migrated `InsightGeneratorService` context gathering off direct Firestore queries to existing domain services:
    - `HealthLogDomainService.listForUser(...)`
    - `NudgeDomainService.listByUserAndStatuses(...)` (with in-service recent-window filtering)
    - `MedicationDomainService.listAllForUser(...)`
  - Removed direct `collection('healthLogs')`, `collection('nudges')`, `collection('medications')`, and direct `users/{id}/insights` collection access from `insightGenerator`.
  - Added focused bridge coverage for insights domain forwarding and insight-generator domain/repository usage.
- Files:
  - `functions/src/services/insightGenerator.ts`
  - `functions/src/services/repositories/insights/InsightRepository.ts`
  - `functions/src/services/repositories/insights/FirestoreInsightRepository.ts`
  - `functions/src/services/domain/insights/InsightDomainService.ts`
  - `functions/src/services/repositories/index.ts`
  - `functions/src/services/domain/index.ts`
  - `functions/src/services/__tests__/insightDomainService.test.ts`
  - `functions/src/services/__tests__/insightGenerator.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/insightDomainService.test.ts src/services/__tests__/insightGenerator.repositoryBridge.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DI) Phase 4 chunk 3 slice: medication users-timezone reads via `UserDomainService`
- Change:
  - Migrated remaining direct user-profile timezone reads in medication flows to domain-backed user reads:
    - `POST /v1/medication-logs` timezone resolution now uses `UserDomainService.getById(...)`
    - medication-reminder timezone helper now uses `UserDomainService.getById(...)`
    - medication schedule helper timezone lookup now uses `UserDomainService.getById(...)`
  - Preserved fallback semantics and centralized timezone normalization behavior while removing direct route/helper coupling to `collection('users')` for these paths.
- Files:
  - `functions/src/routes/medicationLogs.ts`
  - `functions/src/routes/medicationReminders.ts`
  - `functions/src/routes/medications/helpers.ts`
- Validation:
  - `npm test -- src/routes/__tests__/medicationLogs.sanitization.test.ts src/routes/__tests__/medicationReminders.softDelete.test.ts src/routes/__tests__/medications.scheduleToday.test.ts src/routes/__tests__/medications.scheduleMark.test.ts` (functions)
  - `npm run build` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run test:remediation-guardrails` (functions)

### DJ) Phase 4 chunk 3 slice: `conditionReminderService` repository/service migration
- Change:
  - Added active-medication scheduler support to medications repository/domain:
    - `MedicationRepository.listActive(...)`
    - `MedicationDomainService.listActive(...)`
  - Migrated `conditionReminderService` off direct Firestore access for medication candidate selection, health-log recency checks, pending nudge checks, nudge creation, and user timezone reads:
    - medications -> `MedicationDomainService.listActive(...)`
    - health logs -> `HealthLogDomainService.listForUser(...)`
    - nudges -> `NudgeDomainService.listByUserAndStatuses(...)` + `createRecord(...)`
    - users -> `UserDomainService.getById(...)`
  - Added dependency-injection hooks for focused service tests.
  - Added focused bridge coverage and updated repository/domain contract tests for the new medication method.
- Files:
  - `functions/src/services/conditionReminderService.ts`
  - `functions/src/services/repositories/medications/MedicationRepository.ts`
  - `functions/src/services/repositories/medications/FirestoreMedicationRepository.ts`
  - `functions/src/services/domain/medications/MedicationDomainService.ts`
  - `functions/src/services/__tests__/conditionReminderService.repositoryBridge.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/conditionReminderService.repositoryBridge.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run test:remediation-guardrails` (functions)

### DK) Phase 4 chunk 3 slice: `personalRNService` nudge repository/service migration
- Change:
  - Migrated personal-RN nudge reads/writes off direct Firestore to `NudgeDomainService`:
    - recent dismissal count
    - active-nudge presence check
    - reactive follow-up nudge creation for elevated readings
  - Added dependency injection for nudge-domain usage in:
    - `buildPatientState(...)`
    - `evaluatePatient(...)`
    - `createReactiveNudge(...)`
  - Added focused bridge coverage for dismissal filtering, active-nudge skip behavior, and reactive nudge writes.
- Files:
  - `functions/src/services/personalRNService.ts`
  - `functions/src/services/__tests__/personalRNService.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/personalRNService.repositoryBridge.test.ts src/services/__tests__/conditionReminderService.repositoryBridge.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)
  - `npm run test:remediation-guardrails` (functions)

### DL) Phase 4 chunk 3 slice: `patientContextAggregator` repository/service migration
- Change:
  - Migrated patient context aggregation reads off direct Firestore access to domain-backed dependencies:
    - health logs -> `HealthLogDomainService.listForUser(...)`
    - visits -> `VisitDomainService.listAllForUser(...)`
    - medications -> `MedicationDomainService.listAllForUser(...)`
    - nudges -> `NudgeDomainService.listByUserAndStatuses(...)`
  - Added dependency injection for testable service boundaries in:
    - `getPatientContext(...)`
    - `getPatientContextLight(...)`
  - Corrected dismissed nudge recency metric to use `dismissedAt` when computing `dismissedLast30Days`.
  - Added focused repository-bridge coverage for full and lightweight context aggregation paths.
- Files:
  - `functions/src/services/patientContextAggregator.ts`
  - `functions/src/services/__tests__/patientContextAggregator.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/patientContextAggregator.repositoryBridge.test.ts src/services/__tests__/personalRNService.repositoryBridge.test.ts src/services/__tests__/conditionReminderService.repositoryBridge.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)

### DM) Phase 4 chunk 3 slice: `nudgeNotificationService` users-domain migration
- Change:
  - Migrated user timezone reads in `nudgeNotificationService` from direct `users` collection access to `UserDomainService.getById(...)`.
  - Added dependency-resolution wiring for notification processor/backfill paths so service logic can run against repository/domain overrides without direct Firestore coupling.
  - Preserved existing scheduler/route call signatures while enabling injected bridge coverage.
- Files:
  - `functions/src/services/nudgeNotificationService.ts`
  - `functions/src/services/__tests__/nudgeNotificationService.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/nudgeNotificationService.test.ts src/services/__tests__/nudgeNotificationService.processing.test.ts src/services/__tests__/nudgeNotificationService.repositoryBridge.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)

### DN) Phase 4 chunk 3 slice: post-commit escalation reporting visit-domain migration
- Change:
  - Added visit repository/domain contract support for post-commit escalation reporting reads:
    - `VisitRepository.listPostCommitEscalated(limit)`
    - `VisitDomainService.listPostCommitEscalated(limit)`
  - Migrated `postCommitEscalationReportingService` to query escalated visits through `VisitDomainService` instead of direct Firestore queries.
  - Added bridge coverage for injected visit-domain dependency usage in escalation reporting.
- Files:
  - `functions/src/services/repositories/visits/VisitRepository.ts`
  - `functions/src/services/repositories/visits/FirestoreVisitRepository.ts`
  - `functions/src/services/domain/visits/VisitDomainService.ts`
  - `functions/src/services/postCommitEscalationReportingService.ts`
  - `functions/src/services/__tests__/postCommitEscalationReportingService.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/postCommitEscalationReportingService.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)
  - `npm test -- src/routes/__tests__` (functions, `160/160`)

### DO) Phase 4 chunk 3 slice: `shareAccess` domain/repository migration
- Change:
  - Migrated caregiver share-access helper reads/writes off direct `shares` collection access to share domain/repository methods:
    - accepted-share list by caregiver UID
    - accepted-share list by caregiver email fallback
    - owner-scoped accepted-share access checks (including canonical share id fallback)
    - caregiver-id backfill on legacy email-only accepted shares via domain-backed merge writes.
  - Added share repository/domain contract support for caregiver-email share reads:
    - `ShareRepository.listByCaregiverEmail(...)`
    - `ShareDomainService.listByCaregiverEmail(...)`
  - Updated fallback/backfill test harnesses to support domain-backed merge updates in share docs.
- Files:
  - `functions/src/services/shareAccess.ts`
  - `functions/src/services/repositories/shares/ShareRepository.ts`
  - `functions/src/services/repositories/shares/FirestoreShareRepository.ts`
  - `functions/src/services/domain/shares/ShareDomainService.ts`
  - `functions/src/routes/__tests__/care.acceptedSharesFallback.test.ts`
  - `functions/src/routes/__tests__/visits.access.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/domainServices.test.ts src/routes/__tests__/care.acceptedSharesFallback.test.ts src/routes/__tests__/visits.access.test.ts src/routes/__tests__/shares.invites.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)
  - `TMPDIR=/Users/tylermcanally/LumiMD/Codebase/functions/.tmp npx jest src/routes/__tests__ --no-cache` (functions, `160/160`)

### DP) Phase 4 chunk 3 slice: `visitPostCommitRecoveryService` visit/user domain migration
- Change:
  - Added post-commit recovery scan contract to visits repository/domain:
    - `VisitRepository.listPostCommitRecoverable(limit)`
    - `VisitDomainService.listPostCommitRecoverable(limit)`
  - Migrated `visitPostCommitRecoveryService` off direct Firestore access for recovery scans and visit state updates:
    - recovery scan now uses `VisitDomainService.listPostCommitRecoverable(...)`
    - visit state/transcript updates now use `VisitDomainService.updateRecord(...)`
  - Migrated caregiver auto-share toggle lookup in recovery retries to `UserDomainService.getById(...)`.
  - Updated visit recovery harness/mocks for repository-backed `visits` doc get/update calls and expanded visit-domain contract coverage for the new recovery method.
- Files:
  - `functions/src/services/repositories/visits/VisitRepository.ts`
  - `functions/src/services/repositories/visits/FirestoreVisitRepository.ts`
  - `functions/src/services/domain/visits/VisitDomainService.ts`
  - `functions/src/services/visitPostCommitRecoveryService.ts`
  - `functions/src/services/__tests__/visitPostCommitRecoveryService.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/visitPostCommitRecoveryService.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DQ) Phase 4 chunk 3 slice: `visitProcessor` medication/user domain migration
- Change:
  - Migrated known-medication lookup in visit summarization from direct `medications` collection access to `MedicationDomainService.listAllForUser(...)`.
  - Migrated caregiver auto-share toggle lookup for caregiver email post-commit operation from direct `users` collection access to `UserDomainService.getById(...)`.
  - Added dependency-resolution wiring so visit processing can be run with domain/repository overrides without direct service-level Firestore coupling for medication/user reads.
  - Updated visit-processor test harness medication query behavior to support repository-backed list semantics.
- Files:
  - `functions/src/services/visitProcessor.ts`
  - `functions/src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts src/services/__tests__/visitPostCommitRecoveryService.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DR) Phase 4 chunk 3 slice: `patientMedicalContext` repository/service migration
- Change:
  - Extended patient-context repository/domain contracts with generalized write operations:
    - `PatientContextRepository.setByUserId(...)`
    - `PatientContextRepository.updateByUserId(...)`
    - `PatientContextDomainService.setForUser(...)`
    - `PatientContextDomainService.updateForUser(...)`
  - Migrated `patientMedicalContext` helper operations off direct Firestore coupling to `PatientContextDomainService`:
    - `getPatientMedicalContext(...)`
    - `createPatientMedicalContext(...)`
    - `updatePatientContextFromVisit(...)`
    - `enableTracking(...)`
    - `recordTrackingLog(...)`
  - Added focused bridge coverage for get/create/update/tracking flows.
- Files:
  - `functions/src/services/repositories/patientContexts/PatientContextRepository.ts`
  - `functions/src/services/repositories/patientContexts/FirestorePatientContextRepository.ts`
  - `functions/src/services/domain/patientContexts/PatientContextDomainService.ts`
  - `functions/src/services/patientMedicalContext.ts`
  - `functions/src/services/__tests__/patientMedicalContext.repositoryBridge.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/patientMedicalContext.repositoryBridge.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DS) Phase 4 chunk 3 slice: `notifications` push-token repository/service migration
- Change:
  - Added users repository/domain push-token list contract:
    - `UserRepository.listPushTokens(userId)`
    - `UserDomainService.listPushTokens(userId)`
  - Migrated notification-service push-token read/remove paths off direct `users/{id}/pushTokens` access:
    - `getUserPushTokens(...)` now uses `UserDomainService.listPushTokens(...)`
    - `removeInvalidToken(...)` now uses `UserDomainService.unregisterPushToken(...)`
  - Added focused bridge coverage for token list de-duplication and invalid-token removal flows.
- Files:
  - `functions/src/services/repositories/users/UserRepository.ts`
  - `functions/src/services/repositories/users/FirestoreUserRepository.ts`
  - `functions/src/services/domain/users/UserDomainService.ts`
  - `functions/src/services/notifications.ts`
  - `functions/src/services/__tests__/notifications.repositoryBridge.test.ts`
  - `functions/src/services/__tests__/domainServices.test.ts`
  - `functions/src/services/__tests__/serviceContainer.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/notifications.repositoryBridge.test.ts src/services/__tests__/domainServices.test.ts src/services/__tests__/serviceContainer.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DT) Phase 4 chunk 3 slice: medication-safety helper-service boundary migration
- Change:
  - Migrated `medicationSafety` user/medication reads off direct Firestore coupling to domain-backed dependencies:
    - medications -> `MedicationDomainService.listAllForUser(...)`
    - users -> `UserDomainService.getById(...)`
  - Migrated `medicationSafetyAI` user/medication reads to the same domain-backed dependencies while preserving existing AI cache collection behavior.
  - Added focused bridge coverage for dependency-injected medication/user reads in hardcoded safety checks.
- Files:
  - `functions/src/services/medicationSafety.ts`
  - `functions/src/services/medicationSafetyAI.ts`
  - `functions/src/services/__tests__/medicationSafety.repositoryBridge.test.ts`
- Validation:
  - `npm test -- src/services/__tests__/medicationSafety.test.ts src/services/__tests__/medicationSafety.repositoryBridge.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

### DU) Phase 4 chunk 3 slice: caregiver-email and provider-report helper-service boundary migration
- Change:
  - Migrated caregiver email helper read paths to domain-backed dependencies:
    - visits -> `VisitDomainService.getById(...)`
    - users -> `UserDomainService.getById(...)`
    - shares -> `ShareDomainService.listByOwnerId(...)`
    - retained `caregiverEmailLog` writes via dependency-injected write hook.
  - Migrated provider-report PDF data reads to domain-backed dependencies:
    - health logs -> `HealthLogDomainService.listForUser(...)`
    - medications -> `MedicationDomainService.listAllForUser(...)`
- Files:
  - `functions/src/services/caregiverEmailService.ts`
  - `functions/src/services/pdfGenerator.ts`
- Validation:
  - `npm test -- src/services/__tests__/visitProcessor.caregiverAutoShare.test.ts src/services/__tests__/visitPostCommitRecoveryService.test.ts` (functions)
  - `npm test -- src/routes/__tests__/medications.core.test.ts src/routes/__tests__/healthLogs.sanitization.test.ts src/routes/__tests__/healthLogs.softDelete.test.ts` (functions)
  - `npm run build` (functions)
  - `npm run test:remediation-guardrails` (functions)

## Current Phase Status
Phase 0 status: complete as of 2026-02-20. Phase 1 status: complete as of 2026-02-21. Phase 2 status: complete as of 2026-02-21. Phase 3 status: complete as of 2026-02-22. Phase 4 status: complete as of 2026-02-23 (long-tail helper-service boundary migrations closed; remediation scope complete).

## Post-Remediation Operational Follow-up
1. Continue telemetry-driven tuning for cache TTLs, index shapes, and query patterns as usage scales.
2. Continue incident/postmortem-driven refinement for observability and policy guardrails.
2. Denormalization policy expansion beyond current highest-risk duplicated fields.
3. Ongoing CI/index guardrail updates and cache/auth tuning from production telemetry.
