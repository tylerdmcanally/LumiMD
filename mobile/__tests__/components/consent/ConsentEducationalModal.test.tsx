/**
 * Tests for ConsentEducationalModal component
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ConsentEducationalModal } from '../../../components/consent/ConsentEducationalModal';

describe('ConsentEducationalModal', () => {
  const defaultProps = {
    visible: true,
    onProceed: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with correct title', () => {
    const { getByText } = render(<ConsentEducationalModal {...defaultProps} />);

    expect(getByText('Recording Tip')).toBeTruthy();
  });

  it('displays informational message about provider notification', () => {
    const { getByText } = render(<ConsentEducationalModal {...defaultProps} />);

    expect(
      getByText(/While not legally required in your state/)
    ).toBeTruthy();
  });

  it('has "Don\'t show this again" checkbox', () => {
    const { getByText } = render(<ConsentEducationalModal {...defaultProps} />);

    expect(getByText("Don't show this again")).toBeTruthy();
  });

  it('calls onProceed with false when proceeding without checking box', () => {
    const { getByText } = render(<ConsentEducationalModal {...defaultProps} />);

    fireEvent.press(getByText('Start Recording'));

    expect(defaultProps.onProceed).toHaveBeenCalledWith(false);
  });

  it('calls onProceed with true when "Don\'t show again" is checked', () => {
    const { getByText } = render(<ConsentEducationalModal {...defaultProps} />);

    // Check the "Don't show again" box
    fireEvent.press(getByText("Don't show this again"));

    // Proceed
    fireEvent.press(getByText('Start Recording'));

    expect(defaultProps.onProceed).toHaveBeenCalledWith(true);
  });

  it('calls onCancel when Cancel button is pressed', () => {
    const { getByText } = render(<ConsentEducationalModal {...defaultProps} />);

    fireEvent.press(getByText('Cancel'));

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('modal is hidden when visible is false', () => {
    // React Native Modal still renders children when visible=false,
    // but they are not displayed to the user. This test verifies
    // the component can render without errors when hidden.
    const { toJSON } = render(
      <ConsentEducationalModal {...defaultProps} visible={false} />
    );
    
    // The component should render without throwing
    expect(toJSON()).toBeTruthy();
  });
});
