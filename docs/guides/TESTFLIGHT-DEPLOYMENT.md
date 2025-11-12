# LumiMD TestFlight Deployment Guide

This guide walks through preparing and shipping the LumiMD iOS app to TestFlight using Expo Application Services (EAS). Follow the sections in order; each callout lists the exact terminal commands to run from your workstation.

---

## 1. Prerequisites

- Apple Developer Program membership (Team ID: `42M6N2GJD2`)
- Expo account (create at <https://expo.dev> if needed)
- Node.js ≥ 18 and npm ≥ 9 installed locally
- Repository cloned at `/Users/tylermcanally/Desktop/LumiMD`

> **Project state check**  
> - Bundle identifier already set to `com.lumimd.app` in `mobile/app.json`  
> - EAS project ID configured (`e496534e-6396-4109-9051-6569d134e1f7`)  
> - `mobile/eas.json` contains production build + submit profiles

---

## 2. EAS CLI Setup

From any terminal:

```bash
npm install -g eas-cli
eas login
cd /Users/tylermcanally/Desktop/LumiMD/mobile
eas whoami
```

- `eas login` prompts for Expo credentials (create one if you do not already have an account).
- `eas whoami` confirms the CLI is authenticated.

---

## 3. Apple Developer Connection

Authenticate EAS with Apple so it can manage certificates and devices.

```bash
eas device:create
```

Steps during the wizard:
1. Log in with the Apple ID tied to the developer account.
2. Allow EAS to manage certificates and profiles.
3. (Optional) Register your iPhone/iPad UDID so internal builds can be installed directly.

You can re-run `eas device:create` later to add more testers’ devices.

---

## 4. App Store Connect Setup

1. Visit <https://appstoreconnect.apple.com> → **My Apps** → **+** → **New App**.
2. Fill in:
   - Platform: **iOS**
   - Name: **LumiMD**
   - Primary Language: **English (U.S.)**
   - Bundle ID: choose **com.lumimd.app** (create it under Certificates, Identifiers & Profiles if missing)
   - SKU: `lumimd-app` (any unique string works)
   - User Access: **Full Access**
3. Configure **App Information** (category: *Medical*) and **Pricing and Availability** (set to *Free*). Save.

You’ll need the numeric **Apple ID** from the App Information page later (e.g., `1234567890`).

---

## 5. Environment Variables (EAS Secrets)

All Firebase values must exist as EAS project secrets **before** building.

```bash
cd /Users/tylermcanally/Desktop/LumiMD/mobile

eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_API_KEY --value "<firebase api key>"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "lumimd-dev.firebaseapp.com"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "lumimd-dev"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "lumimd-dev.firebasestorage.app"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "<messaging sender id>"
eas secret:create --scope project --name EXPO_PUBLIC_FIREBASE_APP_ID --value "<firebase app id>"
eas secret:create --scope project --name EXPO_PUBLIC_WEB_PORTAL_URL --value "https://lumimd.app"
```

Retrieve the exact values from `web-portal/.env.local`. Use `printf` or copy/paste carefully to avoid trailing newlines.

Confirm secrets:

```bash
eas secret:list
```

---

## 6. Configure `eas.json`

`mobile/eas.json` already contains the necessary configuration (including production iOS build profile and submit settings). Update two placeholders *before* the first submission:

| Field | Location | Value |
| ----- | -------- | ----- |
| `appleId` | `submit.production.ios.appleId` | Apple ID email used for the developer account |
| `ascAppId` | `submit.production.ios.ascAppId` | Numeric App Store Connect Apple ID (fill in after first build appears in ASC) |

Example snippet:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "you@example.com",
      "ascAppId": "1234567890",
      "appleTeamId": "42M6N2GJD2"
    }
  }
}
```

---

## 7. Build the iOS Binary (IPA)

```bash
cd /Users/tylermcanally/Desktop/LumiMD/mobile
eas build --platform ios --profile production
```

First build notes:
- Takes ~10–20 minutes.
- Generates signing credentials automatically.
- Provides a build dashboard URL to monitor progress.

Once completed, download artifacts or copy the build ID for reference.

---

## 8. Submit to TestFlight

After the first build finishes **and** the App Store Connect Apple ID has been filled into `eas.json`:

```bash
eas submit --platform ios --profile production --latest
```

What happens:
- Uploads the most recent build to App Store Connect.
- For internal testers, availability is typically within minutes.
- No App Review is required for internal testing.

Monitor submission status at **App Store Connect → TestFlight**. Wait for “Ready to Test”.

---

## 9. Invite Internal Testers

1. App Store Connect → **Users and Access** → ensure teammates exist and have **Access to App Store Connect**.
2. Navigate to **TestFlight → Internal Testing**.
3. Click **+** to add team members as testers.
4. Optionally enable “Automatically distribute to testers” so future builds ship automatically.

Testers install the **TestFlight** app from the App Store, accept the email invitation, then install LumiMD.

---

## 10. Test Run Checklist

- ✅ Email/password sign-in flow
- ✅ Navigation between Dashboard / Visits / Medications / Actions / Profile
- ✅ Check iOS ↔ Web Universal Links open correctly
- ✅ Verify microphone permissions (visit recording)
- ✅ Exercise medication insights and action item flows

Monitor crashes under **App Store Connect → TestFlight → Crashes**.

---

## 11. Future Releases

1. Bump version in `mobile/app.json` (e.g., `1.0.1`).
2. Commit changes.
3. Re-run:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production --latest
```

4. Add “What to Test” notes in TestFlight for each build.

---

## 12. Troubleshooting Tips

| Issue | How to Resolve |
| ----- | -------------- |
| Certificate / provisioning errors | `eas credentials` → Manage iOS → Regenerate |
| Submission fails | Ensure bundle ID matches, `ascAppId` is correct, Apple membership active |
| Runtime crashes | Confirm all EAS secrets exist, inspect build logs |
| Universal Links not working | Check `https://lumimd.app/.well-known/apple-app-site-association`, verify `associatedDomains` in `app.json`, allow 24–48 hrs for Apple cache refresh |

---

Following these steps will deliver a signed .ipa to TestFlight and seed your internal team with early builds. Reach out before onboarding external testers to plan the App Review submission and marketing assets. Good luck! 🛫

