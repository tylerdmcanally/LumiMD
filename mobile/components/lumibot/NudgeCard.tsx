/**
 * NudgeCard Component
 * 
 * Displays a single nudge as an interactive card in the LumiBot section.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Colors, spacing, Radius } from '../ui';
import type { Nudge, NudgeActionType } from '@lumimd/sdk';

export interface NudgeCardProps {
    nudge: Nudge;
    onAction: (nudge: Nudge) => void;
    onSnooze: (nudge: Nudge) => void;
    onDismiss: (nudge: Nudge) => void;
}

function getIconForActionType(actionType: NudgeActionType): keyof typeof Ionicons.glyphMap {
    switch (actionType) {
        case 'log_bp':
            return 'heart-outline';
        case 'log_glucose':
            return 'water-outline';
        case 'log_weight':
            return 'scale-outline';
        case 'confirm_yes_no':
        case 'medication_check':
            return 'medical-outline';
        case 'symptom_check':
            return 'pulse-outline';
        case 'acknowledge':
            return 'information-circle-outline';
        case 'view_insight':
            return 'analytics-outline';
        default:
            return 'chatbubble-outline';
    }
}

function getIconColorForType(type: Nudge['type']): string {
    switch (type) {
        case 'condition_tracking':
            return Colors.primary;
        case 'medication_checkin':
            return Colors.accent;
        case 'introduction':
            return Colors.primary;
        case 'insight':
            return Colors.accent; // Purple/accent for insights
        default:
            return Colors.primary;
    }
}

export function NudgeCard({ nudge, onAction, onSnooze, onDismiss }: NudgeCardProps) {
    const icon = getIconForActionType(nudge.actionType);
    const iconColor = getIconColorForType(nudge.type);

    return (
        <Card style={styles.card}>
            <View style={styles.container}>
                {/* Icon */}
                <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
                    <Ionicons name={icon} size={24} color={iconColor} />
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <Text style={styles.title}>{nudge.title}</Text>
                    <Text style={styles.message}>{nudge.message}</Text>

                    {/* Action Buttons */}
                    <View style={styles.actions}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.primaryButton,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={() => onAction(nudge)}
                        >
                            <Text style={styles.primaryButtonText}>
                                {nudge.actionType === 'confirm_yes_no' ? 'Respond' :
                                    nudge.actionType === 'acknowledge' ? 'Got it' :
                                        nudge.actionType === 'view_insight' ? 'Got it' : 'Log'}
                            </Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [
                                styles.secondaryButton,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={() => onSnooze(nudge)}
                        >
                            <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
                            <Text style={styles.secondaryButtonText}>Later</Text>
                        </Pressable>

                        <Pressable
                            style={({ pressed }) => [
                                styles.dismissButton,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={() => onDismiss(nudge)}
                        >
                            <Ionicons name="close" size={18} color={Colors.textMuted} />
                        </Pressable>
                    </View>
                </View>
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        marginBottom: spacing(3),
    },
    container: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing(3),
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: spacing(1),
    },
    message: {
        fontSize: 14,
        color: Colors.textMuted,
        lineHeight: 20,
        marginBottom: spacing(3),
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
    },
    primaryButton: {
        backgroundColor: Colors.primary,
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(2),
        borderRadius: Radius.sm,
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2),
        borderRadius: Radius.sm,
        backgroundColor: Colors.background,
        gap: spacing(1),
    },
    secondaryButtonText: {
        color: Colors.textMuted,
        fontSize: 14,
    },
    dismissButton: {
        padding: spacing(2),
        marginLeft: 'auto',
    },
    buttonPressed: {
        opacity: 0.7,
    },
});
