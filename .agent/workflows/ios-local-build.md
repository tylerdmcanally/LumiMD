# iOS Local Build

## Prerequisites
- Xcode installed with iOS simulator
- CocoaPods installed (`brew install cocoapods`)
- Node.js with npm

## Build Commands

### First-time or fresh build
```bash
cd mobile
rm -rf ios
npx expo prebuild --platform ios
export LANG=en_US.UTF-8 && cd ios && pod install && cd ..
npx expo run:ios
```

### Subsequent builds
```bash
cd mobile
npx expo run:ios
```

## Important Configuration

### New Architecture Setting
This project uses **Legacy Architecture** (`newArchEnabled: false` in `app.json`).

> ⚠️ **DO NOT enable New Architecture** - React Native Firebase has compatibility issues with RN 0.81+ and New Architecture. Enabling it will cause build failures with "implicit int" errors in RNFBStorage.

If `ios/` folder is deleted or regenerated, ensure `app.json` contains:
```json
{
  "expo": {
    "newArchEnabled": false,
    ...
  }
}
```

### CocoaPods UTF-8 Fix
If pod install fails with encoding errors, run:
```bash
export LANG=en_US.UTF-8
cd ios && pod install
```

## Troubleshooting

### "No space left on device"
Free up disk space. Common cleanup commands:
```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/*
xcrun simctl delete unavailable
```

### Simulator not found
Check available simulators:
```bash
xcrun simctl list devices available
```
