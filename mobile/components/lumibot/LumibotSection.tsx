/**
 * LumibotSection Component
 * 
 * Collapsible dashboard section that displays active nudges from LumiBot.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { NudgeCard } from './NudgeCard';
import type { Nudge } from '@lumimd/sdk';

export interface LumibotSectionProps {
    nudges: Nudge[];
    isLoading: boolean;
    error?: Error | null;
    onUpdateNudge: (id: string, data: { status: 'snoozed' | 'dismissed'; snoozeDays?: number }) => void;
    onRespondToNudge: (id: string, data: { response: 'yes' | 'no' | 'good' | 'having_issues'; note?: string }) => void;
    onOpenLogModal: (nudge: Nudge) => void;
}

export function LumibotSection({
    nudges,
    isLoading,
    error,
    onUpdateNudge,
    onRespondToNudge,
    onOpenLogModal,
}: LumibotSectionProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleToggle = useCallback(() => {
        setIsCollapsed(prev => !prev);
    }, []);

    const handleAction = useCallback((nudge: Nudge) => {
        if (nudge.actionType === 'confirm_yes_no') {
            // Show quick response alert
            Alert.alert(
                nudge.title,
                nudge.message,
                [
                    {
                        text: 'Not Yet',
                        style: 'cancel',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'no' }),
                    },
                    {
                        text: 'Yes',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'yes' }),
                    },
                ],
            );
        } else if (nudge.actionType === 'medication_check') {
            // Show medication check options
            Alert.alert(
                nudge.title,
                nudge.message,
                [
                    {
                        text: 'Having Issues',
                        style: 'destructive',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'having_issues' }),
                    },
                    {
                        text: 'Going Well',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'good' }),
                    },
                ],
            );
        } else {
            // Open log modal for BP, glucose, etc.
            onOpenLogModal(nudge);
        }
    }, [onRespondToNudge, onOpenLogModal]);

    const handleSnooze = useCallback((nudge: Nudge) => {
        Alert.alert(
            'Snooze',
            'Would you like to be reminded later?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Tomorrow',
                    onPress: () => onUpdateNudge(nudge.id, { status: 'snoozed', snoozeDays: 1 }),
                },
                {
                    text: 'In 3 Days',
                    onPress: () => onUpdateNudge(nudge.id, { status: 'snoozed', snoozeDays: 3 }),
                },
            ],
        );
    }, [onUpdateNudge]);

    const handleDismiss = useCallback((nudge: Nudge) => {
        Alert.alert(
            'Dismiss',
            'This nudge won\'t appear again. You can still log data manually anytime.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Dismiss',
                    style: 'destructive',
                    onPress: () => onUpdateNudge(nudge.id, { status: 'dismissed' }),
                },
            ],
        );
    }, [onUpdateNudge]);

    // Don't render if no nudges and not loading
    if (!isLoading && !error && nudges.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <Pressable style={styles.header} onPress={handleToggle}>
                <View style={styles.headerLeft}>
                    <View style={styles.botIcon}>
                        <Ionicons name="sparkles" size={16} color={Colors.primary} />
                    </View>
                    <Text style={styles.headerTitle}>LumiBot</Text>
                    {nudges.length > 0 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{nudges.length}</Text>
                        </View>
                    )}
                </View>
                <Ionicons
                    name={isCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={20}
                    color={Colors.textMuted}
                />
            </Pressable>

            {/* Content */}
            {!isCollapsed && (
                <View style={styles.content}>
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={Colors.primary} />
                        </View>
                    ) : error ? (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>Unable to load. Pull down to refresh.</Text>
                        </View>
                    ) : (
                        nudges.map(nudge => (
                            <NudgeCard
                                key={nudge.id}
                                nudge={nudge}
                                onAction={handleAction}
                                onSnooze={handleSnooze}
                                onDismiss={handleDismiss}
                            />
                        ))
                    )}
                </View>
            )}

            {/* Disclaimer */}
            {!isCollapsed && nudges.length > 0 && (
                <Text style={styles.disclaimer}>
                    For tracking purposes only. Not medical advice.
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing(4),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(2),
        marginBottom: spacing(2),
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
    },
    botIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: `${Colors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    badge: {
        backgroundColor: Colors.primary,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing(1.5),
    },
    badgeText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    content: {
        // Nudge cards will be rendered here
    },
    loadingContainer: {
        paddingVertical: spacing(6),
        alignItems: 'center',
    },
    errorContainer: {
        paddingVertical: spacing(4),
        alignItems: 'center',
    },
    errorText: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    disclaimer: {
        fontSize: 11,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: spacing(2),
        fontStyle: 'italic',
    },
});
