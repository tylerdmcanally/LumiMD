/**
 * Subscription Context
 *
 * Provides subscription status to the app. The source of truth is the Firestore
 * user profile (subscriptionStatus, trialEndsAt), which is updated by:
 * - Backend on user creation (sets trial)
 * - App Store Server Notifications webhook (updates on purchase/renewal/expiry)
 *
 * This context simply reads from the user profile and exposes the status.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useUserProfile } from '../api/hooks';
import { useAuth } from '../../contexts/AuthContext';

export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'unknown';

type SubscriptionContextValue = {
  status: SubscriptionStatus;
  isActive: boolean;
  daysLeft?: number;
  isLoading: boolean;
};

const SubscriptionContext = createContext<SubscriptionContextValue>({
  status: 'unknown',
  isActive: false,
  isLoading: true,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const { data: profile, isLoading } = useUserProfile(user?.uid);

  const value = useMemo<SubscriptionContextValue>(() => {
    if (!isAuthenticated || isLoading) {
      return { status: 'unknown', isActive: false, isLoading: true };
    }

    const subscriptionStatus = profile?.subscriptionStatus as string | undefined;
    const trialEndsAt = profile?.trialEndsAt as string | undefined;

    // Check if actively subscribed
    if (subscriptionStatus === 'active') {
      return { status: 'active', isActive: true, isLoading: false };
    }

    // Check if in trial period
    if (trialEndsAt) {
      const trialEnd = new Date(trialEndsAt).getTime();
      const now = Date.now();
      if (trialEnd > now) {
        const daysLeft = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
        return { status: 'trial', isActive: true, daysLeft, isLoading: false };
      }
    }

    // Trial/subscription expired
    return { status: 'expired', isActive: false, isLoading: false };
  }, [isAuthenticated, isLoading, profile?.subscriptionStatus, profile?.trialEndsAt]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export const useSubscription = () => useContext(SubscriptionContext);
