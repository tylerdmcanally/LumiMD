import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MedicationScheduleScreen from '../app/medication-schedule';

const mockUseAuth = jest.fn();
const mockUseMedicationSchedule = jest.fn();
const mockMarkDose = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('../lib/api/hooks', () => ({
  useMedicationSchedule: (options: any) => mockUseMedicationSchedule(options),
  useMarkDose: () => ({ mutateAsync: mockMarkDose, isPending: false }),
  useMarkBatch: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSnoozeDose: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock('../lib/widget', () => ({
  useWidgetSync: jest.fn(),
  syncMedicationScheduleToWidget: jest.fn(),
}));

describe('MedicationScheduleScreen', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseMedicationSchedule.mockReset();
    mockMarkDose.mockReset();
  });

  it('renders summary and allows marking dose as taken', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
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
      refetch: jest.fn(),
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
});
