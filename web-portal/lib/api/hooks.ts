import { useMemo, useCallback } from 'react';
import { toast } from 'sonner';

import {
  collection,
  doc,
  query,
  where,
  type FirestoreError,
} from 'firebase/firestore';
import { QueryKey, UseQueryOptions } from '@tanstack/react-query';

import { db } from '@/lib/firebase';
import {
  convertValue,
  serializeDoc,
  sortByTimestampDescending,
  useFirestoreCollection,
  useFirestoreDocument,
} from '@lumimd/sdk';
import { useViewing } from '@/lib/contexts/ViewingContext';

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
  'queryKey' | 'queryFn' | 'enabled'
> & {
  enabled?: boolean;
};

const useRealtimeErrorHandler = () =>
  useCallback((error: FirestoreError) => {
    console.error('[Firestore] Snapshot error', error);
    toast.error('Connection error', {
      description: 'Unable to sync data. Please check your connection and try again.',
      duration: 5000,
    });
  }, []);

export function useVisits(
  userId?: string | null,
  options?: QueryEnabledOptions<Visit[]>,
) {
  const { viewingUserId } = useViewing();
  const effectiveUserId = userId ?? viewingUserId;
  const key = useMemo(() => queryKeys.visits(effectiveUserId), [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const visitsQueryRef = useMemo(() => {
    if (!effectiveUserId) return null;
    return query(collection(db, 'visits'), where('userId', '==', effectiveUserId));
  }, [effectiveUserId]);

  return useFirestoreCollection<Visit>(visitsQueryRef, key, {
    transform: sortByTimestampDescending,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
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
  const handleSnapshotError = useRealtimeErrorHandler();

  const visitDocRef = useMemo(() => {
    if (!userId || !visitId) return null;
    return doc(db, 'visits', visitId);
  }, [userId, visitId]);

  return useFirestoreDocument<Visit>(visitDocRef, key, {
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

export function useMedications(
  userId?: string | null,
  options?: QueryEnabledOptions<Medication[]>,
) {
  const { viewingUserId } = useViewing();
  const effectiveUserId = userId ?? viewingUserId;
  const key = useMemo(() => queryKeys.medications(effectiveUserId), [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const medicationsQueryRef = useMemo(() => {
    if (!effectiveUserId) return null;
    return query(collection(db, 'medications'), where('userId', '==', effectiveUserId));
  }, [effectiveUserId]);

  return useFirestoreCollection<Medication>(medicationsQueryRef, key, {
    transform: sortByTimestampDescending,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
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
  const handleSnapshotError = useRealtimeErrorHandler();

  const medicationDocRef = useMemo(() => {
    if (!userId || !medicationId) return null;
    return doc(db, 'medications', medicationId);
  }, [userId, medicationId]);

  return useFirestoreDocument<Medication>(medicationDocRef, key, {
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

export function useActions(
  userId?: string | null,
  options?: QueryEnabledOptions<ActionItem[]>,
) {
  const { viewingUserId } = useViewing();
  const effectiveUserId = userId ?? viewingUserId;
  const key = useMemo(() => queryKeys.actions(effectiveUserId), [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const actionsQueryRef = useMemo(() => {
    if (!effectiveUserId) return null;
    return query(collection(db, 'actions'), where('userId', '==', effectiveUserId));
  }, [effectiveUserId]);

  const sortActions = useCallback((actions: ActionItem[]) => {
    return [...actions].sort((a, b) => {
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
  }, []);

  return useFirestoreCollection<ActionItem>(actionsQueryRef, key, {
    transform: sortActions,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

export function useUserProfile(
  userId?: string | null,
  options?: QueryEnabledOptions<UserProfile | null>,
) {
  const { viewingUserId } = useViewing();
  const effectiveUserId = userId ?? viewingUserId;
  const key = useMemo(() => queryKeys.userProfile(effectiveUserId), [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const profileDocRef = useMemo(() => {
    if (!effectiveUserId) return null;
    return doc(db, 'users', effectiveUserId);
  }, [effectiveUserId]);

  return useFirestoreDocument<UserProfile>(profileDocRef, key, {
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}
