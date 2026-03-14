import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('react-native', () => {
  const RN = jest.requireActual('../jest/react-native');
  const ReactMod = require('react');
  return {
    ...RN,
    RefreshControl: (props: any) => ReactMod.createElement('RefreshControl', props),
    FlatList: ({ data, renderItem, ListEmptyComponent, keyExtractor, ...rest }: any) => {
      if (!data || data.length === 0) {
        if (ListEmptyComponent) {
          return typeof ListEmptyComponent === 'function'
            ? ReactMod.createElement(ListEmptyComponent)
            : ListEmptyComponent;
        }
        return null;
      }
      return ReactMod.createElement(
        'FlatList',
        rest,
        data.map((item: any, index: number) =>
          ReactMod.createElement(ReactMod.Fragment, { key: keyExtractor?.(item, index) ?? index }, renderItem({ item, index }))
        ),
      );
    },
  };
});

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ patientId: 'p1' }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

let mockMedsData: any[] | null = null;
let mockMedsLoading = false;
let mockMedsRefetching = false;
let mockMedsRefetch = jest.fn();

let mockMedStatusData: any = null;
let mockMedStatusRefetch = jest.fn();

jest.mock('../lib/api/hooks', () => ({
  useCareMedications: () => ({
    data: mockMedsData,
    isLoading: mockMedsLoading,
    isRefetching: mockMedsRefetching,
    refetch: mockMedsRefetch,
  }),
  useCareMedicationStatus: () => ({
    data: mockMedStatusData,
    refetch: mockMedStatusRefetch,
  }),
}));

import MedicationsScreen from '../app/(caregiver)/patient/[patientId]/medications';

describe('CaregiverMedicationListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMedsData = [
      { id: 'm1', name: 'Metformin', dose: '500mg', frequency: 'twice daily', active: true },
      { id: 'm2', name: 'Lisinopril', dose: '10mg', frequency: 'once daily', active: true },
      { id: 'm3', name: 'Ibuprofen', dose: '200mg', active: false, stoppedAt: '2026-03-01T00:00:00Z' },
    ];
    mockMedStatusData = {
      medications: [
        { id: 'm1', name: 'Metformin', dose: '500mg', status: 'taken' },
        { id: 'm2', name: 'Lisinopril', dose: '10mg', status: 'missed' },
      ],
      summary: { taken: 1, skipped: 0, pending: 0, missed: 1, total: 2 },
    };
    mockMedsLoading = false;
    mockMedsRefetching = false;
    mockMedsRefetch = jest.fn();
    mockMedStatusRefetch = jest.fn();
  });

  it('renders medication list', () => {
    const { getByText } = render(<MedicationsScreen />);
    expect(getByText('Metformin')).toBeTruthy();
    expect(getByText('Lisinopril')).toBeTruthy();
  });

  it('shows today status for medications', () => {
    const { getByText } = render(<MedicationsScreen />);
    expect(getByText('taken')).toBeTruthy();
    expect(getByText('missed')).toBeTruthy();
  });

  it('shows inactive label for stopped medications', () => {
    const { getByText } = render(<MedicationsScreen />);
    expect(getByText('Inactive')).toBeTruthy();
  });

  it('does NOT show any edit, delete, or add buttons (read-only)', () => {
    const { queryByText, queryByTestId } = render(<MedicationsScreen />);
    expect(queryByText('Edit')).toBeNull();
    expect(queryByText('Delete')).toBeNull();
    expect(queryByText('Stop')).toBeNull();
    expect(queryByText('Add Medication')).toBeNull();
    expect(queryByTestId('fab')).toBeNull();
  });

  it('shows dose and frequency', () => {
    const { getByText } = render(<MedicationsScreen />);
    expect(getByText(/500mg/)).toBeTruthy();
    expect(getByText(/twice daily/)).toBeTruthy();
  });

  it('shows empty state when no medications', () => {
    mockMedsData = [];
    const { getByText } = render(<MedicationsScreen />);
    expect(getByText('No medications')).toBeTruthy();
  });

  it('shows loading state', () => {
    mockMedsLoading = true;
    const { queryByText } = render(<MedicationsScreen />);
    expect(queryByText('Metformin')).toBeNull();
  });

  it('shows warning for medications with warnings', () => {
    mockMedsData = [
      {
        id: 'm1',
        name: 'Warfarin',
        dose: '5mg',
        active: true,
        medicationWarning: [
          { type: 'drug_interaction', severity: 'high', message: 'Interacts with aspirin' },
        ],
      },
    ];
    const { getByText } = render(<MedicationsScreen />);
    expect(getByText('Interacts with aspirin')).toBeTruthy();
  });
});
