/**
 * Caregiver Alerts Trigger — Tests
 *
 * Tests missed medication detection, visit-ready notifications, dedup logic,
 * and edge cases (no shares, no tokens, etc.).
 */

jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_config: any, handler: any) => handler,
}));

const mockSendNotifications = jest.fn(() => Promise.resolve([]));
const mockGetUserPushTokens = jest.fn(() =>
  Promise.resolve([{ token: 'expo-token-1', platform: 'ios' }]),
);

jest.mock('../../services/notifications', () => ({
  getNotificationService: () => ({
    sendNotifications: mockSendNotifications,
    getUserPushTokens: mockGetUserPushTokens,
  }),
}));

import * as admin from 'firebase-admin';

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

describe('caregiverAlerts', () => {
  let firestoreMock: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Build a mock Firestore with configurable collection responses
    const collectionResponses = new Map<string, any>();
    const docResponses = new Map<string, any>();

    firestoreMock = {
      collection: jest.fn((name: string) => {
        const chain: any = {
          where: jest.fn(() => chain),
          limit: jest.fn(() => chain),
          get: jest.fn(() => {
            return Promise.resolve(
              collectionResponses.get(name) || createMockSnapshot([]),
            );
          }),
          doc: jest.fn((id: string) => {
            const docKey = `${name}/${id}`;
            return {
              get: jest.fn(() =>
                Promise.resolve(
                  docResponses.get(docKey) || { exists: false, data: () => null },
                ),
              ),
              update: jest.fn(() => Promise.resolve()),
              set: jest.fn(() => Promise.resolve()),
            };
          }),
        };
        return chain;
      }),
    };

    // Store references so tests can configure responses
    firestoreMock._collectionResponses = collectionResponses;
    firestoreMock._docResponses = docResponses;

    (admin.firestore as unknown as jest.Mock).mockReturnValue(firestoreMock);

    // Mock Timestamp.fromDate and Timestamp.now
    (admin.firestore as any).Timestamp = {
      fromDate: (d: Date) => ({ toDate: () => d, _seconds: Math.floor(d.getTime() / 1000) }),
      now: () => ({ toDate: () => new Date(), _seconds: Math.floor(Date.now() / 1000) }),
    };
    (admin.firestore as any).FieldValue = {
      serverTimestamp: () => 'SERVER_TIMESTAMP',
    };
  });

  it('is exported as a function', async () => {
    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    expect(typeof processCaregiverAlerts).toBe('function');
  });

  it('completes without error when no reminders or visits match', async () => {
    // All collections return empty
    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    const handler = processCaregiverAlerts as unknown as () => Promise<void>;
    await expect(handler()).resolves.toBeUndefined();
    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('sends missed medication notification when dose is unlogged', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    // Configure collection responses
    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'medicationReminders') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'reminder-1',
                  data: {
                    userId: 'patient-1',
                    medicationId: 'med-1',
                    medicationName: 'Lisinopril',
                    lastNotifiedAt: { toDate: () => threeHoursAgo },
                    deletedAt: null,
                    caregiverNotifications: [],
                  },
                },
              ]),
            );
          }
          if (name === 'medicationLogs') {
            // No logs — medication was not taken
            return Promise.resolve(createMockSnapshot([]));
          }
          if (name === 'shares') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'share-1',
                  data: { ownerId: 'patient-1', caregiverId: 'cg-1', status: 'accepted' },
                },
              ]),
            );
          }
          if (name === 'visits') {
            return Promise.resolve(createMockSnapshot([]));
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn((id: string) => ({
          get: jest.fn(() => {
            if (name === 'users' && id === 'patient-1') {
              return Promise.resolve({
                exists: true,
                data: () => ({ preferredName: 'Mom' }),
              });
            }
            return Promise.resolve({ exists: false, data: () => null });
          }),
          update: jest.fn(() => Promise.resolve()),
          set: jest.fn(() => Promise.resolve()),
        })),
      };
      return chain;
    });

    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    const handler = processCaregiverAlerts as unknown as () => Promise<void>;
    await handler();

    expect(mockSendNotifications).toHaveBeenCalledTimes(1);
    const payloads = (mockSendNotifications.mock.calls[0] as any[])[0];
    expect(payloads[0].title).toContain('Mom');
    expect(payloads[0].title).toContain('missed');
    expect(payloads[0].data.type).toBe('missed_medication_caregiver');
    expect(payloads[0].data.patientId).toBe('patient-1');
  });

  it('does not send missed medication alert when dose was logged', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'medicationReminders') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'reminder-1',
                  data: {
                    userId: 'patient-1',
                    medicationId: 'med-1',
                    medicationName: 'Lisinopril',
                    lastNotifiedAt: { toDate: () => threeHoursAgo },
                    deletedAt: null,
                    caregiverNotifications: [],
                  },
                },
              ]),
            );
          }
          if (name === 'medicationLogs') {
            // Medication WAS taken
            return Promise.resolve(
              createMockSnapshot([
                { id: 'log-1', data: { userId: 'patient-1', medicationId: 'med-1', action: 'taken' } },
              ]),
            );
          }
          if (name === 'visits') {
            return Promise.resolve(createMockSnapshot([]));
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
          update: jest.fn(() => Promise.resolve()),
          set: jest.fn(() => Promise.resolve()),
        })),
      };
      return chain;
    });

    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    const handler = processCaregiverAlerts as unknown as () => Promise<void>;
    await handler();

    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('sends visit-ready notification for newly completed visit', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'medicationReminders') {
            return Promise.resolve(createMockSnapshot([]));
          }
          if (name === 'visits') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'visit-1',
                  data: {
                    userId: 'patient-1',
                    processingStatus: 'completed',
                    completedAt: { toDate: () => fiveMinutesAgo },
                    deletedAt: null,
                    caregiverNotifications: [],
                  },
                },
              ]),
            );
          }
          if (name === 'shares') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'share-1',
                  data: { ownerId: 'patient-1', caregiverId: 'cg-1', status: 'accepted' },
                },
              ]),
            );
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn((id: string) => ({
          get: jest.fn(() => {
            if (name === 'users' && id === 'patient-1') {
              return Promise.resolve({
                exists: true,
                data: () => ({ preferredName: 'Mom' }),
              });
            }
            return Promise.resolve({ exists: false, data: () => null });
          }),
          update: jest.fn(() => Promise.resolve()),
          set: jest.fn(() => Promise.resolve()),
        })),
      };
      return chain;
    });

    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    const handler = processCaregiverAlerts as unknown as () => Promise<void>;
    await handler();

    expect(mockSendNotifications).toHaveBeenCalledTimes(1);
    const payloads = (mockSendNotifications.mock.calls[0] as any[])[0];
    expect(payloads[0].title).toContain("Mom's visit summary is ready");
    expect(payloads[0].data.type).toBe('visit_ready_caregiver');
    expect(payloads[0].data.visitId).toBe('visit-1');
  });

  it('skips visit notification when already notified (dedup)', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'medicationReminders') {
            return Promise.resolve(createMockSnapshot([]));
          }
          if (name === 'visits') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'visit-1',
                  data: {
                    userId: 'patient-1',
                    processingStatus: 'completed',
                    completedAt: { toDate: () => fiveMinutesAgo },
                    deletedAt: null,
                    caregiverNotifications: [
                      { caregiverId: 'cg-1', type: 'visit_ready', notifiedAt: new Date().toISOString() },
                    ],
                  },
                },
              ]),
            );
          }
          if (name === 'shares') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'share-1',
                  data: { ownerId: 'patient-1', caregiverId: 'cg-1', status: 'accepted' },
                },
              ]),
            );
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn((id: string) => ({
          get: jest.fn(() => {
            if (name === 'users' && id === 'patient-1') {
              return Promise.resolve({
                exists: true,
                data: () => ({ preferredName: 'Mom' }),
              });
            }
            return Promise.resolve({ exists: false, data: () => null });
          }),
          update: jest.fn(() => Promise.resolve()),
          set: jest.fn(() => Promise.resolve()),
        })),
      };
      return chain;
    });

    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    const handler = processCaregiverAlerts as unknown as () => Promise<void>;
    await handler();

    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('completes without error when patient has no caregivers', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'medicationReminders') {
            return Promise.resolve(createMockSnapshot([]));
          }
          if (name === 'visits') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'visit-1',
                  data: {
                    userId: 'patient-1',
                    processingStatus: 'completed',
                    completedAt: { toDate: () => fiveMinutesAgo },
                    deletedAt: null,
                    caregiverNotifications: [],
                  },
                },
              ]),
            );
          }
          if (name === 'shares') {
            // No shares for this patient
            return Promise.resolve(createMockSnapshot([]));
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
          update: jest.fn(() => Promise.resolve()),
          set: jest.fn(() => Promise.resolve()),
        })),
      };
      return chain;
    });

    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    const handler = processCaregiverAlerts as unknown as () => Promise<void>;
    await expect(handler()).resolves.toBeUndefined();
    expect(mockSendNotifications).not.toHaveBeenCalled();
  });

  it('skips when caregiver has no push tokens', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    mockGetUserPushTokens.mockResolvedValueOnce([]);

    firestoreMock.collection.mockImplementation((name: string) => {
      const chain: any = {
        where: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        get: jest.fn(() => {
          if (name === 'medicationReminders') {
            return Promise.resolve(createMockSnapshot([]));
          }
          if (name === 'visits') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'visit-1',
                  data: {
                    userId: 'patient-1',
                    processingStatus: 'completed',
                    completedAt: { toDate: () => fiveMinutesAgo },
                    deletedAt: null,
                    caregiverNotifications: [],
                  },
                },
              ]),
            );
          }
          if (name === 'shares') {
            return Promise.resolve(
              createMockSnapshot([
                {
                  id: 'share-1',
                  data: { ownerId: 'patient-1', caregiverId: 'cg-1', status: 'accepted' },
                },
              ]),
            );
          }
          return Promise.resolve(createMockSnapshot([]));
        }),
        doc: jest.fn((id: string) => ({
          get: jest.fn(() => {
            if (name === 'users' && id === 'patient-1') {
              return Promise.resolve({
                exists: true,
                data: () => ({ preferredName: 'Mom' }),
              });
            }
            return Promise.resolve({ exists: false, data: () => null });
          }),
          update: jest.fn(() => Promise.resolve()),
          set: jest.fn(() => Promise.resolve()),
        })),
      };
      return chain;
    });

    const { processCaregiverAlerts } = await import('../caregiverAlerts');
    const handler = processCaregiverAlerts as unknown as () => Promise<void>;
    await handler();

    expect(mockSendNotifications).not.toHaveBeenCalled();
  });
});
