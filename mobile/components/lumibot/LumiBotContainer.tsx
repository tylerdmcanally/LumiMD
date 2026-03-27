/**
 * LumiBotContainer Component
 *
 * Self-contained component that fetches nudges and manages all LumiBot interactions.
 * Uses realtime Firestore listener for instant updates when nudges are created.
 *
 * v2: Shows PostLogFeedback with trend context after logging readings.
 */

import React, { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LumiBotBanner } from './LumiBotBanner';
import { BPLogModal } from './BPLogModal';
import { GlucoseLogModal } from './GlucoseLogModal';
import { WeightLogModal } from './WeightLogModal';
import type { WeightValue } from './WeightLogModal';
import { SideEffectsModal } from './SideEffectsModal';
import { SymptomCheckModal } from './SymptomCheckModal';
import type { SymptomCheckValue } from './SymptomCheckModal';
import type { SideEffectResponse } from './SideEffectsModal';
import { SafetyAlert } from './SafetyAlert';
import { PostLogFeedback } from './PostLogFeedback';
import type { RecentReading } from './PostLogFeedback';
import {
    useRealtimeNudges,
    useUpdateNudge,
    useRespondToNudge,
    useCreateHealthLog,
} from '../../lib/api/hooks';
import type { Nudge, AlertLevel, BloodPressureValue, GlucoseValue, HealthLogType } from '@lumimd/sdk';


export interface LumiBotContainerProps {
    userId?: string | null;
    enabled?: boolean;
}

/** Format a BP or glucose value for display */
function formatLogValue(type: HealthLogType, value: unknown): string {
    const v = value as Record<string, unknown>;
    if (type === 'bp' && typeof v.systolic === 'number' && typeof v.diastolic === 'number') {
        return `${v.systolic}/${v.diastolic}`;
    }
    if (type === 'glucose' && typeof v.reading === 'number') {
        return `${v.reading} mg/dL`;
    }
    if (type === 'weight' && typeof v.weight === 'number') {
        return `${v.weight} ${v.unit || 'lbs'}`;
    }
    return '';
}

export function LumiBotContainer({ userId, enabled = true }: LumiBotContainerProps) {
    const router = useRouter();

    // State
    const [activeBPNudge, setActiveBPNudge] = useState<Nudge | null>(null);
    const [activeGlucoseNudge, setActiveGlucoseNudge] = useState<Nudge | null>(null);
    const [activeWeightNudge, setActiveWeightNudge] = useState<Nudge | null>(null);
    const [activeSideEffectsNudge, setActiveSideEffectsNudge] = useState<Nudge | null>(null);
    const [activeSymptomCheckNudge, setActiveSymptomCheckNudge] = useState<Nudge | null>(null);
    const [safetyAlert, setSafetyAlert] = useState<{
        visible: boolean;
        level: AlertLevel;
        message: string;
    }>({ visible: false, level: 'normal', message: '' });

    // v2: Post-log feedback state
    const [postLogFeedback, setPostLogFeedback] = useState<{
        visible: boolean;
        currentValue: string;
        alertLevel: AlertLevel;
        healthLogType: HealthLogType;
        recentReadings: RecentReading[];
    }>({ visible: false, currentValue: '', alertLevel: 'normal', healthLogType: 'bp', recentReadings: [] });

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

    const handleRespondToNudge = useCallback((id: string, data: { response: 'got_it' | 'not_yet' | 'taking_it' | 'having_trouble' | 'good' | 'okay' | 'issues' | 'none' | 'mild' | 'concerning' | 'done' | 'remind_later'; note?: string; sideEffects?: string[] }) => {
        respondToNudge.mutate({ id, data }, {
            onSuccess: (result) => {
                Alert.alert('Response Recorded', result.message);
            },
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
            response: 'issues',
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
        } else if (nudge.actionType === 'log_weight') {
            setActiveWeightNudge(nudge);
        } else if (nudge.actionType === 'symptom_check') {
            setActiveSymptomCheckNudge(nudge);
        } else {
            Alert.alert('Coming Soon', 'This log type will be available soon!');
        }
    }, []);

    /** Show post-log feedback or safety alert based on alert level */
    const showPostLogResult = useCallback((
        type: HealthLogType,
        value: unknown,
        alertLevel: AlertLevel | undefined,
        alertMessage: string | undefined,
        shouldShowAlert: boolean | undefined,
        nudge: Nudge | null,
    ) => {
        const level = alertLevel || 'normal';

        // Emergency → SafetyAlert only (unchanged)
        if (level === 'emergency' && shouldShowAlert && alertMessage) {
            setSafetyAlert({ visible: true, level, message: alertMessage });
            return;
        }

        // Warning with alert → SafetyAlert (keep existing behavior)
        if (level === 'warning' && shouldShowAlert && alertMessage) {
            setSafetyAlert({ visible: true, level, message: alertMessage });
            return;
        }

        // Normal or caution → PostLogFeedback with context
        const formatted = formatLogValue(type, value);
        const recentReadings: RecentReading[] = [];

        // Pull last reading from nudge context if available
        if (nudge?.context?.lastReading) {
            recentReadings.push({
                value: nudge.context.lastReading.value,
                date: nudge.context.lastReading.date,
            });
        }

        setPostLogFeedback({
            visible: true,
            currentValue: formatted,
            alertLevel: level,
            healthLogType: type,
            recentReadings,
        });
    }, []);

    const handleBPSubmit = useCallback(async (value: BloodPressureValue) => {
        try {
            const result = await createHealthLog.mutateAsync({
                type: 'bp',
                value,
                nudgeId: activeBPNudge?.id,
                source: activeBPNudge ? 'nudge' : 'manual',
            });

            const nudge = activeBPNudge;
            setActiveBPNudge(null);
            showPostLogResult('bp', value, result.alertLevel, result.alertMessage, result.shouldShowAlert, nudge);

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
    }, [activeBPNudge, createHealthLog, showPostLogResult]);

    const handleGlucoseSubmit = useCallback(async (value: GlucoseValue) => {
        try {
            const result = await createHealthLog.mutateAsync({
                type: 'glucose',
                value,
                nudgeId: activeGlucoseNudge?.id,
                source: activeGlucoseNudge ? 'nudge' : 'manual',
            });

            const nudge = activeGlucoseNudge;
            setActiveGlucoseNudge(null);
            showPostLogResult('glucose', value, result.alertLevel, result.alertMessage, result.shouldShowAlert, nudge);

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
    }, [activeGlucoseNudge, createHealthLog, showPostLogResult]);

    const handleDismissSafetyAlert = useCallback(() => {
        setSafetyAlert({ visible: false, level: 'normal', message: '' });
    }, []);

    const handleDismissPostLogFeedback = useCallback(() => {
        setPostLogFeedback(prev => ({ ...prev, visible: false }));
    }, []);

    const handleViewTrend = useCallback(() => {
        const type = postLogFeedback.healthLogType;
        setPostLogFeedback(prev => ({ ...prev, visible: false }));
        router.push({ pathname: '/(patient)/health', params: { type } });
    }, [postLogFeedback.healthLogType, router]);

    const handleWeightSubmit = useCallback(async (value: WeightValue) => {
        try {
            const result = await createHealthLog.mutateAsync({
                type: 'weight',
                value,
                nudgeId: activeWeightNudge?.id,
                source: activeWeightNudge ? 'nudge' : 'manual',
            });

            const nudge = activeWeightNudge;
            setActiveWeightNudge(null);
            showPostLogResult('weight', value, result.alertLevel, result.alertMessage, result.shouldShowAlert, nudge);

            return {
                alertLevel: result.alertLevel,
                alertMessage: result.alertMessage,
                shouldShowAlert: result.shouldShowAlert,
            };
        } catch (err) {
            console.error('[LumiBot] Weight log error:', err);
            Alert.alert('Error', 'Failed to save reading. Please try again.');
            return { shouldShowAlert: false };
        }
    }, [activeWeightNudge, createHealthLog, showPostLogResult]);

    const handleSymptomCheckSubmit = useCallback(async (value: SymptomCheckValue) => {
        try {
            const result = await createHealthLog.mutateAsync({
                type: 'symptom_check',
                value,
                nudgeId: activeSymptomCheckNudge?.id,
                source: activeSymptomCheckNudge ? 'nudge' : 'manual',
            });

            // Symptom checks keep the existing SafetyAlert flow (no PostLogFeedback)
            if (value.breathingDifficulty >= 4 || value.swelling === 'severe') {
                setSafetyAlert({
                    visible: true,
                    level: 'warning',
                    message: 'Your symptoms suggest you may need to contact your care team. Please reach out if symptoms worsen.',
                });
            }

            setActiveSymptomCheckNudge(null);

            return {
                alertLevel: result.alertLevel,
                alertMessage: result.alertMessage,
                shouldShowAlert: result.shouldShowAlert,
            };
        } catch (err) {
            console.error('[LumiBot] Symptom check error:', err);
            Alert.alert('Error', 'Failed to save check-in. Please try again.');
            return { shouldShowAlert: false };
        }
    }, [activeSymptomCheckNudge, createHealthLog]);

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

            <WeightLogModal
                visible={activeWeightNudge !== null}
                onClose={() => setActiveWeightNudge(null)}
                onSubmit={handleWeightSubmit}
                isSubmitting={createHealthLog.isPending}
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

            <PostLogFeedback
                visible={postLogFeedback.visible}
                currentValue={postLogFeedback.currentValue}
                alertLevel={postLogFeedback.alertLevel}
                healthLogType={postLogFeedback.healthLogType}
                recentReadings={postLogFeedback.recentReadings}
                onViewTrend={handleViewTrend}
                onDismiss={handleDismissPostLogFeedback}
            />

            <SymptomCheckModal
                visible={activeSymptomCheckNudge !== null}
                onClose={() => setActiveSymptomCheckNudge(null)}
                onSubmit={handleSymptomCheckSubmit}
                isSubmitting={createHealthLog.isPending}
            />
        </>
    );
}
