'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Home,
    Pill,
    CheckSquare,
    Settings,
    X,
    ArrowLeftRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
};

const CARE_NAV_ITEMS: NavItem[] = [
    { label: 'Overview', href: '/care', icon: Home },
    // Medications and Actions are accessed via patient detail pages
    { label: 'Settings', href: '/settings', icon: Settings },
];

interface CaregiverMobileSidebarProps {
    open: boolean;
    onClose: () => void;
    hasPatientRole?: boolean;
}

export function CaregiverMobileSidebar({ open, onClose, hasPatientRole = false }: CaregiverMobileSidebarProps) {
    const router = useRouter();

    const handleSwitchToMyHealth = () => {
        onClose();
        router.push('/dashboard');
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    'fixed inset-0 z-drawer-backdrop bg-black/50 transition-opacity duration-300',
                    open ? 'opacity-100' : 'opacity-0 pointer-events-none'
                )}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={cn(
                    'fixed top-0 left-0 bottom-0 z-drawer w-80 max-w-[85vw] bg-surface shadow-xl transition-transform duration-300',
                    open ? 'translate-x-0' : '-translate-x-full'
                )}
                style={{
                    paddingTop: 'env(safe-area-inset-top)',
                    paddingLeft: 'env(safe-area-inset-left)',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border-light">
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-black tracking-tight text-brand-primary">
                            LumiMD
                        </span>
                        <span className="text-xs font-medium text-text-muted bg-brand-primary-pale px-2 py-0.5 rounded-full">
                            Care
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-hover transition-colors"
                        aria-label="Close menu"
                    >
                        <X className="h-5 w-5 text-text-secondary" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-1">
                    {CARE_NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onClose}
                                className="flex items-center gap-3 px-4 py-3 rounded-lg text-text-secondary hover:bg-hover hover:text-text-primary transition-colors"
                            >
                                <Icon className="h-5 w-5" />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Divider and Switch to My Health - only show if user also has patient role */}
                {hasPatientRole && (
                    <>
                        <div className="mx-4 border-t border-border-light" />
                        <div className="p-4">
                            <button
                                onClick={handleSwitchToMyHealth}
                                className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-text-secondary hover:bg-hover hover:text-brand-primary transition-colors"
                            >
                                <ArrowLeftRight className="h-5 w-5" />
                                <span className="font-medium">Switch to My Health</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
