import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SignInScreen from '../app/sign-in';

const mockSignIn = jest.fn(async () => ({ error: null }));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
  }),
}));

describe('SignInScreen', () => {
  beforeEach(() => {
    mockSignIn.mockClear();
    const { __mockRouter } = jest.requireMock('expo-router');
    __mockRouter.replace.mockClear();
  });

  it('validates empty fields', () => {
    const { getByText } = render(<SignInScreen />);
    fireEvent.press(getByText('Sign In'));
    expect(getByText('Please enter both email and password')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('submits credentials and navigates on success', async () => {
    const { getByPlaceholderText, getByText } = render(<SignInScreen />);
    fireEvent.changeText(getByPlaceholderText('your@email.com'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('••••••••'), 'password123');
    fireEvent.press(getByText('Sign In'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    const { __mockRouter } = jest.requireMock('expo-router');
    expect(__mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
