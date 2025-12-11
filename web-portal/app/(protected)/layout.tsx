'use client';

import * as React from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { TopNavigation } from '@/components/layout/TopNavigation';
import { MobileSidebarDrawer } from '@/components/layout/MobileSidebarDrawer';
import { ViewingProvider } from '@/lib/contexts/ViewingContext';
import { ReadOnlyBanner } from '@/components/ReadOnlyBanner';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Set viewport height for consistent cross-browser mobile experience
  React.useEffect(() => {
    const setAppHeight = () => {
      // Use visualViewport if available (more accurate on mobile browsers)
      const vh = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    };

    setAppHeight();

    // Update on orientation change (but not on scroll-triggered resize)
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

  return (
    <AuthGuard>
      <ViewingProvider>
        <div
          className="flex flex-col bg-background overflow-hidden"
          style={{ height: 'var(--app-height)' }}
        >
          <TopNavigation onMobileMenuClick={() => setDrawerOpen(true)} />
          <MobileSidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

          {/* Spacer for fixed header */}
          <div className="h-20 shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }} />

          <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
            <ReadOnlyBanner />
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

