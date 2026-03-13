# LumiMD Security Review — 2026-03-12

**Scope:** Uncommitted changes on `main` (AVS document upload, MedlinePlus linking, action nudges) + full repo secrets sweep
**Reviewer:** Automated (Claude Code security review)
**Status:** Remediated

---

## Summary

| # | Severity | Category | File | Status |
|---|----------|----------|------|--------|
| 1 | **HIGH** | Path Traversal / AuthZ Bypass | `functions/src/routes/visits.ts` | **Fixed** |
| 2 | LOW | Open Redirect (defense-in-depth) | `web-portal/app/api/medlineplus/route.ts` | **Fixed** |
| 3 | -- | API Key / Secrets Exposure | Repo-wide sweep | **Clean** |

---

## Finding 1: Storage Path Traversal — Unauthorized Access to Other Users' Documents

**Severity:** HIGH
**Category:** Path Traversal / Authorization Bypass (CWE-22, CWE-862)
**Confidence:** 8/10
**Status:** Fixed (2026-03-12)

### Description

The `documentStoragePath` field (and `storagePath` for audio) was accepted as a free-form string validated only by Zod type checking (`z.string()`). No validation ensured the path belonged to the authenticated user's storage namespace (`visits/{userId}/...`).

When `POST /v1/visits/:id/process-document` processed the document, it called `bucket.file(path)` using the **Firebase Admin SDK**, which bypasses all client-side Storage security rules. The ownership check (`ensureVisitOwnerAccessOrReject`) only verified the **visit document** belonged to the caller — not that the **storage path** did.

### Attack Path

1. Authenticated User A calls `POST /v1/visits` with:
   ```json
   {
     "source": "avs_photo",
     "documentStoragePath": "visits/USER_B_UID/1710000000000.jpg",
     "documentType": "avs_photo"
   }
   ```
2. Visit is created owned by User A but referencing User B's file.
3. User A calls `POST /v1/visits/{visitId}/process-document`.
4. Server confirms User A owns the visit (true), reads User B's file via Admin SDK, sends to GPT-4o, writes extracted PHI (diagnoses, medications, summary) onto User A's visit.
5. User A reads their own visit to access User B's medical data.

### Impact

- **PHI exposure:** An authenticated user could extract another patient's medical documents (AVS photos, PDFs, audio recordings).
- **HIPAA implications:** Unauthorized access to protected health information.
- **Scope:** Affected `documentStoragePath` (images/PDFs) and `storagePath` (audio) across create, update, process-document, and retry code paths.

### Remediation Applied

Added `validateStoragePath()` and `validateStoragePaths()` helpers to `functions/src/routes/visits.ts` (line 117). These reject paths containing `..` and require paths start with `visits/{userId}/` or `audio/{userId}/`.

Validation applied at 6 points:

| Endpoint | Field(s) Validated | Line | Returns |
|----------|-------------------|------|---------|
| `POST /v1/visits` | `storagePath` | ~739 | 403 |
| `POST /v1/visits` | `documentStoragePath` | ~741 | 403 |
| `PATCH /v1/visits/:id` | `storagePath` | ~834 | 403 |
| `POST /v1/visits/:id/process-document` | `documentPaths` | ~1766 | 403 |
| `POST /v1/visits/:id/retry` (document) | `documentPaths` | ~1172 | 403 |
| `POST /v1/visits/:id/retry` (audio) | `storagePath` | ~1263 | 403 |

### Post-Remediation Bug Caught

During verification, the document retry path had validation placed **after** `res.json()` — the 403 could never be sent (Express "headers already sent" error). Moved validation before the response. All other 5 validation points were correctly placed.

---

## Finding 2: Open Redirect via MedlinePlus Proxy (Defense-in-Depth)

**Severity:** LOW (not practically exploitable)
**Category:** Open Redirect (CWE-601)
**Confidence:** 2/10 — Defense-in-depth hardening only
**Status:** Fixed (2026-03-12)

### Description

The `/api/medlineplus` route fetched XML from the NLM Health Topics API, extracted a URL via regex, and issued a 302 redirect with no domain allowlist. The route is unauthenticated.

### Why This Was Low Risk

- The NLM API is a US government service that exclusively returns `medlineplus.gov` URLs.
- The attacker controls the search term but **cannot control the result URLs**.
- A nonsensical search term returns no results, triggering the safe fallback path.
- Open redirects are explicitly low-impact per OWASP unless chained with other vulns.

### Remediation Applied

Added domain allowlist validation in `web-portal/app/api/medlineplus/route.ts` (line 28). The extracted URL is now parsed and checked against `medlineplus.gov` / `*.medlineplus.gov` before redirecting. Invalid or non-matching URLs fall through to the safe search fallback.

---

## Finding 3: API Key / Secrets Exposure — Repo-Wide Sweep

**Status:** Clean
**Reviewed:** 2026-03-12

### Methodology

Full sweep of the repository for hardcoded API keys, credentials, and secrets including:
- Hardcoded key patterns (`sk-`, `pk_`, `AIza`, `key-`, base64 tokens)
- `.env` files in git history
- Client-side code shipping secrets to browser/app bundle
- `process.env` fallbacks with hardcoded defaults
- Firebase config, OpenAI, AssemblyAI, Resend, Sentry DSN values

### Results

**No secrets are committed to git.** All `.env` files exist only locally and are properly gitignored:

| File | Git Tracked | Gitignore Rule |
|------|-------------|----------------|
| `functions/.env` | No | `.env` (line 66) |
| `mobile/.env` | No | `.env` (line 66) |
| `web-portal/.env.local` | No | `*.env.local` (line 67), `web-portal/.env.local` (line 87) |
| `marketing-site/.vercel/.env.development.local` | No | `*.env.local` (line 67) |

- `git ls-files` confirms none of these are tracked
- `git log` confirms no `.env` files were ever committed (only `ios/.xcode.env`, an Xcode build config)
- Client-side Firebase keys use `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` prefixes (intentionally public, restricted by Firebase security rules)
- All server-side code reads secrets from `process.env` without hardcoded fallbacks

### Recommendation

Enable GitHub push protection / secret scanning on the remote repo as a preventive measure against accidental future commits.

---

## Verification Checklist

- [x] `POST /v1/visits` rejects `documentStoragePath` outside `visits/{userId}/`
- [x] `POST /v1/visits` rejects `storagePath` outside `audio/{userId}/`
- [x] `PATCH /v1/visits/:id` rejects `storagePath` outside `audio/{userId}/`
- [x] `POST /v1/visits/:id/process-document` re-validates paths before `bucket.file()`
- [x] `POST /v1/visits/:id/retry` re-validates both path types
- [x] Paths containing `..` are rejected
- [x] MedlinePlus redirect validates domain
- [x] Existing tests pass (561/561)
- [x] Document retry validation order bug caught and fixed
- [x] Unit tests for path validation (7 tests in `visits.storagePathValidation.test.ts`)
