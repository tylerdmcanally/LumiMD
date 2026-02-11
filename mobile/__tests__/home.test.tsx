import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import HomeScreen from '../app/index';

const mockUseAuth = jest.fn();
const mockUseUserProfile = jest.fn();
const mockUseRealtimePendingActions = jest.fn();
const mockUseRealtimeVisits = jest.fn();
const mockUseRealtimeActiveMedications = jest.fn();
const mockUseMedicationSchedule = jest.fn();
const mockCleanupOrphanedReminders = jest.fn();
const mockCleanupOrphanedNudges = jest.fn();
const mockTrackEvent = jest.fn();
const mockHandleDismissBanner = jest.fn();
const mockHandleRestoreBanner = jest.fn();
const mockClearPendingShare = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../lib/api/hooks', () => ({
  useUserProfile: (options: unknown) => mockUseUserProfile(options),
  useRealtimePendingActions: (userId: string) => mockUseRealtimePendingActions(userId),
  useRealtimeVisits: (userId: string) => mockUseRealtimeVisits(userId),
  useRealtimeActiveMedications: (userId: string) => mockUseRealtimeActiveMedications(userId),
  useMedicationSchedule: (userId: string, options: unknown) =>
    mockUseMedicationSchedule(userId, options),
  cleanupOrphanedReminders: () => mockCleanupOrphanedReminders(),
  cleanupOrphanedNudges: () => mockCleanupOrphanedNudges(),
}));

jest.mock('../lib/telemetry', () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

jest.mock('../lib/hooks/useVisitSharePrompt', () => ({
  useVisitSharePrompt: () => ({
    pendingShare: null,
    clearPendingShare: mockClearPendingShare,
  }),
}));

jest.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../components/HeroBanner', () => ({
  HeroBanner: () => null,
}));

jest.mock('../components/StartVisitCTA', () => ({
  StartVisitCTA: () => null,
}));

jest.mock('../components/lumibot', () => ({
  LumiBotContainer: () => null,
}));

jest.mock('../components/ShareConfirmationSheet', () => ({
  ShareConfirmationSheet: () => null,
}));

jest.mock('../components/HealthSnapshotCard', () => ({
  HealthSnapshotCard: () => null,
}));

jest.mock('../components/WebPortalBanner', () => ({
  WebPortalBanner: () => null,
  NeedHelpButton: () => null,
  useWebPortalBannerState: () => ({
    isDismissed: false,
    handleDismiss: mockHandleDismissBanner,
    handleRestore: mockHandleRestoreBanner,
  }),
}));

type QueryResult<T> = {
  data: T;
  isLoading: boolean;
  isRefetching: boolean;
  refetch: jest.Mock<Promise<unknown>>;
  error: Error | null;
};

function makeQueryResult<T>(
  data: T,
  overrides?: Partial<Omit<QueryResult<T>, 'data'>>,
): QueryResult<T> {
  return {
    data,
    isLoading: false,
    isRefetching: false,
    refetch: jest.fn(async () => ({ data, error: null })),
    error: null,
    ...overrides,
  };
}

function setupDefaultMocks() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    loading: false,
    user: { uid: 'user-1' },
  });

  mockUseUserProfile.mockReturnValue(
    makeQueryResult(
      {
        firstName: 'Test',
        complete: true,
      },
      undefined,
    ),
  );
  mockUseRealtimePendingActions.mockReturnValue(makeQueryResult([]));
  mockUseRealtimeVisits.mockReturnValue(makeQueryResult([]));
  mockUseRealtimeActiveMedications.mockReturnValue(makeQueryResult([]));
  mockUseMedicationSchedule.mockReturnValue(
    makeQueryResult({
      scheduledDoses: [],
      summary: { taken: 0, skipped: 0, pending: 0, overdue: 0, total: 0 },
      nextDue: null,
    }),
  );
}

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('shows partial-failure banner while still rendering overview cards', () => {
    const actionsRefetch = jest.fn(async () => ({ data: [], error: new Error('actions failed') }));
    mockUseRealtimePendingActions.mockReturnValue(
      makeQueryResult([], {
        error: new Error('actions failed'),
        refetch: actionsRefetch,
      }),
    );

    const { getByText } = render(<HomeScreen />);

    expect(getByText('Some dashboard data could not refresh')).toBeTruthy();
    expect(getByText('Action Items')).toBeTruthy();
    expect(getByText('Recent Visits')).toBeTruthy();
    expect(getByText('Medications')).toBeTruthy();
  });

  it('retries all dashboard queries when banner retry is pressed', async () => {
    const profileRefetch = jest.fn(async () => ({ data: { firstName: 'Test', complete: true }, error: null }));
    const actionsRefetch = jest.fn(async () => ({ data: [], error: null }));
    const visitsRefetch = jest.fn(async () => ({ data: [], error: null }));
    const medsRefetch = jest.fn(async () => ({ data: [], error: null }));
    const scheduleRefetch = jest.fn(async () => ({ data: { summary: { total: 0 } }, error: null }));

    mockUseUserProfile.mockReturnValue(
      makeQueryResult(
        { firstName: 'Test', complete: true },
        {
          refetch: profileRefetch,
        },
      ),
    );
    mockUseRealtimePendingActions.mockReturnValue(
      makeQueryResult([], {
        error: new Error('actions failed'),
        refetch: actionsRefetch,
      }),
    );
    mockUseRealtimeVisits.mockReturnValue(
      makeQueryResult([], {
        refetch: visitsRefetch,
      }),
    );
    mockUseRealtimeActiveMedications.mockReturnValue(
      makeQueryResult([], {
        refetch: medsRefetch,
      }),
    );
    mockUseMedicationSchedule.mockReturnValue(
      makeQueryResult(
        {
          scheduledDoses: [],
          summary: { taken: 0, skipped: 0, pending: 0, overdue: 0, total: 0 },
          nextDue: null,
        },
        {
          refetch: scheduleRefetch,
        },
      ),
    );

    const { getByText } = render(<HomeScreen />);
    fireEvent.press(getByText('Retry'));

    await waitFor(() => {
      expect(profileRefetch).toHaveBeenCalled();
      expect(actionsRefetch).toHaveBeenCalled();
      expect(visitsRefetch).toHaveBeenCalled();
      expect(medsRefetch).toHaveBeenCalled();
      expect(scheduleRefetch).toHaveBeenCalled();
    });

    expect(mockTrackEvent).toHaveBeenCalledWith(
      'home_recovery_attempt',
      expect.objectContaining({
        source: 'banner_retry',
      }),
    );
  });
});
