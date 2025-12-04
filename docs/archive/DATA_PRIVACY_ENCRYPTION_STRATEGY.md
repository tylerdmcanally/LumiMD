# LumiMD Data Privacy & Encryption Strategy

**Date:** 2025-12-03
**Status:** 🔴 **CRITICAL - Immediate Action Required for HIPAA Compliance**

---

## Executive Summary

LumiMD processes Protected Health Information (PHI) including:
- Audio recordings of doctor visits
- Medical transcripts
- Diagnoses and medications
- Personal health data

**Current Status:** ⚠️ **Not HIPAA Compliant** - Third-party services are retaining PHI without proper safeguards.

**Critical Issues:**
1. ❌ OpenAI API is configured to retain data for 30 days (non-compliant)
2. ❌ No Business Associate Agreements (BAAs) in place
3. ✅ Encryption in transit (HTTPS)
4. ⚠️ Encryption at rest (Firebase default, but not E2E)

---

## Current Data Flow

```
Patient Device (Mobile/Web)
    ↓ [Audio Recording]
Firebase Storage (encrypted at rest)
    ↓ [Audio File URL]
AssemblyAI API (transcription)
    ↓ [Transcript Text - RETAINED]
Firebase Functions
    ↓ [Transcript]
OpenAI API (summarization) - ⚠️ RETAINED FOR 30 DAYS
    ↓ [Structured Data]
Firestore Database (encrypted at rest)
    ↓
Patient Device (viewing data)
```

---

## Third-Party Data Handling Analysis

### AssemblyAI 🟡 Conditionally HIPAA Compliant

**Current Status:** Not compliant (no BAA)

**Compliance Requirements:**
- ✅ **Available**: HIPAA-compliant service
- ✅ **Available**: Business Associate Agreement (BAA)
- ❌ **Missing**: Executed BAA with LumiMD
- ✅ **Has**: Data retention and deletion policies

**Data Retention:**
- Retains data as long as necessary for service
- Will delete/return data upon termination
- Complies with data protection laws

**Action Required:**
1. Contact AssemblyAI sales team to execute BAA
2. Review and sign data processing addendum
3. Configure account for HIPAA mode

**Sources:**
- [AssemblyAI Business Associate Agreement](https://www.assemblyai.com/legal/business-associate-agreement)
- [AssemblyAI HIPAA Compliance FAQ](https://www.assemblyai.com/docs/faq/are-you-hipaa-compliant)
- [AssemblyAI Security](https://www.assemblyai.com/security)

---

### OpenAI API 🔴 Currently Non-Compliant

**Current Status:** ⚠️ **CRITICAL ISSUE** - Retaining PHI for 30 days

**Compliance Requirements:**
- ✅ **Available**: HIPAA-compliant API service
- ✅ **Available**: Business Associate Agreement (BAA)
- ❌ **Missing**: Executed BAA with LumiMD
- ❌ **CRITICAL**: Not using zero data retention endpoints

**Data Retention (Current Configuration):**
- 🔴 **Default behavior**: Retains all API requests for **30 days**
- 🔴 **Used for**: Monitoring, abuse detection, possibly training
- 🔴 **HIPAA Status**: **NOT COMPLIANT** with default settings

**Zero Data Retention Mode:**
- ✅ Data is immediately deleted after response
- ✅ No storage, logging, or training use
- ✅ HIPAA compliant when BAA is in place
- ⚠️ Requires specific API parameter: `store: false`

**Action Required (URGENT):**
1. Email `baa@openai.com` to request BAA (1-2 day response)
2. **IMMEDIATELY** add `store: false` to all API calls
3. Review and sign BAA when provided
4. Verify zero retention is working

**Implementation Fix:**
```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  store: false, // ⚠️ CRITICAL: Zero data retention
  messages: [...],
});
```

**Sources:**
- [OpenAI BAA Information](https://help.openai.com/en/articles/8660679-how-can-i-get-a-business-associate-agreement-baa-with-openai)
- [OpenAI HIPAA Compliance Guide 2025](https://arkenea.com/blog/is-openai-hipaa-compliant-2025-guide/)
- [OpenAI Enterprise Privacy](https://openai.com/enterprise-privacy/)

---

## Encryption Strategy

### 1. Encryption in Transit ✅ Already Implemented

**Current State:**
- ✅ All API traffic uses HTTPS
- ✅ TLS 1.2+ enforced
- ✅ Strict-Transport-Security header (HSTS)

**Status:** COMPLIANT

---

### 2. Encryption at Rest 🟡 Partially Implemented

**Current State:**
- ✅ Firebase Storage: Encrypted by default (AES-256)
- ✅ Firestore: Encrypted by default (AES-256)
- ✅ Firebase Authentication: Encrypted by default
- ⚠️ Third-party services: Depends on compliance (see above)

**Limitations:**
- ⚠️ Google/Firebase has decryption keys (not E2E encrypted)
- ⚠️ Firebase employees with sufficient access could theoretically access data
- ⚠️ Subject to legal requests (subpoenas, court orders)

**Status:** COMPLIANT (but not E2E)

---

### 3. End-to-End Encryption (E2E) ❌ Not Implemented

**Challenge:** E2E encryption conflicts with server-side AI processing

**Current Architecture:**
```
Client → [Encrypt] → Storage → [Decrypt] → AI Processing → [Encrypt] → Storage → [Decrypt] → Client
         ❌ E2E                ⚠️ Plaintext                  ❌ E2E
```

**E2E Encryption Limitation:**
- AssemblyAI needs **plaintext audio** to transcribe
- OpenAI needs **plaintext text** to summarize
- Cannot process encrypted data server-side

**Possible Solutions:**

#### Option A: Hybrid Encryption (Recommended)
```
┌─────────────────────────────────────────────────────┐
│ E2E Encrypted Fields:                               │
│ - Patient name, DOB (user profile)                 │
│ - Medical history, allergies                        │
│ - Visit notes added by patient                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Server-Processed Fields (Not E2E):                  │
│ - Audio recordings (needed for transcription)       │
│ - Transcripts (needed for AI summarization)        │
│ - AI-extracted medications, diagnoses               │
└─────────────────────────────────────────────────────┘
```

**Implementation:**
- Use client-side encryption (Web Crypto API / React Native Crypto)
- Encrypt sensitive fields before sending to Firestore
- Decrypt on device after retrieval
- Store encryption keys locally (device keychain/keystore)

**Pros:**
- Protects most sensitive data with E2E
- Allows AI processing of necessary fields
- Google/Firebase cannot access E2E fields

**Cons:**
- More complex implementation
- Key management challenges
- Lost keys = lost data (need recovery mechanism)

#### Option B: On-Device Processing (Future Enhancement)
```
Client Device:
  ↓ Record audio locally
  ↓ Transcribe with on-device speech recognition
  ↓ Encrypt everything E2E
  ↓ Upload encrypted data only
  ↓ Server never sees plaintext
```

**Implementation:**
- Use on-device models (Apple Speech Framework, Android Speech Recognition)
- Use on-device LLMs (local Llama, GPT4All, etc.)
- Upload only encrypted results

**Pros:**
- True E2E encryption
- No third-party data exposure
- Complete privacy

**Cons:**
- Lower accuracy than cloud AI
- Significant device resources required
- Slower processing
- Requires offline-first architecture

#### Option C: Status Quo + Compliance (Current Recommendation)
```
- Sign BAAs with all vendors
- Use zero data retention
- Rely on Firebase's at-rest encryption
- Add audit logging
- Implement data retention policies
```

**Pros:**
- Fastest to implement
- Maintains current accuracy
- HIPAA compliant with BAAs
- Industry-standard approach

**Cons:**
- Not true E2E encryption
- Trust in third-party vendors
- Subject to legal data requests

---

## HIPAA Compliance Checklist

### Administrative Safeguards

- [ ] **Business Associate Agreements**
  - [ ] Execute BAA with OpenAI (email: baa@openai.com)
  - [ ] Execute BAA with AssemblyAI (contact sales)
  - [ ] Execute BAA with Google Cloud / Firebase (if not already)
  - [ ] Store executed BAAs securely

- [ ] **Access Controls**
  - [x] User authentication implemented (Firebase Auth)
  - [x] Authorization checks on all endpoints
  - [x] Firestore security rules enforcing ownership
  - [ ] Audit logging for data access
  - [ ] Role-based access control (RBAC) if multiple admin users

- [ ] **Training & Policies**
  - [ ] HIPAA training for all team members
  - [ ] Privacy policy posted and accessible
  - [ ] Data breach notification procedures
  - [ ] Incident response plan

### Technical Safeguards

- [x] **Encryption in Transit** (HTTPS, TLS 1.2+)
- [x] **Encryption at Rest** (Firebase default AES-256)
- [ ] **Zero Data Retention** (OpenAI: add `store: false`)
- [x] **Access Controls** (Firebase Auth + Security Rules)
- [ ] **Audit Logging** (Firebase admin actions, data access)
- [x] **Session Management** (Firebase Auth tokens)
- [ ] **Automatic Logoff** (implement session timeouts)

### Physical Safeguards

- [x] **Cloud Infrastructure** (Firebase/GCP handles this)
- [x] **Disaster Recovery** (Firebase automatic backups)
- [x] **Workstation Security** (developer responsibility)

### Documentation

- [ ] **Privacy Notice** (patient-facing)
- [ ] **Data Processing Agreement** (DPA)
- [ ] **Data Retention Policy** (define timelines)
- [ ] **Data Disposal Procedures**
- [ ] **Risk Assessment** (this document serves as basis)

---

## Immediate Action Items (Priority Order)

### 🔴 CRITICAL (Do Today)

1. **Add `store: false` to OpenAI API Calls**
   - File: `functions/src/services/openai.ts`
   - File: `functions/src/services/medicationSafetyAI.ts`
   - Test to verify zero retention

2. **Request BAA from OpenAI**
   - Email: baa@openai.com
   - Include company details and use case
   - Expected response: 1-2 business days

3. **Contact AssemblyAI for BAA**
   - Contact sales team
   - Request HIPAA-compliant account setup
   - Execute BAA

### 🟡 HIGH PRIORITY (This Week)

4. **Implement Audit Logging**
   - Log all data access (who, what, when)
   - Use Firebase Functions logging
   - Consider Cloud Logging for retention

5. **Create Privacy Policy**
   - Patient-facing privacy notice
   - Explain data collection and use
   - Link from app and website

6. **Data Retention Policy**
   - Define how long data is kept
   - Implement automatic deletion (e.g., 7 years post-visit)
   - User-initiated deletion

### 🟢 MEDIUM PRIORITY (This Month)

7. **Consider Hybrid Encryption**
   - Design E2E encryption for profile fields
   - Implement client-side encryption
   - Key management strategy

8. **Security Audit & Penetration Testing**
   - Professional security assessment
   - Penetration testing
   - Vulnerability scanning

9. **Compliance Review**
   - Hire HIPAA compliance consultant
   - Complete risk assessment
   - Document all safeguards

---

## Data Retention Recommendations

### Audio Recordings
- **Recommendation**: 7 years (standard medical records retention)
- **Rationale**: Legal requirements, patient records
- **Deletion**: Automatic after retention period

### Transcripts & Summaries
- **Recommendation**: 7 years (tied to audio)
- **Rationale**: Core medical records
- **Deletion**: Automatic after retention period

### Medications & Actions
- **Recommendation**: 7 years
- **Rationale**: Active medical records
- **Deletion**: Automatic after retention period

### User Accounts
- **Recommendation**: Retain while active + 30 days after deletion request
- **Rationale**: Account recovery, fraud prevention
- **Deletion**: User-initiated or automatic after inactivity (e.g., 3 years)

### Audit Logs
- **Recommendation**: 7 years
- **Rationale**: HIPAA requires 6 years minimum
- **Deletion**: Automatic after 7 years

---

## Cost & Effort Estimate

| Task | Effort | Cost | Priority |
|------|--------|------|----------|
| Add `store: false` to OpenAI | 1 hour | $0 | 🔴 Critical |
| Request OpenAI BAA | 1 hour | $0 | 🔴 Critical |
| Request AssemblyAI BAA | 1 hour | $0 | 🔴 Critical |
| Implement audit logging | 8 hours | $0 | 🟡 High |
| Create privacy policy | 4 hours | $0-500 (legal review) | 🟡 High |
| Data retention policies | 8 hours | $0 | 🟡 High |
| Hybrid E2E encryption | 40+ hours | $0 | 🟢 Medium |
| HIPAA compliance consultant | N/A | $2,000-10,000 | 🟢 Medium |
| Penetration testing | N/A | $5,000-15,000 | 🟢 Medium |

---

## Recommended Encryption Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Patient Device                             │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ User Profile Data (E2E Encrypted)                      │  │
│  │ - Name, DOB, Allergies (encrypted with device key)    │  │
│  │ - Medical history (encrypted with device key)         │  │
│  │ - Custom notes (encrypted with device key)            │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Visit Data (Server-Processed, Not E2E)                │  │
│  │ - Audio recordings (plaintext for AI)                 │  │
│  │ - Transcripts (plaintext for AI)                      │  │
│  │ - AI-extracted data (plaintext for processing)        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                        ↓ HTTPS (TLS 1.2+)
┌──────────────────────────────────────────────────────────────┐
│                   Firebase / Cloud                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Firestore (At-Rest Encrypted AES-256)                 │  │
│  │ - Encrypted profile fields (ciphertext)               │  │
│  │ - Plaintext visit data (for AI)                       │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Storage (At-Rest Encrypted AES-256)                   │  │
│  │ - Audio files (plaintext for AI)                      │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                        ↓ HTTPS
┌──────────────────────────────────────────────────────────────┐
│                  Third-Party AI Services                      │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ AssemblyAI (BAA + Data Deletion Policies)             │  │
│  │ - Processes plaintext audio                           │  │
│  │ - Deletes after processing                            │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ OpenAI (BAA + Zero Data Retention)                    │  │
│  │ - Processes plaintext transcripts                     │  │
│  │ - Immediately deletes (store: false)                  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## Conclusion

**Current Risk Level:** 🔴 **HIGH** (PHI being retained without BAAs)

**Target Risk Level:** 🟢 **LOW** (HIPAA compliant with BAAs and zero retention)

**Timeline to Compliance:**
- **Week 1**: Critical fixes (`store: false`, request BAAs)
- **Week 2-4**: BAA execution, audit logging, policies
- **Month 2-3**: E2E encryption for profile data (optional)
- **Ongoing**: Monitoring, compliance reviews, updates

**Next Steps:**
1. Review and approve this strategy
2. Implement critical fixes immediately
3. Request BAAs from vendors
4. Create timeline for remaining items
5. Consider hiring HIPAA compliance consultant

---

## References & Resources

**Third-Party Compliance:**
- [AssemblyAI HIPAA Compliance](https://www.assemblyai.com/docs/faq/are-you-hipaa-compliant)
- [AssemblyAI BAA](https://www.assemblyai.com/legal/business-associate-agreement)
- [OpenAI HIPAA Compliance Guide 2025](https://arkenea.com/blog/is-openai-hipaa-compliant-2025-guide/)
- [OpenAI BAA Request](https://help.openai.com/en/articles/8660679-how-can-i-get-a-business-associate-agreement-baa-with-openai)
- [OpenAI Enterprise Privacy](https://openai.com/enterprise-privacy/)

**HIPAA Resources:**
- [HHS HIPAA Summary](https://www.hhs.gov/hipaa/for-professionals/security/guidance/index.html)
- [HIPAA Security Rule Guidance](https://www.hhs.gov/hipaa/for-professionals/security/guidance/guidance-on-risk-analysis-requirements-under-the-hipaa-security-rule/index.html)
- [Cloud Computing Guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/cloud-computing/index.html)

**Encryption Standards:**
- [NIST Encryption Standards](https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Firebase Security Best Practices](https://firebase.google.com/docs/rules/best-practices)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-03
**Next Review:** After critical fixes implemented

