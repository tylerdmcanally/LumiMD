import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

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
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn('min-h-screen bg-background text-text-primary antialiased', inter.variable)}>
        <ErrorBoundary
          onError={(error, errorInfo) => {
            // Log errors in development
            if (process.env.NODE_ENV === 'development') {
              console.error('[ErrorBoundary] Caught error:', error);
              console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
            }
            // TODO: Send to error monitoring service (e.g., Sentry) when implemented
          }}
        >
          <QueryProvider>{children}</QueryProvider>
          <ToastProvider />
        </ErrorBoundary>
      </body>
    </html>
  );
}
