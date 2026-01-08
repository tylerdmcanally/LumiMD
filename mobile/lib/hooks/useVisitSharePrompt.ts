/**
 * useVisitSharePrompt
 * 
 * Hook that monitors for newly-completed visits and prompts to share with caregivers.
 * Uses Firestore realtime listener to detect when processingStatus changes to 'completed'.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../api/client';

interface PendingShare {
    visitId: string;
    caregiverCount: number;
}

export function useVisitSharePrompt() {
    const { user } = useAuth();
    const [pendingShare, setPendingShare] = useState<PendingShare | null>(null);
    const lastCompletedRef = useRef<Set<string>>(new Set());
    const caregiverCountRef = useRef<number>(0);
    const hasActiveCaregiversRef = useRef<boolean>(false);

    // Check for active caregivers on mount
    const checkCaregivers = useCallback(async () => {
        if (!user) return;
        try {
            const response = await api.user.listCaregivers();
            const activeCaregivers = (response.caregivers || []).filter(
                (c: any) => c.status !== 'paused'
            );
            caregiverCountRef.current = activeCaregivers.length;
            hasActiveCaregiversRef.current = activeCaregivers.length > 0;
        } catch (error) {
            console.error('[useVisitSharePrompt] Failed to check caregivers:', error);
            hasActiveCaregiversRef.current = false;
        }
    }, [user]);

    // Listen for visit processing completion
    useEffect(() => {
        if (!user) return;

        // Check caregivers first
        checkCaregivers();

        // Query for user's recent visits that are processing or completed
        const unsubscribe = firestore()
            .collection('visits')
            .where('userId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .onSnapshot(
                (snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'modified') {
                            const visit = change.doc.data();
                            const visitId = change.doc.id;
                            const status = visit.processingStatus || visit.status;

                            // Check if this visit just completed
                            if (
                                status === 'completed' &&
                                !lastCompletedRef.current.has(visitId)
                            ) {
                                lastCompletedRef.current.add(visitId);

                                // Only prompt if user has active caregivers
                                if (hasActiveCaregiversRef.current) {
                                    console.log('[useVisitSharePrompt] Visit completed, prompting share:', visitId);
                                    setPendingShare({
                                        visitId,
                                        caregiverCount: caregiverCountRef.current,
                                    });
                                }
                            }
                        }
                    });
                },
                (error) => {
                    console.error('[useVisitSharePrompt] Firestore listener error:', error);
                }
            );

        return () => {
            unsubscribe();
        };
    }, [user, checkCaregivers]);

    // Clear the pending share (after user responds to sheet)
    const clearPendingShare = useCallback(() => {
        setPendingShare(null);
    }, []);

    // Refresh caregiver check (call after user adds/removes caregivers)
    const refreshCaregivers = useCallback(() => {
        checkCaregivers();
    }, [checkCaregivers]);

    return {
        pendingShare,
        clearPendingShare,
        refreshCaregivers,
        hasCaregivers: hasActiveCaregiversRef.current,
    };
}
