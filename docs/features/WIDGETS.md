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

The current **Record Visit** widget is a simple launcher and does not require shared data.
App Group storage is reserved for the future medication schedule widget.

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
Widgets are native iOS targets. Code lives in `mobile/ios/LumiMDWidget/`.
- **Modifying UI:** Edit `mobile/ios/LumiMDWidget/Widgets.swift`.
- **Config:** `mobile/ios/LumiMDWidget/Info.plist`.
