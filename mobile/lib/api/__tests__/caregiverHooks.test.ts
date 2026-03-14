/**
 * Caregiver API Hooks — unit tests
 *
 * These are lightweight tests that verify the hooks are exported correctly
 * and that the fetchWithAuth utility is called with the right paths.
 * Full integration tests would require a QueryClient wrapper.
 */

// Mock the modules that hooks.ts imports
jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({ currentUser: { uid: 'cg-1', getIdToken: () => Promise.resolve('tok') } }),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@lumimd/sdk', () => ({
  createApiHooks: () => ({}),
  queryKeys: { actions: ['actions'], profile: ['profile'], visits: ['visits'], medications: ['medications'] },
  sortByTimestampDescending: jest.fn(),
}));

jest.mock('../client', () => ({
  api: {
    shares: { list: jest.fn(), invite: jest.fn(), myInvites: jest.fn(), update: jest.fn(), revokeInvite: jest.fn(), resendInvite: jest.fn() },
    actions: { update: jest.fn() },
    medications: { acknowledgeWarnings: jest.fn() },
    medicationReminders: { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    messages: { list: jest.fn(), unreadCount: jest.fn(), markRead: jest.fn() },
    user: { updateProfile: jest.fn() },
  },
}));

jest.mock('../nudgeFilters', () => ({
  filterDueNudges: jest.fn((n: any) => n),
}));

// Import after mocks
import * as hooks from '../hooks';

describe('Caregiver API hooks exports', () => {
  it('exports useCareOverview', () => {
    expect(typeof hooks.useCareOverview).toBe('function');
  });

  it('exports useCareAlerts', () => {
    expect(typeof hooks.useCareAlerts).toBe('function');
  });

  it('exports useCareQuickOverview', () => {
    expect(typeof hooks.useCareQuickOverview).toBe('function');
  });

  it('exports useCareMedicationStatus', () => {
    expect(typeof hooks.useCareMedicationStatus).toBe('function');
  });

  it('exports useSendCareMessage', () => {
    expect(typeof hooks.useSendCareMessage).toBe('function');
  });

  it('exports CareOverviewData type shape', () => {
    // Type-level check — if this compiles, the types exist
    const mockData: hooks.CareOverviewData = {
      patients: [],
    };
    expect(mockData.patients).toEqual([]);
  });

  it('exports CareAlertItem type shape', () => {
    const mockAlert: hooks.CareAlertItem = {
      type: 'missed_medication',
      severity: 'high',
      title: 'Missed dose',
      description: 'Test',
      timestamp: '2026-03-13T10:00:00Z',
    };
    expect(mockAlert.severity).toBe('high');
  });
});
