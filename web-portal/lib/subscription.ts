import { UserProfile } from '@lumimd/sdk';

// Constants
const FREE_VISIT_LIMIT = 3;

export type SubscriptionState = {
  status: 'active' | 'trial' | 'expired';
  freeVisitsUsed?: number;
  freeVisitsRemaining?: number;
  paywallEnabled: boolean;
};

/**
 * Determine the subscription state based on user profile.
 * Uses session-based trial (3 free visits) rather than time-based.
 */
export function getSubscriptionState(profile?: Partial<UserProfile> | null): SubscriptionState {
  const paywallEnabled = process.env.NEXT_PUBLIC_PAYWALL_ENABLED === 'true';

  // If paywall is disabled, always return active
  if (!paywallEnabled) {
    return { status: 'active', paywallEnabled };
  }

  // Check for bypass flag (testing/beta users)
  if (profile?.bypassPaywall === true) {
    return { status: 'active', paywallEnabled };
  }

  // Check for active subscription
  const subscriptionStatus = profile?.subscriptionStatus;
  if (subscriptionStatus === 'active') {
    return { status: 'active', paywallEnabled };
  }

  // Session-based trial: check free visits used
  const freeVisitsUsed = typeof profile?.freeVisitsUsed === 'number'
    ? profile.freeVisitsUsed
    : 0;
  const freeVisitsRemaining = Math.max(0, FREE_VISIT_LIMIT - freeVisitsUsed);

  if (freeVisitsRemaining > 0) {
    return {
      status: 'trial',
      freeVisitsUsed,
      freeVisitsRemaining,
      paywallEnabled,
    };
  }

  // Trial expired (used all free visits)
  return {
    status: 'expired',
    freeVisitsUsed,
    freeVisitsRemaining: 0,
    paywallEnabled,
  };
}

/**
 * Check if the user can record a new visit.
 */
export function canRecordVisit(profile?: Partial<UserProfile> | null): boolean {
  const state = getSubscriptionState(profile);
  return state.status === 'active' || state.status === 'trial';
}
