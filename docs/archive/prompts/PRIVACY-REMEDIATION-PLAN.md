# Privacy & Security Remediation Plan

**Created:** March 16, 2026
**Status:** Complete
**Current phase:** All phases done

## Overview

LumiMD is a consumer health app (not HIPAA-covered, subject to FTC Health Breach Notification Rule). A privacy audit found gaps in token security, data cleanup completeness, cache headers, and audit logging. This document guides phased remediation — execute one phase per context window, test, update status, then hand off.

## How to Use This Document

1. Read CLAUDE.md for full project context
2. Execute the **current phase** (marked below)
3. Run the verification steps for that phase
4. Update the status checkboxes and "Current phase" field above
5. Commit changes with a descriptive message
6. Start a new context window for the next phase

---

## Phase 1: Cryptographic Token Fix (HIGH) — `[ ] Not started`

**Problem:** `Math.random()` produces predictable email verification tokens. An attacker could guess tokens and verify arbitrary email addresses.

### Files to modify

**1a. Email verification tokens → `crypto.randomBytes()`**

| File | Line | Current | Replace with |
|------|------|---------|-------------|
| `web-portal/app/api/send-verification-email/route.ts` | 92 | `Math.random().toString(36).substring(2) + Date.now().toString(36)` | `crypto.randomBytes(32).toString('hex')` |
| `web-portal/app/api/send-verification-email-simple/route.ts` | 42 | Same pattern | Same fix |

Both files need `import crypto from 'crypto';` added at the top (Node.js built-in, no dependency needed).

**1b. Remove PII from server logs**

| File | Line | Issue | Fix |
|------|------|-------|-----|
| `web-portal/app/api/send-verification-email-simple/route.ts` | 37 | `console.log` includes `email` in body | Log only `userId`, remove `email` |
| `web-portal/app/api/send-verification-email-simple/route.ts` | 48 | `console.log('Sending email to:', email)` | Remove line or redact email |

**1c. Backend Math.random() cleanup**

| File | Line | Current | Replace with |
|------|------|---------|-------------|
| `functions/src/services/lumibotAnalyzer.ts` | 37 (`generateShortId()`) | `Math.random().toString(36).substring(2, 10)` | `crypto.randomBytes(4).toString('hex')` |

Add `import crypto from 'crypto';` at top if not already imported.

**1d. Mobile device ID — SKIPPED** (non-sensitive device identifier, negligible risk, would require native rebuild)

### Documentation updates
- `docs/SECURITY.md` — Remove `Math.random()` from Open Items table (line 24)

### Verification
```bash
cd web-portal && npx next build          # No import errors
cd functions && npm run build && npm test # All 554 tests pass
# Confirm no remaining Math.random in backend/web security paths:
grep -r "Math.random" functions/src/ web-portal/app/api/
```

### After completion
- [ ] All code changes made
- [ ] `web-portal` builds successfully
- [ ] `functions` builds and all tests pass
- [ ] `grep` confirms zero `Math.random` in `functions/src/` and `web-portal/app/api/`
- [ ] `docs/SECURITY.md` updated
- [ ] Changes committed
- [ ] Updated "Current phase" at top of this doc to Phase 2

---

## Phase 2: Cache-Control & Retention Alignment (MEDIUM) — `[ ] Not started`

**Problem:** 4 endpoints use `max-age` caching on mutable health data (causes stale reads after mutations). Soft-delete retention documented as 30 days but coded as 90.

### Files to modify

**2a. Fix Cache-Control headers**

| File | Line | Current | Replace with |
|------|------|---------|-------------|
| `functions/src/routes/medicationLogs.ts` | 171 | `'private, max-age=30'` | `'private, no-cache'` |
| `functions/src/routes/medicationLogs.ts` | 250 | `'private, max-age=60'` | `'private, no-cache'` |
| `functions/src/routes/medicationReminders.ts` | 138 | `'private, max-age=30'` | `'private, no-cache'` |
| `functions/src/routes/medicationReminders.ts` | 160 | `'private, max-age=15'` | `'private, no-cache'` |

**2b. Align retention period to 30 days**

| File | Line | Current | Replace with |
|------|------|---------|-------------|
| `functions/src/services/softDeleteRetentionService.ts` | 10 | `DEFAULT_SOFT_DELETE_RETENTION_DAYS = 90` | `DEFAULT_SOFT_DELETE_RETENTION_DAYS = 30` |

Note: existing tests pass explicit `retentionDays` in options, so this default change won't break them.

**2c. Timezone consistency**

| File | Line | Current | Replace with |
|------|------|---------|-------------|
| `functions/src/triggers/privacySweeper.ts` | 21 | `timeZone: 'America/Chicago'` | `timeZone: 'Etc/UTC'` |

This matches `purgeSoftDeletedData` in `functions/src/index.ts` (line ~390).

### Verification
```bash
cd functions && npm run build && npm test
# Confirm no remaining max-age on mutable endpoints:
grep -r "max-age" functions/src/routes/
```

### After completion
- [ ] All code changes made
- [ ] `functions` builds and all tests pass
- [ ] `grep` confirms zero `max-age` in `functions/src/routes/`
- [ ] Changes committed
- [ ] Updated "Current phase" at top of this doc to Phase 3

---

## Phase 3: Account Deletion Completeness (MEDIUM) — `[ ] Not started`

**Problem:** `DELETE /v1/users/me` misses `caregiverMessages` collection and doesn't clean up Storage files (audio, AVS documents). When a user deletes their account, orphaned data remains.

### Files to modify

**3a. Add missing collections to deletion targets**

File: `functions/src/services/repositories/users/FirestoreUserRepository.ts`
Function: `buildDeletionTargets()` (lines 62-82)

Add these entries to the `targets` array (before the `userEmailCandidates.forEach` block):
```typescript
{ collection: 'caregiverMessages', field: 'recipientId', value: userId },
{ collection: 'caregiverMessages', field: 'senderId', value: userId },
{ collection: 'devices', field: 'userId', value: userId },
```

**3b. Clean up Storage files on account deletion**

File: `functions/src/routes/users.ts` — in `DELETE /v1/users/me` handler (around line 947)

The approach: before calling `deleteAccountData()`, query the user's visits to collect Storage paths. After Firestore deletion succeeds, delete Storage files.

```
1. Query visits collection for userId to get storagePath and documentStoragePath values
2. Call deleteAccountData() (existing Firestore cleanup)
3. For each collected Storage path:
   - admin.storage().bucket().file(path).delete({ ignoreNotFound: true })
   - Handle documentStoragePath as string | string[] (normalize to array)
   - Wrap each delete in try/catch (don't block full deletion if one file fails)
4. Delete Firebase Auth user (existing)
```

### Key context
- `documentStoragePath` can be a `string` (single PDF) or `string[]` (multi-image AVS)
- Audio files are at `audio/{userId}/...`, documents at `visits/{userId}/...`
- The existing `deleteAccountData()` method is at line 641 of `FirestoreUserRepository.ts`
- Use `admin.storage().bucket()` for default bucket (no `bucketName` field on document visits)

### Verification
```bash
cd functions && npm run build && npm test
```
Manual: create test user with visits (audio + AVS docs) + caregiver messages → delete account → verify Firestore collections empty + Storage files gone.

### After completion
- [ ] `caregiverMessages` and `devices` added to `buildDeletionTargets()`
- [ ] Storage cleanup added to DELETE handler
- [ ] `functions` builds and all tests pass
- [ ] Changes committed
- [ ] Updated "Current phase" at top of this doc to Phase 4

---

## Phase 4: Document File Cleanup in Privacy Sweeper (MEDIUM) — `[ ] Not started`

**Problem:** `privacySweeper` cleans audio files and AssemblyAI transcripts after 24 hours but ignores AVS document files (`documentStoragePath`), which persist in Storage forever.

### Files to modify

File: `functions/src/triggers/privacySweeper.ts`

The existing sweep loop (lines 43-79) handles `transcriptionId` and `storagePath/audioUrl`. Add a third block after the audio cleanup (after line 79) for document files:

```typescript
// Check for lingering document files (AVS photos/PDFs)
if (data.documentStoragePath) {
  try {
    const paths = Array.isArray(data.documentStoragePath)
      ? data.documentStoragePath
      : [data.documentStoragePath];
    const bucket = admin.storage().bucket();
    for (const docPath of paths) {
      await bucket.file(docPath).delete({ ignoreNotFound: true });
    }
    await doc.ref.update({
      documentStoragePath: admin.firestore.FieldValue.delete(),
      documentDeletedAt: admin.firestore.Timestamp.now(),
      sweptByPrivacyJob: true,
    });
    cleanedDocuments++;
    functions.logger.info(`[PrivacyAudit] Swept lingering documents for visit ${doc.id}`);
  } catch (error) {
    functions.logger.error(`[PrivacyAudit] Failed to sweep documents for visit ${doc.id}`, error);
  }
}
```

Also:
- Add `let cleanedDocuments = 0;` at line 40-41 (alongside existing counters)
- Update summary log (line 82) to include `cleanedDocuments`:
  ```
  `[PrivacyAudit] Sweep complete. Cleaned ${cleanedTranscripts} transcripts, ${cleanedAudio} audio files, and ${cleanedDocuments} document files.`
  ```

### Documentation updates
- `CLAUDE.md` — Update privacySweeper description to mention document file cleanup

### Verification
```bash
cd functions && npm run build && npm test
# Confirm document cleanup is present:
grep "documentStoragePath" functions/src/triggers/privacySweeper.ts
```

### After completion
- [ ] Document cleanup block added to privacySweeper
- [ ] Counter and summary log updated
- [ ] `CLAUDE.md` updated
- [ ] `functions` builds and all tests pass
- [ ] Changes committed
- [ ] Updated "Current phase" at top of this doc to Phase 5

---

## Phase 5: Privacy Audit Logging (LOW) — `[ ] Not started`

**Problem:** No persistent audit trail for privacy-sensitive operations (account deletions, data exports, caregiver access changes, privacy sweeps).

### Files to create

**5a. Create `functions/src/services/privacyAuditLogger.ts`**

A lightweight service that writes to a top-level `privacyAuditLogs` collection:

```typescript
import * as admin from 'firebase-admin';

export type PrivacyEventType =
  | 'account_deletion'
  | 'data_export'
  | 'privacy_sweep'
  | 'caregiver_access_granted'
  | 'caregiver_access_revoked';

export interface PrivacyAuditEvent {
  eventType: PrivacyEventType;
  actorUserId: string;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
}

export async function logPrivacyEvent(event: PrivacyAuditEvent): Promise<void> {
  await admin.firestore().collection('privacyAuditLogs').add({
    ...event,
    occurredAt: admin.firestore.Timestamp.now(),
  });
}
```

Note: `FirestoreUserRepository.ts` already uses a `privacyAuditLogs` subcollection for analytics consent — this extends the pattern to a top-level collection for system-wide events.

### Files to modify

**5b. Integrate audit logging**

| File | Location | Event type |
|------|----------|------------|
| `functions/src/routes/users.ts` | `DELETE /v1/users/me` handler (~line 947) | `account_deletion` |
| `functions/src/routes/users.ts` | `GET /v1/users/me/export` (if exists) | `data_export` |
| `functions/src/triggers/privacySweeper.ts` | End of sweep (after line 151) | `privacy_sweep` with metrics |
| `functions/src/routes/shares.ts` | Share accept handler | `caregiver_access_granted` |
| `functions/src/routes/shares.ts` | Share revoke handler | `caregiver_access_revoked` |

Wrap each `logPrivacyEvent()` call in try/catch — audit logging should never block the primary operation.

### Documentation updates
- `docs/SECURITY.md` — Add privacy audit logging to completed items, update Open Items
- `CLAUDE.md` — Document the audit logging pattern and `privacyAuditLogs` collection

### Firestore rules
- Add deny-all client rule for `privacyAuditLogs` (admin SDK only, like `auth_handoffs`):
  ```
  match /privacyAuditLogs/{logId} {
    allow read, write: if false;
  }
  ```
- File: `firebase-setup/firestore.rules`

### Verification
```bash
cd functions && npm run build && npm test
```
Manual: delete test account → query `privacyAuditLogs` in Firebase Console → verify event logged.
Manual: accept/revoke a caregiver share → verify audit log entry.

### After completion
- [ ] `privacyAuditLogger.ts` created
- [ ] Audit logging integrated at all 5 locations
- [ ] Firestore rules updated
- [ ] `docs/SECURITY.md` and `CLAUDE.md` updated
- [ ] `functions` builds and all tests pass
- [ ] Changes committed
- [ ] Mark this document status as **Complete**

---

## Summary

| Phase | Severity | Scope | Files changed | Native build? |
|-------|----------|-------|--------------|--------------|
| 1 | HIGH | web-portal + functions | 3 files + SECURITY.md | No |
| 2 | MEDIUM | functions | 3 files | No |
| 3 | MEDIUM | functions | 2 files | No |
| 4 | MEDIUM | functions | 1 file + CLAUDE.md | No |
| 5 | LOW | functions + firestore rules | 5 files + docs | No |

All phases deploy without a native mobile build. Can be deployed incrementally after each phase.

## Prompt for New Context Windows

Copy this to start each phase:

```
Read docs/prompts/PRIVACY-REMEDIATION-PLAN.md and execute the current phase
(marked in the "Current phase" field at the top). Follow the instructions exactly,
run all verification steps, update the checkboxes, and commit when done.
```
