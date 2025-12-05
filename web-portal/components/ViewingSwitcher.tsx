'use client';

import * as React from 'react';
import { User } from 'lucide-react';

import { useViewing } from '@/lib/contexts/ViewingContext';
import { useUserProfile } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

type SwitcherOption = {
  id: string;
  label: string;
  description: string;
  icon?: 'self';
};

export function ViewingSwitcher() {
  const { viewingUserId, setViewingUserId, isViewingSelf, userType, hasPatientData, incomingShares } =
    useViewing();

  // Profile of the currently viewed user (for display label)
  const { data: viewingProfile } = useUserProfile(viewingUserId);

  const currentLabel = React.useMemo(() => {
    if (isViewingSelf) return 'My Health';
    const preferred =
      typeof viewingProfile?.preferredName === 'string' && viewingProfile.preferredName.trim()
        ? viewingProfile.preferredName.trim()
        : '';
    const first =
      typeof viewingProfile?.firstName === 'string' && viewingProfile.firstName.trim()
        ? viewingProfile.firstName.trim()
        : '';
    const email =
      typeof (viewingProfile as any)?.email === 'string' && (viewingProfile as any).email
        ? (viewingProfile as any).email
        : '';
    return preferred || first || email || 'Shared Health';
  }, [isViewingSelf, viewingProfile?.preferredName, viewingProfile?.firstName, (viewingProfile as any)?.email]);

  const options: SwitcherOption[] = React.useMemo(() => {
    const result: SwitcherOption[] = [];

    if (hasPatientData) {
      result.push({
        id: 'self',
        label: 'My Health',
        description: 'Your LumiMD account',
        icon: 'self',
      });
    }

    incomingShares.forEach((share, idx) => {
      result.push({
        id: share.ownerId,
        label: 'Shared Health',
        description: `Shared access ${incomingShares.length > 1 ? `#${idx + 1}` : ''}`.trim(),
        icon: undefined,
      });
    });

    return result;
  }, [hasPatientData, incomingShares]);

  // If no options (shouldn't happen), render nothing
  if (options.length === 0) return null;

  const activeId = isViewingSelf ? 'self' : viewingUserId || options[0].id;

  const handleSelect = (id: string) => {
    if (id === 'self') {
      setViewingUserId(null);
    } else {
      setViewingUserId(id);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        Viewing as
      </div>
      <div className="space-y-2">
        {options.map((option) => {
          const isActive = option.id === activeId;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSelect(option.id)}
              className={cn(
                'w-full rounded-xl border px-3.5 py-3 text-left transition-smooth',
                'flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                isActive
                  ? 'border-brand-primary bg-brand-primary-pale/60 text-brand-primary shadow-sm'
                  : 'border-border-light hover:border-brand-primary/60 hover:bg-background-subtle',
              )}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{option.label}</p>
                <p className="text-xs text-text-secondary truncate">
                  {isActive ? `Active: ${currentLabel}` : option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      {userType === 'caregiver' && (
        <p className="text-[11px] text-text-tertiary">
          You have caregiver access only. You’re viewing shared data.
        </p>
      )}
    </div>
  );
}

