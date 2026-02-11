/**
 * AuthContext - Global authentication state management
 * Provides auth state and functions to all components
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { useQueryClient } from '@tanstack/react-query';
import {
  onAuthStateChange,
  signInWithEmail,
  signUpWithEmail,
  signOut as authSignOut,
} from '../lib/auth';
import {
  unregisterAllPushTokens,
  cancelAllScheduledNotifications,
  dismissAllNotifications,
  clearBadge,
  clearStoredPushToken,
} from '../lib/notifications';

interface AuthContextType {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = onAuthStateChange((newUser) => {
      console.log('[AuthContext] Auth state changed:', newUser ? 'signed in' : 'signed out');
      setUser(newUser);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

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
      await authSignOut();
      console.log('[AuthContext] Sign out complete');
    } catch (authErr) {
      console.error('[AuthContext] Firebase sign out failed:', authErr);
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
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
