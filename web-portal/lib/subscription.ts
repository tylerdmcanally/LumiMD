import { UserProfile } from '@lumimd/sdk';

export type SubscriptionState = {
  status: 'active' | 'trial' | 'expired';
  daysLeft?: number;
  paywallEnabled: boolean;
};

export function getSubscriptionState(profile?: Partial<UserProfile> | null): SubscriptionState {
  const paywallEnabled = process.env.NEXT_PUBLIC_PAYWALL_ENABLED === 'true';
  if (!paywallEnabled) {
    return { status: 'active', paywallEnabled };
  }

  const now = Date.now();
  const trialEnds =
    typeof profile?.trialEndsAt === 'string' && profile.trialEndsAt
      ? Date.parse(profile.trialEndsAt)
      : null;
  const subscriptionStatus =
    typeof profile?.subscriptionStatus === 'string' ? profile.subscriptionStatus : 'trial';

  if (subscriptionStatus === 'active') {
    return { status: 'active', paywallEnabled };
  }

  const inTrial = typeof trialEnds === 'number' && trialEnds > now;
  if (inTrial) {
    const daysLeft = Math.max(0, Math.ceil((trialEnds - now) / (1000 * 60 * 60 * 24)));
    return { status: 'trial', daysLeft, paywallEnabled };
  }

  return { status: 'expired', paywallEnabled };
}


