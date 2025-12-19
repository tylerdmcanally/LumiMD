'use client';

import { useMemo } from 'react';
import { createApiClient } from '@lumimd/sdk';
import { auth } from '@/lib/firebase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api';

/**
 * Hook to get a configured API client for making authenticated requests.
 * Uses the current Firebase user's ID token for authentication.
 */
export function useApiClient() {
    return useMemo(() => {
        return createApiClient({
            baseUrl: API_BASE_URL,
            getAuthToken: async () => {
                const user = auth.currentUser;
                if (!user) return null;
                return user.getIdToken();
            },
        });
    }, []);
}
