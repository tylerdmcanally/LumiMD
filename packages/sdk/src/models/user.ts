/**
 * User Profile Model
 */

export interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  allergies?: string[];
  tags?: string[];
  folders?: string[];
  roles?: Array<'patient' | 'caregiver'>;
  primaryRole?: 'patient' | 'caregiver' | null;
  createdAt?: string | null;
  updatedAt?: string | null;

  // Subscription fields
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'cancelled' | 'paused';
  subscriptionPlatform?: 'ios' | 'revenuecat' | null;
  subscriptionExpiresAt?: string | null;
  originalTransactionId?: string | null;
  revenuecatAppUserId?: string | null;

  // Session-based trial tracking (3 free visits)
  freeVisitsUsed?: number;

  // Testing/beta bypass
  bypassPaywall?: boolean;

  // Conversion nudge tracking
  nudgeDismissals?: string[];
  lastNudgeShownAt?: Record<string, string>;

  [key: string]: unknown;
}
