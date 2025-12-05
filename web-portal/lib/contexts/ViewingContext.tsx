'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { api } from '@/lib/api/client';

interface ViewingContextValue {
  viewingUserId: string | null; // effective ID (self or selected share owner)
  setViewingUserId: (userId: string | null) => void;
  isViewingSelf: boolean;
  isViewingShared: boolean;
  isCaregiver: boolean;
  incomingShares: Array<{ ownerId: string }>;
}

const ViewingContext = React.createContext<ViewingContextValue | undefined>(undefined);

export function ViewingProvider({ children }: { children: React.ReactNode }) {
  const currentUser = useCurrentUser();
  const currentUserId = currentUser?.uid ?? null;
  const [selectedViewingUserId, setSelectedViewingUserId] = React.useState<string | null>(null);

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

  // Reset to self if current user changes
  React.useEffect(() => {
    if (currentUserId) {
      // If viewing someone else and current user changes, reset to self
      if (selectedViewingUserId && selectedViewingUserId === currentUserId) {
        setSelectedViewingUserId(null);
      }
    } else {
      // If user logs out, clear viewing
      setSelectedViewingUserId(null);
    }
  }, [currentUserId, selectedViewingUserId]);

  const isCaregiver = incomingShares.length > 0;

  // Auto-select shared view for caregiver users
  React.useEffect(() => {
    if (!isCaregiver) return;
    const firstShare = incomingShares[0];
    if (firstShare && selectedViewingUserId !== firstShare.ownerId) {
      setSelectedViewingUserId(firstShare.ownerId);
    }
  }, [isCaregiver, incomingShares, selectedViewingUserId]);

  const effectiveUserId = selectedViewingUserId || currentUserId;

  const value = React.useMemo(
    () => ({
      viewingUserId: effectiveUserId,
      setViewingUserId: setSelectedViewingUserId,
      isViewingSelf: !selectedViewingUserId || selectedViewingUserId === currentUserId,
      isViewingShared: !!selectedViewingUserId && selectedViewingUserId !== currentUserId,
      isCaregiver,
      incomingShares: incomingShares.map((s: any) => ({ ownerId: s.ownerId })),
    }),
    [effectiveUserId, selectedViewingUserId, currentUserId, isCaregiver, incomingShares],
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

