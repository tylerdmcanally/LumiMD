# App Store Launch Tracker

Running log of everything completed and remaining for iOS App Store submission.

---

## Completed Work

### Code Tasks (2026-03-26)

All deployed via OTA unless noted.

| # | Task | Status | Deployed |
|---|------|--------|----------|
| 1 | Remove privacy policy beta section | Done | OTA |
| 2 | Medical disclaimer on sign-in screen | Done | OTA |
| 3 | AI transparency on recording consent card | Done | OTA |
| 4 | Disclaimer banner on visit summary | Done | OTA |
| 5 | Wrap console.log in \_\_DEV\_\_ guards | Done | OTA |
| 6 | Initialize Sentry on mobile | Done | Needs EAS build |

### Bug Fix (2026-03-26)

**Apple Sign-In blank screen** — Fixed navigation race condition in `mobile/app/sign-in.tsx`. Two concurrent `router.replace('/')` calls (guard effect + explicit handler) confused Expo Router. Fix: `hasNavigated` ref deduplicates so only the first navigation fires. Deployed via OTA. Applies to all sign-in methods (email, Google, Apple).

### Sentry Setup (2026-03-27)

Sentry project created at sentry.io (org: `lumimd`, project: `lumimd-mobile`). DSN added to `mobile/eas.json` production env block.

**Important:** Sentry code is in the app but will NOT be active until a native EAS build is run. The `@sentry/react-native` package is a native dependency that can't be delivered via OTA — it requires `eas build --platform ios --profile production`. Current OTA builds have the initialization code but no native Sentry module to bind to, so it's silently a no-op until the next native build.

### Marketing Site Updates (2026-03-27)

Updated marketing site copy to reflect the note-taking positioning pivot:
- Reframed from "recording" language to "note-taking companion" throughout
- Removed any surfacing of verbatim transcripts — all references now point to plain-language summaries
- Consistent with the copy guidelines in CLAUDE.md (use "visit notes" not "transcript," "LumiMD listens and takes notes" not "AI-powered transcription")

---

## Remaining Steps Before App Store Submission

1. ~~Create Sentry project at sentry.io~~ — Done (2026-03-27)
2. **Run backend tests:** `cd functions && npm test` (554 tests)
3. **EAS build:** `eas build --platform ios --profile production --auto-submit` (picks up Sentry native dependency + DSN)
4. **TestFlight manual test on physical device:**
   - Sign-in screen: medical disclaimer visible
   - Apple / Google / email sign-in: no blank screen or spinner
   - Record visit: AI transparency on consent card
   - Completed visit: summary disclaimer banner
   - Settings: existing disclaimer still there
   - Core flows work (recording, medications, actions, caregiver share)
5. **App Store Connect setup:**
   - App name & subtitle
   - Screenshots (6.7" + 6.1")
   - App description
   - Privacy nutrition labels
   - Age rating questionnaire
   - Apple reviewer demo account with prepopulated data
   - Review notes with demo credentials and feature walkthrough
6. ~~Verify marketing site~~ — Done. Note-taking copy live, privacy policy clean at lumimd.app/privacy (2026-03-27)

---

## Reference: Task Specs

Archived specs for completed tasks. Useful if something needs to be revisited or if a similar change is needed elsewhere.

<details>
<summary>Task 1: Remove Privacy Policy Beta Section</summary>

**File:** `PRIVACY_POLICY.md` (repo root)

Removed lines 6-22 containing beta section wrapped in TODO comments.

</details>

<details>
<summary>Task 2: Medical Disclaimer on Sign-In Screen</summary>

**File:** `mobile/app/sign-in.tsx`

Added disclaimer below sign-in form: "LumiMD helps you capture and organize your medical visits. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult your healthcare provider."

Styled to match Settings disclaimer: fontSize 12, muted/gray, italic, centered, info icon.

</details>

<details>
<summary>Task 3: AI Transparency on Recording Consent Card</summary>

**File:** `mobile/app/(patient)/record-visit.tsx`

Added to both one-party and two-party consent cards: "Your recording is processed by AI services (AssemblyAI for transcription, OpenAI for analysis) to generate your visit notes. These services do not retain your data."

</details>

<details>
<summary>Task 4: Disclaimer Banner on Visit Summary</summary>

**File:** `mobile/app/(patient)/visit-detail.tsx`

Added banner on completed visits: "AI-generated summary — always verify with your care team." Shows after header, before summary content. Not dismissible.

</details>

<details>
<summary>Task 5: Wrap console.log in __DEV__ Guards</summary>

Wrapped all console.log/console.warn statements in mobile/app/ and mobile/lib/ with `if (__DEV__)` guards.

</details>

<details>
<summary>Task 6: Initialize Sentry on Mobile</summary>

Installed `@sentry/react-native`, added Expo plugin, initialized with `sendDefaultPii: false` and health data stripping in `beforeSend`. Root component wrapped with `Sentry.wrap()`. DSN set in eas.json production env.

</details>
