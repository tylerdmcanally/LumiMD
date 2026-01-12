**Security Audit Plan**

AI-Generated Code Security & FTC Health Breach Notification Compliance

*LumiMD Patient Care Management Platform*

Generated: January 12, 2026

Executive Summary

AI coding assistants introduce significant security
vulnerabilities---studies show 25-73% of AI-generated code contains
security weaknesses, with Java reaching a 72% failure rate on OWASP Top
10 tests. For a healthcare application handling sensitive patient data,
this creates compounding security and regulatory risks.

Your specific stack faces critical vulnerabilities requiring immediate
attention: Next.js 14.1 has an unpatched SSRF (CVE-2024-34351), pdfmake
contains a CVSS 9.8 RCE (CVE-2024-25180), and several dependencies have
known security issues.

As a direct-to-consumer health app, LumiMD falls under the FTC Health
Breach Notification Rule (HBNR), which was significantly expanded in
July 2024. This requires breach notification to users, the FTC, and
potentially media within 60 days, with penalties up to \$53,088 per
violation.

Part 1: AI-Generated Code Security Vulnerabilities

Research Findings

A seminal 2022 study by Pearce et al. found 40% of 1,689 GitHub
Copilot-generated programs contained vulnerabilities mapping to MITRE\'s
CWE Top 25, with C code showing approximately 50% vulnerability rates.
The 2025 Veracode GenAI Code Security Report tested 100+ LLMs and found
45% of generated samples failed OWASP Top 10 security tests---with no
improvement in newer models.

Cross-site scripting dominates AI code security failures with an 86%
failure rate in Veracode testing. Insufficient randomness (CWE-330),
SQL/NoSQL injection (CWE-89), and missing authentication (CWE-306)
appear consistently across studies.

Vulnerability Rates by Tool

  ------------------ ------------- ------------------ --------------------
  **Tool**           **Vuln Rate** **Known CVEs**     **Notable Issues**

  GitHub Copilot     29.8-40%      CVE-2025-53773     Command injection
                                                      via prompt injection

  Amazon             \~30%         AWS-2025-019       Lower rate for
  CodeWhisperer                                       AWS-specific code

  Claude Code        Research      CVE-2025-52882     WebSocket
                     ongoing                          authentication
                                                      bypass

  Cursor AI          Documented    CVE-2025-49150     Data exfiltration
                     RCE                              via JSON schema

  ChatGPT/Codex      Only 5/21     CVE-2025-61260     High package
                     secure                           hallucination rate
  ------------------ ------------- ------------------ --------------------

**Recommendation: AI-generated code should be treated as untrusted input
requiring security review equivalent to external contributions.**

Common Vulnerability Patterns

- Cross-Site Scripting (XSS) - 86% failure rate, particularly in React
  dangerouslySetInnerHTML usage

- Insufficient Randomness (CWE-330) - AI often suggests Math.random()
  for security-critical operations

- SQL/NoSQL Injection (CWE-89) - Missing parameterization in database
  queries

- Missing Authentication (CWE-306) - Omitted ownership checks in
  Firestore operations

- Hardcoded Credentials - Placeholder API keys and secrets in generated
  code

- Incomplete Input Validation - Type-only checks without length limits
  or format validation

Part 2: Stack-Specific Security Vulnerabilities

Critical CVEs Requiring Immediate Action

  ----------------- ------------------ ---------- ------------------------------
  **Package**       **CVE**            **CVSS**   **Action Required**

  Next.js 14.1      CVE-2024-34351     High       Upgrade to 14.2.35+ (SSRF
                                                  vulnerability)

  Next.js           CVE-2025-29927     Critical   Middleware authorization
                                                  bypass - upgrade immediately

  pdfmake           CVE-2024-25180     9.8        Arbitrary code injection -
                                                  upgrade and validate all
                                                  inputs

  pdfmake           CVE-2022-46161     9.4        Remote code execution via
                                                  unsafe evaluation

  Zod               CVE-2023-4316      Medium     Upgrade to 3.22.4+ (ReDoS in
                                                  email validation)

  \@firebase/auth   CVE-2024-11023     Medium     Upgrade to 1.6.2+ (XSS via
                                                  \_authTokenSyncURL)

  React 19.1 (RSC)  CVE-2025-55182     10.0       If using Server Components,
                                                  upgrade to 19.1.4+
  ----------------- ------------------ ---------- ------------------------------

React Native Mobile Security

**Critical Issue: AsyncStorage stores data unencrypted in plaintext.**

For a healthcare application storing authentication tokens or cached
patient data, unencrypted storage creates significant security risk.
Migrate sensitive data to encrypted storage solutions.

- **react-native-encrypted-storage:** Uses EncryptedSharedPreferences
  (Android) + Keychain (iOS) with AES-256

- **react-native-keychain:** iOS Keychain + Android Keystore integration

Deep linking vulnerabilities present another critical attack surface. No
centralized URL scheme registry exists---malicious apps can register
identical schemes to intercept authentication callbacks. Implement
Universal Links (iOS) and App Links (Android) with domain verification.

Firebase Security Rules

Analysis of 950 Firebase projects found 25% contained vulnerable
security rules. The most dangerous anti-pattern is rules cascade---rules
at parent paths override child rules. The March 2024 Firebase incident
exposed 19.8 million secrets through misconfigured security rules.

**Common Firebase Security Rule Mistakes:**

- Open read/write rules: allow read, write: if true

- Missing ownership checks on document access

- Overly permissive parent rules cascading to children

- No data validation in security rules

OpenAI API Security

OpenAI publicly acknowledges that prompt injection \"may always be
vulnerable\"---only 34.7% of enterprises have deployed dedicated
defenses. For AI transcription processing visit recordings, implement
defense-in-depth.

- Never expose API keys in client-side code (search for \'sk-\' pattern)

- Store keys in Google Cloud Secret Manager, not environment variables
  in source

- Implement input validation detecting injection patterns

- Use structured prompts separating trusted (system) from untrusted
  (user) content

- Validate outputs for sensitive data leakage before displaying or
  storing

Part 3: FTC Health Breach Notification Rule Compliance

Applicability to LumiMD

The FTC Health Breach Notification Rule (HBNR) applies to \"vendors of
personal health records\" not covered by HIPAA. As of July 29, 2024, the
amended rule explicitly includes direct-to-consumer health apps,
connected devices, and similar products.

**LumiMD qualifies as a \"vendor of personal health records\" because
it:**

- Offers or maintains electronic health records (visit recordings,
  medication tracking)

- Has technical capacity to draw information from multiple sources

- Is managed, shared, and controlled by or primarily for the individual

What Constitutes a Breach

**Critical: A \"breach\" is NOT limited to cybersecurity intrusions.**

Under the HBNR, a breach includes any unauthorized acquisition of
unsecured PHR identifiable health information, including:

- Cybersecurity intrusions or hacking incidents

- Unauthorized disclosure by the company (e.g., sharing with
  analytics/ad networks without consent)

- Employee access without authorization

- Lost or stolen devices containing unencrypted health data

Notification Requirements

  --------------- -------------------------- ----------------------------------------------
  **Notify**      **Timing**                 **Method**

  Affected        Within 60 days, without    Email (with text/in-app/banner) OR first-class
  Individuals     unreasonable delay         mail

  FTC             500+ affected: same time   Online form:
                  as individuals; \<500:     ftc.gov/business-guidance/health-breach-form
                  within 60 days of calendar 
                  year end                   

  Media           500+ residents of a single Prominent media outlets serving the affected
                  state: within 60 days      locale
  --------------- -------------------------- ----------------------------------------------

Required Notification Content

All breach notifications must include:

- Brief description of what happened (date of breach, date discovered)

- Identity of third parties that acquired the information (if
  disclosable)

- Types of PHR identifiable health information involved

- Steps individuals can take to protect themselves

- Steps your business is taking to investigate and prevent future
  breaches

- At least two contact methods (toll-free phone, email, website, in-app,
  or postal)

Penalties

**Civil penalty: Up to \$53,088 per violation (as of January 2025).**

Each individual whose information was breached and not properly notified
may constitute a separate violation.

Compliance Implementation Checklist

- [ ] Document all data flows involving PHR identifiable health
  information

- [ ] Encrypt all health data at rest (eliminates notification
  requirement for encrypted data)

- [ ] Audit all third-party data sharing (analytics, advertising,
  service providers)

- [ ] Implement breach detection and logging mechanisms

- [ ] Create incident response plan with notification templates

- [ ] Establish user communication preferences for breach notification
  method

- [ ] Document third-party service provider agreements with breach
  notification terms

- [ ] Train team on breach identification and escalation procedures

Part 4: IDE Security Tooling Configuration

Recommended Tool Stack

Antigravity IDE is Google\'s VS Code fork using OpenVSX rather than VS
Code Marketplace. Most VS Code extensions work via manual .vsix
installation.

IDE-Integrated Tools (Essential Free Stack)

- **SonarQube for IDE (SonarLint):** Available on OpenVSX; real-time
  analysis for 20+ languages

- **Semgrep:** Requires .vsix installation; custom SAST rules with
  React/TypeScript support

- **ESLint with eslint-plugin-security:** Native support; detects object
  injection, unsafe regex, eval patterns

Pre-commit Hooks

- **Gitleaks:** OSS secret detection with OpenAI API key pattern support

- **GitGuardian:** 350+ secret types; free tier for 25 users

CI/CD Pipeline

- **GitHub CodeQL:** Deep semantic SAST for JavaScript/TypeScript

- **Socket.dev:** Supply chain attack detection for npm dependencies

- **Firebase Emulator Suite:** Jest-compatible Firestore rules testing

ESLint Security Configuration

Add to eslint.config.js:

import pluginSecurity from \'eslint-plugin-security\'; export default
\[pluginSecurity.configs.recommended, { rules: {
\'security/detect-object-injection\': \'warn\',
\'security/detect-non-literal-regexp\': \'error\',
\'security/detect-unsafe-regex\': \'error\',
\'security/detect-eval-with-expression\': \'error\' }}\];

Semgrep Custom Rules

Save as .semgrep.yml in project root:

rules: - id: react-dangerouslysetinnerhtml pattern:
dangerouslySetInnerHTML={{\_\_html: \$X}} message: \"Potential XSS -
requires manual review\" severity: WARNING languages: \[typescript,
javascript\] - id: asyncstorage-sensitive-data pattern:
AsyncStorage.setItem(\$KEY, \$VALUE) message: \"AsyncStorage
unencrypted - use encrypted storage\" severity: WARNING languages:
\[typescript, javascript\]

Pre-commit Configuration

Save as .pre-commit-config.yaml:

repos: - repo: https://github.com/gitleaks/gitleaks rev: v8.18.0
hooks: - id: gitleaks - repo: local hooks: - id: npm-audit name: npm
audit entry: npm audit \--audit-level=high language: system
pass_filenames: false

Part 5: Comprehensive Security Audit Checklist

Critical Severity (Execute Before Any Deployment)

**Dependency Patches**

- [ ] Upgrade Next.js to 14.2.35 or later (CVE-2024-34351,
  CVE-2025-29927)

- [ ] Upgrade pdfmake to latest, audit all PDF inputs (CVE-2024-25180,
  CVE-2022-46161)

- [ ] Upgrade Zod to 3.22.4+ (CVE-2023-4316)

- [ ] Upgrade \@firebase/auth to 1.6.2+ (CVE-2024-11023)

- [ ] Upgrade React to 19.1.4+ if using Server Components
  (CVE-2025-55182)

- [ ] Run npm audit \--audit-level=critical and resolve all findings

**Secret Detection**

- [ ] Configure GitGuardian or Gitleaks pre-commit hook

- [ ] Scan repository history: gitleaks detect \--source . \--verbose

- [ ] Verify OpenAI API keys not in client-side code (search for \'sk-\'
  pattern)

- [ ] Migrate all secrets to Google Cloud Secret Manager

- [ ] Remove any secrets from .env files committed to git

**Data Encryption (FTC HBNR Compliance)**

- [ ] Encrypt all health data at rest (eliminates breach notification
  for encrypted data)

- [ ] Migrate mobile storage from AsyncStorage to
  react-native-encrypted-storage

- [ ] Implement TLS 1.2+ for all data transmission

High Severity (Execute Within One Week)

**Firebase Security Rules Audit**

- [ ] Review all Firestore rules for \'allow read, write: if true\'
  patterns

- [ ] Verify all document access includes ownership checks
  (request.auth.uid)

- [ ] Implement data validation in rules (field presence, types, sizes)

- [ ] Test rules with Firebase Emulator before deployment

- [ ] Review Storage rules for file type and size validation

**Authentication and Authorization**

- [ ] Implement server-side ID token verification for all protected
  endpoints

- [ ] Add custom claims for role-based access (patient, caregiver,
  admin)

- [ ] Implement automatic session timeout (recommended: 15-30 minutes)

- [ ] Block x-middleware-subrequest header at WAF/load balancer level

**Mobile Application Security**

- [ ] Implement iOS Keychain with
  kSecAttrAccessibleWhenUnlockedThisDeviceOnly

- [ ] Implement Android Keystore with EncryptedSharedPreferences

- [ ] Add screen capture prevention (FLAG_SECURE, secureContentView)

- [ ] Implement app backgrounding blur overlay

- [ ] Validate all deep link parameters before processing

- [ ] Implement Universal Links (iOS) and App Links (Android)

**API Security**

- [ ] Validate Express CORS uses explicit allowlist (no \'\*\' with
  credentials)

- [ ] Implement helmet middleware for security headers

- [ ] Add rate limiting for Cloud Functions

- [ ] Sanitize error responses in production (no stack traces)

- [ ] Implement Zod validation for all API inputs

Medium Severity (Execute Within One Month)

**AI Code Review Patterns**

- [ ] Configure Semgrep with React/TypeScript rules

- [ ] Enable ESLint security plugin for all generated code

- [ ] Establish AI-code-specific review checklist for PRs

- [ ] Flag all AI-generated code touching health data for manual
  security review

- [ ] Check for hardcoded credentials in AI suggestions

- [ ] Verify AI-generated input validation is complete (not just type
  checks)

**OpenAI API Security**

- [ ] Implement prompt injection detection layer

- [ ] Use structured prompts separating system/user content

- [ ] Validate LLM outputs for sensitive data leakage

- [ ] Implement per-user rate limiting

- [ ] Set up cost alerting and usage monitoring

- [ ] Configure API key rotation automation

**FTC HBNR Incident Response Preparation**

- [ ] Create breach notification templates (individual, FTC, media)

- [ ] Implement comprehensive audit logging

- [ ] Document all third-party data sharing agreements

- [ ] Establish user notification preference collection (email vs mail)

- [ ] Train team on breach identification and 60-day notification
  timeline

- [ ] Document incident response escalation procedures

**TypeScript Security Patterns**

- [ ] Enable strict mode in tsconfig.json (strict: true, noImplicitAny:
  true)

- [ ] Replace all \'any\' types at API boundaries with Zod schemas

- [ ] Audit all type assertions (\'as Type\') for runtime safety

- [ ] Implement runtime validation for all external data

Part 6: Manual Review Guidelines for AI-Generated Code

When reviewing AI-generated code handling health data or authentication,
apply these checks in addition to automated scanning:

1.  **Verify input validation completeness:** AI often generates
    type-only validation; ensure Zod schemas cover all edge cases
    including string length limits, format validation, and business
    rules.

2.  **Check authentication context:** Verify request.auth.uid checks
    exist for all Firestore operations; AI frequently omits ownership
    verification.

3.  **Audit hardcoded values:** AI commonly generates placeholder
    credentials, API keys, or configuration that should be environment
    variables.

4.  **Review error handling:** Ensure no health data or stack traces
    leak in error responses; AI defaults to verbose errors.

5.  **Validate cryptographic implementations:** AI frequently suggests
    deprecated or weak crypto; verify AES-256, TLS 1.2+, and proper key
    management.

6.  **Check for deprecated dependencies:** AI may suggest outdated
    packages with known vulnerabilities; cross-reference with npm audit.

Conclusion

The intersection of AI-generated code vulnerabilities and FTC Health
Breach Notification requirements creates a uniquely challenging security
environment. Your application\'s success depends on executing the
critical items---particularly dependency patches and encryption of
health data---before any security incident occurs.

The automated tooling stack of Semgrep, ESLint security plugins,
GitGuardian, and Firebase Emulator testing provides baseline protection,
but AI-generated code handling health data requires mandatory manual
review until the industry\'s 45% security failure rate improves.

**Key Actions:**

- Configure pre-commit hooks for secret detection immediately

- Establish CI/CD gates blocking critical/high vulnerability findings

- Treat every AI suggestion touching authentication or health data as
  requiring explicit security signoff

- Encrypt all health data at rest to eliminate breach notification
  requirements for encrypted data

- Prepare FTC HBNR incident response plan with 60-day notification
  timeline

*--- End of Document ---*
