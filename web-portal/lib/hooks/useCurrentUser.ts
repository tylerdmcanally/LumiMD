'use client';

import { useEffect, useState } from 'react';

import { onAuthStateChanged, type User } from 'firebase/auth';

import { auth } from '@/lib/firebase';

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });
    return () => unsubscribe();
  }, []);

  return user;
}

