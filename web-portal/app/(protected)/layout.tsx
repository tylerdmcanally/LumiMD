'use client';

import * as React from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileSidebarDrawer } from '@/components/layout/MobileSidebarDrawer';
import { TopBar } from '@/components/layout/TopBar';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Set fixed viewport height on mount to prevent layout shifts from browser chrome
  React.useEffect(() => {
    const setAppHeight = () => {
      const vh = window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${vh}px`);
    };

    setAppHeight();
    // Don't update on resize to prevent shifts when browser chrome shows/hides
  }, []);

  return (
    <AuthGuard>
      <div className="flex h-[100vh] lg:h-screen h-[var(--app-height)] bg-background overflow-hidden">
        <Sidebar />
        <MobileSidebarDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <main className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <TopBar onMenuClick={() => setDrawerOpen(true)} />
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
    </AuthGuard>
  );
}
