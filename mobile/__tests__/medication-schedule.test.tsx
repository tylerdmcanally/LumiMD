import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MedicationScheduleScreen from '../app/medication-schedule';

const mockUseAuth = jest.fn();
const mockUseMedicationSchedule = jest.fn();
const mockMarkDose = jest.fn();
const mockRefetch = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../lib/api/hooks', () => ({
  useMedicationSchedule: (userId: string, options: any) => mockUseMedicationSchedule(userId, options),
  useMarkDose: () => ({ mutateAsync: mockMarkDose, isPending: false }),
  useMarkBatch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSnoozeDose: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../lib/widget/widgetSync', () => ({
  useWidgetSync: jest.fn(),
  syncMedicationScheduleToWidget: jest.fn(),
}));

describe('MedicationScheduleScreen', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseMedicationSchedule.mockReset();
    mockMarkDose.mockReset();
    mockRefetch.mockReset();
  });

  it('renders summary and allows marking dose as taken', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { uid: 'user-1' } });
    mockUseMedicationSchedule.mockReturnValue({
      data: {
        scheduledDoses: [
          {
            medicationId: 'med-1',
            reminderId: 'rem-1',
            name: 'Lisinopril',
            dose: '10mg',
            scheduledTime: '08:00',
            status: 'pending',
            logId: null,
          },
        ],
        summary: { taken: 0, skipped: 0, pending: 1, total: 1 },
        nextDue: { name: 'Lisinopril', time: '08:00' },
      },
      isLoading: false,
      isRefetching: false,
      refetch: mockRefetch,
      error: null,
    });

    const { getAllByText } = render(<MedicationScheduleScreen />);
    const takenButtons = getAllByText('Taken');
    fireEvent.press(takenButtons[takenButtons.length - 1]);
    expect(mockMarkDose).toHaveBeenCalledWith({
      medicationId: 'med-1',
      scheduledTime: '08:00',
      action: 'taken',
    });
  });

  it('shows retry action when schedule hard-fails to load', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { uid: 'user-1' } });
    mockUseMedicationSchedule.mockReturnValue({
      data: undefined,
      isLoading: false,
      isRefetching: false,
      refetch: mockRefetch,
      error: new Error('network'),
    });

    const { getByText } = render(<MedicationScheduleScreen />);
    fireEvent.press(getByText('Try Again'));

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('keeps cached schedule visible when refetch errors', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { uid: 'user-1' } });
    mockUseMedicationSchedule.mockReturnValue({
      data: {
        scheduledDoses: [
          {
            medicationId: 'med-1',
            reminderId: 'rem-1',
            name: 'Lisinopril',
            dose: '10mg',
            scheduledTime: '08:00',
            status: 'taken',
            logId: 'log-1',
          },
        ],
        summary: { taken: 1, skipped: 0, pending: 0, total: 1 },
        nextDue: null,
      },
      isLoading: false,
      isRefetching: false,
      refetch: mockRefetch,
      error: new Error('temporary refresh failure'),
    });

    const { getByText } = render(<MedicationScheduleScreen />);

    expect(getByText('Showing the last synced schedule. Pull to refresh.')).toBeTruthy();
    expect(getByText('Taken')).toBeTruthy();
  });
});
