'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { onAuthStateChanged } from 'firebase/auth';
import { Toaster } from 'sonner';
import { auth } from '@/lib/firebase';

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
  const lastAuthUserIdRef = useRef<string | null>(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const nextUserId = user?.uid ?? null;
      if (nextUserId !== lastAuthUserIdRef.current) {
        queryClient.clear();
        lastAuthUserIdRef.current = nextUserId;
      }
    });

    return () => unsubscribe();
  }, [queryClient]);

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
