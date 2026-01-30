/**
 * Tests for ConsentRequiredModal component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ConsentRequiredModal } from '../../../components/consent/ConsentRequiredModal';

describe('ConsentRequiredModal', () => {
  const defaultProps = {
    visible: true,
    stateCode: 'CA',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with correct state name', () => {
    const { getByText } = render(<ConsentRequiredModal {...defaultProps} />);

    expect(getByText(/California requires all-party consent/)).toBeTruthy();
  });

  it('displays consent required title', () => {
    const { getByText } = render(<ConsentRequiredModal {...defaultProps} />);

    expect(getByText('Consent Required')).toBeTruthy();
  });

  it('shows suggested script for asking consent', () => {
    const { getByText } = render(<ConsentRequiredModal {...defaultProps} />);

    expect(
      getByText(/Do you mind if I record this visit/)
    ).toBeTruthy();
  });

  it('displays legal disclaimer', () => {
    const { getByText } = render(<ConsentRequiredModal {...defaultProps} />);

    expect(getByText(/LumiMD cannot provide legal advice/)).toBeTruthy();
  });

  it('Start Recording button is disabled until checkbox is checked', () => {
    const { getByText } = render(<ConsentRequiredModal {...defaultProps} />);

    const confirmButton = getByText('Start Recording');
    fireEvent.press(confirmButton);

    // Should not call onConfirm because checkbox is not checked
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('enables Start Recording after checkbox is checked', () => {
    const { getByText } = render(<ConsentRequiredModal {...defaultProps} />);

    // Check the checkbox
    const checkbox = getByText('I confirm my provider has consented to recording');
    fireEvent.press(checkbox);

    // Now press confirm
    const confirmButton = getByText('Start Recording');
    fireEvent.press(confirmButton);

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel button is pressed', () => {
    const { getByText } = render(<ConsentRequiredModal {...defaultProps} />);

    fireEvent.press(getByText('Cancel'));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('handles unknown state gracefully', () => {
    const { getByText } = render(
      <ConsentRequiredModal {...defaultProps} stateCode={null} />
    );

    expect(getByText(/your state requires all-party consent/)).toBeTruthy();
  });

  it('renders different state names correctly', () => {
    const { getByText, rerender } = render(
      <ConsentRequiredModal {...defaultProps} stateCode="FL" />
    );

    expect(getByText(/Florida requires all-party consent/)).toBeTruthy();

    rerender(<ConsentRequiredModal {...defaultProps} stateCode="WA" />);

    expect(getByText(/Washington requires all-party consent/)).toBeTruthy();
  });
});
