/**
 * SubscriptionContext - Global subscription state management
 * Provides subscription status and free visit tracking to all components
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from './AuthContext';
import { useUserProfile } from '../lib/api/hooks';
import {
  configureRevenueCat,
  getOfferings,
  purchasePackage,
  restorePurchases,
  logOutRevenueCat,
  Package,
} from '../lib/store';

// Constants
const FREE_VISIT_LIMIT = 3;

export type SubscriptionStatus = 'loading' | 'free' | 'subscribed' | 'trial_expired';

interface SubscriptionContextType {
  // Status
  status: SubscriptionStatus;
  isSubscribed: boolean;
  isLoading: boolean;

  // Free visit tracking
  freeVisitsUsed: number;
  freeVisitsRemaining: number;
  hasTrialVisitsLeft: boolean;

  // Paywall enabled flag
  paywallEnabled: boolean;

  // Actions
  showPaywall: () => void;
  refreshSubscription: () => Promise<void>;

  // RevenueCat offerings
  offerings: Package[];
  loadOfferings: () => Promise<void>;
  purchase: (pkg: Package) => Promise<{ success: boolean; error?: string }>;
  restore: () => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { data: userProfile, refetch: refetchProfile } = useUserProfile({
    enabled: isAuthenticated && !!user,
  });

  const [offerings, setOfferings] = useState<Package[]>([]);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);

  // Check if paywall is enabled via environment variable
  const paywallEnabled = process.env.EXPO_PUBLIC_PAYWALL_ENABLED === 'true';

  // Extract subscription data from user profile
  const subscriptionStatus = userProfile?.subscriptionStatus;
  const subscriptionExpiresAt = userProfile?.subscriptionExpiresAt;
  const freeVisitsUsed = typeof userProfile?.freeVisitsUsed === 'number'
    ? userProfile.freeVisitsUsed
    : 0;
  const bypassPaywall = userProfile?.bypassPaywall === true;

  // Calculate derived state
  // Allow access if: active subscription, cancelled but not expired, or bypass enabled
  const isActiveSubscription = subscriptionStatus === 'active';
  const isCancelledButValid = subscriptionStatus === 'cancelled' &&
    subscriptionExpiresAt &&
    new Date(subscriptionExpiresAt) > new Date();
  const isSubscribed = isActiveSubscription || isCancelledButValid || bypassPaywall;
  const freeVisitsRemaining = Math.max(0, FREE_VISIT_LIMIT - freeVisitsUsed);
  const hasTrialVisitsLeft = freeVisitsRemaining > 0;

  // Determine overall status
  let status: SubscriptionStatus = 'loading';
  if (userProfile !== undefined) {
    if (isSubscribed) {
      status = 'subscribed';
    } else if (hasTrialVisitsLeft) {
      status = 'free';
    } else {
      status = 'trial_expired';
    }
  }

  const isLoading = userProfile === undefined;

  // Configure RevenueCat when user changes
  useEffect(() => {
    if (user?.uid) {
      configureRevenueCat(user.uid);
    }
  }, [user?.uid]);

  // Log out from RevenueCat when user signs out
  useEffect(() => {
    if (!isAuthenticated) {
      logOutRevenueCat();
    }
  }, [isAuthenticated]);

  // Load offerings from RevenueCat
  const loadOfferings = useCallback(async () => {
    if (isLoadingOfferings) return;

    setIsLoadingOfferings(true);
    try {
      const pkgs = await getOfferings();
      setOfferings(pkgs);
    } catch (error) {
      console.error('[Subscription] Failed to load offerings:', error);
    } finally {
      setIsLoadingOfferings(false);
    }
  }, [isLoadingOfferings]);

  // Navigate to paywall screen
  const showPaywall = useCallback(() => {
    router.push('/paywall');
  }, [router]);

  // Refresh subscription status from server
  const refreshSubscription = useCallback(async () => {
    await refetchProfile();
  }, [refetchProfile]);

  // Purchase a package
  const purchase = useCallback(async (pkg: Package) => {
    const result = await purchasePackage(pkg);

    if (result.success) {
      // Refresh user profile to get updated subscription status
      await refreshSubscription();
    }

    return {
      success: result.success,
      error: result.userCancelled ? undefined : result.error,
    };
  }, [refreshSubscription]);

  // Restore purchases
  const restore = useCallback(async () => {
    const restored = await restorePurchases();

    if (restored) {
      // Refresh user profile to get updated subscription status
      await refreshSubscription();
    }

    return restored;
  }, [refreshSubscription]);

  const value: SubscriptionContextType = {
    status,
    isSubscribed: !paywallEnabled || isSubscribed,
    isLoading,
    freeVisitsUsed,
    freeVisitsRemaining,
    hasTrialVisitsLeft: !paywallEnabled || hasTrialVisitsLeft || isSubscribed,
    paywallEnabled,
    showPaywall,
    refreshSubscription,
    offerings,
    loadOfferings,
    purchase,
    restore,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

/**
 * Hook to access subscription context
 */
export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

/**
 * Hook to check if user can record a visit
 * Returns { canRecord, showPaywall } - call showPaywall() if canRecord is false
 */
export function useCanRecord() {
  const { isSubscribed, hasTrialVisitsLeft, showPaywall, paywallEnabled } = useSubscription();

  const canRecord = !paywallEnabled || isSubscribed || hasTrialVisitsLeft;

  return {
    canRecord,
    showPaywall,
  };
}
