'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

import { usePathname, useRouter } from 'next/navigation';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from '@/lib/firebase';
import { cn } from '@/lib/utils';

type AuthGuardProps = {
  children: ReactNode;
  redirectTo?: string;
  loaderClassName?: string;
};

export function AuthGuard({
  children,
  redirectTo = '/sign-in',
  loaderClassName,
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isChecking, setIsChecking] = useState(true);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsChecking(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isChecking && !currentUser && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      const returnTo = encodeURIComponent(pathname || '/');
      router.replace(`${redirectTo}?returnTo=${returnTo}`);
    }
  }, [currentUser, isChecking, pathname, redirectTo, router]);

  if (isChecking || !currentUser) {
    return (
      <div
        className={cn(
          'flex min-h-screen flex-col items-center justify-center bg-background text-muted',
          loaderClassName,
        )}
      >
        <div className="relative mb-4 h-14 w-14">
          <div className="absolute inset-0 rounded-full border-4 border-border" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          Checking your account…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

