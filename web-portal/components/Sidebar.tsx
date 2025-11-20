'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import {
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Pill,
  Stethoscope,
  User,
} from 'lucide-react';

import { auth } from '@/lib/firebase';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
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
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
    >
      <Icon className="h-5 w-5" />
      <span className="font-medium">{item.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const router = useRouter();
  const user = useCurrentUser();
  const email = user?.email || '';
  const displayName = email.split('@')[0] || 'User';

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/sign-in');
    } catch (error) {
      console.error('[auth] Failed to sign out', error);
    }
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r bg-background p-4 flex flex-col">
      {/* Logo */}
      <Link href="/dashboard" className="mb-8">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary text-primary-foreground">
          <div className="w-10 h-10 rounded-md bg-primary-foreground/20 flex items-center justify-center font-bold text-lg">
            L
          </div>
          <div>
            <p className="font-bold">LumiMD</p>
            <p className="text-xs opacity-75">Health Dashboard</p>
          </div>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      {/* Profile & Logout */}
      <div className="border-t pt-4 space-y-2">
        <Link
          href="/profile"
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
        >
          <User className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
