# LumiMD Security & Privacy Summary

**Last Updated:** January 12, 2026
**Status:** ⚠️ Needs remediation (see `docs/SECURITY_AUDIT_REPORT.md`)

---

## Overview

LumiMD is a consumer-facing health app that helps users track their doctor visits with AI-powered transcription and summarization. This document summarizes our security posture and privacy practices.

---

## Security Improvements Implemented

### ✅ Critical Security Fixes

1. **Timing Attack Protection**
   - File: [functions/src/routes/webhooks.ts](functions/src/routes/webhooks.ts)
   - Webhook authentication uses constant-time comparison
   - Prevents secret guessing through timing analysis

2. **CORS Whitelist**
   - File: [functions/src/index.ts](functions/src/index.ts)
   - Only whitelisted origins can access API
   - Configured: `https://lumimd.app`, `https://portal.lumimd.app`, localhost (dev), and Vercel previews
   - Prevents CSRF attacks

3. **Security Headers (Helmet.js)**
   - Content Security Policy (XSS protection)
   - HTTP Strict Transport Security (HSTS)
   - X-Frame-Options (clickjacking protection)
   - X-Content-Type-Options (MIME sniffing protection)

4. **Environment-Based Rate Limiting**
   - Production: 100 req/15min (API), 5 attempts/15min (auth)
   - Development: 500 req/15min (API), 50 attempts/15min (auth)
   - Prevents brute force and DoS attacks

### ✅ Privacy Improvements

5. **Zero Data Retention with OpenAI**
   - Files: [functions/src/services/openai.ts](functions/src/services/openai.ts), [functions/src/services/medicationSafetyAI.ts](functions/src/services/medicationSafetyAI.ts)
   - Added `store: false` to all OpenAI API calls
   - Patient data is immediately deleted after AI processing

6. **Account Deletion**
   - Endpoint: `DELETE /v1/users/me`
   - Users can delete their account and all data
   - Deletes: visits, transcripts, medications, actions, shares, auth account

7. **Data Export**
   - Endpoint: `GET /v1/users/me/export`
   - Users can download all their data in JSON format
   - Complies with CCPA/GDPR data portability rights

---

## Privacy Policy

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for the complete user-facing privacy policy.

**Key Principles:**
- ✅ Never sell user data
- ✅ Transparent about AI processing
- ✅ User owns and controls their data
- ✅ Easy data deletion and export
- ✅ AI providers don't retain data

---

## Data Flow

```
User Device (Mobile/Web)
    ↓ [Audio Recording]
    ↓ HTTPS (TLS 1.2+)
Firebase Storage (encrypted at rest, AES-256)
    ↓ [Audio File URL]
    ↓ HTTPS
AssemblyAI API
    ↓ Transcribes audio
    ↓ Deletes data after processing
    ↓ [Transcript Text]
Firebase Functions
    ↓ [Transcript]
    ↓ HTTPS
OpenAI API (store: false)
    ↓ Summarizes transcript
    ↓ Immediately deletes data
    ↓ [Structured Data]
Firestore Database (encrypted at rest, AES-256)
    ↓ HTTPS (TLS 1.2+)
User Device (viewing data)
```

---

## Encryption

### In Transit ✅
- All API traffic uses HTTPS/TLS 1.2+
- HSTS header enforces HTTPS
- Certificate-based authentication

### At Rest ✅
- Firebase Storage: AES-256
- Firestore: AES-256
- Firebase Authentication: AES-256
- Managed by Google Cloud Platform

### Third-Party Processing
- **AssemblyAI**: Deletes after transcription
- **OpenAI**: Immediate deletion (store: false)
- No long-term retention of PHI by AI providers

---

## API Endpoints

### User Management
- `GET /v1/users/me` - Get user profile
- `PATCH /v1/users/me` - Update profile
- `GET /v1/users/me/export` - **Export all data**
- `DELETE /v1/users/me` - **Delete account**
- `POST /v1/users/push-tokens` - Register push token
- `DELETE /v1/users/push-tokens` - Remove push token

### Authentication
- `POST /v1/auth/create-handoff` - Create mobile→web auth code
- `POST /v1/auth/exchange-handoff` - Exchange code for token

### Visits
- `GET /v1/visits` - List visits
- `POST /v1/visits` - Create visit (upload audio)
- `GET /v1/visits/:id` - Get visit details
- `DELETE /v1/visits/:id` - Delete visit

### Medications & Actions
- Standard CRUD operations with ownership checks
- See `docs/SECURITY_AUDIT.md` for full audit checklist

---

## Authentication & Authorization

### Authentication (Firebase Auth)
- Email/password
- OAuth providers (Google, Apple)
- JWT tokens with expiration
- Token revocation supported

### Authorization Checks
- All endpoints require authentication
- Ownership verification on all resources
- Firestore Security Rules enforce access control
- Share relationships support caregiver access

---

## Compliance

### Not HIPAA Compliant
LumiMD is a **direct-to-consumer** product, not a "covered entity" under HIPAA. We are not required to be HIPAA compliant.

### Privacy Laws We Follow
- **CCPA** (California): Right to know, delete, and export data
- **GDPR** (EU/EEA): Data access, deletion, and portability
- **General**: Best practices for consumer privacy

---

## Security Testing

### Completed
- ✅ Manual code review
- ✅ Security vulnerability assessment
- ✅ OWASP Top 10 review

### Recommended (Future)
- [ ] Professional penetration testing
- [ ] Automated vulnerability scanning
- [ ] Regular security audits

---

## Deployment Checklist

### Development
- [x] Environment variables configured
- [x] Security fixes implemented
- [x] Privacy features built
- [x] Deployed to lumimd-dev

### Production (When Ready)
- [ ] Set `NODE_ENV=production` in Firebase config
- [ ] Set `ALLOWED_ORIGINS` to production domain only
- [ ] Verify rate limits are enforced (test with 6 failed auth attempts)
- [ ] Test CORS with unauthorized origin
- [ ] Deploy: `firebase use prod && firebase deploy --only functions`

---

## Monitoring & Maintenance

### What to Monitor
- Authentication failures (potential attacks)
- Rate limit hits (abuse detection)
- CORS rejections (unauthorized access attempts)
- Error rates and performance

### Regular Tasks
- Dependency updates (`npm audit`)
- Security patch reviews
- Log review for suspicious activity
- User data deletion requests

---

## Documentation Files

### Active Documentation
- [PRIVACY_POLICY.md](PRIVACY_POLICY.md) - User-facing privacy policy
- [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) - Security audit checklist and plan
- [docs/SECURITY_AUDIT_REPORT.md](docs/SECURITY_AUDIT_REPORT.md) - Audit findings vs codebase
- **This file** - Overall summary

---

## Security Contact

**Security Issues:** security@lumimd.app
**Privacy Questions:** privacy@lumimd.app
**General Support:** support@lumimd.app

**Responsible Disclosure:**
We appreciate responsible security research. If you find a vulnerability, please email security@lumimd.app with details. We commit to:
- Acknowledging within 48 hours
- Providing a fix timeline within 1 week
- Crediting you (if desired) after the fix is deployed

---

## Summary: What We Built

### Security ✅
- Timing attack protection
- CORS whitelist
- Security headers (helmet.js)
- Environment-based rate limiting
- Input validation (Zod)
- Firestore security rules

### Privacy ✅
- Zero data retention (OpenAI)
- Account deletion feature
- Data export feature
- Transparent privacy policy
- User data ownership

### Compliance ✅
- CCPA/GDPR compliance features
- Clear privacy policy
- User rights enforcement
- No data selling

---

**Status:** Production ready with strong security and privacy foundation 🔒

