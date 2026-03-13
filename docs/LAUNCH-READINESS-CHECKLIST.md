# LumiMD iOS Launch Readiness Checklist

*Generated March 12, 2026 — Direct-to-consumer, free, non-covered entity*

---

## 1. Legal Entity & App Store Account

### Apple requires health apps be submitted by a legal entity, not an individual developer.

- [ ] **Establish a legal entity** (LLC, Corp, etc.) if not already done. Apple's guideline for "highly-regulated fields" like healthcare explicitly requires this — individual developer accounts will be rejected.
- [ ] **Enroll in Apple Developer Program as an Organization** with the entity's D-U-N-S number. If you're currently enrolled as an individual, you'll need to convert. Apple doesn't accept DBAs or trade names.
- [ ] **Verify Apple Developer Team ID** (`42M6N2GJD2` in your config) is tied to the correct entity.

### Non-Covered Entity Position

Your lawyer/friend has advised LumiMD is a non-covered entity (personal health record tool, not a provider/plan/clearinghouse). This is a defensible and common position for consumer health apps — but document it clearly:

- [ ] **Document your HIPAA analysis in writing** — why LumiMD qualifies as a non-covered entity. Keep this on file. The logic: patients record their own visits, the app processes *their own data* for *their own use*, and LumiMD doesn't transmit data to providers or payers on behalf of patients.
- [ ] **Ensure your Privacy Policy reflects this** — it should *not* promise HIPAA compliance or use HIPAA terminology (PHI, covered entity, etc.). It should clearly describe what health data you collect, how it's processed, and how users can delete it.
- [ ] **State and FTC regulations still apply** — even without HIPAA, you're subject to state health data privacy laws (especially California's CCPA/CPRA, Washington's My Health My Data Act, and Connecticut's health data laws) and FTC enforcement around health data practices. Your Privacy Policy should address these.

---

## 2. Vendor Agreements & Data Processing

You don't need BAAs since you're non-covered, but you *do* need to have your data processing story straight and ensure your vendors' terms permit your use case.

### OpenAI (GPT-4 / GPT-4o Vision)

- [ ] **Review OpenAI's Service Terms and Usage Policies.** Key points:
  - OpenAI API with `store: false` (you already do this) means they don't retain input/output data. Good.
  - OpenAI's terms state their services are "not intended for use in the diagnosis or treatment of any health condition." Your app extracts/summarizes — ensure your UI language and marketing never position it as diagnostic.
  - OpenAI offers a Data Processing Addendum (DPA) — consider signing it for general data protection coverage (GDPR, CCPA), even if not for HIPAA.
- [ ] **Confirm your OpenAI plan tier supports your expected volume.** Rate limits on GPT-4/GPT-4o Vision can be tight on lower tiers. A single multi-page AVS extraction can be a large request.

### AssemblyAI (Transcription)

- [ ] **Review AssemblyAI's Terms of Service.** They offer HIPAA-compliant workflows with BAAs, but since you're non-covered, you don't need the BAA.
- [ ] **Consider signing their DPA anyway** for general data protection (GDPR/CCPA). Available at their legal page.
- [ ] **Understand their data retention.** How long do they retain audio after transcription completes? Ensure this aligns with what your Privacy Policy promises users.

### Firebase / Google Cloud

- [ ] **Review Firebase's data processing terms.** Firebase operates as a data processor under GDPR and service provider under CCPA. Their standard terms cover non-HIPAA consumer apps.
- [ ] **Note: Firebase Auth is NOT covered under Google Cloud's BAA** even if you ever need one in the future. Not an issue now, but worth knowing.
- [ ] **Ensure Firebase data residency** aligns with your Privacy Policy (Firebase defaults to US multi-region — fine for a US consumer app).

### Resend (Email)

- [ ] **Review Resend's terms** for sending transactional emails containing any user health context (if applicable).

### Sentry (Error Tracking)

- [ ] **Ensure Sentry is configured to scrub PII** from error reports. Your backend Sentry config already does this (`sendDefaultPii: false`, auth header redaction). Good.
- [ ] **Decide on mobile Sentry** — it's configured but NOT initialized in the mobile app (see codebase section below). Either set it up or remove the config.

### Expo / EAS

- [ ] **Review Expo's terms** regarding OTA update delivery and data handling.

---

## 3. App Store Submission Requirements

### Apple Health App Guidelines (Guideline 1.4)

- [ ] **"Consult your doctor" disclaimer** — Apple requires health/medical apps to remind users to consult a physician. Ensure this appears prominently (onboarding, settings, and/or visit summary screens). Your medical advice guardrails in GPT prompts are good, but Apple wants it visible in the UI.
- [ ] **No diagnostic claims** — your App Store description, screenshots, and marketing must not claim LumiMD diagnoses or treats conditions. Position it as: "records, transcribes, and organizes your medical visit information."
- [ ] **Accuracy disclosure** — if you make any claims about transcription or extraction accuracy, you must disclose methodology. Safest approach: don't make specific accuracy claims.

### AI Transparency (New as of Nov 2025)

- [ ] **Disclose AI usage to users** — Apple now requires clear disclosure when personal data is shared with third-party AI services (OpenAI, AssemblyAI). This should be in your Privacy Policy AND visible in the app (onboarding or settings).
- [ ] **Obtain explicit consent** before processing — your recording consent card on `record-visit.tsx` partially covers this, but ensure it mentions AI processing (not just recording consent).
- [ ] **App Store privacy nutrition label** — must accurately reflect that health data is sent to third-party AI services for processing.

### Privacy & Data

- [ ] **App Store Privacy Nutrition Labels** — fill these out accurately in App Store Connect. You collect: health data, audio, contacts (if caregiver sharing), identifiers, usage data. Be thorough — Apple rejections for inaccurate labels are common.
- [ ] **Privacy Policy URL** — yours is at `https://lumimd.app/privacy`. Verify it's live and accessible.
- [ ] **App Tracking Transparency** — your config has `ITSAppUsesNonExemptEncryption: false` and no `NSUserTrackingUsageDescription`. Confirm you're NOT using IDFA or any tracking SDKs. If not, you're fine.
- [ ] **Data deletion** — Apple requires apps that create accounts to offer account deletion. You have `DELETE /v1/users/me`. Verify this is accessible in the mobile settings UI and actually works end-to-end.

### App Store Listing

- [ ] **App description** — clear, honest description of what the app does. No overclaiming on medical capabilities.
- [ ] **Screenshots** — required for App Store listing. Prepare 6.7" (iPhone 15 Pro Max) and 6.5" screenshots at minimum.
- [ ] **App category** — "Health & Fitness" or "Medical." Medical category may trigger stricter review.
- [ ] **Age rating** — complete the updated questionnaire (Apple updated ratings in 2025). Health data handling may require 12+ or higher.
- [ ] **Support URL** — required. Point to your marketing site or a support page.
- [ ] **Copyright** — must match your legal entity name.

### Technical Requirements

- [ ] **Built with current Xcode/SDK** — as of April 2026, Apple requires iOS 26 SDK. Check your Expo SDK 54 compatibility with the latest Xcode and ensure your EAS build config uses a compatible image.
- [ ] **No private API usage** — Expo generally handles this, but verify.
- [ ] **App completeness** — every feature shown in the app must work during review. Apple testers will try to record a visit, view summaries, etc. Consider creating a demo mode or ensuring your dev/staging backend handles review traffic.

---

## 4. Codebase Fixes (Launch Blockers)

These issues were found in your codebase audit:

### Critical (Must Fix Before Submission)

- [ ] **Production API endpoint is pointing to dev.** In `mobile/eas.json`, the production build config sets `EXPO_PUBLIC_API_BASE_URL` to `https://us-central1-lumimd-dev.cloudfunctions.net/api`. This needs to point to your production Firebase project (`lumimd`), e.g., `https://us-central1-lumimd.cloudfunctions.net/api`.

- [ ] **Privacy Policy beta section.** `PRIVACY_POLICY.md` contains a `<!-- TODO: REMOVE THIS BETA SECTION BEFORE PUBLIC LAUNCH -->` block with a "Beta Program Notice." Remove this before launch and ensure the hosted version at `lumimd.app/privacy` is updated.

- [ ] **Deploy backend to production Firebase project.** Ensure all Cloud Functions are deployed to `lumimd` (not just `lumimd-dev`), with all required environment variables/secrets set:
  - `OPENAI_API_KEY` (production key)
  - `ASSEMBLYAI_API_KEY` (production key)
  - `STORAGE_BUCKET` (update from `lumimd-dev.appspot.com` to `lumimd.appspot.com`)
  - `SENTRY_DSN` (if using)
  - `ASSEMBLYAI_WEBHOOK_SECRET`
  - `ALLOWED_ORIGINS` (production CORS whitelist)
  - Any other secrets listed in your `.env.example`

- [ ] **Deploy Firestore rules and indexes to production.** Run `firebase use lumimd && firebase deploy --only firestore:rules,firestore:indexes,storage` against the prod project.

### High Priority (Should Fix)

- [ ] **Mobile Sentry not initialized.** The DSN is configured but Sentry is never actually set up in the mobile app. For a production launch, either initialize it (recommended — you want crash reporting) or remove the unused config. Backend Sentry is properly configured.

- [ ] **Verify Google OAuth Client IDs.** The hardcoded web client ID in `eas.json` (`355816267177-...`) — confirm this is your production Google Cloud Console credential, not a test one. Also verify the iOS client ID is set correctly for production.

- [ ] **Verify Apple Sign-In provisioning.** The entitlement is configured (`com.apple.developer.applesignin`), but ensure your App ID in the Apple Developer portal has "Sign In with Apple" capability enabled for the production bundle ID.

### Recommended

- [ ] **Test full auth flows in TestFlight** — Email/password, Google Sign-In, and Apple Sign-In should all work against the production backend before submission.
- [ ] **Test the complete visit pipeline** — record audio → transcription → GPT extraction → visit summary, using the production API keys and backend.
- [ ] **Test AVS upload pipeline** — photo capture → upload → GPT-4o extraction on production.
- [ ] **Test push notifications** — ensure FCM is configured for the production Firebase project and notifications deliver correctly on TestFlight builds.

---

## 5. Operational Readiness

### Monitoring & Alerting

- [ ] **Set up Firebase/GCP monitoring** for the production project — Cloud Function error rates, latency, and invocation counts.
- [ ] **Set up billing alerts** — GPT-4/GPT-4o Vision calls and AssemblyAI transcription minutes can add up quickly. Set budget alerts in OpenAI, AssemblyAI, and Google Cloud.
- [ ] **Monitor rate limits** — your app has 100 req/15min in prod. Is this sufficient for your expected user base at launch?

### Scaling Considerations

- [ ] **Cloud Functions concurrency** — default cold start behavior may cause slow first-visit-processing experiences. Consider setting minimum instances for critical functions.
- [ ] **OpenAI rate limits** — check your API tier's tokens-per-minute and requests-per-minute limits. A single AVS extraction with multi-page images can consume significant tokens.
- [ ] **AssemblyAI concurrency** — check how many simultaneous transcriptions your plan supports.
- [ ] **Firebase Firestore** — review your index coverage for production query patterns.

### Support & Communication

- [ ] **Support email/channel** — set up a way for users to reach you (in-app, marketing site, or App Store listing support URL).
- [ ] **App Store review notes** — prepare a demo account or clear instructions for Apple reviewers to test the app. They'll need to be able to sign up, record (or simulate) a visit, and see results. If transcription takes minutes, note the expected wait time.

### Backup & Recovery

- [ ] **Firestore backups** — enable automated daily backups on the production Firestore database.
- [ ] **Test account deletion flow** — verify the `DELETE /v1/users/me` endpoint and `privacySweeper` work correctly.

---

## 6. Marketing Site & Public Presence

- [ ] **Marketing site is live at `lumimd.app`** — your current marketing site is minimal (static Vite pages). Ensure it has at minimum: app description, Privacy Policy link, Terms of Service link, and support contact.
- [ ] **Terms of Service** — you mentioned these are live and hosted. Verify the URL is correct and linked from the app.
- [ ] **App Store listing links** — once approved, add the App Store download link to your marketing site.

---

## 7. Post-Submission Considerations

- [ ] **Apple review timeline** — typically 1-3 days, but health/medical apps can take longer. Don't plan a hard launch date without buffer.
- [ ] **Rejection response plan** — have a plan for quickly addressing common rejections (metadata issues, missing disclaimers, privacy label inaccuracies). Health apps see higher rejection rates.
- [ ] **OTA update readiness** — your EAS update setup (`eas update --branch default`) allows JS-only hotfixes without App Store review. Test this works on your production build.
- [ ] **Version management** — your current version is `1.4.0`. Consider whether you want to launch as `1.0.0` for the public release or keep the existing versioning.

---

## Priority Order

If you need to tackle these in order, here's the critical path:

1. **Legal entity setup** (longest lead time — D-U-N-S number can take days/weeks)
2. **Production backend deployment** (Firebase project, secrets, rules)
3. **Fix eas.json production API URL**
4. **Remove privacy policy beta section**
5. **AI transparency & doctor disclaimer in UI**
6. **App Store Connect setup** (nutrition labels, screenshots, description)
7. **TestFlight end-to-end testing on production backend**
8. **Submit for review**
