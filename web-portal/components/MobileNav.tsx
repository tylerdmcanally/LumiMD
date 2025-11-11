'use client';

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

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';

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

export function MobileNav() {
  const pathname = usePathname();
  const user = useCurrentUser();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('[auth] Failed to sign out (mobile nav)', error);
    }
  };

  return (
    <div className="lg:hidden space-y-6 animate-fade-in-up">
      {/* User Profile Card */}
      {user && (
        <div className="flex items-center gap-3 rounded-xl bg-surface border border-border-light shadow-elevated px-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-pale text-brand-primary">
            <User className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate font-semibold text-text-primary">
              {user.displayName || 'User'}
            </p>
            <p className="truncate text-sm text-text-muted">{user.email}</p>
          </div>
        </div>
      )}

      {/* Navigation Grid */}
      <div className="bg-surface border border-border-light rounded-xl shadow-elevated p-4">
        <nav className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex flex-col items-center justify-center gap-2 rounded-lg px-4 py-4 font-semibold transition-smooth',
                  'min-h-[80px]',
                  isActive
                    ? 'bg-gradient-primary text-white shadow-elevated'
                    : 'bg-background-subtle text-text-secondary hover:bg-hover hover:text-brand-primary'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon
                  className={cn(
                    'h-6 w-6 transition-smooth',
                    isActive
                      ? 'text-white'
                      : 'text-text-tertiary group-hover:text-brand-primary group-hover:scale-110'
                  )}
                />
                <span className="text-xs text-center">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sign Out Button */}
        <div className="mt-4 pt-4 border-t border-border-light">
          <Button
            variant="ghost"
            fullWidth
            onClick={handleSignOut}
            className="justify-center text-text-secondary hover:text-error"
            leftIcon={<LogOut className="h-4 w-4" />}
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
