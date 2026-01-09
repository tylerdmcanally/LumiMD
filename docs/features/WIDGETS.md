# iOS Widgets & App Groups

## Overview
LumiMD includes iOS Home Screen widgets to display:
1.  **Medication Schedule**: Timeline of daily medications.
2.  **Record Visit**: Quick launcher for recording.

These widgets are built using **SwiftUI** and **WidgetKit**, interacting with the main React Native app via **App Groups**.

## Architecture

### App Groups
Data sharing is enabled by the App Group `group.com.lumimd.app`.
- **Main App**: Writes data to `UserDefaults(suiteName: "group.com.lumimd.app")`.
- **Widget Extension**: Reads data from the same `UserDefaults` suite.

### Provisioning & Credentials
Since Widgets require distinct Bundle IDs and App Group capabilities, they need separate provisioning profiles.

| Target | Bundle ID | Capabilities |
|--------|-----------|--------------|
| **App** | `com.lumimd.app` | App Groups, Push Notifications, etc. |
| **Widget** | `com.lumimd.app.widget` | App Groups |

**Important:** Both provisioning profiles must have the `group.com.lumimd.app` App Group enabled in the Apple Developer Portal.

### Data Synchronization

#### 1. React Native Side (`mobile/lib/widget`)
The `useWidgetSync` hook listens for changes in the medication schedule and writes them to the App Group.

**Key File:** `mobile/lib/widget/widgetSync.ts`

```typescript
// Writes JSON string to UserDefaults under key "medicationSchedule"
SharedGroupPreferences.setItem('medicationSchedule', jsonString, appGroupIdentifier);
// Reloads widget timeline
WidgetKit.reloadAllTimelines();
```

#### 2. Swift Side (`mobile/targets/widget/widgets.swift`)
The widget code (Swift) reads this JSON and decodes it into a Swift struct.

```swift
let defaults = UserDefaults(suiteName: "group.com.lumimd.app")
let jsonString = defaults?.string(forKey: "medicationSchedule")
```

## Troubleshooting Build Issues

### "Provisioning profile doesn't support App Groups"
If EAS Build fails with this error:
1.  Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list).
2.  Find the **Widget** Identifier (`com.lumimd.app.widget`).
3.  Ensure "App Groups" is enabled and `group.com.lumimd.app` is checked.
4.  Regenerate the provisioning profile via `npx eas credentials` (delete old widget profile -> rebuild).

### Widget Says "Sync Required"
The widget displays "Sync Required" if it finds no data in the App Group.
**Fix:** Open the main app. `useWidgetSync` in `app/index.tsx` will automatically write the data on launch.

## Development Workflow
Widgets are native iOS targets. Code lives in `mobile/targets/widget/`.
- **Modifying UI:** Edit `mobile/targets/widget/widgets.swift`.
- **Config:** `mobile/targets/widget/expo-target.config.js`.
