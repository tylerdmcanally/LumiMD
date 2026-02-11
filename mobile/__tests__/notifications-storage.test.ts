import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearStoredPushToken,
  getStoredPushToken,
  LEGACY_PUSH_TOKEN_STORAGE_KEY,
  LAST_PUSH_TOKEN_STORAGE_KEY,
  setStoredPushToken,
} from '../lib/notifications';

jest.mock('../lib/api/client', () => ({
  api: {
    user: {
      registerPushToken: jest.fn(),
      unregisterPushToken: jest.fn(),
      unregisterAllPushTokens: jest.fn(),
    },
  },
}));

describe('notification token storage normalization', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('migrates legacy push token key to canonical key on read', async () => {
    await AsyncStorage.setItem(LEGACY_PUSH_TOKEN_STORAGE_KEY, 'legacy-token');

    const token = await getStoredPushToken();

    expect(token).toBe('legacy-token');
    expect(await AsyncStorage.getItem(LAST_PUSH_TOKEN_STORAGE_KEY)).toBe('legacy-token');
    expect(await AsyncStorage.getItem(LEGACY_PUSH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('stores canonical token and removes legacy key on write', async () => {
    await AsyncStorage.setItem(LEGACY_PUSH_TOKEN_STORAGE_KEY, 'old-token');

    await setStoredPushToken('new-token');

    expect(await AsyncStorage.getItem(LAST_PUSH_TOKEN_STORAGE_KEY)).toBe('new-token');
    expect(await AsyncStorage.getItem(LEGACY_PUSH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it('clears canonical and legacy keys together', async () => {
    await AsyncStorage.setItem(LAST_PUSH_TOKEN_STORAGE_KEY, 'current-token');
    await AsyncStorage.setItem(LEGACY_PUSH_TOKEN_STORAGE_KEY, 'legacy-token');

    await clearStoredPushToken();

    expect(await AsyncStorage.getItem(LAST_PUSH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_PUSH_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
