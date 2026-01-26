# LumiMD Security Audit Checklist

**Purpose:** Minimal, actionable checklist for security reviews and compliance.  
**Scope:** Mobile, web, Cloud Functions, Firebase rules, and third-party AI services.  
**Last Updated:** January 2026

---

## 1. Blocking Issues (Must Fix Before Production)

- Update vulnerable dependencies (Next.js, pdfmake, Express/qs, etc.)
- Replace any security-critical `Math.random()` with cryptographic randomness
- Encrypt mobile storage for sensitive data (use encrypted storage/keychain)
- Enforce HTTPS, CORS allowlist, security headers, and rate limits

---

## 2. Codebase Review Checklist

### Backend (Cloud Functions)
- Auth required on all endpoints
- Ownership checks on all Firestore access
- Zod validation on all inputs
- Sanitized error responses in production
- Webhooks verify secrets using constant-time comparison

### Firebase Rules
- No `allow read, write: if true`
- Owner + caregiver access rules are explicit and limited
- Field-level validation (size/type) where applicable

### Mobile
- Sensitive data stored in encrypted storage
- Screen capture prevention on sensitive screens
- Deep links validated (parameters + domain verification)

### Web Portal
- Auth middleware applied to protected routes
- No client-side secret exposure
- Avoid `dangerouslySetInnerHTML`

---

## 3. AI/LLM Safety

- API keys stored server-side only
- Prompt inputs validated/escaped
- Output validated before storing or displaying
- Logging avoids PHI/PII

---

## 4. FTC Health Breach Notification Rule (HBNR)

Required readiness:
- Document data flows involving health data
- Incident response plan with notification templates
- Audit logging for data access and exports
- Third-party agreements documented

Notification timing:
- **Users:** within 60 days
- **FTC:** 500+ affected, same time as users; <500 by year end
- **Media:** 500+ residents of a state

---

## 5. Tooling Expectations

- Secret scanning (Gitleaks or GitGuardian)
- Dependency auditing (`npm audit`)
- Static analysis (ESLint security plugin, Semgrep)
- Firebase Emulator tests for rules

---

## 6. Owner & Cadence

- **Owner:** Security lead or tech lead
- **Cadence:** Every release and after dependency upgrades

---

For detailed findings and current gaps, see `docs/SECURITY_AUDIT_REPORT.md`.
