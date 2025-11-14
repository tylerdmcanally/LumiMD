import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';
import { cn } from '@/lib/utils';
import { QueryProvider } from '@/components/providers/query-provider';

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
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
