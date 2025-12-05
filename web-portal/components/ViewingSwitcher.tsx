'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, Eye } from 'lucide-react';

import { useViewing } from '@/lib/contexts/ViewingContext';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { api } from '@/lib/api/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserProfile } from '@/lib/api/hooks';
import type { Share } from '@lumimd/sdk';

export function ViewingSwitcher() {
  const currentUser = useCurrentUser();
  const { viewingUserId, setViewingUserId, isViewingSelf, isViewingShared } = useViewing();

  const { data: shares = [] } = useQuery({
    queryKey: ['shares'],
    queryFn: () => api.shares.list(),
    enabled: !!currentUser,
  });

  // Get profile for current viewing user (must be before any early returns)
  const { data: viewingProfile } = useUserProfile(viewingUserId);

  // Get incoming accepted shares (people who shared with current user)
  const incomingShares = shares.filter(
    (s: Share) => s.type === 'incoming' && s.status === 'accepted',
  ) as Share[];

  // If no shared access, don't show switcher
  if (incomingShares.length === 0) {
    return null;
  }

  const displayName = React.useMemo(() => {
    if (isViewingSelf) {
      return 'My Health';
    }
    const preferred =
      typeof viewingProfile?.preferredName === 'string' && viewingProfile.preferredName.trim()
        ? viewingProfile.preferredName.trim()
        : '';
    const first =
      typeof viewingProfile?.firstName === 'string' && viewingProfile.firstName.trim()
        ? viewingProfile.firstName.trim()
        : '';
    return preferred || first || 'Shared Health';
  }, [isViewingSelf, viewingProfile?.preferredName, viewingProfile?.firstName]);

  const options = React.useMemo(() => {
    const result = [{ value: 'self', label: 'My Health', userId: currentUser?.uid || null }];
    for (const share of incomingShares) {
      // For incoming shares, we don't have owner email in the share doc
      // We'll show a generic label and the profile will load separately
      result.push({
        value: share.ownerId,
        label: 'Shared Health',
        userId: share.ownerId,
      });
    }
    return result;
  }, [currentUser?.uid, incomingShares]);

  const handleChange = (value: string) => {
    if (value === 'self') {
      setViewingUserId(null);
    } else {
      setViewingUserId(value);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Eye className="h-4 w-4 text-text-tertiary" />
      <Select value={isViewingSelf ? 'self' : viewingUserId || 'self'} onValueChange={handleChange}>
        <SelectTrigger className="w-[180px] border-border-light">
          <SelectValue>{displayName}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                {option.value === 'self' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                <span>{option.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

