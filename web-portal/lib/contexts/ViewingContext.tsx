'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useHasPatientData } from '@/lib/api/hooks';
import { api } from '@/lib/api/client';

interface ViewingContextValue {
  viewingUserId: string | null; // effective ID (self or selected share)
  setViewingUserId: (userId: string | null) => void;
  isViewingSelf: boolean;
  isViewingShared: boolean;
  userType: 'patient' | 'caregiver' | 'hybrid';
  hasPatientData: boolean;
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

  // Detect whether current user has their own patient data
  const { data: hasPatientData = false } = useHasPatientData(currentUserId);

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

  // Determine user type
  const userType: 'patient' | 'caregiver' | 'hybrid' = React.useMemo(() => {
    const hasShares = incomingShares.length > 0;
    if (hasPatientData && hasShares) return 'hybrid';
    if (hasPatientData) return 'patient';
    if (hasShares) return 'caregiver';
    return 'patient';
  }, [hasPatientData, incomingShares.length]);

  // Auto-select shared view for caregiver-only users
  React.useEffect(() => {
    if (userType === 'caregiver') {
      const firstShare = incomingShares[0];
      if (firstShare && selectedViewingUserId !== firstShare.ownerId) {
        setSelectedViewingUserId(firstShare.ownerId);
      }
    }
  }, [userType, incomingShares, selectedViewingUserId]);

  const effectiveUserId = selectedViewingUserId || currentUserId;

  const value = React.useMemo(
    () => ({
      viewingUserId: effectiveUserId,
      setViewingUserId: setSelectedViewingUserId,
      isViewingSelf: !selectedViewingUserId || selectedViewingUserId === currentUserId,
      isViewingShared: !!selectedViewingUserId && selectedViewingUserId !== currentUserId,
      userType,
      hasPatientData,
      incomingShares: incomingShares.map((s: any) => ({ ownerId: s.ownerId })),
    }),
    [effectiveUserId, selectedViewingUserId, currentUserId, userType, hasPatientData, incomingShares],
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

