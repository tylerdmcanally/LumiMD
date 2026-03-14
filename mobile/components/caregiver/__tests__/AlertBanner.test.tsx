import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

import { AlertBanner } from '../AlertBanner';

describe('AlertBanner', () => {
  const defaultProps = {
    type: 'missed_medication',
    severity: 'high' as const,
    title: 'Missed dose',
    description: 'Mom may have missed their Metformin dose.',
    patientName: 'Mom',
    timestamp: new Date().toISOString(),
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and description', () => {
    const { getByText } = render(<AlertBanner {...defaultProps} />);
    expect(getByText('Missed dose')).toBeTruthy();
    expect(getByText('Mom may have missed their Metformin dose.')).toBeTruthy();
  });

  it('renders patient name', () => {
    const { getByText } = render(<AlertBanner {...defaultProps} />);
    expect(getByText('Mom')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <AlertBanner {...defaultProps} onPress={onPress} />,
    );
    fireEvent.press(getByText('Missed dose'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without onPress (no crash)', () => {
    const { getByText } = render(
      <AlertBanner {...defaultProps} onPress={undefined} />,
    );
    expect(getByText('Missed dose')).toBeTruthy();
  });

  it('renders medium severity without crash', () => {
    const { getByText } = render(
      <AlertBanner {...defaultProps} severity="medium" title="Overdue action" />,
    );
    expect(getByText('Overdue action')).toBeTruthy();
  });

  it('renders low severity without crash', () => {
    const { getByText } = render(
      <AlertBanner {...defaultProps} severity="low" title="Info" />,
    );
    expect(getByText('Info')).toBeTruthy();
  });

  it('renders without patient name', () => {
    const { getByText, queryByText } = render(
      <AlertBanner {...defaultProps} patientName={undefined} />,
    );
    expect(getByText('Missed dose')).toBeTruthy();
    expect(queryByText('Mom')).toBeNull();
  });
});
