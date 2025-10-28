import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  refreshAccessToken,
  LoginResponse,
  RegisterPayload,
} from '@/shared/services/api/auth';
import { updateAuthTokens, registerTokenRefresh } from '@/shared/services/api/client';

interface AuthContextValue {
  user: LoginResponse['user'] | null;
  tokens: LoginResponse['tokens'] | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const STORAGE_KEY = '@lumimd_auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<LoginResponse['user'] | null>(null);
  const [tokens, setTokens] = useState<LoginResponse['tokens'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            user: LoginResponse['user'];
            tokens: LoginResponse['tokens'];
          };

          setUser(parsed.user);
          setTokens(parsed.tokens);
          updateAuthTokens(parsed.tokens);

          // Optionally refresh token on app start
          try {
            const refreshed = await refreshAccessToken(parsed.tokens.refreshToken);
            setTokens(refreshed);
            updateAuthTokens(refreshed);
            await AsyncStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ user: parsed.user, tokens: refreshed })
            );
          } catch (refreshError) {
            console.warn('Failed to refresh access token on startup', refreshError);
            await clearSession();
          }
        }
      } catch (hydrateError) {
        console.error('Failed to hydrate auth state', hydrateError);
        await clearSession();
      } finally {
        setLoading(false);
      }
    };

    hydrate();
  }, []);

  const persistSession = async (
    nextUser: LoginResponse['user'],
    nextTokens: LoginResponse['tokens']
  ) => {
    setUser(nextUser);
    setTokens(nextTokens);
    updateAuthTokens(nextTokens);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: nextUser, tokens: nextTokens }));
  };

  const clearSession = async () => {
    setUser(null);
    setTokens(null);
    updateAuthTokens(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    if (tokens?.refreshToken && user) {
      registerTokenRefresh(async () => {
        try {
          const refreshed = await refreshAccessToken(tokens.refreshToken);
          await persistSession(user, refreshed);
          return refreshed;
        } catch (err) {
          console.warn('Failed to refresh access token', err);
          await clearSession();
          return null;
        }
      });
    } else {
      registerTokenRefresh(null);
    }

    return () => {
      registerTokenRefresh(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens?.refreshToken, user?.id]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await apiLogin(email, password);
      await persistSession(response.user, response.tokens);
      setError(null);
    } catch (err: any) {
      console.error('Login failed', err);
      setError(err.response?.data?.error?.message ?? 'Unable to login. Please try again.');
      await clearSession();
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload: RegisterPayload) => {
    setLoading(true);
    try {
      const response = await apiRegister(payload);
      await persistSession(response.user, response.tokens);
      setError(null);
    } catch (err: any) {
      console.error('Registration failed', err);
      setError(err.response?.data?.error?.message ?? 'Unable to register. Please try again.');
      await clearSession();
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await apiLogout();
    } catch (err) {
      console.warn('Logout call failed', err);
    } finally {
      await clearSession();
      setLoading(false);
      setError(null);
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      tokens,
      loading,
      error,
      login,
      register,
      logout,
      clearError: () => setError(null),
    }),
    [user, tokens, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
