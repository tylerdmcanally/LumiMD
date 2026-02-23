import * as admin from 'firebase-admin';
import { getNotificationService } from '../notifications';
import {
  processAndNotifyMedicationReminders,
  purgeSoftDeletedMedicationReminders,
} from '../medicationReminderService';

jest.mock('../notifications', () => ({
  getNotificationService: jest.fn(),
}));

type TimestampLike = admin.firestore.Timestamp;

type ReminderRecord = {
  id: string;
  userId: string;
  medicationId: string;
  medicationName: string;
  medicationDose?: string;
  times: string[];
  enabled: boolean;
  timingMode?: 'local' | 'anchor';
  anchorTimezone?: string | null;
  criticality?: 'standard' | 'time_sensitive';
  lastSentAt?: TimestampLike;
  lastSentLockUntil?: TimestampLike;
  lastSentLockAt?: TimestampLike;
  updatedAt?: TimestampLike;
  deletedAt?: TimestampLike | null;
  deletedBy?: string | null;
};

type MedicationRecord = {
  id: string;
  active?: boolean;
  deletedAt?: TimestampLike | null;
};

type UserRecord = {
  id: string;
  timezone?: string;
};

type MedicationLogRecord = {
  id: string;
  userId: string;
  medicationId: string;
  scheduledTime?: string;
  scheduledDate?: string;
  action?: string;
  loggedAt?: TimestampLike;
  snoozeUntil?: TimestampLike;
};

type HarnessState = {
  reminders: Record<string, ReminderRecord>;
  medications: Record<string, MedicationRecord>;
  users: Record<string, UserRecord>;
  medicationLogs: Record<string, MedicationLogRecord>;
};

type QueryFilter = {
  field: string;
  op: '==' | '>=' | '<=';
  value: unknown;
};

const DELETE_FIELD_SENTINEL = Symbol('deleteField');

const makeTimestamp = (input: string | number | Date): TimestampLike => {
  const date = input instanceof Date ? input : new Date(input);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  } as unknown as TimestampLike;
};

const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in (value as Record<string, unknown>) &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
};

const matchesFilters = (record: Record<string, unknown>, filters: QueryFilter[]): boolean =>
  filters.every((filter) => {
    const fieldValue = record[filter.field];
    if (filter.op === '==') {
      if (filter.value === null) {
        return fieldValue == null;
      }
      return fieldValue === filter.value;
    }

    const left = toMillis(fieldValue);
    const right = toMillis(filter.value);
    if (left === null || right === null) {
      return false;
    }

    if (filter.op === '>=') {
      return left >= right;
    }
    return left <= right;
  });

function buildHarness(initialState: HarnessState) {
  const state: HarnessState = {
    reminders: { ...initialState.reminders },
    medications: { ...initialState.medications },
    users: { ...initialState.users },
    medicationLogs: { ...initialState.medicationLogs },
  };

  const applyUpdate = (
    target: Record<string, unknown>,
    payload: Record<string, unknown>,
  ) => {
    Object.entries(payload).forEach(([key, value]) => {
      if (value === DELETE_FIELD_SENTINEL) {
        delete target[key];
        return;
      }
      target[key] = value;
    });
  };

  const makeReminderDocRef = (reminderId: string): any => ({
    id: reminderId,
    path: `medicationReminders/${reminderId}`,
    get: jest.fn(async () => ({
      exists: !!state.reminders[reminderId],
      id: reminderId,
      data: () => state.reminders[reminderId],
      ref: makeReminderDocRef(reminderId),
    })),
    update: jest.fn(async (payload: Record<string, unknown>) => {
      const current = state.reminders[reminderId];
      if (!current) {
        throw new Error(`Reminder not found: ${reminderId}`);
      }
      applyUpdate(current as unknown as Record<string, unknown>, payload);
    }),
    delete: jest.fn(async () => {
      delete state.reminders[reminderId];
    }),
  });

  const selectQueryDocs = (
    collectionName: 'medicationReminders' | 'medicationLogs',
    filters: QueryFilter[],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
  ) => {
    const source =
      collectionName === 'medicationReminders'
        ? state.reminders
        : state.medicationLogs;

    let docs = Object.entries(source)
      .filter(([, record]) =>
        matchesFilters(record as unknown as Record<string, unknown>, filters),
      )
      .map(([id, record]) => ({
        id,
        data: () => record,
        ref:
          collectionName === 'medicationReminders'
            ? makeReminderDocRef(id)
            : {
                id,
                path: `medicationLogs/${id}`,
              },
      }));

    if (orderByField) {
      docs = docs.sort((left, right) => {
        const leftMillis = toMillis(left.data()[orderByField]) ?? 0;
        const rightMillis = toMillis(right.data()[orderByField]) ?? 0;
        const base = leftMillis === rightMillis ? 0 : leftMillis > rightMillis ? 1 : -1;
        return orderDirection === 'desc' ? -base : base;
      });
    }

    if (typeof limitValue === 'number') {
      docs = docs.slice(0, limitValue);
    }

    return docs;
  };

  const buildQuery = (
    collectionName: 'medicationReminders' | 'medicationLogs',
    filters: QueryFilter[] = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitValue?: number,
  ): any => ({
    where: jest.fn((field: string, op: QueryFilter['op'], value: unknown) =>
      buildQuery(
        collectionName,
        [...filters, { field, op, value }],
        orderByField,
        orderDirection,
        limitValue,
      ),
    ),
    orderBy: jest.fn((field: string, direction: 'asc' | 'desc' = 'asc') =>
      buildQuery(collectionName, filters, field, direction, limitValue),
    ),
    limit: jest.fn((nextLimit: number) =>
      buildQuery(collectionName, filters, orderByField, orderDirection, nextLimit),
    ),
    get: jest.fn(async () => {
      const docs = selectQueryDocs(
        collectionName,
        filters,
        orderByField,
        orderDirection,
        limitValue,
      );
      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
      };
    }),
  });

  const batchOperations: Array<() => Promise<void>> = [];
  const batch = {
    update: jest.fn((ref: { update: (payload: Record<string, unknown>) => Promise<void> }, payload: Record<string, unknown>) => {
      batchOperations.push(() => ref.update(payload));
    }),
    set: jest.fn(),
    delete: jest.fn((ref: { id: string; path?: string }) => {
      batchOperations.push(async () => {
        if (ref.path?.startsWith('medicationReminders/')) {
          delete state.reminders[ref.id];
        }
      });
    }),
    commit: jest.fn(async () => {
      for (const operation of batchOperations.splice(0, batchOperations.length)) {
        await operation();
      }
    }),
  };

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'medicationReminders') {
        return {
          where: jest.fn((field: string, op: QueryFilter['op'], value: unknown) =>
            buildQuery('medicationReminders', [{ field, op, value }]),
          ),
          doc: jest.fn((id: string) => makeReminderDocRef(id)),
        };
      }

      if (name === 'medications') {
        return {
          doc: jest.fn((id: string) => ({
            get: jest.fn(async () => ({
              exists: !!state.medications[id],
              id,
              data: () => state.medications[id],
              get: (field: string) =>
                (state.medications[id] as Record<string, unknown> | undefined)?.[field],
            })),
          })),
        };
      }

      if (name === 'users') {
        return {
          doc: jest.fn((id: string) => ({
            get: jest.fn(async () => ({
              exists: !!state.users[id],
              id,
              data: () => state.users[id],
            })),
          })),
        };
      }

      if (name === 'medicationLogs') {
        return {
          where: jest.fn((field: string, op: QueryFilter['op'], value: unknown) =>
            buildQuery('medicationLogs', [{ field, op, value }]),
          ),
        };
      }

      throw new Error(`Unknown collection: ${name}`);
    }),
    batch: jest.fn(() => batch),
    runTransaction: jest.fn(async (updater: (tx: {
      get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
      update: (ref: { update: (payload: Record<string, unknown>) => Promise<void> }, payload: Record<string, unknown>) => void;
    }) => Promise<boolean>) => {
      const txOperations: Array<() => Promise<void>> = [];
      const tx = {
        get: jest.fn(async (ref: { get: () => Promise<unknown> }) => ref.get()),
        update: jest.fn((ref: { update: (payload: Record<string, unknown>) => Promise<void> }, payload: Record<string, unknown>) => {
          txOperations.push(() => ref.update(payload));
        }),
      };

      const result = await updater(tx);

      for (const operation of txOperations) {
        await operation();
      }

      return result;
    }),
  };

  return { state, db, batch };
}

describe('processAndNotifyMedicationReminders timezone travel behavior', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;
  const mockedGetNotificationService = getNotificationService as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    (firestoreMock as unknown as { Timestamp?: unknown }).Timestamp = {
      now: jest.fn(() => makeTimestamp(new Date(Date.now()))),
      fromDate: jest.fn((date: Date) => makeTimestamp(date)),
      fromMillis: jest.fn((millis: number) => makeTimestamp(millis)),
    };
    (firestoreMock as unknown as { FieldValue?: unknown }).FieldValue = {
      delete: jest.fn(() => DELETE_FIELD_SENTINEL),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends only the local reminder at 9 PM Los Angeles after east-to-west travel', async () => {
    jest.setSystemTime(new Date('2026-03-01T05:00:00.000Z')); // 9:00 PM LA, 12:00 AM NY

    const harness = buildHarness({
      reminders: {
        'r-local': {
          id: 'r-local',
          userId: 'user-1',
          medicationId: 'med-local',
          medicationName: 'Vitamin D',
          times: ['21:00'],
          enabled: true,
          timingMode: 'local',
          anchorTimezone: null,
        },
        'r-anchor': {
          id: 'r-anchor',
          userId: 'user-1',
          medicationId: 'med-anchor',
          medicationName: 'Tacrolimus',
          times: ['21:00'],
          enabled: true,
          timingMode: 'anchor',
          anchorTimezone: 'America/New_York',
        },
      },
      medications: {
        'med-local': { id: 'med-local', active: true },
        'med-anchor': { id: 'med-anchor', active: true },
      },
      users: {
        'user-1': { id: 'user-1', timezone: 'America/Los_Angeles' },
      },
      medicationLogs: {},
    });

    firestoreMock.mockImplementation(() => harness.db);

    const notificationService = {
      getUserPushTokens: jest.fn(async () => [
        { token: 'ExponentPushToken[travel-local]', platform: 'ios' },
      ]),
      sendNotifications: jest.fn(async (payloads: unknown[]) =>
        payloads.map(() => ({ status: 'ok' })),
      ),
      removeInvalidToken: jest.fn(async () => undefined),
    };
    mockedGetNotificationService.mockReturnValue(notificationService);

    const result = await processAndNotifyMedicationReminders();

    expect(result).toEqual({ processed: 1, sent: 1, errors: 0 });
    expect(notificationService.sendNotifications).toHaveBeenCalledTimes(1);

    const payloads = notificationService.sendNotifications.mock.calls[0][0] as Array<{
      data?: Record<string, unknown>;
    }>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0].data).toMatchObject({
      reminderId: 'r-local',
      evaluationTimezone: 'America/Los_Angeles',
      scheduledTime: '21:00',
      dueReason: 'schedule',
    });

    expect(harness.state.reminders['r-local'].lastSentAt).toBeDefined();
    expect(harness.state.reminders['r-anchor'].lastSentAt).toBeUndefined();
  });

  it('sends only the anchor reminder when New York reaches 9 PM while user is in Los Angeles', async () => {
    jest.setSystemTime(new Date('2026-03-01T02:00:00.000Z')); // 6:00 PM LA, 9:00 PM NY

    const harness = buildHarness({
      reminders: {
        'r-local': {
          id: 'r-local',
          userId: 'user-2',
          medicationId: 'med-local',
          medicationName: 'Vitamin D',
          times: ['21:00'],
          enabled: true,
          timingMode: 'local',
          anchorTimezone: null,
        },
        'r-anchor': {
          id: 'r-anchor',
          userId: 'user-2',
          medicationId: 'med-anchor',
          medicationName: 'Tacrolimus',
          times: ['21:00'],
          enabled: true,
          timingMode: 'anchor',
          anchorTimezone: 'America/New_York',
        },
      },
      medications: {
        'med-local': { id: 'med-local', active: true },
        'med-anchor': { id: 'med-anchor', active: true },
      },
      users: {
        'user-2': { id: 'user-2', timezone: 'America/Los_Angeles' },
      },
      medicationLogs: {},
    });

    firestoreMock.mockImplementation(() => harness.db);

    const notificationService = {
      getUserPushTokens: jest.fn(async () => [
        { token: 'ExponentPushToken[travel-anchor]', platform: 'ios' },
      ]),
      sendNotifications: jest.fn(async (payloads: unknown[]) =>
        payloads.map(() => ({ status: 'ok' })),
      ),
      removeInvalidToken: jest.fn(async () => undefined),
    };
    mockedGetNotificationService.mockReturnValue(notificationService);

    const result = await processAndNotifyMedicationReminders();

    expect(result).toEqual({ processed: 1, sent: 1, errors: 0 });
    expect(notificationService.sendNotifications).toHaveBeenCalledTimes(1);

    const payloads = notificationService.sendNotifications.mock.calls[0][0] as Array<{
      data?: Record<string, unknown>;
    }>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0].data).toMatchObject({
      reminderId: 'r-anchor',
      evaluationTimezone: 'America/New_York',
      scheduledTime: '21:00',
      dueReason: 'schedule',
    });

    expect(harness.state.reminders['r-anchor'].lastSentAt).toBeDefined();
    expect(harness.state.reminders['r-local'].lastSentAt).toBeUndefined();
  });

  it('sends only the local reminder at 9 PM New York after west-to-east travel', async () => {
    jest.setSystemTime(new Date('2026-03-02T02:00:00.000Z')); // 9:00 PM NY, 6:00 PM LA

    const harness = buildHarness({
      reminders: {
        'r-local': {
          id: 'r-local',
          userId: 'user-3',
          medicationId: 'med-local',
          medicationName: 'Vitamin D',
          times: ['21:00'],
          enabled: true,
          timingMode: 'local',
          anchorTimezone: null,
        },
        'r-anchor': {
          id: 'r-anchor',
          userId: 'user-3',
          medicationId: 'med-anchor',
          medicationName: 'Tacrolimus',
          times: ['21:00'],
          enabled: true,
          timingMode: 'anchor',
          anchorTimezone: 'America/Los_Angeles',
        },
      },
      medications: {
        'med-local': { id: 'med-local', active: true },
        'med-anchor': { id: 'med-anchor', active: true },
      },
      users: {
        'user-3': { id: 'user-3', timezone: 'America/New_York' },
      },
      medicationLogs: {},
    });

    firestoreMock.mockImplementation(() => harness.db);

    const notificationService = {
      getUserPushTokens: jest.fn(async () => [
        { token: 'ExponentPushToken[travel-east-local]', platform: 'ios' },
      ]),
      sendNotifications: jest.fn(async (payloads: unknown[]) =>
        payloads.map(() => ({ status: 'ok' })),
      ),
      removeInvalidToken: jest.fn(async () => undefined),
    };
    mockedGetNotificationService.mockReturnValue(notificationService);

    const result = await processAndNotifyMedicationReminders();

    expect(result).toEqual({ processed: 1, sent: 1, errors: 0 });
    expect(notificationService.sendNotifications).toHaveBeenCalledTimes(1);

    const payloads = notificationService.sendNotifications.mock.calls[0][0] as Array<{
      data?: Record<string, unknown>;
    }>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0].data).toMatchObject({
      reminderId: 'r-local',
      evaluationTimezone: 'America/New_York',
      scheduledTime: '21:00',
      dueReason: 'schedule',
    });

    expect(harness.state.reminders['r-local'].lastSentAt).toBeDefined();
    expect(harness.state.reminders['r-anchor'].lastSentAt).toBeUndefined();
  });

  it('sends only the anchor reminder when Los Angeles reaches 9 PM while user is in New York', async () => {
    jest.setSystemTime(new Date('2026-03-02T05:00:00.000Z')); // 12:00 AM NY, 9:00 PM LA

    const harness = buildHarness({
      reminders: {
        'r-local': {
          id: 'r-local',
          userId: 'user-4',
          medicationId: 'med-local',
          medicationName: 'Vitamin D',
          times: ['21:00'],
          enabled: true,
          timingMode: 'local',
          anchorTimezone: null,
        },
        'r-anchor': {
          id: 'r-anchor',
          userId: 'user-4',
          medicationId: 'med-anchor',
          medicationName: 'Tacrolimus',
          times: ['21:00'],
          enabled: true,
          timingMode: 'anchor',
          anchorTimezone: 'America/Los_Angeles',
        },
      },
      medications: {
        'med-local': { id: 'med-local', active: true },
        'med-anchor': { id: 'med-anchor', active: true },
      },
      users: {
        'user-4': { id: 'user-4', timezone: 'America/New_York' },
      },
      medicationLogs: {},
    });

    firestoreMock.mockImplementation(() => harness.db);

    const notificationService = {
      getUserPushTokens: jest.fn(async () => [
        { token: 'ExponentPushToken[travel-east-anchor]', platform: 'ios' },
      ]),
      sendNotifications: jest.fn(async (payloads: unknown[]) =>
        payloads.map(() => ({ status: 'ok' })),
      ),
      removeInvalidToken: jest.fn(async () => undefined),
    };
    mockedGetNotificationService.mockReturnValue(notificationService);

    const result = await processAndNotifyMedicationReminders();

    expect(result).toEqual({ processed: 1, sent: 1, errors: 0 });
    expect(notificationService.sendNotifications).toHaveBeenCalledTimes(1);

    const payloads = notificationService.sendNotifications.mock.calls[0][0] as Array<{
      data?: Record<string, unknown>;
    }>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0].data).toMatchObject({
      reminderId: 'r-anchor',
      evaluationTimezone: 'America/Los_Angeles',
      scheduledTime: '21:00',
      dueReason: 'schedule',
    });

    expect(harness.state.reminders['r-anchor'].lastSentAt).toBeDefined();
    expect(harness.state.reminders['r-local'].lastSentAt).toBeUndefined();
  });

  it('respects anchor timezone on DST boundary when local timezone has already shifted', async () => {
    jest.setSystemTime(new Date('2026-03-08T10:00:00.000Z')); // DST day: 6:00 AM NY (EDT), 3:00 AM Phoenix

    const harness = buildHarness({
      reminders: {
        'r-local': {
          id: 'r-local',
          userId: 'user-dst',
          medicationId: 'med-local',
          medicationName: 'Vitamin D',
          times: ['03:00'],
          enabled: true,
          timingMode: 'local',
          anchorTimezone: null,
        },
        'r-anchor': {
          id: 'r-anchor',
          userId: 'user-dst',
          medicationId: 'med-anchor',
          medicationName: 'Tacrolimus',
          times: ['03:00'],
          enabled: true,
          timingMode: 'anchor',
          anchorTimezone: 'America/Phoenix',
        },
      },
      medications: {
        'med-local': { id: 'med-local', active: true },
        'med-anchor': { id: 'med-anchor', active: true },
      },
      users: {
        'user-dst': { id: 'user-dst', timezone: 'America/New_York' },
      },
      medicationLogs: {},
    });

    firestoreMock.mockImplementation(() => harness.db);

    const notificationService = {
      getUserPushTokens: jest.fn(async () => [
        { token: 'ExponentPushToken[dst-anchor]', platform: 'ios' },
      ]),
      sendNotifications: jest.fn(async (payloads: unknown[]) =>
        payloads.map(() => ({ status: 'ok' })),
      ),
      removeInvalidToken: jest.fn(async () => undefined),
    };
    mockedGetNotificationService.mockReturnValue(notificationService);

    const result = await processAndNotifyMedicationReminders();

    expect(result).toEqual({ processed: 1, sent: 1, errors: 0 });
    expect(notificationService.sendNotifications).toHaveBeenCalledTimes(1);

    const payloads = notificationService.sendNotifications.mock.calls[0][0] as Array<{
      data?: Record<string, unknown>;
    }>;
    expect(payloads).toHaveLength(1);
    expect(payloads[0].data).toMatchObject({
      reminderId: 'r-anchor',
      evaluationTimezone: 'America/Phoenix',
      scheduledTime: '03:00',
      dueReason: 'schedule',
    });

    expect(harness.state.reminders['r-anchor'].lastSentAt).toBeDefined();
    expect(harness.state.reminders['r-local'].lastSentAt).toBeUndefined();
  });

  it('soft-disables orphaned reminders instead of hard deleting them', async () => {
    jest.setSystemTime(new Date('2026-03-01T05:00:00.000Z'));

    const harness = buildHarness({
      reminders: {
        'r-orphan': {
          id: 'r-orphan',
          userId: 'user-orphan',
          medicationId: 'med-missing',
          medicationName: 'Orphan med',
          times: ['21:00'],
          enabled: true,
          timingMode: 'local',
          anchorTimezone: null,
        },
      },
      medications: {},
      users: {
        'user-orphan': { id: 'user-orphan', timezone: 'America/Los_Angeles' },
      },
      medicationLogs: {},
    });

    firestoreMock.mockImplementation(() => harness.db);
    const notificationService = {
      getUserPushTokens: jest.fn(async () => [
        { token: 'ExponentPushToken[orphan]', platform: 'ios' },
      ]),
      sendNotifications: jest.fn(async () => [{ status: 'ok' }]),
      removeInvalidToken: jest.fn(async () => undefined),
    };
    mockedGetNotificationService.mockReturnValue(notificationService);

    const result = await processAndNotifyMedicationReminders();

    expect(result).toEqual({ processed: 1, sent: 0, errors: 0 });
    expect(harness.state.reminders['r-orphan']).toBeDefined();
    expect(harness.state.reminders['r-orphan']).toMatchObject({
      enabled: false,
      deletedBy: 'system:medication-reminder-processor',
    });
    expect(harness.state.reminders['r-orphan'].deletedAt).toBeDefined();
    expect(notificationService.sendNotifications).not.toHaveBeenCalled();
  });

  it('purges soft-deleted reminders older than retention window', async () => {
    jest.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    const harness = buildHarness({
      reminders: {
        'r-old-deleted': {
          id: 'r-old-deleted',
          userId: 'user-1',
          medicationId: 'med-1',
          medicationName: 'Old Deleted',
          times: ['09:00'],
          enabled: false,
          deletedAt: makeTimestamp('2025-10-01T12:00:00.000Z'),
        },
        'r-recent-deleted': {
          id: 'r-recent-deleted',
          userId: 'user-1',
          medicationId: 'med-2',
          medicationName: 'Recent Deleted',
          times: ['10:00'],
          enabled: false,
          deletedAt: makeTimestamp('2026-03-01T12:00:00.000Z'),
        },
        'r-active': {
          id: 'r-active',
          userId: 'user-1',
          medicationId: 'med-3',
          medicationName: 'Active',
          times: ['11:00'],
          enabled: true,
          deletedAt: null,
        },
      },
      medications: {},
      users: {},
      medicationLogs: {},
    });

    firestoreMock.mockImplementation(() => harness.db);
    mockedGetNotificationService.mockReturnValue({
      getUserPushTokens: jest.fn(async () => []),
      sendNotifications: jest.fn(async () => []),
      removeInvalidToken: jest.fn(async () => undefined),
    });

    const result = await purgeSoftDeletedMedicationReminders({
      retentionDays: 90,
      pageSize: 10,
    });

    expect(result).toMatchObject({
      scanned: 1,
      purged: 1,
      hasMore: false,
    });
    expect(harness.state.reminders['r-old-deleted']).toBeUndefined();
    expect(harness.state.reminders['r-recent-deleted']).toBeDefined();
    expect(harness.state.reminders['r-active']).toBeDefined();
  });
});
