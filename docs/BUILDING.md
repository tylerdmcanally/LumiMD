## Building the LumiMD Workspace

### 1. Install Dependencies (Root)

```bash
cd /Users/tylermcanally/Desktop/LumiMD
npm install --legacy-peer-deps
```

`--legacy-peer-deps` keeps Expo on React 18 / React Native 0.75 while the web portal uses React 19 in its own workspace.

### 2. Validate Mobile (Expo)

```bash
cd mobile
npx expo-doctor
npx expo start --clear
```

If Watchman reports repeated \"recrawl\" warnings, reset the watch:

```bash
watchman watch-del '/Users/tylermcanally/Desktop/LumiMD'
watchman watch-project '/Users/tylermcanally/Desktop/LumiMD'
```

### 3. Build Web Portal

```bash
cd /Users/tylermcanally/Desktop/LumiMD
npm run build -w web-portal
```

Vercel runs the same command from the repo root.

### 4. Shared SDK

The SDK is rebuilt automatically during the root `npm install` via the `postinstall` script:

```
npm run build -w packages/sdk --if-present
```

No extra steps are required unless you are editing the SDK directly. In that case, run `npm run build -w packages/sdk` before committing to keep `dist/` current.

### Notes

- For SDK 54, we pin `expo-font` via root `overrides` to avoid duplicate native
  module versions reported by `expo-doctor`. Remove the override after upgrading
  `expo`/`@expo/vector-icons` to a patch that depends on `expo-font ~14.0.11`.
- App versioning uses `mobile/app.config.js` as the single source of truth.
  During EAS builds, `EAS_BUILD_NUMBER` is used to set `ios.buildNumber`.
- Widget versioning is synced in `mobile/plugins/withWidgetVersionSync.js` to
  match the app config values used during prebuild.

### Future Upgrade: Expo SDK 55 / React Native 0.76

When we are ready to adopt React 19 on mobile:

1. `cd mobile && npx expo upgrade 55` to bump Expo, React Native, and React.
2. Regenerate native artifacts (`pod install`, Gradle sync) if using the dev client/EAS builds.
3. Re-run `npx expo-doctor`, `npx expo start --clear`, and `npm run build -w web-portal`.
4. Update documentation and CI scripts to remove the `--legacy-peer-deps` note.
5. Build new EAS TestFlight/Play Store binaries and soak-test before launch.

