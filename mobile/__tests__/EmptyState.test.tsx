import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '../components/EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    const { getByText } = render(
      <EmptyState
        icon="document-text-outline"
        title="No visits yet"
        description="Record your first visit to see summaries here."
      />,
    );

    expect(getByText('No visits yet')).toBeTruthy();
    expect(getByText('Record your first visit to see summaries here.')).toBeTruthy();
  });

  it('fires action when pressed', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <EmptyState
        icon="cloud-offline-outline"
        title="Offline"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={onAction}
      />,
    );

    fireEvent.press(getByText('Retry'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
