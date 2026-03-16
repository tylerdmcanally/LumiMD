/**
 * AuthContext - Global authentication state management
 * Provides auth state and functions to all components
 */

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import {
  onAuthStateChange,
  signInWithEmail,
  signUpWithEmail,
  signOut as authSignOut,
} from '../lib/auth';
import { signInWithGoogle } from '../lib/googleAuth';
import { signInWithApple } from '../lib/appleAuth';
import {
  unregisterAllPushTokens,
  cancelAllScheduledNotifications,
  dismissAllNotifications,
  clearBadge,
  clearStoredPushToken,
} from '../lib/notifications';
import { clearOnePartyDismissal } from '../lib/recordingConsent';

const ROLE_CACHE_KEY = 'lumimd:cachedRole';
const ROLE_OVERRIDE_KEY = 'lumimd:roleOverride';

export type UserRole = 'patient' | 'caregiver';

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  role: UserRole | null;
  roleLoading: boolean;
  availableRoles: UserRole[];
  setRoleOverride: (role: UserRole) => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInGoogle: () => Promise<{ error: string | null }>;
  signInApple: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([]);
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);
  const roleResolutionRef = useRef(0); // guards against stale fetches

  const setRoleOverride = useCallback((newRole: UserRole) => {
    setRole(newRole);
    AsyncStorage.setItem(ROLE_OVERRIDE_KEY, newRole).catch(() => {});
    AsyncStorage.setItem(ROLE_CACHE_KEY, newRole).catch(() => {});
  }, []);

  const resolveRole = useCallback(async (currentUser: FirebaseAuthTypes.User | null) => {
    if (!currentUser) {
      setRole(null);
      setAvailableRoles([]);
      setRoleLoading(false);
      await AsyncStorage.removeItem(ROLE_CACHE_KEY).catch(() => {});
      await AsyncStorage.removeItem(ROLE_OVERRIDE_KEY).catch(() => {});
      return;
    }

    const resolutionId = ++roleResolutionRef.current;

    // Signal that role is being resolved — prevents the role router from
    // acting on a stale null role while we fetch the profile.
    setRoleLoading(true);

    // Use cached role for instant startup while we fetch
    try {
      const cached = await AsyncStorage.getItem(ROLE_CACHE_KEY);
      if (cached === 'caregiver' || cached === 'patient') {
        if (resolutionId === roleResolutionRef.current) {
          setRole(cached);
          setRoleLoading(false);
        }
      }
    } catch {
      // Cache miss — no problem, we'll fetch
    }

    try {
      const token = await currentUser.getIdToken();
      const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api';
      const response = await fetch(`${baseUrl}/v1/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });

      if (resolutionId !== roleResolutionRef.current) return; // stale

      if (!response.ok) {
        console.warn('[AuthContext] Profile fetch failed, falling back to patient');
        setRole('patient');
        setAvailableRoles(['patient']);
        setRoleLoading(false);
        return;
      }

      const profile = await response.json();

      // Determine available roles from profile
      const roles: UserRole[] = [];
      if (Array.isArray(profile.roles)) {
        if (profile.roles.includes('patient')) roles.push('patient');
        if (profile.roles.includes('caregiver')) roles.push('caregiver');
      }
      if (roles.length === 0) roles.push('patient'); // fallback

      let resolved: UserRole = 'patient';

      if (profile.primaryRole === 'caregiver' || profile.primaryRole === 'patient') {
        resolved = profile.primaryRole;
      } else if (roles.includes('caregiver')) {
        resolved = 'caregiver';
      }

      if (resolutionId !== roleResolutionRef.current) return; // stale

      // Check for persisted role override (from user switching)
      const override = await AsyncStorage.getItem(ROLE_OVERRIDE_KEY).catch(() => null);
      if (override === 'patient' || override === 'caregiver') {
        if (roles.includes(override)) {
          resolved = override;
        }
      }

      console.log('[AuthContext] Role resolved:', resolved, 'available:', roles);
      setAvailableRoles(roles);
      setRole(resolved);
      setRoleLoading(false);
      await AsyncStorage.setItem(ROLE_CACHE_KEY, resolved).catch(() => {});
    } catch (err) {
      console.warn('[AuthContext] Role resolution error, falling back to patient:', err);
      if (resolutionId === roleResolutionRef.current) {
        setRole('patient');
        setAvailableRoles(['patient']);
        setRoleLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange((newUser) => {
      console.log('[AuthContext] Auth state changed:', newUser ? 'signed in' : 'signed out');
      setUser(newUser);
      setLoading(false);
      resolveRole(newUser);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, [resolveRole]);

  // Re-resolve role on AppState foreground (catches role changes made on web)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && user) {
        resolveRole(user);
      }
    });
    return () => subscription.remove();
  }, [user, resolveRole]);

  // Clear all cached query data when account context changes.
  useEffect(() => {
    const nextUserId = user?.uid ?? null;
    if (previousUserIdRef.current === nextUserId) {
      return;
    }

    previousUserIdRef.current = nextUserId;
    queryClient.clear();
    console.log('[AuthContext] Cleared query cache after auth user change');
  }, [user?.uid, queryClient]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        return { error: formatErrorMessage(error) };
      }
      return { error: null };
    } catch (err: any) {
      return { error: formatErrorMessage(err.message) };
    }
  };

  const signUp = async (email: string, password: string) => {
    try {
      const { error } = await signUpWithEmail(email, password);
      if (error) {
        return { error: formatErrorMessage(error) };
      }
      return { error: null };
    } catch (err: any) {
      return { error: formatErrorMessage(err.message) };
    }
  };

  const signInGoogle = async () => {
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        return { error };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Failed to sign in with Google' };
    }
  };

  const signInApple = async () => {
    try {
      const { error } = await signInWithApple();
      if (error) {
        return { error };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Failed to sign in with Apple' };
    }
  };

  const signOut = async () => {
    // Run all cleanup steps independently so one failure doesn't skip the rest.
    try {
      console.log('[AuthContext] Unregistering all push tokens before sign out...');
      await unregisterAllPushTokens();
    } catch (err) {
      console.error('[AuthContext] Failed to unregister push tokens during sign out:', err);
    }

    try {
      await cancelAllScheduledNotifications();
    } catch (err) {
      console.error('[AuthContext] Failed to cancel scheduled notifications during sign out:', err);
    }

    try {
      await dismissAllNotifications();
    } catch (err) {
      console.error('[AuthContext] Failed to dismiss notifications during sign out:', err);
    }

    try {
      await clearBadge();
    } catch (err) {
      console.error('[AuthContext] Failed to clear badge during sign out:', err);
    }

    try {
      await clearStoredPushToken();
    } catch (err) {
      console.error('[AuthContext] Failed to clear local push token during sign out:', err);
    }

    try {
      await clearOnePartyDismissal();
    } catch (err) {
      console.error('[AuthContext] Failed to clear consent dismissal during sign out:', err);
    }

    try {
      await AsyncStorage.removeItem(ROLE_CACHE_KEY);
      await AsyncStorage.removeItem(ROLE_OVERRIDE_KEY);
    } catch (err) {
      console.error('[AuthContext] Failed to clear cached role during sign out:', err);
    }

    try {
      await authSignOut();
      console.log('[AuthContext] Sign out complete');
    } catch (authErr) {
      console.error('[AuthContext] Firebase sign out failed:', authErr);
    }
  };

  const value = {
    user,
    loading,
    role,
    roleLoading,
    availableRoles,
    setRoleOverride,
    signIn,
    signUp,
    signInGoogle,
    signInApple,
    signOut,
    isAuthenticated: user !== null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Format Firebase error messages to be user-friendly
 */
function formatErrorMessage(error: string): string {
  // Firebase error codes come in format: Firebase: Error (auth/error-code)
  const match = error.match(/\(auth\/([^)]+)\)/);
  if (!match) return error;

  const errorCode = match[1];

  const messages: Record<string, string> = {
    'email-already-in-use': 'This email is already registered. Try signing in instead.',
    'invalid-email': 'Please enter a valid email address.',
    'weak-password': 'Password should be at least 6 characters.',
    'user-not-found': 'No account found with this email.',
    'wrong-password': 'Incorrect password. Please try again.',
    'too-many-requests': 'Too many failed attempts. Please try again later.',
    'network-request-failed': 'Network error. Please check your connection.',
    'invalid-credential': 'Invalid email or password. Please try again.',
  };

  return messages[errorCode] || 'An error occurred. Please try again.';
}
