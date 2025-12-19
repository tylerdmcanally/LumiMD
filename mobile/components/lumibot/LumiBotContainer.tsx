/**
 * LumiBotContainer Component
 * 
 * Self-contained component that fetches nudges and manages all LumiBot interactions.
 * Uses realtime Firestore listener for instant updates when nudges are created.
 */

import React, { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { LumiBotBanner } from './LumiBotBanner';
import { BPLogModal } from './BPLogModal';
import { GlucoseLogModal } from './GlucoseLogModal';
import { SideEffectsModal } from './SideEffectsModal';
import type { SideEffectResponse } from './SideEffectsModal';
import { SafetyAlert } from './SafetyAlert';
import {
    useRealtimeNudges,
    useUpdateNudge,
    useRespondToNudge,
    useCreateHealthLog,
} from '../../lib/api/hooks';
import type { Nudge, AlertLevel, BloodPressureValue, GlucoseValue } from '@lumimd/sdk';


export interface LumiBotContainerProps {
    userId?: string | null;
    enabled?: boolean;
}

export function LumiBotContainer({ userId, enabled = true }: LumiBotContainerProps) {
    // State
    const [activeBPNudge, setActiveBPNudge] = useState<Nudge | null>(null);
    const [activeGlucoseNudge, setActiveGlucoseNudge] = useState<Nudge | null>(null);
    const [activeSideEffectsNudge, setActiveSideEffectsNudge] = useState<Nudge | null>(null);
    const [safetyAlert, setSafetyAlert] = useState<{
        visible: boolean;
        level: AlertLevel;
        message: string;
    }>({ visible: false, level: 'normal', message: '' });

    // Queries and Mutations - use realtime hook for instant updates
    const { data: nudges = [], isLoading } = useRealtimeNudges(userId, { enabled });
    const updateNudge = useUpdateNudge();
    const respondToNudge = useRespondToNudge();
    const createHealthLog = useCreateHealthLog();

    // Handlers
    const handleUpdateNudge = useCallback((id: string, data: { status: 'snoozed' | 'dismissed'; snoozeDays?: number }) => {
        updateNudge.mutate({ id, data }, {
            onError: (err) => {
                Alert.alert('Error', 'Failed to update nudge. Please try again.');
                console.error('[LumiBot] Update nudge error:', err);
            },
        });
    }, [updateNudge]);

    const handleRespondToNudge = useCallback((id: string, data: { response: 'yes' | 'no' | 'good' | 'having_issues'; note?: string; sideEffects?: string[] }) => {
        respondToNudge.mutate({ id, data }, {
            onError: (err) => {
                Alert.alert('Error', 'Failed to save response. Please try again.');
                console.error('[LumiBot] Respond to nudge error:', err);
            },
        });
    }, [respondToNudge]);

    // Open side effects modal when user reports issues
    const handleOpenSideEffectsModal = useCallback((nudge: Nudge) => {
        setActiveSideEffectsNudge(nudge);
    }, []);

    // Submit side effects from modal
    const handleSideEffectsSubmit = useCallback(async (response: SideEffectResponse) => {
        if (!activeSideEffectsNudge) return;

        handleRespondToNudge(activeSideEffectsNudge.id, {
            response: 'having_issues',
            sideEffects: response.sideEffects,
            note: response.notes,
        });

        setActiveSideEffectsNudge(null);
    }, [activeSideEffectsNudge, handleRespondToNudge]);

    const handleOpenLogModal = useCallback((nudge: Nudge) => {
        if (nudge.actionType === 'log_bp') {
            setActiveBPNudge(nudge);
        } else if (nudge.actionType === 'log_glucose') {
            setActiveGlucoseNudge(nudge);
        } else {
            // Fallback for other action types
            Alert.alert('Coming Soon', 'This log type will be available soon!');
        }
    }, []);


    const handleBPSubmit = useCallback(async (value: BloodPressureValue) => {
        try {
            const result = await createHealthLog.mutateAsync({
                type: 'bp',
                value,
                nudgeId: activeBPNudge?.id,
                source: activeBPNudge ? 'nudge' : 'manual',
            });

            // Check for safety alert
            if (result.shouldShowAlert && result.alertLevel && result.alertMessage) {
                setSafetyAlert({
                    visible: true,
                    level: result.alertLevel,
                    message: result.alertMessage,
                });
            }

            setActiveBPNudge(null);

            return {
                alertLevel: result.alertLevel,
                alertMessage: result.alertMessage,
                shouldShowAlert: result.shouldShowAlert,
            };
        } catch (err) {
            console.error('[LumiBot] BP log error:', err);
            Alert.alert('Error', 'Failed to save reading. Please try again.');
            return { shouldShowAlert: false };
        }
    }, [activeBPNudge, createHealthLog]);

    const handleGlucoseSubmit = useCallback(async (value: GlucoseValue) => {
        try {
            const result = await createHealthLog.mutateAsync({
                type: 'glucose',
                value,
                nudgeId: activeGlucoseNudge?.id,
                source: activeGlucoseNudge ? 'nudge' : 'manual',
            });

            // Check for safety alert
            if (result.shouldShowAlert && result.alertLevel && result.alertMessage) {
                setSafetyAlert({
                    visible: true,
                    level: result.alertLevel,
                    message: result.alertMessage,
                });
            }

            setActiveGlucoseNudge(null);

            return {
                alertLevel: result.alertLevel,
                alertMessage: result.alertMessage,
                shouldShowAlert: result.shouldShowAlert,
            };
        } catch (err) {
            console.error('[LumiBot] Glucose log error:', err);
            Alert.alert('Error', 'Failed to save reading. Please try again.');
            return { shouldShowAlert: false };
        }
    }, [activeGlucoseNudge, createHealthLog]);

    const handleDismissSafetyAlert = useCallback(() => {
        setSafetyAlert({ visible: false, level: 'normal', message: '' });
    }, []);

    if (!enabled) {
        return null;
    }

    return (
        <>
            <LumiBotBanner
                nudges={nudges}
                isLoading={isLoading}
                onUpdateNudge={handleUpdateNudge}
                onRespondToNudge={handleRespondToNudge}
                onOpenLogModal={handleOpenLogModal}
                onOpenSideEffectsModal={handleOpenSideEffectsModal}
            />

            <BPLogModal
                visible={activeBPNudge !== null}
                onClose={() => setActiveBPNudge(null)}
                onSubmit={handleBPSubmit}
                isSubmitting={createHealthLog.isPending}
                nudgeId={activeBPNudge?.id}
            />

            <GlucoseLogModal
                visible={activeGlucoseNudge !== null}
                onClose={() => setActiveGlucoseNudge(null)}
                onSubmit={handleGlucoseSubmit}
                isSubmitting={createHealthLog.isPending}
                nudgeId={activeGlucoseNudge?.id}
            />

            <SideEffectsModal
                visible={activeSideEffectsNudge !== null}
                medicationName={activeSideEffectsNudge?.medicationName}
                onClose={() => setActiveSideEffectsNudge(null)}
                onSubmit={handleSideEffectsSubmit}
                isSubmitting={respondToNudge.isPending}
            />

            <SafetyAlert
                visible={safetyAlert.visible}
                alertLevel={safetyAlert.level}
                message={safetyAlert.message}
                onDismiss={handleDismissSafetyAlert}
            />
        </>

    );
}
