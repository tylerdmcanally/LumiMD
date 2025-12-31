import { useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import {
  collection,
  doc,
  query,
  where,
  type FirestoreError,
  limit,
} from 'firebase/firestore';
import * as Firestore from 'firebase/firestore';
import { QueryKey, UseQueryOptions, useQuery, useQueryClient } from '@tanstack/react-query';

import { db } from '@/lib/firebase';
import { useViewingSafe } from '@/lib/contexts/ViewingContext';

// =============================================================================
// Local Firestore helpers (mirrors @lumimd/sdk realtime exports)
// =============================================================================
function convertValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in (value as Record<string, unknown>)
  ) {
    try {
      return (value as Firestore.Timestamp).toDate().toISOString();
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

function serializeDoc<T extends { id: string }>(
  snapshot: Firestore.QueryDocumentSnapshot<Firestore.DocumentData>,
): T {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    ...(convertValue(data) as Record<string, unknown>),
  } as T;
}

function sortByTimestampDescending<
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
function useFirestoreCollection<T extends { id: string }>(
  queryRef: Firestore.Query<Firestore.DocumentData> | null,
  key: QueryKey,
  options?: {
    transform?: (items: T[]) => T[];
    enabled?: boolean;
    staleTimeMs?: number;
    onError?: (error: Firestore.FirestoreError) => void;
    queryOptions?: Omit<UseQueryOptions<T[], Error, T[], QueryKey>, 'queryKey' | 'queryFn'>;
  },
) {
  const queryClient = useQueryClient();
  const {
    transform,
    enabled = true,
    staleTimeMs = 30_000,
    onError,
    queryOptions,
  } = options ?? {};
  const combinedEnabled =
    typeof queryOptions?.enabled === 'boolean' ? enabled && queryOptions.enabled : enabled;

  const mapDoc = useCallback(
    (snapshot: Firestore.QueryDocumentSnapshot<Firestore.DocumentData>) => {
      return serializeDoc<T>(snapshot);
    },
    [],
  );

  useEffect(() => {
    if (!queryRef || !combinedEnabled) return;

    const unsubscribe = Firestore.onSnapshot(
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
      const snapshot = await Firestore.getDocs(queryRef);
      const docs = snapshot.docs.map(mapDoc);
      return transform ? transform(docs) : docs;
    },
  });
}

function useFirestoreDocument<T extends { id: string }>(
  docRef: Firestore.DocumentReference<Firestore.DocumentData> | null,
  key: QueryKey,
  options?: {
    enabled?: boolean;
    staleTimeMs?: number;
    onError?: (error: Firestore.FirestoreError) => void;
    queryOptions?: Omit<UseQueryOptions<T | null, Error, T | null, QueryKey>, 'queryKey' | 'queryFn'>;
  },
) {
  const queryClient = useQueryClient();
  const { enabled = true, staleTimeMs = 15_000, onError, queryOptions } = options ?? {};
  const combinedEnabled =
    typeof queryOptions?.enabled === 'boolean' ? enabled && queryOptions.enabled : enabled;

  const mapDoc = useCallback(
    (snapshot: Firestore.QueryDocumentSnapshot<Firestore.DocumentData>) => {
      return serializeDoc<T>(snapshot);
    },
    [],
  );

  useEffect(() => {
    if (!docRef || !combinedEnabled) return;

    const unsubscribe = Firestore.onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          queryClient.setQueryData(key, null);
          return;
        }
        const data = mapDoc(snapshot as Firestore.QueryDocumentSnapshot<Firestore.DocumentData>);
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
      const snapshot = await Firestore.getDoc(docRef);
      if (!snapshot.exists()) return null;
      return mapDoc(snapshot as Firestore.QueryDocumentSnapshot<Firestore.DocumentData>);
    },
  });
}

// =============================================================================

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
  healthLogs: (userId?: string | null) =>
    ['health-logs', userId ?? 'anonymous'] as const,
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
  const viewing = useViewingSafe();
  const effectiveUserId = userId ?? viewing?.viewingUserId ?? null;
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
  const viewing = useViewingSafe();
  const effectiveUserId = userId ?? viewing?.viewingUserId ?? null;
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
  const viewing = useViewingSafe();
  const effectiveUserId = userId ?? viewing?.viewingUserId ?? null;
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
  // Only call useViewing if no userId is explicitly provided
  // This prevents hook order issues in components that pass userId explicitly
  const viewing = useViewingSafe();
  const effectiveUserId = userId ?? viewing?.viewingUserId ?? null;
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

/**
 * Detect whether a user has any patient data (visits or medications).
 * Used to differentiate patient-only, caregiver-only, and hybrid users.
 */
export function useHasPatientData(userId?: string | null) {
  const userKey = userId ?? 'anonymous';

  return useQuery({
    queryKey: ['has-patient-data', userKey],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!userId) return false;

      // Check visits quickly
      const visitsSnap = await Firestore.getDocs(
        query(collection(db, 'visits'), where('userId', '==', userId), limit(1)),
      );
      if (!visitsSnap.empty) return true;

      // Check medications if no visits
      const medsSnap = await Firestore.getDocs(
        query(collection(db, 'medications'), where('userId', '==', userId), limit(1)),
      );
      return !medsSnap.empty;
    },
  });
}

export type HealthLog = {
  id: string;
  userId: string;
  type: 'bp' | 'glucose' | 'weight' | 'med_compliance' | 'symptom_check';
  value: {
    systolic?: number;
    diastolic?: number;
    reading?: number;
    timing?: string;
    weight?: number;
    unit?: string;
    taken?: boolean;
    symptoms?: string[];
    severity?: string;
    note?: string;
  };
  alertLevel?: 'normal' | 'caution' | 'warning';
  createdAt?: string | null;
  source?: string;
};

export function useHealthLogs(
  userId?: string | null,
  options?: QueryEnabledOptions<HealthLog[]>,
) {
  const viewing = useViewingSafe();
  const effectiveUserId = userId ?? viewing?.viewingUserId ?? null;
  const key = useMemo(() => queryKeys.healthLogs(effectiveUserId), [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const healthLogsQueryRef = useMemo(() => {
    if (!effectiveUserId) return null;
    return query(
      collection(db, 'healthLogs'),
      where('userId', '==', effectiveUserId),
    );
  }, [effectiveUserId]);

  return useFirestoreCollection<HealthLog>(healthLogsQueryRef, key, {
    transform: sortByTimestampDescending,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

// =============================================================================
// Medication Reminders
// =============================================================================

export type MedicationReminder = {
  id: string;
  userId: string;
  medicationId: string;
  medicationName: string;
  medicationDose?: string;
  times: string[]; // HH:MM format
  enabled: boolean;
  lastSentAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export function useMedicationReminders(
  userId?: string | null,
  options?: QueryEnabledOptions<MedicationReminder[]>,
) {
  const viewing = useViewingSafe();
  const effectiveUserId = userId ?? viewing?.viewingUserId ?? null;
  const key = useMemo(() => ['medication-reminders', effectiveUserId ?? 'anonymous'] as const, [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);
  const handleSnapshotError = useRealtimeErrorHandler();

  const remindersQueryRef = useMemo(() => {
    if (!effectiveUserId) return null;
    return query(
      collection(db, 'medicationReminders'),
      where('userId', '==', effectiveUserId),
    );
  }, [effectiveUserId]);

  return useFirestoreCollection<MedicationReminder>(remindersQueryRef, key, {
    transform: sortByTimestampDescending,
    enabled,
    onError: handleSnapshotError,
    queryOptions: options,
  });
}

// =============================================================================
// Medication Compliance
// =============================================================================

export type MedicationCompliance = {
  hasReminders: boolean;
  period: number;
  adherence: number;
  takenCount: number;
  expectedCount: number;
  byMedication: Array<{
    medicationId: string;
    name: string;
    adherence: number;
    taken: number;
    expected: number;
  }>;
  dailyData: Array<{
    date: string;
    adherence: number;
    taken: number;
    expected: number;
  }>;
};

export function useMedicationCompliance(
  days: number = 7,
  options?: QueryEnabledOptions<MedicationCompliance>,
) {
  const viewing = useViewingSafe();
  const effectiveUserId = viewing?.viewingUserId ?? null;
  const key = useMemo(() => ['medication-compliance', effectiveUserId ?? 'anonymous', days] as const, [effectiveUserId, days]);
  const enabled = Boolean(effectiveUserId);

  return useQuery<MedicationCompliance>({
    queryKey: key,
    staleTime: 60_000, // 1 minute
    enabled,
    ...options,
    queryFn: async () => {
      if (!effectiveUserId) {
        return {
          hasReminders: false,
          period: days,
          adherence: 0,
          takenCount: 0,
          expectedCount: 0,
          byMedication: [],
          dailyData: [],
        };
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/meds/compliance?days=${days}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch compliance data');
      }

      return response.json();
    },
  });
}

// =============================================================================
// Health Insights (AI-generated)
// =============================================================================

export type HealthInsight = {
  id: string;
  text: string;
  type: 'positive' | 'neutral' | 'attention' | 'tip';
  category: 'medication' | 'vitals' | 'engagement' | 'general';
  generatedAt: string | null;
  expiresAt: string | null;
};

export function useHealthInsights(
  options?: QueryEnabledOptions<HealthInsight[]>,
) {
  const viewing = useViewingSafe();
  const effectiveUserId = viewing?.viewingUserId ?? null;
  const key = useMemo(() => ['health-insights', effectiveUserId ?? 'anonymous'] as const, [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);

  return useQuery<HealthInsight[]>({
    queryKey: key,
    staleTime: 5 * 60 * 1000, // 5 minutes (insights are cached for 24h server-side)
    enabled,
    ...options,
    queryFn: async () => {
      if (!effectiveUserId) {
        return [];
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/insights`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }

      const data = await response.json();
      return data.insights || [];
    },
  });
}

// =============================================================================
// Patient Conditions (AI-detected from visits)
// =============================================================================

export type PatientCondition = {
  id: string;
  name: string;
  status: 'active' | 'resolved' | 'monitoring';
  diagnosedAt: string | null;
  sourceVisitId: string;
  notes?: string;
};

export function usePatientConditions(
  options?: QueryEnabledOptions<PatientCondition[]>,
) {
  const viewing = useViewingSafe();
  const effectiveUserId = viewing?.viewingUserId ?? null;
  const key = useMemo(() => ['patient-conditions', effectiveUserId ?? 'anonymous'] as const, [effectiveUserId]);
  const enabled = Boolean(effectiveUserId);

  return useQuery<PatientCondition[]>({
    queryKey: key,
    staleTime: 60_000, // 1 minute
    enabled,
    ...options,
    queryFn: async () => {
      if (!effectiveUserId) {
        return [];
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/medical-context/conditions`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conditions');
      }

      const data = await response.json();
      return data.conditions || [];
    },
  });
}

import { useMutation } from '@tanstack/react-query';

export function useUpdateConditionStatus() {
  const queryClient = useQueryClient();
  const viewing = useViewingSafe();
  const effectiveUserId = viewing?.viewingUserId ?? null;

  return useMutation({
    mutationFn: async ({ conditionId, status }: { conditionId: string; status: 'active' | 'resolved' | 'monitoring' }) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/medical-context/conditions/${conditionId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ status }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update condition status');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['patient-conditions', effectiveUserId ?? 'anonymous'],
      });
      toast.success('Condition updated');
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Failed to update condition';
      toast.error(message);
    },
  });
}
