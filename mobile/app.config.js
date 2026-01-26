const buildNumber = process.env.EAS_BUILD_NUMBER ?? '1';

module.exports = {
  expo: {
    name: 'LumiMD',
    slug: 'lumimd',
    version: '1.3.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'cover',
      backgroundColor: '#40C9D0',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.lumimd.app',
      buildNumber: String(buildNumber),
      appleTeamId: '42M6N2GJD2',
      googleServicesFile: './GoogleService-Info.plist',
      associatedDomains: ['applinks:lumimd.app'],
      infoPlist: {
        NSMicrophoneUsageDescription:
          'LumiMD needs access to your microphone to record your medical visits.',
        NSCalendarsUsageDescription:
          'LumiMD needs access to your calendar to add action items as reminders for follow-up appointments and medical tasks.',
        NSHealthShareUsageDescription:
          'LumiMD uses your health data to provide a comprehensive view of your vitals, including weight, heart rate, and blood pressure, alongside your medical visits and medications.',
        NSHealthUpdateUsageDescription:
          'LumiMD may record health observations from your medical visits.',
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
      [
        './plugins/withHealthKit',
        {
          usageDescription:
            'LumiMD uses your health data to provide a comprehensive view of your vitals, including weight, heart rate, and blood pressure, alongside your medical visits and medications.',
          backgroundDelivery: false,
        },
      ],
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
