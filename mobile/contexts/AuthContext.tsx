/**
 * AuthContext - Global authentication state management
 * Provides auth state and functions to all components
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { 
  onAuthStateChange, 
  signInWithEmail, 
  signUpWithEmail, 
  signOut as authSignOut,
  getCurrentUser
} from '../lib/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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
    try {
      await authSignOut();
    } catch (err) {
      console.error('[AuthContext] Sign out error:', err);
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


