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
  const dismissedRef = useRef<Set<string>>(new Set());
  // Track the visitId we've already set as pending — prevents duplicate
  // snapshots (from sequential backend writes) from re-triggering the sheet.
  const activeVisitIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      if (__DEV__) console.log('[useMedicationReviewPrompt] No user, skipping listener');
      return;
    }

    if (__DEV__) console.log('[useMedicationReviewPrompt] Setting up Firestore listener for user:', user.uid);

    // Listen for visits with pending medication confirmation
    const unsubscribe = firestore()
      .collection('visits')
      .where('userId', '==', user.uid)
      .where('medicationConfirmationStatus', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .onSnapshot(
        (snapshot) => {
          if (__DEV__) {
          console.log(
            '[useMedicationReviewPrompt] Snapshot received:',
            snapshot.size,
            'docs,',
            'empty:',
            snapshot.empty,
          );
          }

          if (snapshot.empty) {
            if (__DEV__) console.log('[useMedicationReviewPrompt] No pending visits found');
            return;
          }

          // Iterate over all docs in the snapshot (more reliable than docChanges)
          for (const doc of snapshot.docs) {
            const visit = doc.data();
            const visitId = doc.id;

            if (__DEV__) {
            console.log(
              '[useMedicationReviewPrompt] Checking visit:',
              visitId,
              'status:',
              visit.medicationConfirmationStatus,
              'hasPending:',
              Boolean(visit.pendingMedicationChanges),
              'dismissed:',
              dismissedRef.current.has(visitId),
            );
            }

            // Skip visits the user already dismissed this session
            if (dismissedRef.current.has(visitId)) {
              continue;
            }

            // Skip if we've already set this visit as the active review —
            // subsequent snapshots from backend writes shouldn't re-trigger.
            if (activeVisitIdRef.current === visitId) {
              if (__DEV__) {
              console.log(
                '[useMedicationReviewPrompt] Skipping duplicate snapshot for already-active visit:',
                visitId,
              );
              }
              return;
            }

            // Need both pending status and populated pending changes
            if (
              visit.medicationConfirmationStatus === 'pending' &&
              visit.pendingMedicationChanges
            ) {
              const pending = visit.pendingMedicationChanges;
              const startedCount = pending.started?.length ?? 0;
              const stoppedCount = pending.stopped?.length ?? 0;
              const changedCount = pending.changed?.length ?? 0;
              const hasChanges = startedCount > 0 || stoppedCount > 0 || changedCount > 0;

              if (__DEV__) {
              console.log(
                '[useMedicationReviewPrompt] Visit',
                visitId,
                'changes:',
                `started=${startedCount}, stopped=${stoppedCount}, changed=${changedCount}`,
                'hasChanges:',
                hasChanges,
              );
              }

              if (hasChanges) {
                const visitDate =
                  visit.visitDate?.toDate?.()?.toISOString?.() ??
                  visit.createdAt?.toDate?.()?.toISOString?.() ??
                  null;

                if (__DEV__) {
                console.log(
                  '[useMedicationReviewPrompt] Setting pending review for visit:',
                  visitId,
                );
                }

                activeVisitIdRef.current = visitId;
                setPendingReview({
                  visitId,
                  visitDate,
                  pendingMedicationChanges: pending as MedicationChanges,
                });
                // Only show one review at a time — most recent first
                return;
              }
            }
          }
        },
        (error) => {
          console.error('[useMedicationReviewPrompt] Firestore listener error:', error);
          console.error('[useMedicationReviewPrompt] Error code:', (error as any)?.code);
          console.error('[useMedicationReviewPrompt] Error message:', error?.message);
        },
      );

    return () => {
      if (__DEV__) console.log('[useMedicationReviewPrompt] Cleaning up listener');
      unsubscribe();
    };
  }, [user]);

  const clearPendingReview = useCallback(() => {
    if (pendingReview) {
      if (__DEV__) {
      console.log(
        '[useMedicationReviewPrompt] Dismissing review for visit:',
        pendingReview.visitId,
      );
      }
      dismissedRef.current.add(pendingReview.visitId);
    }
    activeVisitIdRef.current = null;
    setPendingReview(null);
  }, [pendingReview]);

  return {
    pendingReview,
    clearPendingReview,
  };
}
