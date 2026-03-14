import React from 'react';
import { render, act } from '@testing-library/react-native';

// --- Mocks ---

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  Stack: Object.assign(
    ({ children }: any) => children,
    { Screen: () => null },
  ),
}));

// Must mock react-native to include useColorScheme
jest.mock('react-native', () => {
  const RN = jest.requireActual('../jest/react-native');
  return {
    ...RN,
    useColorScheme: jest.fn(() => 'light'),
  };
});

const mockSetBadgeCount = jest.fn(() => Promise.resolve());
const mockGetExpoPushToken = jest.fn(() => Promise.resolve('expo-token'));
const mockRegisterPushToken = jest.fn(() => Promise.resolve());
const mockRegisterNotificationCategories = jest.fn(() => Promise.resolve());
jest.mock('../lib/notifications', () => ({
  setBadgeCount: (...args: any[]) => mockSetBadgeCount(...args),
  getExpoPushToken: () => mockGetExpoPushToken(),
  registerPushToken: (...args: any[]) => mockRegisterPushToken(...args),
  registerNotificationCategories: () => mockRegisterNotificationCategories(),
  syncTimezone: jest.fn(() => Promise.resolve()),
  MED_REMINDER_CATEGORY: 'medication_reminder',
  MED_ACTION_TOOK_IT: 'TOOK_IT',
  MED_ACTION_SKIPPED: 'SKIPPED',
}));

const mockCreateMedicationLog = jest.fn(() => Promise.resolve({ id: 'log-1' }));
jest.mock('../lib/api/client', () => ({
  api: {
    medicationLogs: {
      create: (...args: any[]) => mockCreateMedicationLog(...args),
    },
  },
}));

jest.mock('../lib/telemetry', () => ({
  initializeTelemetryConsent: jest.fn(),
}));

let mockAuthValues: any = {
  isAuthenticated: true,
  user: { uid: 'test-user' },
  role: 'patient',
  roleLoading: false,
  loading: false,
};

jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: any) => children,
  useAuth: () => mockAuthValues,
}));

// Mock hooks
const mockUsePendingActions = jest.fn(() => ({ data: [] }));
const mockUseVisits = jest.fn(() => ({ data: [] }));
const mockUseMedicationSchedule = jest.fn(() => ({ data: null, refetch: jest.fn() }));
const mockUseCareOverview = jest.fn(() => ({ data: null }));

jest.mock('../lib/api/hooks', () => ({
  usePendingActions: (...args: any[]) => mockUsePendingActions(...args),
  useVisits: (...args: any[]) => mockUseVisits(...args),
  useMedicationSchedule: (...args: any[]) => mockUseMedicationSchedule(...args),
  useCareOverview: (...args: any[]) => mockUseCareOverview(...args),
}));

// Mock fonts
jest.mock('@expo-google-fonts/plus-jakarta-sans', () => ({
  useFonts: () => [true],
  PlusJakartaSans_500Medium: 'PlusJakartaSans_500Medium',
  PlusJakartaSans_600SemiBold: 'PlusJakartaSans_600SemiBold',
  PlusJakartaSans_700Bold: 'PlusJakartaSans_700Bold',
}));
jest.mock('@expo-google-fonts/fraunces', () => ({
  Fraunces_400Regular: 'Fraunces_400Regular',
  Fraunces_600SemiBold: 'Fraunces_600SemiBold',
  Fraunces_700Bold: 'Fraunces_700Bold',
}));

jest.mock('@react-navigation/native', () => ({
  ThemeProvider: ({ children }: any) => children,
}));

jest.mock('../theme', () => ({
  navTheme: () => ({}),
}));

jest.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => children,
}));

jest.mock('../components/ui', () => ({
  Colors: { background: '#fff', text: '#000', textMuted: '#666', primary: '#40C9D0' },
  spacing: (n: number) => n * 4,
  Radius: {},
}));

const mockInvalidateQueries = jest.fn(() => Promise.resolve());
jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(() => ({ clear: jest.fn() })),
  QueryClientProvider: ({ children }: any) => children,
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

// Mock expo-notifications — capture the response callback
let notificationResponseCallback: ((response: any) => void) | null = null;

jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn((callback: any) => {
    notificationResponseCallback = callback;
    return { remove: jest.fn() };
  }),
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
}));

import * as Notifications from 'expo-notifications';

import RootLayout from '../app/_layout';

describe('NotificationHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear AsyncStorage dedup keys between tests
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    AsyncStorage.clear();
    mockCreateMedicationLog.mockResolvedValue({ id: 'log-1' });
    notificationResponseCallback = null;
    mockAuthValues = {
      isAuthenticated: true,
      user: { uid: 'test-user' },
      role: 'patient',
      roleLoading: false,
      loading: false,
    };
    mockUseCareOverview.mockReturnValue({ data: null });
    mockUsePendingActions.mockReturnValue({ data: [] });
    mockUseVisits.mockReturnValue({ data: [] });
    mockUseMedicationSchedule.mockReturnValue({ data: null, refetch: jest.fn() });
  });

  function renderLayout() {
    render(<RootLayout />);
    return notificationResponseCallback;
  }

  function makeResponse(data: Record<string, any>, actionIdentifier?: string) {
    return {
      actionIdentifier: actionIdentifier ?? Notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: {
        request: { content: { data } },
      },
    };
  }

  // --- Patient notification routing ---

  it('routes medication_reminder to /medication-schedule for patient role (default tap)', () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    expect(cb).toBeTruthy();
    act(() => cb!(makeResponse({ type: 'medication_reminder' })));
    expect(mockPush).toHaveBeenCalledWith('/medication-schedule');
  });

  // --- Medication reminder action buttons ---

  it('logs taken when TOOK_IT action button is tapped', async () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    await act(async () => {
      cb!(
        makeResponse(
          {
            type: 'medication_reminder',
            medicationId: 'med-1',
            medicationName: 'Lisinopril',
            scheduledTime: '08:00',
            reminderId: 'rem-1',
          },
          'TOOK_IT',
        ),
      );
      // Flush the AsyncStorage.getItem + api.create promise chain
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateMedicationLog).toHaveBeenCalledWith({
      medicationId: 'med-1',
      medicationName: 'Lisinopril',
      action: 'taken',
      scheduledTime: '08:00',
      reminderId: 'rem-1',
    });
    expect(mockPush).not.toHaveBeenCalled();
    // Should invalidate medication caches
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['medicationSchedule'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['medications'] });
  });

  it('logs skipped when SKIPPED action button is tapped', async () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    await act(async () => {
      cb!(
        makeResponse(
          {
            type: 'medication_reminder',
            medicationId: 'med-2',
            medicationName: 'Metformin',
            scheduledTime: '12:00',
          },
          'SKIPPED',
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateMedicationLog).toHaveBeenCalledWith({
      medicationId: 'med-2',
      medicationName: 'Metformin',
      action: 'skipped',
      scheduledTime: '12:00',
      reminderId: undefined,
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('deduplicates repeated action button taps for the same dose', async () => {
    mockAuthValues.role = 'patient';
    const medData = {
      type: 'medication_reminder',
      medicationId: 'med-dup',
      medicationName: 'Aspirin',
      scheduledTime: '09:00',
    };

    const cb = renderLayout();

    // First tap — should create log
    await act(async () => {
      cb!(makeResponse(medData, 'TOOK_IT'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateMedicationLog).toHaveBeenCalledTimes(1);

    // Second tap — should be deduped
    mockCreateMedicationLog.mockClear();
    await act(async () => {
      cb!(makeResponse(medData, 'TOOK_IT'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockCreateMedicationLog).not.toHaveBeenCalled();
  });

  it('does not log medication action when not authenticated', async () => {
    mockAuthValues.isAuthenticated = false;
    const cb = renderLayout();
    await act(async () => {
      cb!(
        makeResponse(
          {
            type: 'medication_reminder',
            medicationId: 'med-1',
            medicationName: 'Lisinopril',
            scheduledTime: '08:00',
          },
          'TOOK_IT',
        ),
      );
      await Promise.resolve();
    });
    expect(mockCreateMedicationLog).not.toHaveBeenCalled();
  });

  it('does not log when required notification data fields are missing', async () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    // Missing scheduledTime
    await act(async () => {
      cb!(
        makeResponse(
          {
            type: 'medication_reminder',
            medicationId: 'med-1',
            medicationName: 'Lisinopril',
          },
          'TOOK_IT',
        ),
      );
      await Promise.resolve();
    });
    expect(mockCreateMedicationLog).not.toHaveBeenCalled();
  });

  it('routes visit-ready to /visit-detail for patient role', () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'visit-ready', visitId: 'v123' })));
    expect(mockPush).toHaveBeenCalledWith('/visit-detail?id=v123');
  });

  it('routes caregiver_message to /messages for patient role', () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'caregiver_message' })));
    expect(mockPush).toHaveBeenCalledWith('/messages');
  });

  it('routes nudge to /(patient)/ for patient role', () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'nudge' })));
    expect(mockReplace).toHaveBeenCalledWith('/(patient)/');
  });

  // --- Caregiver notification routing ---

  it('routes daily_briefing to /(caregiver)/ for caregiver role', () => {
    mockAuthValues.role = 'caregiver';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'daily_briefing' })));
    expect(mockReplace).toHaveBeenCalledWith('/(caregiver)/');
  });

  it('routes missed_medication_caregiver to patient detail for caregiver role', () => {
    mockAuthValues.role = 'caregiver';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'missed_medication_caregiver', patientId: 'p123' })));
    expect(mockPush).toHaveBeenCalledWith('/(caregiver)/patient/p123');
  });

  it('routes overdue_action_caregiver to patient detail for caregiver role', () => {
    mockAuthValues.role = 'caregiver';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'overdue_action_caregiver', patientId: 'p456' })));
    expect(mockPush).toHaveBeenCalledWith('/(caregiver)/patient/p456');
  });

  it('routes visit_ready_caregiver to patient detail for caregiver role', () => {
    mockAuthValues.role = 'caregiver';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'visit_ready_caregiver', patientId: 'p789' })));
    expect(mockPush).toHaveBeenCalledWith('/(caregiver)/patient/p789');
  });

  // --- Cross-role protection ---

  it('does not route patient notification types when role is caregiver', () => {
    mockAuthValues.role = 'caregiver';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'medication_reminder' })));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not route caregiver notification types when role is patient', () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'missed_medication_caregiver', patientId: 'p123' })));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- Unknown type ---

  it('ignores unknown notification types', () => {
    mockAuthValues.role = 'patient';
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'unknown_type' })));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- Badge count ---

  it('sets caregiver badge to count of high-severity alerts', () => {
    mockAuthValues.role = 'caregiver';
    mockUseCareOverview.mockReturnValue({
      data: {
        patients: [
          {
            patientId: 'p1',
            alerts: [
              { severity: 'high', type: 'missed_checkins', title: 'a', description: 'b', timestamp: '' },
              { severity: 'medium', type: 'other', title: 'c', description: 'd', timestamp: '' },
              { severity: 'high', type: 'medication_trouble', title: 'e', description: 'f', timestamp: '' },
            ],
          },
          {
            patientId: 'p2',
            alerts: [
              { severity: 'high', type: 'missed_checkins', title: 'g', description: 'h', timestamp: '' },
            ],
          },
        ],
      },
    });

    render(<RootLayout />);

    // Should count 3 high-severity alerts across 2 patients
    expect(mockSetBadgeCount).toHaveBeenCalledWith(3);
  });

  it('sets caregiver badge to 0 when no alerts', () => {
    mockAuthValues.role = 'caregiver';
    mockUseCareOverview.mockReturnValue({
      data: { patients: [{ patientId: 'p1', alerts: [] }] },
    });

    render(<RootLayout />);

    expect(mockSetBadgeCount).toHaveBeenCalledWith(0);
  });

  // --- Unauthenticated ---

  it('does not route notifications when not authenticated', () => {
    mockAuthValues.isAuthenticated = false;
    const cb = renderLayout();
    act(() => cb!(makeResponse({ type: 'daily_briefing' })));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
