# LumiMD Security & Privacy

**Last Updated:** March 12, 2026
**Status:** Active — all critical findings remediated

---

## Security Posture Summary

| Category | Status | Notes |
|----------|--------|-------|
| API security (auth, CORS, rate limiting, headers) | Done | Helmet.js, Zod validation, constant-time webhook verification |
| Storage path authorization | Done | `validateStoragePath()` enforces user-namespace prefix (March 2026) |
| MedlinePlus redirect hardening | Done | Domain allowlist on NLM API redirect (March 2026) |
| Dependency vulnerabilities | Done | Next.js 15.5+, Express 4.22+, pdfmake 0.2.20 |
| Secrets in git | Clean | No secrets in tracked files or git history; `.env` properly gitignored |
| External code review | Done | 16/16 items addressed (Feb 2026) |
| Key exposure incident | Done | Resend key rotated, Firebase keys restricted (Feb 2026) |
| Privacy audit logging | Done | `privacyAuditLogs` collection tracks deletions, exports, sweeps, access changes (March 2026) |
| Cache-Control consistency | Done | All mutable GET endpoints use `private, no-cache` (March 2026) |
| Account deletion completeness | Done | `caregiverMessages`, `devices` added to deletion targets; Storage files cleaned up (March 2026) |
| Document file cleanup | Done | `privacyDataSweeper` now cleans AVS document files alongside audio (March 2026) |
| Soft-delete retention alignment | Done | Code aligned to 30-day retention (was 90); timezone normalized to UTC (March 2026) |

### Open Items

| Item | Severity | Notes |
|------|----------|-------|
| ~~`Math.random()` in email verification tokens~~ | ~~High~~ | Fixed March 2026 — replaced with `crypto.randomBytes(32)` in both email routes + `lumibotAnalyzer.ts`. PII removed from server logs. |
| Mobile encrypted storage | Medium | AsyncStorage is unencrypted — migrate sensitive data to `expo-secure-store` |
| Screen capture prevention | Medium | No `FLAG_SECURE` / `preventScreenCapture` on health data screens |
| `x-middleware-subrequest` header blocking | Medium | Next.js middleware bypass (CVE-2025-29927) — add header check |
| Pre-commit secret scanning | Low | No gitleaks or GitGuardian hook configured |
| ESLint security plugin | Low | `eslint-plugin-security` not installed |

---

## What's Protected

### Authentication & Authorization
- **Firebase Auth:** Email/password, Google Sign-In, Apple Sign-In (mobile), JWT tokens
- **All endpoints require auth:** `requireAuth` middleware on every route
- **Ownership checks:** `ensureVisitOwnerAccessOrReject` on all resource access
- **Storage path validation:** `validateStoragePath()` ensures Admin SDK file access stays within the user's namespace (`visits/{userId}/`, `audio/{userId}/`) — prevents cross-user document reads
- **Caregiver access:** Firestore rules check `shares/{ownerId_caregiverId}` with `status: 'accepted'`
- **Token revocation:** `verifyIdToken(token, true)` with `checkRevoked=true`
- **Mobile-web handoff:** One-time code with 5-min TTL via `signInWithCustomToken`

### Network & Transport
- **CORS whitelist:** `lumimd.app`, `portal.lumimd.app`, localhost (dev), Vercel previews — no wildcards
- **Security headers (Helmet.js):** CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- **Rate limiting:** 100 req/15min (prod), 5 auth attempts/15min
- **HTTPS enforcement:** `requireHttps` middleware, HSTS header

### Data Protection
- **Encryption at rest:** Firestore + Firebase Storage use AES-256 (GCP-managed)
- **Encryption in transit:** TLS 1.2+ on all API traffic
- **Zero AI data retention:** `store: false` on all OpenAI calls
- **Soft deletes:** `deletedAt` field, 30-day retention before `privacySweeper` purges
- **Input sanitization:** Zod schemas on all endpoints; `sanitizePlainText()` on text fields

### Firestore Security Rules
- No `allow read, write: if true` patterns
- Owner-only writes on all collections
- Caregiver read access gated on accepted share status
- Field-level size/type validation
- Storage rules: owner read/write, 20 MB limit for documents, content type restrictions

---

## Data Flow

```
User Device (Mobile/Web)
    ↓ HTTPS (TLS 1.2+)
Firebase Storage (AES-256 at rest)
    ↓ Signed URL (15-min TTL)
AssemblyAI API (audio) or GPT-4o Vision (documents)
    ↓ Transcription / extraction (data deleted after processing)
Firebase Functions
    ↓ GPT-4 summarization (store: false)
Firestore (AES-256 at rest)
    ↓ HTTPS (TLS 1.2+)
User Device (viewing data)
```

---

## Privacy & Compliance

### Privacy Principles
- Never sell user data
- User owns and controls their data
- AI providers don't retain patient data
- Transparent about AI processing

### User Data Rights
- **Export:** `GET /v1/users/me/export` — full data download in JSON
- **Delete:** `DELETE /v1/users/me` — removes visits, medications, actions, shares, auth account
- **CCPA/GDPR:** Data access, deletion, and portability supported

### Regulatory Status
- **Not a HIPAA covered entity** — LumiMD is direct-to-consumer
- **FTC Health Breach Notification Rule (HBNR):** Applies to consumer health apps
  - User notification within 60 days of breach
  - FTC notification (500+ affected: same time as users; <500: by year end)
  - Media notification (500+ in a state)

### Third-Party Data Processing
| Provider | Data Processed | Retention |
|----------|---------------|-----------|
| AssemblyAI | Audio recordings | Deleted after transcription |
| OpenAI | Transcripts, documents | Immediate deletion (`store: false`) |
| Firebase/GCP | All data | AES-256, GCP-managed keys |
| Resend | Email content | Transactional only |

---

## Incident History

### March 2026 — Storage Path Traversal (CWE-22, CWE-862)

**Severity:** HIGH — Fixed
**Finding:** `documentStoragePath` and `storagePath` accepted arbitrary strings. Firebase Admin SDK bypasses Storage security rules, allowing cross-user document access.
**Fix:** Added `validateStoragePath()` / `validateStoragePaths()` helpers to `functions/src/routes/visits.ts`. Validation at 6 endpoints (POST create, PATCH update, process-document, retry x2). 7 unit tests.
**Full details:** `docs/archive/security/SECURITY-REVIEW-2026-03-12.md`

### February 2026 — Resend API Key Exposure

**Severity:** HIGH — Resolved
**Finding:** Resend API key committed in historical git commit `ce04d1b` during brief public repo window.
**Fix:** Key rotated, Firebase API keys restricted, placeholder values in docs.
**Full details:** `docs/archive/security/KEY-EXPOSURE-REMEDIATION-2026-02-07.md`

### January 2026 — Initial Security Audit

**Severity:** Mixed — Critical items resolved
**Finding:** Dependency vulnerabilities (Next.js, Express), `Math.random()` for tokens, missing mobile encryption.
**Fixed:** Next.js upgraded to 15.5+, Express to 4.22+, pdfmake audited.
**Still open:** `Math.random()` tokens, EncryptedStorage, screen capture prevention.
**Full details:** `docs/archive/security/SECURITY_AUDIT_REPORT.md`

### February 2026 — External Code Review

**Status:** 16/16 items addressed
**Scope:** Backend routes/services/triggers, Firestore indexes, web/mobile integration.
**Full details:** `docs/archive/security/code-review-remediation-plan.md`, `docs/archive/security/reviewer-remediation-overview.md`

---

## Security Contact

- **Security issues:** security@lumimd.app
- **Privacy questions:** privacy@lumimd.app
- **Responsible disclosure:** We acknowledge within 48 hours, provide fix timeline within 1 week, credit researchers after deployment.

---

## Production Deployment Checklist

- [ ] `NODE_ENV=production` in Firebase config
- [ ] `ALLOWED_ORIGINS` set to production domains only
- [ ] Rate limits verified (test with 6 failed auth attempts)
- [ ] CORS tested with unauthorized origin
- [ ] Firebase API keys restricted to required APIs + bundle IDs
- [ ] GitHub push protection / secret scanning enabled
- [ ] `Math.random()` replaced with `crypto.randomBytes()` in email routes
