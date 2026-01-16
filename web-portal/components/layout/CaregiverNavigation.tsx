'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import {
    Home,
    Pill,
    CheckSquare,
    Settings,
    LogOut,
    User,
    ChevronDown,
    Menu,
    ArrowLeftRight,
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

const CARE_NAV_ITEMS: NavItem[] = [
    { label: 'Overview', href: '/care', icon: Home, exact: true },
    // Medications and Actions are accessed via patient detail pages
];

interface CaregiverNavigationProps {
    onMobileMenuClick?: () => void;
}

export function CaregiverNavigation({ onMobileMenuClick }: CaregiverNavigationProps) {
    const pathname = usePathname();
    const router = useRouter();
    const user = useCurrentUser();
    const userId = user?.uid ?? null;
    const [userMenuOpen, setUserMenuOpen] = React.useState(false);
    const userMenuRef = React.useRef<HTMLDivElement>(null);

    const { data: profile } = useUserProfile(userId, {
        enabled: Boolean(userId),
    });

    // Check if user also has patient role
    const hasPatientRole = profile?.roles?.includes('patient') ?? false;

    // Close menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const displayName = React.useMemo(() => {
        const profileName =
            (typeof profile?.preferredName === 'string' && profile.preferredName.trim()) ||
            (typeof profile?.firstName === 'string' && profile.firstName.trim());
        if (profileName && profileName.length > 0) return profileName;
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

    const handleSwitchToMyHealth = () => {
        router.push('/dashboard');
    };

    return (
        <header
            className="fixed top-0 left-0 right-0 z-header bg-surface border-b border-border-light shrink-0"
            style={{
                paddingTop: 'max(env(safe-area-inset-top), 0px)',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
            }}
        >
            <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between gap-4">
                    {/* Left: Logo + Mobile Menu */}
                    <div className="flex items-center gap-3">
                        {/* Mobile Menu Button */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="md:hidden shrink-0 h-10 w-10 p-0"
                            onClick={onMobileMenuClick}
                            aria-label="Open menu"
                        >
                            <Menu className="h-6 w-6" />
                        </Button>

                        {/* Logo */}
                        <Link
                            href="/care"
                            className="flex items-center gap-2 transition-smooth hover:opacity-80"
                        >
                            <span className="text-2xl font-black tracking-tight text-brand-primary leading-none">
                                LumiMD
                            </span>
                            <span className="hidden sm:inline-block text-sm font-medium text-text-muted bg-brand-primary-pale px-2 py-0.5 rounded-full">
                                Care
                            </span>
                        </Link>
                    </div>

                    {/* Center: Navigation (desktop only) */}
                    <nav className="hidden md:flex items-center gap-1">
                        {CARE_NAV_ITEMS.map((item) => {
                            const isActive = item.exact
                                ? pathname === item.href
                                : pathname?.startsWith(item.href);
                            const Icon = item.icon;

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-150',
                                        isActive
                                            ? 'bg-brand-primary text-white shadow-sm'
                                            : 'text-text-secondary hover:bg-hover hover:text-brand-primary'
                                    )}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    <Icon className="h-4 w-4" />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Right: Switch View + User Menu */}
                    <div className="flex items-center gap-3">
                        {/* Switch to My Health (desktop only) - only show if user also has patient role */}
                        {hasPatientRole && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSwitchToMyHealth}
                                className="hidden md:flex items-center gap-2 text-text-secondary hover:text-brand-primary"
                            >
                                <ArrowLeftRight className="h-4 w-4" />
                                <span>My Health</span>
                            </Button>
                        )}

                        {/* User Menu */}
                        <div className="relative" ref={userMenuRef}>
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className={cn(
                                    'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150',
                                    'hover:bg-hover text-text-secondary hover:text-text-primary',
                                    userMenuOpen && 'bg-hover'
                                )}
                            >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary-pale text-brand-primary">
                                    <User className="h-4 w-4" />
                                </div>
                                <span className="hidden sm:block text-sm font-medium">{displayName}</span>
                                <ChevronDown className={cn(
                                    'h-4 w-4 transition-transform duration-150',
                                    userMenuOpen && 'rotate-180'
                                )} />
                            </button>

                            {/* Dropdown Menu */}
                            {userMenuOpen && (
                                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-surface border border-border-light shadow-floating overflow-hidden animate-fade-in-up">
                                    {/* User Info */}
                                    <div className="px-4 py-3 border-b border-border-light bg-background-subtle">
                                        <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
                                        <p className="text-xs text-text-muted truncate">{user?.email}</p>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="py-1">
                                        {/* Switch to My Health (mobile) - only show if user also has patient role */}
                                        {hasPatientRole && (
                                            <button
                                                onClick={() => {
                                                    setUserMenuOpen(false);
                                                    handleSwitchToMyHealth();
                                                }}
                                                className="md:hidden w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-hover hover:text-text-primary transition-colors"
                                            >
                                                <ArrowLeftRight className="h-4 w-4" />
                                                <span>Switch to My Health</span>
                                            </button>
                                        )}

                                        <Link
                                            href="/care/settings"
                                            onClick={() => setUserMenuOpen(false)}
                                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-hover hover:text-text-primary transition-colors"
                                        >
                                            <Settings className="h-4 w-4" />
                                            <span>Settings</span>
                                        </Link>
                                        <button
                                            onClick={() => {
                                                setUserMenuOpen(false);
                                                handleSignOut();
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-error-light hover:text-error transition-colors"
                                        >
                                            <LogOut className="h-4 w-4" />
                                            <span>Sign out</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
