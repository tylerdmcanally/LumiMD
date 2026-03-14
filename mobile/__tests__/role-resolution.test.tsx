import React from 'react';
import { Text, View } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from '../contexts/AuthContext';

const mockSignInWithEmail = jest.fn();
const mockSignUpWithEmail = jest.fn();
const mockAuthSignOut = jest.fn();

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

jest.mock('../lib/googleAuth', () => ({
  signInWithGoogle: jest.fn().mockResolvedValue({ error: null }),
}));

jest.mock('../lib/appleAuth', () => ({
  signInWithApple: jest.fn().mockResolvedValue({ error: null }),
}));

jest.mock('../lib/notifications', () => ({
  unregisterAllPushTokens: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotifications: jest.fn().mockResolvedValue(undefined),
  dismissAllNotifications: jest.fn().mockResolvedValue(undefined),
  clearBadge: jest.fn().mockResolvedValue(undefined),
  clearStoredPushToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/recordingConsent', () => ({
  clearOnePartyDismissal: jest.fn().mockResolvedValue(undefined),
}));

const mockAsyncStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockAsyncStorage[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockAsyncStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockAsyncStorage[key];
      return Promise.resolve();
    }),
  },
}));

// Mock global fetch for profile API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

function RoleHarness() {
  const { role, roleLoading, isAuthenticated } = useAuth();
  return (
    <View>
      <Text testID="role">{role ?? 'null'}</Text>
      <Text testID="role-loading">{roleLoading ? 'true' : 'false'}</Text>
      <Text testID="auth-state">{isAuthenticated ? 'authenticated' : 'anonymous'}</Text>
    </View>
  );
}

function renderWithAuth() {
  const queryClient = new QueryClient();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RoleHarness />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return result;
}

describe('AuthContext role resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authStateChangeCallback = null;
    Object.keys(mockAsyncStorage).forEach((k) => delete mockAsyncStorage[k]);
    mockFetch.mockReset();
  });

  it('defaults to patient when profile has no role fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u1', email: 'test@test.com' }),
    });

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u1', getIdToken: () => Promise.resolve('token-1') });
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('patient');
      expect(getByTestId('role-loading')).toHaveTextContent('false');
    });
  });

  it('resolves caregiver from primaryRole', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u2', primaryRole: 'caregiver' }),
    });

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u2', getIdToken: () => Promise.resolve('token-2') });
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('caregiver');
    });
  });

  it('resolves caregiver from roles array when primaryRole is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u3', roles: ['caregiver'] }),
    });

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u3', getIdToken: () => Promise.resolve('token-3') });
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('caregiver');
    });
  });

  it('falls back to patient when profile fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u4', getIdToken: () => Promise.resolve('token-4') });
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('patient');
      expect(getByTestId('role-loading')).toHaveTextContent('false');
    });
  });

  it('falls back to patient when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u5', getIdToken: () => Promise.resolve('token-5') });
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('patient');
      expect(getByTestId('role-loading')).toHaveTextContent('false');
    });
  });

  it('resets role to null on sign out', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u6', primaryRole: 'caregiver' }),
    });

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u6', getIdToken: () => Promise.resolve('token-6') });
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('caregiver');
    });

    await act(async () => {
      authStateChangeCallback?.(null);
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('null');
    });
  });

  it('caches resolved role in AsyncStorage', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'u7', primaryRole: 'caregiver' }),
    });

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u7', getIdToken: () => Promise.resolve('token-7') });
    });

    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('caregiver');
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('lumimd:cachedRole', 'caregiver');
  });

  it('uses cached role from AsyncStorage for instant startup', async () => {
    mockAsyncStorage['lumimd:cachedRole'] = 'caregiver';

    // Make the API call slow so we can check the cached value is used first
    mockFetch.mockImplementationOnce(() =>
      new Promise((resolve) =>
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'u8', primaryRole: 'caregiver' }),
        }), 200)
      )
    );

    const { getByTestId } = renderWithAuth();

    await act(async () => {
      authStateChangeCallback?.({ uid: 'u8', getIdToken: () => Promise.resolve('token-8') });
    });

    // Should show cached role before API responds
    await waitFor(() => {
      expect(getByTestId('role')).toHaveTextContent('caregiver');
      expect(getByTestId('role-loading')).toHaveTextContent('false');
    });
  });
});
