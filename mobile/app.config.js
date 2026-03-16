const buildNumber = process.env.EAS_BUILD_NUMBER ?? '1';

module.exports = {
  expo: {
    name: 'LumiMD',
    slug: 'lumimd',
    version: '1.5.0',
    runtimeVersion: {
      policy: 'appVersion',
    },
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'cover',
      backgroundColor: '#40C9D0',
    },
    updates: {
      url: 'https://u.expo.dev/e496534e-6396-4109-9051-6569d134e1f7',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.lumimd.app',
      runtimeVersion: {
        policy: 'appVersion',
      },
      buildNumber: String(buildNumber),
      appleTeamId: '42M6N2GJD2',
      googleServicesFile: './GoogleService-Info.plist',
      associatedDomains: ['applinks:lumimd.app'],
      entitlements: {
        'com.apple.developer.applesignin': ['Default'],
      },
      infoPlist: {
        NSMicrophoneUsageDescription:
          'LumiMD needs access to your microphone to record your medical visits.',
        NSCalendarsUsageDescription:
          'LumiMD needs access to your calendar to add action items as reminders for follow-up appointments and medical tasks.',
        NSLocationWhenInUseUsageDescription:
          'LumiMD uses your location to determine recording consent requirements for your state.',
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ['audio', 'remote-notification'],
      },
    },
    android: {
      icon: './assets/icon.png',
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#40C9D0',
      },
      package: 'com.lumimd.app',
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
        'android.permission.READ_CALENDAR',
        'android.permission.WRITE_CALENDAR',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.ACCESS_FINE_LOCATION',
      ],
    },
    scheme: 'lumimd',
    plugins: [
      'expo-router',
      [
        'expo-av',
        {
          microphonePermission:
            'Allow LumiMD to record audio for your medical visit recordings.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#40C9D0',
          sounds: [],
        },
      ],
      [
        'expo-calendar',
        {
          calendarPermission:
            'Allow LumiMD to add action items to your calendar as reminders.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Allow LumiMD to determine recording consent requirements for your state.',
        },
      ],
      'expo-apple-authentication',
      'expo-font',
      'expo-web-browser',
      [
        'expo-build-properties',
        {
          ios: {
            useFrameworks: 'static',
          },
        },
      ],
      '@react-native-firebase/app',
      '@react-native-google-signin/google-signin',
    ],
    extra: {
      router: {},
      eas: {
        projectId: 'e496534e-6396-4109-9051-6569d134e1f7',
      },
    },
    newArchEnabled: false,
  },
};
