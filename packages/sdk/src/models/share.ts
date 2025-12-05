/**
 * Share and ShareInvite Models
 */

export interface Share {
  id: string;
  ownerId: string;
  caregiverUserId: string;
  caregiverEmail: string;
  role: 'viewer';
  status: 'pending' | 'accepted' | 'revoked';
  message?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  acceptedAt?: string | null;
  type?: 'outgoing' | 'incoming';
}

export interface ShareInvite {
  id: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  inviteeEmail: string;
  role: 'viewer';
  status: 'pending' | 'accepted' | 'expired';
  message?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
}

