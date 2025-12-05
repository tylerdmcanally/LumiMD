'use client';

import * as React from 'react';
import { Eye, X } from 'lucide-react';

import { useViewing } from '@/lib/contexts/ViewingContext';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useUserProfile } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ReadOnlyBanner() {
  const { isViewingShared, viewingUserId, setViewingUserId } = useViewing();
  const currentUser = useCurrentUser();
  const { data: viewingProfile } = useUserProfile(viewingUserId);

  if (!isViewingShared || !viewingUserId) {
    return null;
  }

  const displayName =
    viewingProfile?.preferredName ||
    viewingProfile?.firstName ||
    'this person';

  return (
    <div
      className={cn(
        'bg-warning-light border-b border-warning/30 px-4 py-3',
        'flex items-center justify-between gap-4',
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Eye className="h-5 w-5 text-warning-dark shrink-0" />
        <p className="text-sm font-medium text-warning-dark flex-1 min-w-0">
          <span className="truncate">You're viewing {displayName}'s health information in read-only mode.</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setViewingUserId(null)}
        className="text-warning-dark hover:bg-warning/20 shrink-0"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Switch back to your health</span>
      </Button>
    </div>
  );
}

