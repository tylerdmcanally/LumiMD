import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GlanceableCard } from '../components/GlanceableCard';

describe('GlanceableCard', () => {
  it('renders count, label, and badge', () => {
    const { getByText } = render(
      <GlanceableCard
        title="Recent Visits"
        count={3}
        countLabel="visits"
        statusBadge={{ text: 'Ready', color: '#10B981' }}
        onPress={() => {}}
      />,
    );

    expect(getByText('Recent Visits')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
    expect(getByText('visits')).toBeTruthy();
    expect(getByText('Ready')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <GlanceableCard
        title="Action Items"
        count={5}
        countLabel="pending"
        onPress={onPress}
      />,
    );

    fireEvent.press(getByText('Action Items'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
