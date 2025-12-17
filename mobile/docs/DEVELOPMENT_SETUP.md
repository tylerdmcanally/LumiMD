# LumiMD Mobile App - Development Setup & Configuration

This document outlines all configurations, fixes, and architectural decisions made to get the LumiMD mobile app to a clean, working production state.

## Table of Contents
- [Architecture Overview](#architecture-overview)
- [Firebase Integration](#firebase-integration)
- [Audio Recording](#audio-recording)
- [Dashboard Layout](#dashboard-layout)
- [Onboarding Flow](#onboarding-flow)
- [Empty States](#empty-states)
- [TypeScript Configuration](#typescript-configuration)
- [EAS Build & Deploy](#eas-build--deploy)

---

## Architecture Overview

### Key Technologies
- **Framework**: Expo (React Native) with Expo Router
- **State Management**: React Query (@tanstack/react-query)
- **Firebase**: React Native Firebase for native modules
- **Styling**: React Native StyleSheet with design tokens

### Project Structure
```
mobile/
├── app/                    # Expo Router screens
├── components/             # Reusable UI components
│   ├── onboarding/        # Onboarding step components
│   ├── ui.tsx             # Design system (Colors, spacing, etc.)
│   ├── EmptyState.tsx     # Unified empty state component
│   └── ...
├── lib/                    # Utilities and hooks
│   ├── api/               # API client, hooks, mutations
│   ├── hooks/             # Custom hooks (useAudioRecording, etc.)
│   ├── firebase.ts        # React Native Firebase setup
│   └── ...
└── docs/                   # Documentation
```

---

## Firebase Integration

### React Native Firebase Setup
The app uses **React Native Firebase** (native modules) instead of the Firebase Web SDK for:
- Better performance on mobile
- Native authentication flows
- Native Firestore listeners

**Key File**: `lib/firebase.ts`
```typescript
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

export { auth, firestore, storage };
```

### Realtime Hooks
Custom hooks in `lib/api/hooks.ts` use React Native Firebase's Firestore API:
- `useRealtimeVisits()` - Real-time visit updates
- `useRealtimeActiveMedications()` - Real-time medication list
- `useRealtimePendingActions()` - Real-time action items

---

## Audio Recording

### Retry Logic for "Recorder Not Prepared" Error
**File**: `lib/hooks/useAudioRecording.ts`

**Problem**: `Audio.Recording.createAsync()` occasionally fails with "recorder not prepared" due to timing issues with audio mode configuration.

**Solution**: Implemented retry logic with delays:
```typescript
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 300;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    await configureAudioMode();
    await delay(RETRY_DELAY_MS);
    recording = await Audio.Recording.createAsync(...);
    break;
  } catch (error) {
    if (attempt === MAX_RETRIES || !isNotPreparedError(error)) {
      throw error;
    }
    // Retry on next iteration
  }
}
```

---

## Dashboard Layout

### Component Hierarchy
```
index.tsx (Dashboard)
├── HeroBanner           # Brand + profile button
├── StartVisitCTA        # Primary CTA (gradient button)
├── Quick Overview       # GlanceableCards (Actions, Visits, Meds)
├── WebPortalBanner      # Full banner OR NeedHelpButton
└── Helper text
```

### Design Decisions

#### Hero Banner
- Clean LumiMD brand text on left
- Profile button (icon) on right
- Tagline "Your health, simplified."

#### Start Visit CTA
- Deep teal gradient (#0A99A4 → #078A94) for high contrast
- Record button (circle with dot) on right side
- Strong shadow for visual weight

#### Web Portal Banner
- Exported as separate hook (`useWebPortalBannerState`) + components
- `hideCollapsedState` prop allows external positioning
- State managed via AsyncStorage for persistence

---

## Onboarding Flow

### Component Location
Onboarding step components moved to `components/onboarding/`:
- `WelcomeStep.tsx`
- `ProfileStep.tsx` (includes DOB validation, back navigation)
- `HealthStep.tsx` (includes back navigation)
- `CompletionStep.tsx` (includes back navigation)

### Date of Birth Validation
**File**: `components/onboarding/ProfileStep.tsx`

Validates:
- Format: MM/DD/YYYY
- Valid month (1-12)
- Valid day for month (including leap years)
- Not a future date
- Year between 1900 and current year

### Profile Completion Requirements
**Backend**: `functions/src/routes/users.ts`

`isProfileComplete()` requires:
- `firstName` (required)
- `dateOfBirth` (required)
- `lastName` (optional)

---

## Empty States

### Unified EmptyState Component
**File**: `components/EmptyState.tsx`

**Props**:
```typescript
type EmptyStateProps = {
  variant?: 'empty' | 'error' | 'success';
  icon: string;           // Ionicons name
  title: string;
  description: string;
  actionLabel?: string;   // Optional CTA button
  onAction?: () => void;
  compact?: boolean;      // Inline mode vs card mode
};
```

**Usage Examples**:
```tsx
// Error state
<EmptyState
  variant="error"
  icon="cloud-offline-outline"
  title="Unable to load visits"
  description="Check your connection and pull down to refresh."
/>

// Empty state with action
<EmptyState
  variant="empty"
  icon="document-text-outline"
  title="No visits recorded yet"
  description="Record your first appointment."
  actionLabel="Record a Visit"
  onAction={() => router.push('/record-visit')}
/>

// Success state (compact)
<EmptyState
  variant="success"
  icon="checkmark-circle-outline"
  title="All caught up"
  description="No pending action items."
  compact
/>
```

---

## TypeScript Configuration

### Fixed Files

#### `lib/notifications.ts`
- Added `shouldShowBanner` and `shouldShowList` (new expo-notifications API)
- Fixed `PermissionStatus.UNDETERMINED` enum usage

#### `lib/store.ts`
- Changed `priceString` → `price` (API change)
- Fixed `getPurchaseHistoryAsync({ useGooglePlayCache: false })`

#### `lib/api/mutations.ts`
- Added index signature to `UpdateProfileInput` for API compatibility:
```typescript
interface UpdateProfileInput {
  firstName?: string;
  // ... other fields
  [key: string]: unknown;
}
```

#### `app/visit-detail.tsx`
- Added type casts for date parsing
- Fixed `disabled` prop with `Boolean()` wrapper

---

## EAS Build & Deploy

### Build Commands
```bash
# Development build
eas build --platform ios --profile development

# Production build
eas build --platform ios --profile production --non-interactive

# Submit to TestFlight
eas submit --platform ios --latest --non-interactive
```

### Current Build Info
- **Build Number**: 36
- **App Version**: 1.0.0
- **Bundle ID**: com.lumimd.app

### Credentials (Managed by EAS)
- Distribution Certificate: Expires Oct 23, 2026
- Provisioning Profile: Active, managed on EAS servers
- App Store Connect API Key: Configured for automated submissions

---

## Design System Tokens

**File**: `components/ui.tsx`

```typescript
export const Colors = {
  primary: '#40C9D0',     // Cyan
  primaryLight: '#5DD3D9',
  secondary: '#89D8C6',   // Mint
  accent: '#0A99A4',      // Deep teal (CTA)
  accentDark: '#078A94',
  warning: '#FBBF24',
  error: '#F87171',
  success: '#34D399',
  surface: '#FFFFFF',
  background: '#F8FAFB',
  text: '#1A2332',
  textMuted: '#4A5568',
  stroke: 'rgba(26,35,50,0.08)',
};

export const Radius = { sm: 10, md: 14, lg: 20 };
export const spacing = (n: number) => n * 4; // 4pt grid
```

---

## EAS Build Environment Variables

> **CRITICAL**: EAS builds do NOT use `.env` files! Environment variables must be configured in `eas.json` or EAS dashboard.

**File**: `eas.json`

```json
"production": {
  "autoIncrement": true,
  "ios": {
    "simulator": false
  },
  "env": {
    "EXPO_PUBLIC_ENV": "production",
    "EXPO_PUBLIC_API_BASE_URL": "https://us-central1-lumimd-dev.cloudfunctions.net/api",
    "EXPO_PUBLIC_WEB_PORTAL_URL": "https://lumimd.app"
  }
}
```

**Why this matters:**
- Without these, production falls back to `localhost:5001` for API calls
- This causes auth handoff and other API calls to fail silently
- The simulator works because it uses local `.env` file

---

## Web Portal Auth Handoff

The mobile app can seamlessly authenticate users in the web portal via a one-time handoff code.

### Flow
1. **Mobile**: Creates handoff code via `POST /v1/auth/create-handoff`
2. **Mobile**: Opens URL: `/auth/handoff?code=xxx&returnTo=/dashboard&uid=xxx`
3. **Web**: Waits for Firebase to restore session from IndexedDB
4. **Web**: If already signed in with matching UID → skip to destination
5. **Web**: Otherwise → exchange code for token, sign in, redirect

### Key Files
- **Mobile**: `lib/linking.ts` - Creates handoff code and opens URL
- **Backend**: `functions/src/routes/auth.ts` - `create-handoff` and `exchange-handoff` endpoints
- **Web Portal**: `app/auth/handoff/page.tsx` - Exchanges code and signs in

### Important Notes
- Uses `Linking.openURL()` to open in user's default browser (not SFSafariViewController)
- Web portal waits for `onAuthStateChanged` before checking auth state
- Handoff codes expire after 5 minutes and are single-use

---

## Quick Reference


| Feature | File(s) |
|---------|---------|
| Audio Recording | `lib/hooks/useAudioRecording.ts` |
| Firebase Setup | `lib/firebase.ts` |
| API Hooks | `lib/api/hooks.ts` |
| Mutations | `lib/api/mutations.ts` |
| Dashboard | `app/index.tsx` |
| Empty States | `components/EmptyState.tsx` |
| Design Tokens | `components/ui.tsx` |
| Notifications | `lib/notifications.ts` |
| In-App Purchases | `lib/store.ts` |

---

*Last updated: December 16, 2024*
