import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../lib/api/client', () => ({
  api: {
    user: {
      registerPushToken: jest.fn(),
      unregisterPushToken: jest.fn(),
      unregisterAllPushTokens: jest.fn(),
    },
  },
}));

import { api } from '../lib/api/client';
import {
  clearStoredPushToken,
  LAST_PUSH_TOKEN_STORAGE_KEY,
  registerPushToken,
} from '../lib/notifications';

const DEVICE_ID_STORAGE_KEY = 'lumimd:deviceInstallationId';
const mockRegisterPushToken = api.user.registerPushToken as jest.Mock;

describe('notification token registration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockRegisterPushToken.mockResolvedValue(undefined);
  });

  it('sends previousToken and deviceId when token rotates', async () => {
    await AsyncStorage.setItem(LAST_PUSH_TOKEN_STORAGE_KEY, 'ExponentPushToken[old-token]');
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, 'device-installation-1');

    await registerPushToken('ExponentPushToken[new-token]');

    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'ExponentPushToken[new-token]',
        previousToken: 'ExponentPushToken[old-token]',
        deviceId: 'device-installation-1',
      }),
    );
    expect(await AsyncStorage.getItem(LAST_PUSH_TOKEN_STORAGE_KEY)).toBe(
      'ExponentPushToken[new-token]',
    );
  });

  it('keeps deviceId stable across logout cleanup and account-switch re-registration', async () => {
    await registerPushToken('ExponentPushToken[user-a-token]');
    await clearStoredPushToken();
    await registerPushToken('ExponentPushToken[user-b-token]');

    expect(mockRegisterPushToken).toHaveBeenCalledTimes(2);
    const firstPayload = mockRegisterPushToken.mock.calls[0][0];
    const secondPayload = mockRegisterPushToken.mock.calls[1][0];

    expect(typeof firstPayload.deviceId).toBe('string');
    expect(firstPayload.deviceId.length).toBeGreaterThan(0);
    expect(secondPayload.deviceId).toBe(firstPayload.deviceId);
    expect(secondPayload.previousToken).toBeUndefined();
  });

  it('does not send previousToken when current token matches stored token', async () => {
    await AsyncStorage.setItem(LAST_PUSH_TOKEN_STORAGE_KEY, 'ExponentPushToken[same-token]');
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, 'device-installation-2');

    await registerPushToken('ExponentPushToken[same-token]');

    expect(mockRegisterPushToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'ExponentPushToken[same-token]',
        previousToken: undefined,
        deviceId: 'device-installation-2',
      }),
    );
  });
});
