'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Stethoscope,
  Pill,
  ClipboardCheck,
  Settings2,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Visits', href: '/visits', icon: Stethoscope },
  { label: 'Medications', href: '/medications', icon: Pill },
  { label: 'Actions', href: '/actions', icon: ClipboardCheck },
  { label: 'Profile', href: '/profile', icon: Settings2 },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  if (!pathname) {
    return null;
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[500] block border-t border-border-light/60 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90 shadow-[0_-10px_40px_rgba(10,153,164,0.12)] lg:hidden',
        'safe-bottom'
      )}
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
        paddingLeft: 'max(env(safe-area-inset-left), 0.75rem)',
        paddingRight: 'max(env(safe-area-inset-right), 0.75rem)',
      }}
    >
      <div className="mx-auto flex h-16 max-w-3xl items-stretch justify-around gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 px-2 min-w-0 rounded-lg transition-all active:scale-95',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                isActive
                  ? 'text-brand-primary'
                  : 'text-text-tertiary hover:text-brand-primary active:bg-hover'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'h-6 w-6 shrink-0 transition-transform duration-200',
                  isActive ? 'scale-110 text-brand-primary' : 'scale-100 text-text-tertiary'
                )}
              />
              <span className={cn('text-xs font-semibold leading-none truncate w-full text-center', isActive ? 'text-brand-primary' : undefined)}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
