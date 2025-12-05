'use client';

import * as React from 'react';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';

interface ViewingContextValue {
  viewingUserId: string | null;
  setViewingUserId: (userId: string | null) => void;
  isViewingSelf: boolean;
  isViewingShared: boolean;
}

const ViewingContext = React.createContext<ViewingContextValue | undefined>(undefined);

export function ViewingProvider({ children }: { children: React.ReactNode }) {
  const currentUser = useCurrentUser();
  const currentUserId = currentUser?.uid ?? null;
  const [viewingUserId, setViewingUserId] = React.useState<string | null>(null);

  // Reset to self if current user changes
  React.useEffect(() => {
    if (currentUserId) {
      // If viewing someone else and current user changes, reset to self
      if (viewingUserId && viewingUserId !== currentUserId) {
        setViewingUserId(null);
      }
    } else {
      // If user logs out, clear viewing
      setViewingUserId(null);
    }
  }, [currentUserId, viewingUserId]);

  const effectiveUserId = viewingUserId || currentUserId;

  const value = React.useMemo(
    () => ({
      viewingUserId: effectiveUserId,
      setViewingUserId,
      isViewingSelf: !viewingUserId || viewingUserId === currentUserId,
      isViewingShared: !!viewingUserId && viewingUserId !== currentUserId,
    }),
    [effectiveUserId, viewingUserId, currentUserId],
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

