'use client';

import * as React from 'react';
import { Check, ChevronDown, User } from 'lucide-react';
import { useViewing } from '@/lib/contexts/ViewingContext';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useUserProfile } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

export function AccountSwitcher() {
    const { viewingUserId, setViewingUserId, isCaregiver, incomingShares } = useViewing();
    const currentUser = useCurrentUser();
    const currentUserId = currentUser?.uid ?? null;
    const [isOpen, setIsOpen] = React.useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    // Get current user's profile
    const { data: currentUserProfile } = useUserProfile(currentUserId, {
        enabled: Boolean(currentUserId),
    });

    // Get viewing user's profile
    const { data: viewingProfile } = useUserProfile(viewingUserId ?? undefined, {
        enabled: Boolean(viewingUserId),
    });

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Don't show switcher if user is not a caregiver
    if (!isCaregiver) {
        return null;
    }

    const isViewingSelf = !viewingUserId || viewingUserId === currentUserId;

    const currentDisplayName = String(
        isViewingSelf
            ? (currentUserProfile?.preferredName ?? currentUserProfile?.firstName ?? 'My Health')
            : (viewingProfile?.preferredName ?? viewingProfile?.firstName ?? 'Shared Account')
    );

    const handleSwitch = (userId: string | null) => {
        setViewingUserId(userId);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    'hover:bg-background-subtle',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    isOpen && 'bg-background-subtle'
                )}
            >
                <User className="h-4 w-4 text-text-secondary" />
                <span className="text-text-primary">{currentDisplayName}</span>
                <ChevronDown
                    className={cn(
                        'h-4 w-4 text-text-secondary transition-transform',
                        isOpen && 'rotate-180'
                    )}
                />
            </button>

            {isOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 rounded-lg border border-border-light bg-surface shadow-lg z-dropdown">
                    <div className="p-2">
                        {/* My Health Option */}
                        <button
                            onClick={() => handleSwitch(null)}
                            className={cn(
                                'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                                'hover:bg-background-subtle',
                                isViewingSelf
                                    ? 'bg-brand-primary/10 text-brand-primary font-medium'
                                    : 'text-text-primary'
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4" />
                                <span>My Health</span>
                            </div>
                            {isViewingSelf && <Check className="h-4 w-4" />}
                        </button>

                        {/* Divider */}
                        {incomingShares.length > 0 && (
                            <div className="my-2 border-t border-border-light" />
                        )}

                        {/* Shared Accounts */}
                        {incomingShares.map((share) => {
                            const isSelected = viewingUserId === share.ownerId;
                            return (
                                <ShareAccountItem
                                    key={share.ownerId}
                                    ownerId={share.ownerId}
                                    isSelected={isSelected}
                                    onSelect={() => handleSwitch(share.ownerId)}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

interface ShareAccountItemProps {
    ownerId: string;
    isSelected: boolean;
    onSelect: () => void;
}

function ShareAccountItem({ ownerId, isSelected, onSelect }: ShareAccountItemProps) {
    const { data: ownerProfile } = useUserProfile(ownerId, {
        enabled: Boolean(ownerId),
    });

    const displayName = String(
        ownerProfile?.preferredName ?? ownerProfile?.firstName ?? 'Shared Account'
    );

    return (
        <button
            onClick={onSelect}
            className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                'hover:bg-background-subtle',
                isSelected
                    ? 'bg-brand-primary/10 text-brand-primary font-medium'
                    : 'text-text-primary'
            )}
        >
            <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <div className="flex flex-col items-start">
                    <span>{displayName}</span>
                    <span className="text-xs text-text-muted">Shared</span>
                </div>
            </div>
            {isSelected && <Check className="h-4 w-4" />}
        </button>
    );
}
