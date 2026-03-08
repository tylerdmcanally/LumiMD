import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google';

import './globals.css';
import { cn } from '@/lib/utils';
import { QueryProvider } from '@/components/providers/query-provider';
import { ErrorBoundary } from '@/components/providers/error-boundary';
import { ToastProvider } from '@/components/providers/toast-provider';

export const metadata: Metadata = {
  title: 'LumiMD',
  description: 'Your medical navigation companion',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn('min-h-screen bg-background text-text-primary antialiased', plusJakarta.variable, fraunces.variable)}>
        <ErrorBoundary>
          <QueryProvider>{children}</QueryProvider>
          <ToastProvider />
        </ErrorBoundary>
      </body>
    </html>
  );
}
