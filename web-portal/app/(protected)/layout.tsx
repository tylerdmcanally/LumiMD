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
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden lg:pb-0">
          <div className="flex-1 overflow-hidden pb-24 lg:pb-0">
            {children}
          </div>
          <MobileBottomNav />
        </div>
      </div>
    </AuthGuard>
  );
}
