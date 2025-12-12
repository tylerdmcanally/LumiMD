'use client';

import * as React from 'react';
import { Eye } from 'lucide-react';

import { useViewing } from '@/lib/contexts/ViewingContext';
import { useUserProfile } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

export function ReadOnlyBanner() {
  const { isViewingShared, viewingUserId, isCaregiver } = useViewing();
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

  // Only show when actively viewing someone else's data
  if (!isViewingShared) {
    return null;
  }

  return (
    <div
      className={cn(
        'bg-blue-50/80 dark:bg-blue-950/20 border-b border-blue-200/60 dark:border-blue-800/30',
        'px-4 py-3',
      )}
    >
      <div className="max-w-8xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 shrink-0">
            <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Viewing {displayName}'s Health Information
            </p>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/70 mt-0.5">
              You have read-only access to this account
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

