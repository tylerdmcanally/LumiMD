/**
 * LumiBotBanner Component
 * 
 * A notification-style banner that appears only when there are active nudges.
 * Tapping expands to show nudge cards. Designed to feel like LumiBot is 
 * proactively reaching out rather than a permanent dashboard section.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    Animated,
    LayoutAnimation,
    Platform,
    UIManager,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Colors, spacing, Radius } from '../ui';
import { NudgeCard } from './NudgeCard';
import type { Nudge } from '@lumimd/sdk';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface LumiBotBannerProps {
    nudges: Nudge[];
    isLoading: boolean;
    onUpdateNudge: (id: string, data: { status: 'snoozed' | 'dismissed'; snoozeDays?: number }) => void;
    onRespondToNudge: (id: string, data: { response: 'got_it' | 'not_yet' | 'taking_it' | 'having_trouble' | 'good' | 'okay' | 'issues' | 'none' | 'mild' | 'concerning'; note?: string }) => void;
    onOpenLogModal: (nudge: Nudge) => void;
    onOpenSideEffectsModal: (nudge: Nudge) => void;
}

export function LumiBotBanner({
    nudges,
    isLoading,
    onUpdateNudge,
    onRespondToNudge,
    onOpenLogModal,
    onOpenSideEffectsModal,
}: LumiBotBannerProps) {

    const [isExpanded, setIsExpanded] = useState(false);
    const [slideAnim] = useState(new Animated.Value(0));

    // Animate in when nudges appear
    useEffect(() => {
        if (nudges.length > 0) {
            Animated.spring(slideAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 50,
                friction: 8,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [nudges.length, slideAnim]);

    const handleToggle = useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(prev => !prev);
    }, []);

    const handleAction = useCallback((nudge: Nudge) => {
        if (nudge.actionType === 'acknowledge' || nudge.actionType === 'view_insight') {
            // Introduction/insight nudge - just dismiss it after acknowledging
            onUpdateNudge(nudge.id, { status: 'dismissed' });
        } else if (nudge.actionType === 'pickup_check') {
            // Pickup check: Got it / Not yet
            Alert.alert(
                nudge.title,
                nudge.message,
                [
                    {
                        text: '⏰ Not yet',
                        style: 'cancel',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'not_yet' }),
                    },
                    {
                        text: '✓ Got it',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'got_it' }),
                    },
                ],
            );
        } else if (nudge.actionType === 'started_check') {
            // Started check: Taking it / Not yet / Trouble
            Alert.alert(
                nudge.title,
                nudge.message,
                [
                    {
                        text: 'Having Trouble',
                        style: 'destructive',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'having_trouble' }),
                    },
                    {
                        text: 'Not yet',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'not_yet' }),
                    },
                    {
                        text: 'Taking it',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'taking_it' }),
                    },
                ],
            );
        } else if (nudge.actionType === 'feeling_check') {
            // Feeling check: Good / Okay / Issues
            Alert.alert(
                nudge.title,
                nudge.message,
                [
                    {
                        text: '👎 Issues',
                        style: 'destructive',
                        onPress: () => onOpenSideEffectsModal(nudge),
                    },
                    {
                        text: '😐 Okay',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'okay' }),
                    },
                    {
                        text: '👍 Good',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'good' }),
                    },
                ],
            );
        } else if (nudge.actionType === 'side_effects') {
            // Side effects: None / Mild / Concerning
            Alert.alert(
                nudge.title,
                nudge.message,
                [
                    {
                        text: '👎 Concerning',
                        style: 'destructive',
                        onPress: () => onOpenSideEffectsModal(nudge),
                    },
                    {
                        text: '😐 Mild',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'mild' }),
                    },
                    {
                        text: '👍 None',
                        onPress: () => onRespondToNudge(nudge.id, { response: 'none' }),
                    },
                ],
            );
        } else {
            onOpenLogModal(nudge);
        }
    }, [onUpdateNudge, onRespondToNudge, onOpenLogModal, onOpenSideEffectsModal]);


    const handleSnooze = useCallback((nudge: Nudge) => {
        Alert.alert(
            'Snooze',
            'When should I remind you?',
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
            'This reminder won\'t appear again.',
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
    if (!isLoading && nudges.length === 0) {
        return null;
    }

    // Loading state - don't show anything
    if (isLoading) {
        return null;
    }

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: slideAnim,
                    transform: [
                        {
                            translateY: slideAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-20, 0],
                            }),
                        },
                    ],
                },
            ]}
        >
            {/* Collapsed Banner */}
            <Pressable onPress={handleToggle}>
                <Card style={styles.bannerCard}>
                    <View style={styles.bannerContent}>
                        <View style={styles.bannerLeft}>
                            <View style={styles.sparkleIcon}>
                                <Ionicons name="sparkles" size={18} color={Colors.primary} />
                            </View>
                            <View>
                                <Text style={styles.bannerTitle}>LumiBot</Text>
                                <Text style={styles.bannerSubtitle}>
                                    {nudges.length} {nudges.length === 1 ? 'item' : 'items'} for you
                                </Text>
                            </View>
                        </View>
                        <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={Colors.textMuted}
                        />
                    </View>
                </Card>
            </Pressable>

            {/* Expanded Content */}
            {isExpanded && (
                <View style={styles.expandedContent}>
                    {nudges.map(nudge => (
                        <NudgeCard
                            key={nudge.id}
                            nudge={nudge}
                            onAction={handleAction}
                            onSnooze={handleSnooze}
                            onDismiss={handleDismiss}
                        />
                    ))}
                    <Text style={styles.disclaimer}>
                        For tracking purposes only. Not medical advice.
                    </Text>
                </View>
            )}
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing(3),
    },
    bannerCard: {
        backgroundColor: `${Colors.primary}08`,
        borderColor: `${Colors.primary}30`,
    },
    bannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bannerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(3),
    },
    sparkleIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: `${Colors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bannerTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    bannerSubtitle: {
        fontSize: 13,
        color: Colors.primary,
        marginTop: 2,
    },
    expandedContent: {
        marginTop: spacing(3),
    },
    disclaimer: {
        fontSize: 11,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: spacing(1),
        fontStyle: 'italic',
    },
});
