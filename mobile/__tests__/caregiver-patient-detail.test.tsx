import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ patientId: 'p1' }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

let mockOverviewData: any = null;
let mockOverviewLoading = false;
let mockOverviewRefetching = false;
let mockOverviewRefetch = jest.fn();

let mockMedStatusData: any = null;
let mockMedStatusRefetch = jest.fn();

jest.mock('../lib/api/hooks', () => ({
  useCareQuickOverview: () => ({
    data: mockOverviewData,
    isLoading: mockOverviewLoading,
    isRefetching: mockOverviewRefetching,
    refetch: mockOverviewRefetch,
  }),
  useCareMedicationStatus: () => ({
    data: mockMedStatusData,
    refetch: mockMedStatusRefetch,
  }),
}));

import PatientDetailScreen from '../app/(caregiver)/patient/[patientId]/index';

describe('PatientDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOverviewData = {
      patientName: 'Mom',
      medicationsToday: { taken: 2, skipped: 0, pending: 1, missed: 1, total: 4 },
      pendingActions: 3,
      overdueActions: 1,
      recentActivity: [
        { type: 'visit', description: 'Visit with Dr. Smith completed', timestamp: '2026-03-13T10:00:00Z' },
      ],
      alerts: [
        { type: 'missed_medication', severity: 'high', title: 'Missed dose', description: 'Missed Lisinopril', timestamp: '2026-03-13T09:00:00Z' },
      ],
    };
    mockMedStatusData = {
      medications: [
        { id: 'm1', name: 'Metformin', dose: '500mg', status: 'taken' },
        { id: 'm2', name: 'Lisinopril', dose: '10mg', status: 'missed' },
        { id: 'm3', name: 'Atorvastatin', dose: '20mg', status: 'pending' },
      ],
      summary: { taken: 2, skipped: 0, pending: 1, missed: 1, total: 4 },
    };
    mockOverviewLoading = false;
    mockOverviewRefetching = false;
    mockOverviewRefetch = jest.fn();
    mockMedStatusRefetch = jest.fn();
  });

  it('renders patient name in header', () => {
    const { getByText } = render(<PatientDetailScreen />);
    expect(getByText('Mom')).toBeTruthy();
  });

  it('renders Today\'s Medications section with meds', () => {
    const { getByText } = render(<PatientDetailScreen />);
    expect(getByText("Today's Medications")).toBeTruthy();
    expect(getByText('Metformin')).toBeTruthy();
    expect(getByText('Lisinopril')).toBeTruthy();
  });

  it('shows medication status chips', () => {
    const { getByText } = render(<PatientDetailScreen />);
    expect(getByText('Taken')).toBeTruthy();
    expect(getByText('Pending')).toBeTruthy();
    expect(getByText('Missed')).toBeTruthy();
  });

  it('shows Needs Attention section for high-severity alerts', () => {
    const { getByText } = render(<PatientDetailScreen />);
    expect(getByText('Needs Attention')).toBeTruthy();
    expect(getByText('Missed dose')).toBeTruthy();
  });

  it('shows action items summary with overdue count', () => {
    const { getAllByText, getByText } = render(<PatientDetailScreen />);
    expect(getAllByText('Action Items').length).toBeGreaterThanOrEqual(1);
    expect(getByText('1 overdue')).toBeTruthy();
    expect(getByText('3 pending')).toBeTruthy();
  });

  it('shows recent activity', () => {
    const { getByText } = render(<PatientDetailScreen />);
    expect(getByText(/Visit with Dr. Smith completed/)).toBeTruthy();
  });

  it('renders navigation buttons', () => {
    const { getByText, getAllByText } = render(<PatientDetailScreen />);
    expect(getByText('Visits')).toBeTruthy();
    // "Medications" appears in both card section and nav; "Action Items" also
    expect(getAllByText('Medications').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Action Items').length).toBeGreaterThanOrEqual(1);
    expect(getByText('Messages')).toBeTruthy();
  });

  it('handles missing data gracefully', () => {
    mockOverviewData = {
      patientName: 'Dad',
      medicationsToday: { taken: 0, skipped: 0, pending: 0, missed: 0, total: 0 },
      pendingActions: 0,
      overdueActions: 0,
      recentActivity: [],
      alerts: [],
    };
    mockMedStatusData = { medications: [], summary: { taken: 0, skipped: 0, pending: 0, missed: 0, total: 0 } };

    const { getByText, queryByText } = render(<PatientDetailScreen />);
    expect(getByText('Dad')).toBeTruthy();
    expect(getByText('No medications scheduled today')).toBeTruthy();
    expect(queryByText('Needs Attention')).toBeNull();
    expect(getByText('No pending action items')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockOverviewLoading = true;
    const { queryByText } = render(<PatientDetailScreen />);
    expect(queryByText('Mom')).toBeNull();
  });

  it('navigates to sub-screens on button press', () => {
    const { getByText } = render(<PatientDetailScreen />);

    fireEvent.press(getByText('Visits'));
    expect(mockPush).toHaveBeenCalledWith('/(caregiver)/patient/p1/visits');

    fireEvent.press(getByText('Medications'));
    expect(mockPush).toHaveBeenCalledWith('/(caregiver)/patient/p1/medications');

    fireEvent.press(getByText('Messages'));
    expect(mockPush).toHaveBeenCalledWith('/(caregiver)/patient/p1/messages');
  });
});
