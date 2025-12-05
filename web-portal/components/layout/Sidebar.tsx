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
} from 'lucide-react';

import { auth } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useUserProfile } from '@/lib/api/hooks';
import { ViewingSwitcher } from '@/components/ViewingSwitcher';
import { useViewing } from '@/lib/contexts/ViewingContext';

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

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = item.exact
    ? pathname === item.href
    : pathname?.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-4 py-3 font-semibold transition-smooth',
        'min-h-[48px]',
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
        <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-white/40" />
      )}
    </Link>
  );
}

export function Sidebar() {
  const user = useCurrentUser();
  const userId = user?.uid ?? null;
  const { userType, incomingShares, hasPatientData } = useViewing();

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

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('[auth] Failed to sign out', error);
    }
  };

  return (
    <aside className="hidden md:flex md:w-sidebar shrink-0 flex-col bg-surface border-r border-border-light shadow-elevated">
      {/* Brand Header */}
      <div className="flex items-center justify-center px-8 py-10">
        <Link
          href="/dashboard"
          className="flex items-center justify-center transition-smooth hover:opacity-80"
        >
          <span className="text-[34px] font-black tracking-tight text-brand-primary leading-none">
            LumiMD
          </span>
        </Link>
      </div>

      {/* Viewing Switcher (Desktop) */}
      {(userType === 'hybrid' || userType === 'caregiver' || incomingShares.length > 0) && (
        <div className="px-5 pt-6 pb-4 border-b border-border-light/60">
          <ViewingSwitcher />
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-5 py-8">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* User Profile & Sign Out */}
      <div className="border-t border-border-light p-4 space-y-3">
        {/* User Info */}
        {user && (
          <div className="flex items-center gap-3 rounded-lg bg-background-subtle px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary-pale text-brand-primary">
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
          className="justify-start text-text-secondary hover:text-error"
          leftIcon={<LogOut className="h-4 w-4" />}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}

