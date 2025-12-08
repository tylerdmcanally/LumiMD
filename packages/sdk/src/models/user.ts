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
  createdAt?: string | null;
  updatedAt?: string | null;
  // Subscription fields
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'cancelled';
  subscriptionPlatform?: 'ios' | null;
  subscriptionExpiresAt?: string | null;
  originalTransactionId?: string | null;
  [key: string]: unknown;
}
