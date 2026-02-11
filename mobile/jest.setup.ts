import '@testing-library/jest-native/extend-expect';

const mockAsyncStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockAsyncStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockAsyncStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockAsyncStorage.delete(key);
    }),
    multiGet: jest.fn(async (keys: string[]) =>
      keys.map((key) => [key, mockAsyncStorage.get(key) ?? null]),
    ),
    multiRemove: jest.fn(async (keys: string[]) => {
      for (const key of keys) {
        mockAsyncStorage.delete(key);
      }
    }),
    clear: jest.fn(async () => {
      mockAsyncStorage.clear();
    }),
  },
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: (props: any) => React.createElement('Icon', props),
  };
});

jest.mock('expo-router', () => {
  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  };
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    __mockRouter: mockRouter,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'test-token' })),
  setBadgeCountAsync: jest.fn(async () => true),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => true),
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
  },
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
  },
}));

jest.mock('@react-native-firebase/auth', () =>
  jest.fn(() => ({
    currentUser: null,
  }))
);
