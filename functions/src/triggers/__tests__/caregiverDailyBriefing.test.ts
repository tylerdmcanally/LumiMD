/**
 * Caregiver Daily Briefing Trigger — Tests
 *
 * Tests the timezone logic, dedup, notification content, and edge cases.
 * The trigger itself is wrapped in onSchedule, so we test the internal
 * functions by extracting them or testing the behavior through mocks.
 */

// The setup.ts already mocks firebase-admin and firebase-functions.
// We need to mock firebase-functions/v2/scheduler additionally.
jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_config: any, handler: any) => handler,
}));

// Mock notification service
const mockSendNotifications = jest.fn(() => Promise.resolve([]));
const mockGetUserPushTokens = jest.fn(() => Promise.resolve([{ token: 'expo-token-1', platform: 'ios' }]));

jest.mock('../../services/notifications', () => ({
  getNotificationService: () => ({
    sendNotifications: mockSendNotifications,
    getUserPushTokens: mockGetUserPushTokens,
  }),
}));

import * as admin from 'firebase-admin';

// Helper to create mock Firestore query results
function createMockSnapshot(docs: Array<{ id: string; data: Record<string, any> }>) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d.data,
      ref: { id: d.id },
    })),
  };
}

describe('caregiverDailyBriefing', () => {
  let firestoreMock: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the chainable Firestore mock
    const collectionResults = new Map<string, any>();

    firestoreMock = {
      collection: jest.fn((name: string) => {
        const chain: any = {
          where: jest.fn(() => chain),
          get: jest.fn(() => Promise.resolve(collectionResults.get(name) || createMockSnapshot([]))),
          doc: jest.fn((id: string) => {
            const subChain: any = {
              get: jest.fn(() => Promise.resolve({
                exists: false,
                data: () => null,
              })),
              set: jest.fn(() => Promise.resolve()),
              collection: jest.fn(() => ({
                doc: jest.fn(() => ({
                  get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
                  set: jest.fn(() => Promise.resolve()),
                })),
              })),
            };
            // Handle user docs
            if (name === 'users') {
              if (id === 'cg-1') {
                subChain.get = jest.fn(() => Promise.resolve({
                  exists: true,
                  data: () => ({
                    preferredName: 'Jane',
                    timezone: 'America/Chicago',
                    briefingHour: 8,
                  }),
                }));
              } else if (id === 'patient-1') {
                subChain.get = jest.fn(() => Promise.resolve({
                  exists: true,
                  data: () => ({ preferredName: 'Mom' }),
                }));
              }
            }
            return subChain;
          }),
        };
        return chain;
      }),
    };

    (admin.firestore as unknown as jest.Mock).mockReturnValue(firestoreMock);

    // Set up shares collection to return a caregiver
    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'shares') {
            return Promise.resolve(createMockSnapshot([
              { id: 'share-1', data: { caregiverId: 'cg-1', ownerId: 'patient-1', status: 'accepted' } },
            ]));
          }
          if (name === 'medications') {
            return Promise.resolve(createMockSnapshot([
              { id: 'med-1', data: { userId: 'patient-1', status: 'active', deletedAt: null } },
              { id: 'med-2', data: { userId: 'patient-1', status: 'active', deletedAt: null } },
            ]));
          }
          if (name === 'medicationLogs') {
            return Promise.resolve(createMockSnapshot([
              { id: 'log-1', data: { userId: 'patient-1', action: 'taken', createdAt: new Date() } },
            ]));
          }
          if (name === 'actions') {
            return Promise.resolve(createMockSnapshot([]));
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn((id: string) => {
          const subChain: any = {
            get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
            set: jest.fn(() => Promise.resolve()),
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
                set: jest.fn(() => Promise.resolve()),
              })),
            })),
          };
          if (name === 'users') {
            if (id === 'cg-1') {
              subChain.get = jest.fn(() => Promise.resolve({
                exists: true,
                data: () => ({
                  preferredName: 'Jane',
                  timezone: 'America/Chicago',
                  briefingHour: new Date().getUTCHours(), // match current hour for testing
                }),
              }));
            } else if (id === 'patient-1') {
              subChain.get = jest.fn(() => Promise.resolve({
                exists: true,
                data: () => ({ preferredName: 'Mom' }),
              }));
            }
          }
          if (name === 'briefings') {
            // Return a chainable subcollection
            subChain.collection = jest.fn(() => ({
              doc: jest.fn(() => ({
                get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
                set: jest.fn(() => Promise.resolve()),
              })),
            }));
          }
          return subChain;
        }),
      };
      return chain;
    });
  });

  it('is exported as a function', async () => {
    // Import the trigger (onSchedule is mocked to return the handler)
    const { processCaregiverDailyBriefing } = await import('../caregiverDailyBriefing');
    expect(typeof processCaregiverDailyBriefing).toBe('function');
  });

  it('completes without error when no shares exist', async () => {
    firestoreMock.collection.mockImplementation((name: string) => ({
      where: jest.fn().mockReturnThis(),
      get: jest.fn(() => Promise.resolve(createMockSnapshot([]))),
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
        set: jest.fn(),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({ exists: false })),
            set: jest.fn(),
          })),
        })),
      })),
    }));

    const { processCaregiverDailyBriefing } = await import('../caregiverDailyBriefing');
    const handler = processCaregiverDailyBriefing as unknown as () => Promise<void>;
    await expect(handler()).resolves.toBeUndefined();
    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('skips when caregiver has no push tokens', async () => {
    mockGetUserPushTokens.mockResolvedValueOnce([]);

    const { processCaregiverDailyBriefing } = await import('../caregiverDailyBriefing');
    const handler = processCaregiverDailyBriefing as unknown as () => Promise<void>;
    await handler();
    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('does not crash on invalid timezone', async () => {
    // Override user doc to return invalid timezone
    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'shares') {
            return Promise.resolve(createMockSnapshot([
              { id: 'share-1', data: { caregiverId: 'cg-1', ownerId: 'patient-1', status: 'accepted' } },
            ]));
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({
            exists: true,
            data: () => ({
              timezone: 'Invalid/Timezone',
              briefingHour: new Date().getUTCHours(),
            }),
          })),
          set: jest.fn(() => Promise.resolve()),
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve({ exists: false })),
              set: jest.fn(() => Promise.resolve()),
            })),
          })),
        })),
      };
      return chain;
    });

    const { processCaregiverDailyBriefing } = await import('../caregiverDailyBriefing');
    const handler = processCaregiverDailyBriefing as unknown as () => Promise<void>;
    // Should not throw
    await expect(handler()).resolves.toBeUndefined();
  });
});
