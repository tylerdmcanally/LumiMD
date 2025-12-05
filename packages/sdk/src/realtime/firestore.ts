import { useCallback, useEffect } from 'react';
import type {
  DocumentData,
  DocumentReference,
  FirestoreError,
  Query,
  QueryDocumentSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { QueryKey, UseQueryOptions, useQuery, useQueryClient } from '@tanstack/react-query';

type FirestoreModule = typeof import('firebase/firestore');

let firestoreModule: FirestoreModule | null = null;

export function configureFirestoreRealtime(module: FirestoreModule) {
  firestoreModule = module;
}

function requireFirestoreModule(): FirestoreModule {
  if (!firestoreModule) {
    throw new Error(
      '[Realtime] Firestore module not configured. Call configureFirestoreRealtime() before using realtime helpers.',
    );
  }
  return firestoreModule;
}

export type FirestoreCollectionOptions<T> = {
  transform?: (items: T[]) => T[];
  enabled?: boolean;
  staleTimeMs?: number;
  onError?: (error: FirestoreError) => void;
  queryOptions?: Omit<UseQueryOptions<T[], Error, T[], QueryKey>, 'queryKey' | 'queryFn'>;
};

export type FirestoreDocumentOptions<T> = {
  enabled?: boolean;
  staleTimeMs?: number;
  onError?: (error: FirestoreError) => void;
  queryOptions?: Omit<UseQueryOptions<T | null, Error, T | null, QueryKey>, 'queryKey' | 'queryFn'>;
};

export function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  const module = firestoreModule;
  if (module && value instanceof module.Timestamp) {
    return value.toDate().toISOString();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in (value as Record<string, unknown>)
  ) {
    try {
      return (value as Timestamp).toDate().toISOString();
    } catch {
      // ignore conversion errors and fall back to original value
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const convertedEntries = Object.entries(value as Record<string, unknown>).map(
      ([key, val]) => [key, convertValue(val)],
    );
    return Object.fromEntries(convertedEntries);
  }

  return value;
}

export function serializeDoc<T extends { id: string }>(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): T {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    ...(convertValue(data) as Record<string, unknown>),
  } as T;
}

export function sortByTimestampDescending<
  T extends { updatedAt?: string | null; createdAt?: string | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime =
      (a.updatedAt && Date.parse(a.updatedAt)) ||
      (a.createdAt && Date.parse(a.createdAt)) ||
      0;
    const bTime =
      (b.updatedAt && Date.parse(b.updatedAt)) ||
      (b.createdAt && Date.parse(b.createdAt)) ||
      0;
    return bTime - aTime;
  });
}

export function useFirestoreCollection<T extends { id: string }>(
  queryRef: Query<DocumentData> | null,
  key: QueryKey,
  options?: FirestoreCollectionOptions<T>,
) {
  const { onSnapshot, getDocs } = requireFirestoreModule();
  const queryClient = useQueryClient();
  const {
    transform,
    enabled = true,
    staleTimeMs = 30_000,
    onError,
    queryOptions,
  } = options ?? {};
  const combinedEnabled =
    typeof queryOptions?.enabled === 'boolean'
      ? enabled && queryOptions.enabled
      : enabled;

  const mapDoc = useCallback((snapshot: QueryDocumentSnapshot<DocumentData>) => {
    return serializeDoc<T>(snapshot);
  }, []);

  useEffect(() => {
    if (!queryRef || !combinedEnabled) return;

    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const docs = snapshot.docs.map(mapDoc);
        const data = transform ? transform(docs) : docs;
        queryClient.setQueryData(key, data);
      },
      (error) => {
        console.error('[Firestore] Snapshot error', error);
        onError?.(error);
      },
    );

    return () => unsubscribe();
  }, [combinedEnabled, key, mapDoc, onError, queryClient, queryRef, transform]);

  return useQuery<T[]>({
    queryKey: key,
    staleTime: staleTimeMs,
    ...(queryOptions ?? {}),
    enabled: combinedEnabled,
    queryFn: async () => {
      if (!queryRef) return [] as T[];
      const snapshot = await getDocs(queryRef);
      const docs = snapshot.docs.map(mapDoc);
      return transform ? transform(docs) : docs;
    },
  });
}

export function useFirestoreDocument<T extends { id: string }>(
  docRef: DocumentReference<DocumentData> | null,
  key: QueryKey,
  options?: FirestoreDocumentOptions<T>,
) {
  const { onSnapshot, getDoc } = requireFirestoreModule();
  const queryClient = useQueryClient();
  const { enabled = true, staleTimeMs = 15_000, onError, queryOptions } = options ?? {};
  const combinedEnabled =
    typeof queryOptions?.enabled === 'boolean'
      ? enabled && queryOptions.enabled
      : enabled;

  const mapDoc = useCallback((snapshot: QueryDocumentSnapshot<DocumentData>) => {
    return serializeDoc<T>(snapshot);
  }, []);

  useEffect(() => {
    if (!docRef || !combinedEnabled) return;

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          queryClient.setQueryData(key, null);
          return;
        }

        const data = mapDoc(snapshot as QueryDocumentSnapshot<DocumentData>);
        queryClient.setQueryData(key, data);
      },
      (error) => {
        console.error('[Firestore] Snapshot error', error);
        onError?.(error);
      },
    );

    return () => unsubscribe();
  }, [combinedEnabled, docRef, key, mapDoc, onError, queryClient]);

  return useQuery<T | null>({
    queryKey: key,
    staleTime: staleTimeMs,
    refetchOnReconnect: true,
    ...(queryOptions ?? {}),
    enabled: combinedEnabled,
    queryFn: async () => {
      if (!docRef) return null;
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;
      return mapDoc(snapshot as QueryDocumentSnapshot<DocumentData>);
    },
  });
}

