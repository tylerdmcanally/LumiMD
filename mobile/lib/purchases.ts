// Placeholder RevenueCat helper.
// Replace with real RevenueCat integration when keys are available.
import * as React from 'react';

type EntitlementStatus = 'active' | 'inactive';

export type SubscriptionState = {
  status: 'active' | 'trial' | 'expired' | 'unknown';
  daysLeft?: number;
};

export function useSubscriptionState({
  trialEndsAt,
  subscriptionStatus,
}: {
  trialEndsAt?: string | null;
  subscriptionStatus?: string | null;
}): SubscriptionState {
  const PAYWALL_ENABLED = process.env.EXPO_PUBLIC_PAYWALL_ENABLED === 'true';
  const [state, setState] = React.useState<SubscriptionState>({ status: 'unknown' });

  React.useEffect(() => {
    if (!PAYWALL_ENABLED) {
      setState({ status: 'active' });
      return;
    }

    const now = Date.now();
    const trialEnds = trialEndsAt ? Date.parse(trialEndsAt) : null;
    const inTrial = typeof trialEnds === 'number' && trialEnds > now;

    if (subscriptionStatus === 'active') {
      setState({ status: 'active' });
      return;
    }

    if (inTrial) {
      const daysLeft = Math.max(0, Math.ceil((trialEnds! - now) / (1000 * 60 * 60 * 24)));
      setState({ status: 'trial', daysLeft });
      return;
    }

    setState({ status: 'expired' });
  }, [trialEndsAt, subscriptionStatus, PAYWALL_ENABLED]);

  return state;
}

// Stubbed purchase handler. Wire this up to RevenueCat later.
export async function startSubscriptionPurchase(): Promise<EntitlementStatus> {
  // TODO: integrate RevenueCat's SDK purchase flow.
  return 'inactive';
}


