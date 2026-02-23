import { NotificationService } from '../notifications';

describe('NotificationService repository bridge', () => {
  it('loads user push tokens through user-domain dependency and de-duplicates by token', async () => {
    const listPushTokens = jest.fn().mockResolvedValue([
      { id: 'token-1', token: 'ExponentPushToken[a]', platform: 'ios' },
      { id: 'token-2', token: 'ExponentPushToken[a]', platform: 'ios' },
      { id: 'token-3', token: 'ExponentPushToken[b]' },
      { id: 'token-4', platform: 'android' },
    ]);
    const notificationService = new NotificationService({
      client: { post: jest.fn() } as never,
      userService: {
        listPushTokens,
        unregisterPushToken: jest.fn(),
      },
    });

    const tokens = await notificationService.getUserPushTokens('user-1');

    expect(listPushTokens).toHaveBeenCalledWith('user-1');
    expect(tokens).toEqual([
      { token: 'ExponentPushToken[a]', platform: 'ios' },
      { token: 'ExponentPushToken[b]', platform: 'ios' },
    ]);
  });

  it('removes invalid token through user-domain dependency', async () => {
    const unregisterPushToken = jest.fn().mockResolvedValue({ deletedCount: 2 });
    const notificationService = new NotificationService({
      client: { post: jest.fn() } as never,
      userService: {
        listPushTokens: jest.fn(),
        unregisterPushToken,
      },
    });

    await notificationService.removeInvalidToken('user-1', 'ExponentPushToken[a]');

    expect(unregisterPushToken).toHaveBeenCalledWith('user-1', 'ExponentPushToken[a]');
  });
});
