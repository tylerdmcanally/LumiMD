# LumiMD Mobile App

React Native mobile app built with Expo. Features a lean, glanceable dashboard that links to the web portal for full management features.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Start Development Server

```bash
npm start
```

This will open Expo Dev Tools in your browser.

### 3. Run on Device/Simulator

**iOS Simulator:**
```bash
npm run ios
```
Or press `i` in the terminal after `npm start`

**Android Emulator:**
```bash
npm run android
```
Or press `a` in the terminal after `npm start`

**Physical Device:**
1. Install Expo Go app from App Store / Play Store
2. Scan the QR code shown in terminal or Expo Dev Tools

## 📲 Development Workflow (Expo Go)

1. Copy `.env.example` to `.env` and populate the required `EXPO_PUBLIC_*` values.
2. Run `npm start` from `mobile/` to launch Metro and Expo Dev Tools.
3. When the QR code appears:
   - iOS: open the Camera app, scan the QR code, and open with Expo Go.
   - Android: open Expo Go and use the built-in scanner.
4. Leave the server running for hot reload; press `r` in the terminal to reload or `m` for the dev menu.
5. If the server misbehaves, run `npm run reset` or the manual cache clearing steps in the Troubleshooting section.

> Because we’re fully managed, no local Xcode/Android Studio build is required for day-to-day development.

## 📱 Current Features

### ✅ Home Screen (Glanceable Dashboard)
- Gradient hero banner with app branding
- "Action Items" card showing pending count
- "Recent Visits" card showing visits to review
- "Start Visit" CTA button (recording to be implemented)
- One-tap links to web portal with seamless authentication

### ✅ Tab Navigation
- **Home** - Main dashboard
- **Actions** - Placeholder (links to web)
- **Visits** - Placeholder (links to web)
- **Meds** - Placeholder (links to web)

### ✅ Seamless Web Integration
- `openWebDashboard()` - Opens main web portal
- `openWebActions()` - Opens actions page
- `openWebVisit(id)` - Opens specific visit
- Automatic authentication handoff (when auth is implemented)

## 🔨 What's Next

### Phase 1 - Core Functionality
- [ ] Implement Firebase Auth (Email + Google Sign-In)
- [ ] Audio recording workflow with expo-av
- [ ] Upload to Firebase Storage
- [ ] Push notification registration

### Phase 2 - Polish
- [ ] Real API integration for stats
- [ ] Loading states
- [ ] Error handling UI
- [ ] Offline support

## 📁 Project Structure

```
mobile/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout with theme
│   └── (tabs)/             # Tab navigation
│       ├── _layout.tsx     # Tab bar configuration
│       ├── index.tsx       # Home screen (glanceable dashboard)
│       ├── actions.tsx     # Actions placeholder
│       ├── visits.tsx      # Visits placeholder
│       └── meds.tsx        # Meds placeholder
├── components/             # Reusable components
│   ├── ui.tsx              # Design tokens & base components
│   ├── HeroBanner.tsx      # Gradient hero header
│   ├── StartVisitCTA.tsx   # Primary action button
│   ├── ActionItemsCard.tsx # Action items list (legacy)
│   └── GlanceableCard.tsx  # Stats card component
├── lib/                    # Utilities
│   ├── config.ts           # Environment configuration
│   ├── auth.ts             # Firebase auth (placeholder)
│   └── linking.ts          # Web portal navigation
├── theme.ts                # Navigation theme
└── package.json
```

## 🎨 Design System

All visual tokens are defined in `components/ui.tsx`:

**Colors:**
- Primary: `#40C9D0` (cyan)
- Secondary: `#89D8C6` (mint)
- Accent: `#0A99A4` (deep teal CTAs)
- Background: `#F9FAFB`
- Text: `#1E293B`

**Spacing:**
- 4pt grid system: `spacing(1)` = 4px, `spacing(5)` = 20px

**Components:**
- `Card` - Surface container with shadow
- `GradientHero` - Hero banner with linear gradient
- `PillLabel` - Small status badge
- `GlanceableCard` - Pressable stats card

## 🔧 Configuration

Environment variables are loaded from `.env`.

1. Duplicate `.env.example` and rename it to `.env`.
2. Fill in each `EXPO_PUBLIC_*` value (Firebase keys, API base URL, etc.).
3. Restart Expo after making changes so the bundle picks up the new values.

**Note:** Expo requires `EXPO_PUBLIC_` prefix for any variable accessed in the client bundle.

Example:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_API_BASE_URL=https://api.lumimd.app
```

## 🚢 Build & Release Pipeline (EAS)

All native binaries are produced with [EAS Build](https://docs.expo.dev/eas/), and profiles live in `eas.json`.

### Preview / Internal Builds

```bash
npx eas-cli build --profile preview --platform ios
```

- Uses `EXPO_PUBLIC_ENV=preview`.
- Distributes through TestFlight without bumping store metadata.

### Production / App Store

1. Update `expo.version` in `app.json` if needed.
2. Trigger the build:

```bash
npx eas-cli build --profile production --platform ios
```

3. Monitor progress on expo.dev (the profile auto-increments the build number).

### Submit to TestFlight

```bash
npx eas-cli submit --platform ios --profile production
```

Submission uses the Apple credentials configured under `submit.production` in `eas.json`.

## 🐛 Troubleshooting

### "Cannot find module" errors
```bash
rm -rf node_modules
npm install
npm start --clear
```

### Metro bundler issues
```bash
npm run reset
# Or manually:
expo start --clear
```

### iOS Simulator not opening
```bash
# Make sure Xcode is installed
xcode-select --install

# Open simulator manually
open -a Simulator
```

### Android Emulator not opening
1. Open Android Studio
2. Tools → Device Manager
3. Start an emulator
4. Then run `npm run android`

## 📱 Testing on Physical Device

### iOS
1. Install Expo Go from App Store
2. Make sure phone and computer are on same WiFi
3. Open Camera app and scan QR code

### Android
1. Install Expo Go from Play Store
2. Open Expo Go app
3. Scan QR code from app

## 🔗 Related Documentation

- **API Reference:** `/functions/openapi.yaml`
- **Web Portal:** `/web-portal/README.md`
- **Seamless Auth:** `/SEAMLESS-AUTH-README.md`
- **Dev Guide:** `/Dev Guide.md`

## 📝 Notes

### Current Limitations
- Auth is placeholder (needs Firebase SDK integration)
- Stats are hardcoded (needs API integration)
- Recording workflow not implemented
- Web links will fail until auth is implemented

### Design Decisions
- **Lean mobile app** - Only recording + glanceable stats
- **Web-first management** - All CRUD operations on web
- **Native-feeling** - Safe areas, native navigation, haptics (future)

## 🎯 Success Criteria

The mobile app is ready when:
- [x] Builds without errors
- [x] Home screen shows glanceable dashboard
- [x] Tab navigation works
- [x] Cards are pressable (web links)
- [ ] Firebase Auth implemented
- [ ] Can create and upload recordings
- [ ] Push notifications work

---

**Ready to start?** Run `npm install && npm start` 🚀


