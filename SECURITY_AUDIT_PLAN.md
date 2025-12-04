# LumiMD Security Audit - Findings & Remediation Plan

**Date:** 2025-12-03
**Auditor:** Senior Developer Review
**Scope:** Full stack application (Firebase Functions, Mobile, Web Portal)

---

## Executive Summary

This security audit identified **2 critical**, **3 high**, and **4 medium** priority vulnerabilities across the LumiMD application. The codebase demonstrates many good security practices (strong authentication, authorization checks, input validation with Zod, Firestore security rules), but several areas require immediate attention to meet healthcare security standards (HIPAA compliance considerations).

**Overall Risk Assessment:** MEDIUM-HIGH
**Immediate Action Required:** Yes (Critical issues should be fixed before production deployment)

---

## Critical Vulnerabilities

### 1. Timing Attack Vulnerability in Webhook Authentication
**Location:** [functions/src/routes/webhooks.ts:56-57](functions/src/routes/webhooks.ts#L56-L57)
**Severity:** CRITICAL
**CVSS Score:** 7.5 (High)

**Issue:**
```typescript
const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-webhook-signature'];
if (providedSecret !== WEBHOOK_SECRET) {
```

The webhook secret is compared using standard string comparison (`!==`), which is vulnerable to timing attacks. An attacker can measure response times to guess the secret character by character.

**Impact:**
- Attackers could potentially bypass webhook authentication
- Unauthorized visit data could be injected into the system
- Patient health data could be compromised

**Remediation:**
Use constant-time comparison to prevent timing attacks:

```typescript
import crypto from 'crypto';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

// Then use:
if (!timingSafeEqual(providedSecret, WEBHOOK_SECRET)) {
  // reject
}
```

### 2. Overly Permissive CORS Configuration
**Location:** [functions/src/index.ts:28](functions/src/index.ts#L28)
**Severity:** CRITICAL
**CVSS Score:** 7.0 (High)

**Issue:**
```typescript
app.use(cors({ origin: true }));
```

This configuration allows **ALL** origins to access your API, enabling potential Cross-Origin attacks and unauthorized access to patient data.

**Impact:**
- Any website can make authenticated requests to your API
- Facilitates CSRF attacks
- Violates principle of least privilege

**Remediation:**
Whitelist specific origins:

```typescript
const allowedOrigins = [
  'https://your-production-domain.com',
  'https://your-web-portal.com',
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
```

---

## High Priority Vulnerabilities

### 3. Missing HTTP Security Headers
**Location:** [functions/src/index.ts](functions/src/index.ts)
**Severity:** HIGH
**CVSS Score:** 6.5 (Medium)

**Issue:**
No security headers are configured (Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, etc.)

**Impact:**
- Vulnerable to clickjacking attacks
- No XSS protection headers
- Missing MIME-type sniffing protection

**Remediation:**
Install and configure helmet.js:

```bash
npm install helmet --workspace=functions
```

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

### 4. Rate Limiting Set Too High for Production
**Location:** [functions/src/middlewares/rateLimit.ts:10,54](functions/src/middlewares/rateLimit.ts#L10)
**Severity:** HIGH
**CVSS Score:** 6.0 (Medium)

**Issue:**
```typescript
max: 500, // Comment says "increased for dev"
max: 50,  // Auth limiter also too high
```

Rate limits are set extremely high, making brute force and DoS attacks feasible.

**Impact:**
- Brute force attacks on authentication
- API abuse and resource exhaustion
- Increased cloud costs

**Remediation:**
Implement environment-based rate limiting:

```typescript
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 500,
  // ... rest
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  skipSuccessfulRequests: true,
  // ... rest
});
```

### 5. Potential Information Disclosure in Error Messages
**Location:** Multiple files (error handlers throughout)
**Severity:** HIGH
**CVSS Score:** 5.5 (Medium)

**Issue:**
Some error handlers may leak stack traces or internal details in production.

**Example locations:**
- [functions/src/routes/visits.ts:133-138](functions/src/routes/visits.ts#L133-L138)
- [functions/src/routes/medications.ts:82-86](functions/src/routes/medications.ts#L82-L86)

**Impact:**
- Reveals internal implementation details
- Aids attackers in reconnaissance
- May expose file paths or dependency versions

**Remediation:**
Create a centralized error handler:

```typescript
// functions/src/middlewares/errorHandler.ts
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  functions.logger.error('Unhandled error:', err);

  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      code: 'server_error',
      message: 'An unexpected error occurred',
    });
  } else {
    res.status(500).json({
      code: 'server_error',
      message: err.message,
      stack: err.stack,
    });
  }
}

// In index.ts
app.use(errorHandler);
```

---

## Medium Priority Issues

### 6. Missing Field Size Validation in Firestore Rules
**Location:** [firebase-setup/firestore.rules:37-41](firebase-setup/firestore.rules#L37-L41)
**Severity:** MEDIUM
**CVSS Score:** 4.5 (Medium)

**Issue:**
Firestore security rules allow field updates but don't validate size limits, potentially allowing data bloat attacks.

**Impact:**
- Storage exhaustion attacks
- Performance degradation
- Increased costs

**Remediation:**
Add field size validation:

```javascript
allow update: if isAuthenticated()
  && isOwner(userId)
  && request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['firstName', 'lastName', 'preferredName', 'dateOfBirth', 'allergies', 'medicalHistory', 'tags', 'folders', 'createdAt', 'updatedAt'])
  // Add size checks
  && (!('firstName' in request.resource.data) || request.resource.data.firstName.size() <= 100)
  && (!('lastName' in request.resource.data) || request.resource.data.lastName.size() <= 100)
  && (!('allergies' in request.resource.data) || request.resource.data.allergies.size() <= 50)
  && (!('medicalHistory' in request.resource.data) || request.resource.data.medicalHistory.size() <= 100);
```

### 7. No HTTPS Enforcement Documentation
**Location:** General infrastructure
**Severity:** MEDIUM
**CVSS Score:** 5.0 (Medium)

**Issue:**
While Firebase Functions likely enforce HTTPS, there's no explicit configuration or documentation confirming this.

**Impact:**
- Potential man-in-the-middle attacks
- Data interception
- HIPAA compliance concerns

**Remediation:**
Add explicit HTTPS check middleware:

```typescript
// functions/src/middlewares/httpsOnly.ts
export function requireHttps(req: Request, res: Response, next: NextFunction) {
  if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      code: 'https_required',
      message: 'HTTPS is required',
    });
  }
  next();
}

// In index.ts
app.use(requireHttps);
```

### 8. Signed URLs Expire in 1 Hour (Potential Issue)
**Location:** [functions/src/routes/visits.ts:619-621](functions/src/routes/visits.ts#L619-L621)
**Severity:** MEDIUM
**CVSS Score:** 4.0 (Low)

**Issue:**
```typescript
const [signedUrl] = await file.getSignedUrl({
  action: 'read',
  expires: Date.now() + 60 * 60 * 1000, // 1 hour
});
```

Signed URLs for audio files expire in 1 hour, which may be too short for long processing jobs.

**Impact:**
- Processing failures for slow transcription
- Need for retry logic
- Poor user experience

**Remediation:**
Increase expiration time for processing operations:

```typescript
expires: Date.now() + 4 * 60 * 60 * 1000, // 4 hours for processing
```

### 9. Push Token Subcollection Access
**Location:** [firebase-setup/firestore.rules](firebase-setup/firestore.rules) (missing rule)
**Severity:** MEDIUM
**CVSS Score:** 4.5 (Medium)

**Issue:**
Push tokens are stored in `/users/{userId}/pushTokens/{tokenId}` but there are no explicit Firestore rules for this subcollection.

**Impact:**
- Potential unauthorized access to push tokens
- Token hijacking

**Remediation:**
Add explicit rules:

```javascript
match /users/{userId}/pushTokens/{tokenId} {
  allow read, write: if isAuthenticated() && isOwner(userId);
}
```

---

## Good Security Practices Found ✓

The following positive security practices were identified:

1. **Strong Authentication**: Proper Firebase ID token verification with revocation check
2. **Authorization Checks**: Consistent ownership verification on all resources
3. **Input Validation**: Comprehensive use of Zod schemas
4. **Firestore Security Rules**: Well-structured rules with proper access control
5. **Secret Management**: API keys stored in environment variables (not committed)
6. **.gitignore Configuration**: Properly excludes .env files and secrets
7. **No XSS Vectors**: No use of `dangerouslySetInnerHTML` or `eval()`
8. **Rate Limiting**: Middleware implemented (though needs tuning)
9. **Authentication Handoff**: Secure one-time code pattern with expiration and usage tracking
10. **Audit Trail**: Share relationships use 'revoked' status instead of deletion
11. **Request Size Limits**: 10MB limit prevents large payload attacks
12. **Sanitization**: User input properly sanitized (trimming, deduplication)

---

## Implementation Priority

### Immediate (Before Production):
1. Fix timing attack vulnerability in webhook authentication
2. Configure CORS whitelist
3. Add security headers (helmet.js)
4. Reduce rate limits for production

### Short-term (Next Sprint):
5. Centralize error handling
6. Add field size validation to Firestore rules
7. Add HTTPS enforcement middleware
8. Add push token subcollection rules

### Medium-term (Next Quarter):
9. Increase signed URL expiration for processing
10. Security awareness training for team
11. Regular dependency audits
12. Implement security testing in CI/CD

---

## Additional Recommendations

### 1. Dependency Security Audits
**Action:** Run `npm audit` regularly and address vulnerabilities

```bash
cd functions && npm audit
cd ../mobile && npm audit
cd ../web-portal && npm audit
```

### 2. Secrets Rotation Policy
**Action:** Establish a policy for rotating:
- OpenAI API keys (every 90 days)
- Webhook secrets (every 90 days)
- Firebase service account keys (annually)

### 3. Logging and Monitoring
**Action:** Ensure sensitive data is never logged:
- Review all `functions.logger` calls
- Redact PII from logs
- Set up alerting for authentication failures

### 4. Security Testing
**Action:** Implement automated security testing:
- Add OWASP ZAP scanning to CI/CD
- Perform penetration testing before launch
- Regular security code reviews

### 5. HIPAA Compliance Considerations
**Action:** If handling PHI (Protected Health Information):
- Ensure Business Associate Agreement with Firebase/GCP
- Implement audit logging for all data access
- Add encryption at rest for sensitive fields
- Implement data retention policies

---

## Conclusion

LumiMD has a solid security foundation with good authentication, authorization, and input validation practices. However, the **critical CORS and timing attack vulnerabilities** must be addressed immediately before production deployment.

The recommended fixes are straightforward and can be implemented in 1-2 days. After remediation, a follow-up security review is recommended.

**Estimated Remediation Time:**
- Critical issues: 4-6 hours
- High priority: 6-8 hours
- Medium priority: 8-12 hours
- **Total: 2-3 days**

---

## Next Steps

1. Review and approve this security audit plan
2. Create tickets for each vulnerability in your project management system
3. Assign priorities and owners
4. Implement fixes following the remediation guidance
5. Test all security changes thoroughly
6. Schedule a follow-up security review after fixes are deployed

