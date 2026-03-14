import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

let mockAuthValues = {
  user: { displayName: 'Jane Smith', uid: 'cg-1' },
  role: 'caregiver',
  roleLoading: false,
  isAuthenticated: true,
  loading: false,
};

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthValues,
}));

let mockOverviewData: any = {
  patients: [
    {
      patientId: 'p1',
      patientName: 'Mom',
      medicationsToday: { taken: 2, total: 4 },
      pendingActions: 1,
      alerts: [
        {
          type: 'missed_medication',
          severity: 'high',
          title: 'Missed dose',
          description: 'Missed Metformin dose',
          timestamp: new Date().toISOString(),
        },
      ],
      lastActive: new Date().toISOString(),
    },
  ],
};
let mockIsLoading = false;
let mockIsRefetching = false;
let mockRefetch = jest.fn();
let mockError: Error | null = null;

jest.mock('../lib/api/hooks', () => ({
  useCareOverview: () => ({
    data: mockOverviewData,
    isLoading: mockIsLoading,
    isRefetching: mockIsRefetching,
    refetch: mockRefetch,
    error: mockError,
  }),
}));

import CaregiverHomeScreen from '../app/(caregiver)/index';

describe('CaregiverHomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOverviewData = {
      patients: [
        {
          patientId: 'p1',
          patientName: 'Mom',
          medicationsToday: { taken: 2, total: 4 },
          pendingActions: 1,
          alerts: [
            {
              type: 'missed_medication',
              severity: 'high',
              title: 'Missed dose',
              description: 'Missed Metformin dose',
              timestamp: new Date().toISOString(),
            },
          ],
          lastActive: new Date().toISOString(),
        },
      ],
    };
    mockIsLoading = false;
    mockIsRefetching = false;
    mockRefetch = jest.fn();
    mockError = null;
    mockAuthValues = {
      user: { displayName: 'Jane Smith', uid: 'cg-1' },
      role: 'caregiver',
      roleLoading: false,
      isAuthenticated: true,
      loading: false,
    };
  });

  it('renders patient overview with patient card', () => {
    const { getByText } = render(<CaregiverHomeScreen />);
    expect(getByText('Your Patients')).toBeTruthy();
    // "Mom" appears in both alerts and patient card
    const moms = render(<CaregiverHomeScreen />).getAllByText('Mom');
    expect(moms.length).toBeGreaterThanOrEqual(1);
  });

  it('shows time-aware greeting with user name', () => {
    const { getByText } = render(<CaregiverHomeScreen />);
    // The greeting should contain "Jane" (first name from displayName)
    const greeting = getByText(/Jane/);
    expect(greeting).toBeTruthy();
  });

  it('shows Needs Attention section for high/medium alerts', () => {
    const { getByText } = render(<CaregiverHomeScreen />);
    expect(getByText('Needs Attention')).toBeTruthy();
    expect(getByText('Missed dose')).toBeTruthy();
  });

  it('shows empty state when no patients', () => {
    mockOverviewData = { patients: [] };
    const { getByText } = render(<CaregiverHomeScreen />);
    expect(getByText('No patients yet')).toBeTruthy();
    expect(getByText(/Once your patient accepts/)).toBeTruthy();
  });

  it('shows loading indicator when isLoading', () => {
    mockIsLoading = true;
    const { queryByText } = render(<CaregiverHomeScreen />);
    // Should not show patient data while loading
    expect(queryByText('Mom')).toBeNull();
  });

  it('shows error banner on error', () => {
    mockError = new Error('Network fail');
    const { getByText } = render(<CaregiverHomeScreen />);
    expect(getByText(/Unable to load data/)).toBeTruthy();
  });

  it('does not show Needs Attention for low-severity-only alerts', () => {
    mockOverviewData = {
      patients: [
        {
          patientId: 'p1',
          patientName: 'Mom',
          medicationsToday: { taken: 4, total: 4 },
          pendingActions: 0,
          alerts: [
            {
              type: 'info',
              severity: 'low',
              title: 'All clear',
              description: 'Nothing to worry about',
              timestamp: new Date().toISOString(),
            },
          ],
          lastActive: new Date().toISOString(),
        },
      ],
    };
    const { queryByText } = render(<CaregiverHomeScreen />);
    expect(queryByText('Needs Attention')).toBeNull();
  });
});
