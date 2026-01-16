import { api } from '@/lib/api/client';

type ShareRecord = {
  type?: 'incoming' | 'outgoing';
  status?: string;
};

export async function resolvePostAuthRedirect(returnTo?: string | null) {
  if (returnTo && returnTo !== '/dashboard') {
    return returnTo;
  }

  try {
    const profile = await api.user.getProfile();
    if (profile?.primaryRole === 'caregiver') {
      return '/care';
    }
    if (profile?.primaryRole === 'patient') {
      return returnTo || '/dashboard';
    }

    const shares = await api.shares.list();
    const incomingAccepted = shares.filter(
      (share: ShareRecord) => share.type === 'incoming' && share.status === 'accepted',
    );
    const outgoingAccepted = shares.filter(
      (share: ShareRecord) => share.type === 'outgoing' && share.status === 'accepted',
    );

    if (incomingAccepted.length > 0 && outgoingAccepted.length === 0) {
      return '/care';
    }
  } catch (error) {
    console.warn('[auth] Failed to resolve post-auth redirect:', error);
  }

  return returnTo || '/dashboard';
}
