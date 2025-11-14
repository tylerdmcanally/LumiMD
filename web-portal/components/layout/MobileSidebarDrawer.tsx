'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'firebase/auth';
import {
  LayoutDashboard,
  Stethoscope,
  Pill,
  ClipboardCheck,
  Settings2,
  LogOut,
  User,
  X,
} from 'lucide-react';

import { auth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useUserProfile } from '@/lib/api/hooks';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'Visits',
    href: '/visits',
    icon: Stethoscope,
  },
  {
    label: 'Medications',
    href: '/medications',
    icon: Pill,
  },
  {
    label: 'Action Items',
    href: '/actions',
    icon: ClipboardCheck,
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: Settings2,
  },
];

interface MobileSidebarDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSidebarDrawer({ open, onClose }: MobileSidebarDrawerProps) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const userId = user?.uid ?? null;

  const { data: profile } = useUserProfile(userId, {
    enabled: Boolean(userId),
  });

  const displayName = React.useMemo(() => {
    const profileName =
      (typeof profile?.preferredName === 'string' && profile.preferredName.trim()) ||
      (typeof profile?.firstName === 'string' && profile.firstName.trim());
    if (profileName && profileName.length > 0) {
      return profileName;
    }

    if (typeof user?.displayName === 'string' && user.displayName.trim().length > 0) {
      return user.displayName.trim().split(' ')[0];
    }

    if (typeof user?.email === 'string' && user.email.length > 0) {
      return user.email.split('@')[0];
    }

    return 'User';
  }, [profile?.preferredName, profile?.firstName, user?.displayName, user?.email]);

  // Close drawer when route changes
  React.useEffect(() => {
    if (open) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Prevent body scroll when drawer is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('[auth] Failed to sign out', error);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-[600] bg-overlay transition-opacity duration-300 lg:hidden',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-[700] w-[280px] max-w-[85vw] flex flex-col bg-surface border-r border-border-light shadow-2xl transition-transform duration-300 lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header with Close Button */}
        <div className="flex items-center justify-between px-6 py-6 border-b border-border-light/60">
          <Link
            href="/dashboard"
            className="flex items-center transition-smooth hover:opacity-80"
            onClick={onClose}
          >
            <span className="text-[28px] font-black tracking-tight text-brand-primary leading-none">
              LumiMD
            </span>
          </Link>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary hover:bg-hover hover:text-text-primary transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            aria-label="Close menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-4 py-6 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-4 py-3.5 font-semibold transition-smooth',
                  'min-h-[52px]',
                  isActive
                    ? 'bg-gradient-primary text-white shadow-elevated'
                    : 'text-text-secondary hover:bg-hover hover:text-brand-primary'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 transition-smooth',
                    isActive
                      ? 'text-white'
                      : 'text-text-tertiary group-hover:text-brand-primary group-hover:scale-110'
                  )}
                />
                <span>{item.label}</span>
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-white/40" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Profile & Sign Out */}
        <div className="border-t border-border-light p-4 space-y-3">
          {/* User Info */}
          {user && (
            <div className="flex items-center gap-3 rounded-xl bg-background-subtle px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-primary-pale text-brand-primary">
                <User className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">
                  {displayName}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {user.email}
                </p>
              </div>
            </div>
          )}

          {/* Sign Out Button */}
          <Button
            variant="ghost"
            fullWidth
            onClick={handleSignOut}
            className="justify-start text-text-secondary hover:text-error min-h-[48px]"
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            Sign out
          </Button>
        </div>
      </aside>
    </>
  );
}
