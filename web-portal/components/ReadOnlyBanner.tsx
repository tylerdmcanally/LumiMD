'use client';

import * as React from 'react';
import { Eye, X } from 'lucide-react';

import { useViewing } from '@/lib/contexts/ViewingContext';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useUserProfile } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ReadOnlyBanner() {
  const { isViewingShared, viewingUserId, setViewingUserId, userType } = useViewing();
  const currentUser = useCurrentUser();
  const { data: viewingProfile } = useUserProfile(viewingUserId);

  // ALL hooks must be before any early returns
  const displayName = React.useMemo(() => {
    const preferred = typeof viewingProfile?.preferredName === 'string' 
      ? viewingProfile.preferredName.trim() 
      : '';
    const first = typeof viewingProfile?.firstName === 'string' 
      ? viewingProfile.firstName.trim() 
      : '';
    return preferred || first || 'this person';
  }, [viewingProfile?.preferredName, viewingProfile?.firstName]);

  // Early return AFTER all hooks
  if (!isViewingShared || !viewingUserId) {
    return null;
  }

  return (
    <div
      className={cn(
        'bg-warning-light/70 border-b border-warning/40 px-4 py-4',
        'flex items-center justify-between gap-4',
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Eye className="h-5 w-5 text-warning-dark shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-warning-dark truncate">
            Viewing {displayName}'s health information (read-only)
          </p>
          <p className="text-xs text-warning-dark/80 truncate">
            You can browse visits, medications, and actions but cannot make changes.
          </p>
        </div>
      </div>
      {userType === 'hybrid' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewingUserId(null)}
          className="text-warning-dark hover:bg-warning/20 shrink-0"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Switch back to your health</span>
        </Button>
      )}
    </div>
  );
}

