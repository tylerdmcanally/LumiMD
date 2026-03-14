import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ patientId: 'p1', visitId: 'v1' }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

let mockVisitData: any = null;
let mockVisitLoading = false;

jest.mock('../lib/api/hooks', () => ({
  useCareVisitDetail: () => ({
    data: mockVisitData,
    isLoading: mockVisitLoading,
  }),
}));

import VisitDetailScreen from '../app/(caregiver)/patient/[patientId]/visit-detail';

describe('CaregiverVisitDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVisitData = {
      id: 'v1',
      processingStatus: 'completed',
      summary: 'Patient discussed blood pressure management and medication adjustments.',
      provider: 'Dr. Smith',
      specialty: 'Cardiology',
      diagnoses: ['Hypertension', 'Type 2 Diabetes'],
      medications: {
        started: [{ name: 'Amlodipine', dose: '5mg', frequency: 'once daily', reason: 'BP control' }],
        changed: [{ name: 'Metformin', previousDose: '500mg', newDose: '1000mg', reason: 'A1C elevated' }],
        stopped: [],
        continued: [{ name: 'Lisinopril', dose: '10mg', frequency: 'once daily' }],
      },
      nextSteps: ['Follow up in 2 weeks', 'Monitor blood pressure daily'],
      followUps: [{ description: 'Cardiology follow-up', dueDate: '2026-04-01', category: 'clinic_follow_up' }],
      testsOrdered: ['CBC', 'HbA1c'],
      education: {
        keyTakeaways: ['Monitor BP twice daily', 'Take Amlodipine with food'],
        redFlags: ['Chest pain', 'Severe dizziness'],
      },
      createdAt: '2026-03-10T14:00:00Z',
      visitDate: '2026-03-10T14:00:00Z',
      patientName: 'Mom',
    };
    mockVisitLoading = false;
  });

  it('renders summary text', () => {
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText(/blood pressure management/)).toBeTruthy();
  });

  it('shows provider and specialty', () => {
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText(/Dr. Smith/)).toBeTruthy();
    expect(getByText(/Cardiology/)).toBeTruthy();
  });

  it('renders date in readable format', () => {
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText(/March 10, 2026/)).toBeTruthy();
  });

  it('shows diagnoses section', () => {
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText('Diagnoses')).toBeTruthy();
    expect(getByText('Hypertension')).toBeTruthy();
    expect(getByText('Type 2 Diabetes')).toBeTruthy();
  });

  it('shows medications section with started/changed/continued', () => {
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText('Medications')).toBeTruthy();
    expect(getByText('Amlodipine')).toBeTruthy();
    expect(getByText('Metformin')).toBeTruthy();
    expect(getByText('Lisinopril')).toBeTruthy();
  });

  it('shows next steps', () => {
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText('Next Steps')).toBeTruthy();
    expect(getByText('Follow up in 2 weeks')).toBeTruthy();
  });

  it('shows education key takeaways and red flags', () => {
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText('Key Takeaways')).toBeTruthy();
    expect(getByText('Monitor BP twice daily')).toBeTruthy();
    expect(getByText('Warning Signs')).toBeTruthy();
    expect(getByText('Chest pain')).toBeTruthy();
  });

  it('shows processing state for non-completed visits', () => {
    mockVisitData = {
      ...mockVisitData,
      processingStatus: 'processing',
      summary: undefined,
    };
    const { getByText } = render(<VisitDetailScreen />);
    expect(getByText('This visit is still being processed.')).toBeTruthy();
  });

  it('handles visit with minimal data', () => {
    mockVisitData = {
      id: 'v2',
      processingStatus: 'completed',
      createdAt: '2026-03-12T10:00:00Z',
    };
    const { getByText, queryByText } = render(<VisitDetailScreen />);
    expect(getByText('Visit Summary')).toBeTruthy();
    expect(queryByText('Diagnoses')).toBeNull();
    expect(queryByText('Medications')).toBeNull();
    expect(queryByText('Next Steps')).toBeNull();
  });

  it('shows loading state', () => {
    mockVisitLoading = true;
    mockVisitData = null;
    const { queryByText } = render(<VisitDetailScreen />);
    expect(queryByText('Visit Summary')).toBeNull();
  });

  it('shows collapsible sections', () => {
    const { getByText } = render(<VisitDetailScreen />);
    // Diagnoses section is default open
    expect(getByText('Hypertension')).toBeTruthy();

    // Tests section is default collapsed
    expect(getByText('Tests Ordered')).toBeTruthy();
    // Expand it
    fireEvent.press(getByText('Tests Ordered'));
    expect(getByText('CBC')).toBeTruthy();
  });
});
