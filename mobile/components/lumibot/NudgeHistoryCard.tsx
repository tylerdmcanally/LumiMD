/**
 * NudgeHistoryCard Component
 *
 * Read-only display of completed/dismissed nudges with feedback controls.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Colors, spacing, Radius } from '../ui';
import type { Nudge } from '@lumimd/sdk';

export interface NudgeHistoryCardProps {
    nudge: Nudge;
    onFeedback: (nudgeId: string, helpful: boolean) => void;
}

function formatRelativeTime(dateString?: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getStatusLabel(status: Nudge['status']): { text: string; color: string } {
    switch (status) {
        case 'completed':
            return { text: 'Completed', color: Colors.success };
        case 'dismissed':
            return { text: 'Dismissed', color: Colors.textMuted };
        case 'snoozed':
            return { text: 'Snoozed', color: Colors.warning };
        default:
            return { text: 'Active', color: Colors.primary };
    }
}

export function NudgeHistoryCard({ nudge, onFeedback }: NudgeHistoryCardProps) {
    const status = getStatusLabel(nudge.status);
    const feedback = nudge.feedback;
    const statusTime = formatRelativeTime(feedback?.createdAt || nudge.createdAt);

    return (
        <Card style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>{nudge.title}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
                    <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
                </View>
            </View>
            <Text style={styles.message}>{nudge.message}</Text>
            {statusTime ? (
                <Text style={styles.timestamp}>{statusTime}</Text>
            ) : null}

            <View style={styles.feedbackRow}>
                {feedback ? (
                    <View style={styles.feedbackAcknowledged}>
                        <Ionicons name="chatbubble-ellipses-outline" size={14} color={Colors.textMuted} />
                        <Text style={styles.feedbackText}>
                            Feedback: {feedback.helpful ? 'Helpful' : 'Not helpful'}
                        </Text>
                    </View>
                ) : (
                    <>
                        <Pressable
                            style={({ pressed }) => [
                                styles.feedbackButton,
                                pressed && styles.feedbackButtonPressed,
                            ]}
                            onPress={() => onFeedback(nudge.id, true)}
                        >
                            <Ionicons name="thumbs-up-outline" size={14} color={Colors.primary} />
                            <Text style={styles.feedbackButtonText}>Helpful</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [
                                styles.feedbackButton,
                                pressed && styles.feedbackButtonPressed,
                            ]}
                            onPress={() => onFeedback(nudge.id, false)}
                        >
                            <Ionicons name="thumbs-down-outline" size={14} color={Colors.textMuted} />
                            <Text style={styles.feedbackButtonText}>Not helpful</Text>
                        </Pressable>
                    </>
                )}
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: spacing(3),
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing(2),
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        flex: 1,
        marginRight: spacing(2),
    },
    message: {
        fontSize: 14,
        color: Colors.textMuted,
        lineHeight: 20,
        marginBottom: spacing(2),
    },
    timestamp: {
        fontSize: 12,
        color: Colors.textMuted,
        marginBottom: spacing(2),
    },
    statusBadge: {
        paddingHorizontal: spacing(2),
        paddingVertical: spacing(1),
        borderRadius: Radius.sm,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    feedbackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
    },
    feedbackButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1),
        paddingHorizontal: spacing(2),
        paddingVertical: spacing(1.5),
        borderRadius: Radius.sm,
        backgroundColor: Colors.background,
    },
    feedbackButtonText: {
        fontSize: 12,
        color: Colors.textMuted,
    },
    feedbackButtonPressed: {
        opacity: 0.7,
    },
    feedbackAcknowledged: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1),
    },
    feedbackText: {
        fontSize: 12,
        color: Colors.textMuted,
    },
});
