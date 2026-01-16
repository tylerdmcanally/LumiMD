'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { CaregiverNavigation } from '@/components/layout/CaregiverNavigation';
import { CaregiverMobileSidebar } from '@/components/layout/CaregiverMobileSidebar';
import { ViewingProvider } from '@/lib/contexts/ViewingContext';

export default function CareLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const pathname = usePathname();
    const isPublicCareRoute =
        pathname?.startsWith('/care/sign-in') ||
        pathname?.startsWith('/care/sign-up') ||
        pathname?.startsWith('/care/invite');

    // Set viewport height for consistent cross-browser mobile experience
    React.useEffect(() => {
        const setAppHeight = () => {
            const vh = window.visualViewport?.height || window.innerHeight;
            document.documentElement.style.setProperty('--app-height', `${vh}px`);
        };

        setAppHeight();

        let lastOrientation = window.orientation;
        const handleResize = () => {
            if (window.orientation !== lastOrientation) {
                lastOrientation = window.orientation;
                setAppHeight();
            }
        };

        window.addEventListener('orientationchange', setAppHeight);
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('orientationchange', setAppHeight);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    if (isPublicCareRoute) {
        return <>{children}</>;
    }

    return (
        <AuthGuard>
            <ViewingProvider>
                <div
                    className="flex flex-col bg-background overflow-hidden"
                    style={{ height: 'var(--app-height)' }}
                >
                    <CaregiverNavigation onMobileMenuClick={() => setDrawerOpen(true)} />
                    <CaregiverMobileSidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

                    {/* Spacer for fixed header */}
                    <div className="h-20 shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }} />

                    <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
                        <div
                            className="flex-1 overflow-y-auto overflow-x-hidden scroll-touch overscroll-contain"
                            style={{
                                paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
                            }}
                        >
                            {children}
                        </div>
                    </main>
                </div>
            </ViewingProvider>
        </AuthGuard>
    );
}
