import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SignUpScreen from '../app/sign-up';

const mockSignUp = jest.fn(async () => ({ error: null }));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    signUp: mockSignUp,
  }),
}));

describe('SignUpScreen', () => {
  beforeEach(() => {
    mockSignUp.mockClear();
    const { __mockRouter } = jest.requireMock('expo-router');
    __mockRouter.replace.mockClear();
  });

  it('shows validation for password mismatch', () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    fireEvent.changeText(getByPlaceholderText('your@email.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('At least 6 characters'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Re-enter password'), 'different');
    fireEvent.press(getByText('Sign Up'));
    expect(getByText('Passwords do not match')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('submits and navigates to onboarding on success', async () => {
    const { getByPlaceholderText, getByText } = render(<SignUpScreen />);
    fireEvent.changeText(getByPlaceholderText('your@email.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('At least 6 characters'), 'password123');
    fireEvent.changeText(getByPlaceholderText('Re-enter password'), 'password123');
    fireEvent.press(getByText('Sign Up'));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    const { __mockRouter } = jest.requireMock('expo-router');
    expect(__mockRouter.replace).toHaveBeenCalledWith('/onboarding');
  });
});
