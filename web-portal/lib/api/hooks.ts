import { useEffect, useMemo } from 'react';

import {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentReference,
  type Query,
} from 'firebase/firestore';
import {
  QueryKey,
  UseQueryOptions,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { db } from '@/lib/firebase';

export type Visit = {
  id: string;
  userId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  processedAt?: string | null;
  provider?: string | null;
  location?: string | null;
  specialty?: string | null;
  status?: string;
  processingStatus?: string;
  summary?: string | null;
  transcript?: string | null;
  notes?: string | null;
  visitDate?: string | null;
  diagnoses?: string[];
  medications?: Record<string, unknown>;
  nextSteps?: string[];
  imaging?: string[];
  tags?: string[];
  folders?: string[];
  education?: {
    diagnoses?: Array<{ name: string; summary?: string; watchFor?: string }>;
    medications?: Array<{
      name: string;
      purpose?: string;
      usage?: string;
      sideEffects?: string;
      whenToCallDoctor?: string;
    }>;
  };
  [key: string]: unknown;
};

export type Medication = {
  id: string;
  userId: string;
  name: string;
  dose?: string | null;
  frequency?: string | null;
  status?: string;
  active?: boolean;
  startedAt?: string | null;
  stoppedAt?: string | null;
  changedAt?: string | null;
  source?: 'manual' | 'visit';
  visitId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  notes?: string | null;
  [key: string]: unknown;
};

export type ActionItem = {
  id: string;
  userId: string;
  description: string;
  completed: boolean;
  completedAt?: string | null;
  dueAt?: string | null;
  visitId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: 'manual' | 'visit';
  notes?: string | null;
  [key: string]: unknown;
};

export type UserProfile = {
  id: string;
  allergies?: string[];
  tags?: string[];
  folders?: string[];
  [key: string]: unknown;
};

export const queryKeys = {
  visits: (userId?: string | null) => ['visits', userId ?? 'anonymous'] as const,
  visit: (userId: string | undefined, visitId?: string | null) =>
    ['visit', userId ?? 'anonymous', visitId ?? 'unknown'] as const,
  medications: (userId?: string | null) =>
    ['medications', userId ?? 'anonymous'] as const,
  medication: (userId: string | undefined, medId?: string | null) =>
    ['medication', userId ?? 'anonymous', medId ?? 'unknown'] as const,
  actions: (userId?: string | null) =>
    ['actions', userId ?? 'anonymous'] as const,
  userProfile: (userId?: string | null) =>
    ['user-profile', userId ?? 'anonymous'] as const,
};

type QueryEnabledOptions<TData> = Omit<
  UseQueryOptions<TData, Error, TData, QueryKey>,
  'queryKey' | 'queryFn'
>;

function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Timestamp) {
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
      // fall through if toDate throws
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, val]) => [key, convertValue(val)],
    );
    return Object.fromEntries(entries);
  }

  return value;
}

function serializeDoc<T extends { id: string }>(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): T {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    ...(convertValue(data) as Record<string, unknown>),
  } as T;
}

function sortByTimestampDescending<T extends { updatedAt?: string | null; createdAt?: string | null }>(
  items: T[],
): T[] {
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

function useCollectionSubscription<T extends { id: string }>(
  queryRef: Query<DocumentData> | null,
  key: QueryKey,
  mapDoc: (snapshot: QueryDocumentSnapshot<DocumentData>) => T,
  transform?: (items: T[]) => T[],
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!queryRef) return;
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const docs = snapshot.docs.map(mapDoc);
        const data = transform ? transform(docs) : docs;
        queryClient.setQueryData(key, data);
      },
      (error) => {
        console.error('[Firestore] Snapshot error', error);
      },
    );

    return () => unsubscribe();
  }, [queryClient, key, mapDoc, queryRef]);
}

function useDocumentSubscription<T extends { id: string }>(
  docRef: DocumentReference<DocumentData> | null,
  key: QueryKey,
  mapDoc: (snapshot: QueryDocumentSnapshot<DocumentData>) => T,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!docRef) return;
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
      },
    );

    return () => unsubscribe();
  }, [docRef, key, mapDoc, queryClient]);
}

export function useVisits(
  userId?: string | null,
  options?: QueryEnabledOptions<Visit[]>,
) {
  const key = useMemo(() => queryKeys.visits(userId), [userId]);
  const enabled = Boolean(userId);

  const visitsQueryRef = useMemo(() => {
    if (!userId) return null;
    return query(collection(db, 'visits'), where('userId', '==', userId));
  }, [userId]);

  useCollectionSubscription(
    visitsQueryRef,
    key,
    (snapshot) => serializeDoc<Visit>(snapshot),
    (items) => sortByTimestampDescending(items),
  );

  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      if (!visitsQueryRef) return [];
      const snapshot = await getDocs(
        visitsQueryRef,
      );
      const visits = snapshot.docs.map((docSnapshot) =>
        serializeDoc<Visit>(docSnapshot),
      );
      return sortByTimestampDescending(visits);
    },
    staleTime: 1000 * 30,
    ...options,
  });
}

export function useVisit(
  userId: string | undefined,
  visitId?: string | null,
  options?: QueryEnabledOptions<Visit | null>,
) {
  const key = useMemo(
    () => queryKeys.visit(userId, visitId),
    [userId, visitId],
  );
  const enabled = Boolean(userId && visitId);

  const visitDocRef = useMemo(() => {
    if (!userId || !visitId) return null;
    return doc(db, 'visits', visitId);
  }, [userId, visitId]);

  useDocumentSubscription(
    visitDocRef,
    key,
    (snapshot) => serializeDoc<Visit>(snapshot),
  );

  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      if (!visitDocRef) return null;
      const snapshot = await getDoc(visitDocRef);
      if (!snapshot.exists()) return null;
      const data = serializeDoc<Visit>(snapshot as QueryDocumentSnapshot);
      if (data.userId && userId && data.userId !== userId) {
        return null;
      }
      return data;
    },
    staleTime: 1000 * 15,
    refetchOnReconnect: 'always',
    ...options,
  });
}

export function useMedications(
  userId?: string | null,
  options?: QueryEnabledOptions<Medication[]>,
) {
  const key = useMemo(() => queryKeys.medications(userId), [userId]);
  const enabled = Boolean(userId);

  const medicationsQueryRef = useMemo(() => {
    if (!userId) return null;
    return query(collection(db, 'medications'), where('userId', '==', userId));
  }, [userId]);

  useCollectionSubscription(
    medicationsQueryRef,
    key,
    (snapshot) => serializeDoc<Medication>(snapshot),
    (items) => sortByTimestampDescending(items),
  );

  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      if (!medicationsQueryRef) return [];
      const snapshot = await getDocs(medicationsQueryRef);
      const medications = snapshot.docs.map((docSnapshot) =>
        serializeDoc<Medication>(docSnapshot),
      );
      return sortByTimestampDescending(medications);
    },
    staleTime: 1000 * 60,
    ...options,
  });
}

export function useMedication(
  userId: string | undefined,
  medicationId?: string | null,
  options?: QueryEnabledOptions<Medication | null>,
) {
  const key = useMemo(
    () => queryKeys.medication(userId, medicationId),
    [userId, medicationId],
  );
  const enabled = Boolean(userId && medicationId);

  const medicationDocRef = useMemo(() => {
    if (!userId || !medicationId) return null;
    return doc(db, 'medications', medicationId);
  }, [userId, medicationId]);

  useDocumentSubscription(
    medicationDocRef,
    key,
    (snapshot) => serializeDoc<Medication>(snapshot),
  );

  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      if (!medicationDocRef) return null;
      const snapshot = await getDoc(medicationDocRef);
      if (!snapshot.exists()) return null;
      const data = serializeDoc<Medication>(snapshot as QueryDocumentSnapshot);
      if (data.userId && userId && data.userId !== userId) {
        return null;
      }
      return data;
    },
    staleTime: 1000 * 60,
    ...options,
  });
}

export function useActions(
  userId?: string | null,
  options?: QueryEnabledOptions<ActionItem[]>,
) {
  const key = useMemo(() => queryKeys.actions(userId), [userId]);
  const enabled = Boolean(userId);

  const actionsQueryRef = useMemo(() => {
    if (!userId) return null;
    return query(collection(db, 'actions'), where('userId', '==', userId));
  }, [userId]);

  useCollectionSubscription(
    actionsQueryRef,
    key,
    (snapshot) => serializeDoc<ActionItem>(snapshot),
    (actions) => {
      const sorted = [...actions].sort((a, b) => {
        if (a.completed === b.completed) {
          const aTime =
            (a.dueAt && Date.parse(a.dueAt)) ||
            (a.createdAt && Date.parse(a.createdAt)) ||
            0;
          const bTime =
            (b.dueAt && Date.parse(b.dueAt)) ||
            (b.createdAt && Date.parse(b.createdAt)) ||
            0;
          return aTime - bTime;
        }
        return Number(a.completed) - Number(b.completed);
      });
      return sorted;
    },
  );

  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      if (!actionsQueryRef) return [];
      const snapshot = await getDocs(actionsQueryRef);
      const actions = snapshot.docs.map((docSnapshot) =>
        serializeDoc<ActionItem>(docSnapshot),
      );
      const sorted = [...actions].sort((a, b) => {
        if (a.completed === b.completed) {
          const aTime =
            (a.dueAt && Date.parse(a.dueAt)) ||
            (a.createdAt && Date.parse(a.createdAt)) ||
            0;
          const bTime =
            (b.dueAt && Date.parse(b.dueAt)) ||
            (b.createdAt && Date.parse(b.createdAt)) ||
            0;
          return aTime - bTime;
        }
        return Number(a.completed) - Number(b.completed);
      });
      return sorted;
    },
    staleTime: 1000 * 30,
    ...options,
  });
}

export function useUserProfile(
  userId?: string | null,
  options?: QueryEnabledOptions<UserProfile | null>,
) {
  const key = useMemo(() => queryKeys.userProfile(userId), [userId]);
  const enabled = Boolean(userId);

  const profileDocRef = useMemo(() => {
    if (!userId) return null;
    return doc(db, 'users', userId);
  }, [userId]);

  useDocumentSubscription(
    profileDocRef,
    key,
    (snapshot) => serializeDoc<UserProfile>(snapshot),
  );

  return useQuery({
    queryKey: key,
    enabled,
    queryFn: async () => {
      if (!profileDocRef) return null;
      const snapshot = await getDoc(profileDocRef);
      if (!snapshot.exists()) return null;
      return serializeDoc<UserProfile>(snapshot as QueryDocumentSnapshot);
    },
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}


