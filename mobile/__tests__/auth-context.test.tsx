import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '../contexts/AuthContext';

const mockSignInWithEmail = jest.fn();
const mockSignUpWithEmail = jest.fn();
const mockAuthSignOut = jest.fn();
const mockUnregisterAllPushTokens = jest.fn();
const mockCancelAllScheduledNotifications = jest.fn();
const mockDismissAllNotifications = jest.fn();
const mockClearBadge = jest.fn();
const mockClearStoredPushToken = jest.fn();

let authStateChangeCallback: ((user: any | null) => void) | null = null;

jest.mock('../lib/auth', () => ({
  signInWithEmail: (...args: any[]) => mockSignInWithEmail(...args),
  signUpWithEmail: (...args: any[]) => mockSignUpWithEmail(...args),
  signOut: (...args: any[]) => mockAuthSignOut(...args),
  onAuthStateChange: (callback: (user: any | null) => void) => {
    authStateChangeCallback = callback;
    return jest.fn();
  },
}));

jest.mock('../lib/notifications', () => ({
  unregisterAllPushTokens: (...args: any[]) => mockUnregisterAllPushTokens(...args),
  cancelAllScheduledNotifications: (...args: any[]) =>
    mockCancelAllScheduledNotifications(...args),
  dismissAllNotifications: (...args: any[]) => mockDismissAllNotifications(...args),
  clearBadge: (...args: any[]) => mockClearBadge(...args),
  clearStoredPushToken: (...args: any[]) => mockClearStoredPushToken(...args),
  LEGACY_PUSH_TOKEN_STORAGE_KEY: 'lumimd:pushToken',
  LAST_PUSH_TOKEN_STORAGE_KEY: 'lumimd:lastExpoPushToken',
}));

function AuthHarness() {
  const { user, isAuthenticated, signOut } = useAuth();

  return (
    <View>
      <Text testID="auth-user">{user?.uid ?? 'none'}</Text>
      <Text testID="auth-state">{isAuthenticated ? 'authenticated' : 'anonymous'}</Text>
      <Pressable
        testID="auth-signout"
        onPress={() => {
          void signOut();
        }}
      >
        <Text>Sign out</Text>
      </Pressable>
    </View>
  );
}

function renderAuthProvider(queryClient?: QueryClient) {
  const client = queryClient ?? new QueryClient();
  const result = render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...result, queryClient: client };
}

describe('AuthContext hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authStateChangeCallback = null;
    mockSignInWithEmail.mockResolvedValue({ user: null, error: null });
    mockSignUpWithEmail.mockResolvedValue({ user: null, error: null });
    mockAuthSignOut.mockResolvedValue({ error: null });
    mockUnregisterAllPushTokens.mockResolvedValue(undefined);
    mockCancelAllScheduledNotifications.mockResolvedValue(undefined);
    mockDismissAllNotifications.mockResolvedValue(undefined);
    mockClearBadge.mockResolvedValue(undefined);
    mockClearStoredPushToken.mockResolvedValue(undefined);
  });

  it('clears react-query cache when auth user changes', async () => {
    const { getByTestId, queryClient } = renderAuthProvider();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'user-a' });
    });

    await waitFor(() => {
      expect(getByTestId('auth-user')).toHaveTextContent('user-a');
    });

    queryClient.setQueryData(['dashboard', 'user-a'], { value: 'cached' });
    expect(queryClient.getQueryData(['dashboard', 'user-a'])).toEqual({ value: 'cached' });

    await act(async () => {
      authStateChangeCallback?.({ uid: 'user-b' });
    });

    await waitFor(() => {
      expect(getByTestId('auth-user')).toHaveTextContent('user-b');
    });

    expect(queryClient.getQueryData(['dashboard', 'user-a'])).toBeUndefined();
  });

  it('runs full notification + token cleanup flow on sign-out', async () => {
    const { getByTestId } = renderAuthProvider();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'user-1' });
    });

    await waitFor(() => {
      expect(getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    fireEvent.press(getByTestId('auth-signout'));

    await waitFor(() => {
      expect(mockUnregisterAllPushTokens).toHaveBeenCalled();
      expect(mockCancelAllScheduledNotifications).toHaveBeenCalled();
      expect(mockDismissAllNotifications).toHaveBeenCalled();
      expect(mockClearBadge).toHaveBeenCalled();
      expect(mockClearStoredPushToken).toHaveBeenCalled();
      expect(mockAuthSignOut).toHaveBeenCalled();
    });
  });
});
