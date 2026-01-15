'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { api } from '@/lib/api/client';

interface ViewingContextValue {
  viewingUserId: string | null; // Always the current user's ID (kept for backwards compatibility)
  isCaregiver: boolean;
  incomingShares: Array<{ ownerId: string }>;
}

const ViewingContext = React.createContext<ViewingContextValue | undefined>(undefined);

export function ViewingProvider({ children }: { children: React.ReactNode }) {
  const currentUser = useCurrentUser();
  const currentUserId = currentUser?.uid ?? null;

  // Fetch incoming shares (accepted)
  const { data: shares = [] } = useQuery({
    queryKey: ['shares', currentUserId],
    queryFn: () => api.shares.list(),
    enabled: Boolean(currentUserId),
  });

  const incomingShares = React.useMemo(
    () => shares.filter((s: any) => s.type === 'incoming' && s.status === 'accepted'),
    [shares],
  );

  const isCaregiver = incomingShares.length > 0;

  const value = React.useMemo(
    () => ({
      viewingUserId: currentUserId,
      isCaregiver,
      incomingShares: incomingShares.map((s: any) => ({ ownerId: s.ownerId })),
    }),
    [currentUserId, isCaregiver, incomingShares],
  );

  return <ViewingContext.Provider value={value}>{children}</ViewingContext.Provider>;
}

export function useViewing() {
  const context = React.useContext(ViewingContext);
  if (context === undefined) {
    throw new Error('useViewing must be used within a ViewingProvider');
  }
  return context;
}

/**
 * Safe version of useViewing that returns null instead of throwing
 * when used outside a ViewingProvider. Useful for hooks that need
 * to work both inside and outside the provider context.
 */
export function useViewingSafe() {
  return React.useContext(ViewingContext) ?? null;
}


