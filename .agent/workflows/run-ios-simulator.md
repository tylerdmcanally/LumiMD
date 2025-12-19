---
description: How to run LumiMD on the iOS simulator for testing
---

# Running LumiMD on iOS Simulator

**IMPORTANT**: This app uses React Native Firebase (native modules), so it **cannot run in Expo Go**. 
You must use a development build with the native iOS simulator.

## Steps to Run

1. Navigate to the mobile directory:
   ```bash
   cd /Users/tylermcanally/Desktop/LumiMD/mobile
   ```

2. Start the Metro bundler with dev-client mode:
   ```bash
   npx expo start --dev-client --clear
   ```

3. In a separate terminal, run the iOS app (or press `i` in Metro):
   ```bash
   cd /Users/tylermcanally/Desktop/LumiMD/ios
   npx pod-install  # if needed
   npx react-native run-ios
   ```

   OR from the mobile directory:
   ```bash
   npx expo run:ios
   ```

## Alternative: Direct Xcode Build

1. Open `/Users/tylermcanally/Desktop/LumiMD/ios/LumiMD.xcworkspace` in Xcode
2. Select an iOS simulator target
3. Press Cmd+R to build and run

## If Native Modules Are Missing

Run a clean prebuild:
```bash
cd /Users/tylermcanally/Desktop/LumiMD/mobile
npx expo prebuild --clean
cd ../ios
pod install
```

## Test User ID

For nudge testing scripts, the current test user ID is:
`7Ta8FpJxCCgLgepcerjy547oxIE3`
