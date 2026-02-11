import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ForgotPasswordScreen from '../app/forgot-password';

const mockResetPassword = jest.fn(async (_email: string) => ({ error: null }));

jest.mock('../lib/auth', () => ({
  resetPassword: (email: string) => mockResetPassword(email),
}));

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    mockResetPassword.mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore();
  });

  it('validates email address', () => {
    const { getByText, getByPlaceholderText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('your@email.com'), 'not-an-email');
    fireEvent.press(getByText('Send Reset Email'));
    expect(getByText('Please enter a valid email address')).toBeTruthy();
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it('submits reset request and shows success alert', async () => {
    const { getByText, getByPlaceholderText } = render(<ForgotPasswordScreen />);
    fireEvent.changeText(getByPlaceholderText('your@email.com'), 'test@example.com');
    fireEvent.press(getByText('Send Reset Email'));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('test@example.com');
      expect(Alert.alert).toHaveBeenCalled();
    });
  });
});
