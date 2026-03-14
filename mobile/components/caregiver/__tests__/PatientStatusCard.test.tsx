import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

import { PatientStatusCard } from '../PatientStatusCard';

describe('PatientStatusCard', () => {
  const defaultProps = {
    name: 'Mom',
    medicationsToday: { taken: 3, total: 4 },
    pendingActions: 2,
    lastActive: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders patient name', () => {
    const { getByText } = render(<PatientStatusCard {...defaultProps} />);
    expect(getByText('Mom')).toBeTruthy();
  });

  it('renders medication progress', () => {
    const { getByText } = render(<PatientStatusCard {...defaultProps} />);
    expect(getByText('3/4')).toBeTruthy();
  });

  it('renders pending action count', () => {
    const { getByText } = render(<PatientStatusCard {...defaultProps} />);
    expect(getByText('2')).toBeTruthy();
  });

  it('shows "No medications" when total is 0', () => {
    const { getByText } = render(
      <PatientStatusCard
        {...defaultProps}
        medicationsToday={{ taken: 0, total: 0 }}
      />,
    );
    expect(getByText('No medications')).toBeTruthy();
  });

  it('handles null medicationsToday gracefully', () => {
    const { getByText } = render(
      <PatientStatusCard {...defaultProps} medicationsToday={null} />,
    );
    expect(getByText('No medications')).toBeTruthy();
  });

  it('shows "No recent activity" when lastActive is null', () => {
    const { getByText } = render(
      <PatientStatusCard {...defaultProps} lastActive={null} />,
    );
    expect(getByText('No recent activity')).toBeTruthy();
  });

  it('renders avatar initial from name', () => {
    const { getByText } = render(<PatientStatusCard {...defaultProps} />);
    expect(getByText('M')).toBeTruthy();
  });
});
