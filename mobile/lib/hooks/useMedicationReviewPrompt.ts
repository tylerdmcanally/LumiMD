/**
 * useMedicationReviewPrompt
 *
 * Hook that monitors for visits with pending medication confirmation.
 * Uses Firestore realtime listener to detect when medicationConfirmationStatus === 'pending'
 * and pendingMedicationChanges is populated (safety-annotated medication changes ready for review).
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import type { MedicationChanges } from '@lumimd/sdk';

export interface PendingMedicationReview {
  visitId: string;
  visitDate: string | null;
  pendingMedicationChanges: MedicationChanges;
}

export function useMedicationReviewPrompt() {
  const { user } = useAuth();
  const [pendingReview, setPendingReview] = useState<PendingMedicationReview | null>(null);
  const lastPromptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    // Listen for visits with pending medication confirmation
    const unsubscribe = firestore()
      .collection('visits')
      .where('userId', '==', user.uid)
      .where('medicationConfirmationStatus', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .onSnapshot(
        (snapshot) => {
          for (const change of snapshot.docChanges()) {
            if (change.type === 'added' || change.type === 'modified') {
              const visit = change.doc.data();
              const visitId = change.doc.id;

              // Only prompt once per visit per session
              if (lastPromptedRef.current.has(visitId)) {
                continue;
              }

              // Need both pending status and populated pending changes
              if (
                visit.medicationConfirmationStatus === 'pending' &&
                visit.pendingMedicationChanges
              ) {
                const pending = visit.pendingMedicationChanges;
                const hasChanges =
                  (pending.started?.length ?? 0) > 0 ||
                  (pending.stopped?.length ?? 0) > 0 ||
                  (pending.changed?.length ?? 0) > 0;

                if (hasChanges) {
                  lastPromptedRef.current.add(visitId);
                  console.log(
                    '[useMedicationReviewPrompt] Pending medication review found:',
                    visitId,
                  );

                  const visitDate =
                    visit.visitDate?.toDate?.()?.toISOString?.() ??
                    visit.createdAt?.toDate?.()?.toISOString?.() ??
                    null;

                  setPendingReview({
                    visitId,
                    visitDate,
                    pendingMedicationChanges: pending as MedicationChanges,
                  });
                  // Only show one review at a time
                  return;
                }
              }
            }
          }
        },
        (error) => {
          console.error('[useMedicationReviewPrompt] Firestore listener error:', error);
        },
      );

    return () => {
      unsubscribe();
    };
  }, [user]);

  const clearPendingReview = useCallback(() => {
    setPendingReview(null);
  }, []);

  return {
    pendingReview,
    clearPendingReview,
  };
}
