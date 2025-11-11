'use client';

import { ReactNode, useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'sonner';

type QueryProviderProps = {
  children: ReactNode;
};

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 2,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
      <Toaster
        position="top-center"
        toastOptions={{
          classNames: {
            toast:
              'border border-border bg-card text-foreground shadow-lg rounded-2xl',
            title: 'font-semibold text-foreground',
            description: 'text-sm text-muted-foreground',
            actionButton:
              'bg-primary text-white hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium',
            cancelButton:
              'bg-muted text-muted-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted/80',
          },
        }}
      />
    </QueryClientProvider>
  );
}

