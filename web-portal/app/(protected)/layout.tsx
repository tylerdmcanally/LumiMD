'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen min-h-[var(--app-height)] bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col lg:pb-0 min-h-0">
          <div className="flex-1 overflow-y-auto scroll-touch overscroll-contain pb-24 lg:pb-0">
            {children}
          </div>
          <MobileBottomNav />
        </div>
      </div>
    </AuthGuard>
  );
}
