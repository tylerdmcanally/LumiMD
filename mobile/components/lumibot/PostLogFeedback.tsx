/**
 * PostLogFeedback Component
 *
 * Shows contextual feedback after a patient logs a health reading via LumiBot.
 * - Normal: Shows current value + mini trend (last 3-5 text values) + link to health hub
 * - Caution/Warning: Shows SafetyAlert + care team suggestion + link
 * - Emergency: Defers entirely to SafetyAlert (not handled here)
 *
 * Tier 3 disclaimer: "Based on the data you've logged. Share with your doctor for clinical interpretation."
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import type { AlertLevel, HealthLogType } from '@lumimd/sdk';

export interface RecentReading {
    value: string;   // e.g. "134/86" or "126 mg/dL"
    date: string;    // e.g. "March 4"
}

export interface CareFlowProgress {
    phase: 'understand' | 'establish' | 'maintain' | 'coast';
    weekNumber: number;
    consecutiveNormalCount: number;
    condition: string;
}

export interface PostLogFeedbackProps {
    visible: boolean;
    currentValue: string;            // Formatted current reading
    alertLevel: AlertLevel;
    healthLogType: HealthLogType;
    recentReadings?: RecentReading[];  // Last 3-5 prior readings (oldest first)
    flowProgress?: CareFlowProgress;  // Care flow context (if part of a flow)
    onViewTrend?: () => void;
    onDismiss: () => void;
}

function getTypeLabel(type: HealthLogType): string {
    switch (type) {
        case 'bp': return 'Blood Pressure';
        case 'glucose': return 'Blood Sugar';
        case 'weight': return 'Weight';
        default: return 'Reading';
    }
}

function getTypeIcon(type: HealthLogType): keyof typeof Ionicons.glyphMap {
    switch (type) {
        case 'bp': return 'heart-outline';
        case 'glucose': return 'water-outline';
        case 'weight': return 'scale-outline';
        default: return 'pulse-outline';
    }
}

function getFlowProgressMessage(progress: CareFlowProgress): string | null {
    const weekText = progress.weekNumber === 1
        ? 'Week 1 of tracking'
        : `Week ${progress.weekNumber} of tracking`;

    if (progress.consecutiveNormalCount >= 5) {
        return `${weekText} — your readings have been consistently good!`;
    }
    if (progress.consecutiveNormalCount >= 3) {
        return `${weekText} — nice streak of healthy readings!`;
    }
    if (progress.phase === 'coast') {
        return `${weekText} — you've been stable, so we're checking in less often.`;
    }
    if (progress.phase === 'maintain') {
        return `${weekText} — keeping things on track!`;
    }
    return weekText;
}

export function PostLogFeedback({
    visible,
    currentValue,
    alertLevel,
    healthLogType,
    recentReadings,
    flowProgress,
    onViewTrend,
    onDismiss,
}: PostLogFeedbackProps) {
    if (!visible || alertLevel === 'emergency') return null;

    const isNormal = alertLevel === 'normal' || !alertLevel;
    const label = getTypeLabel(healthLogType);
    const icon = getTypeIcon(healthLogType);

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            presentationStyle="overFullScreen"
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={[
                            styles.iconCircle,
                            { backgroundColor: isNormal ? `${Colors.success}15` : `${Colors.warning}15` },
                        ]}>
                            <Ionicons
                                name={isNormal ? 'checkmark-circle' : 'alert-circle'}
                                size={32}
                                color={isNormal ? Colors.success : Colors.warning}
                            />
                        </View>
                        <Text style={styles.title}>
                            {isNormal ? 'Got it!' : 'Heads Up'}
                        </Text>
                    </View>

                    {/* Current reading */}
                    <View style={styles.readingRow}>
                        <Ionicons name={icon} size={18} color={Colors.primary} />
                        <Text style={styles.currentValue}>{label}: {currentValue}</Text>
                    </View>

                    {/* Caution/warning message */}
                    {!isNormal && (
                        <Text style={styles.cautionText}>
                            Consider sharing this with your care team.
                        </Text>
                    )}

                    {/* Mini trend (normal only, when we have prior readings) */}
                    {isNormal && recentReadings && recentReadings.length > 0 && (
                        <View style={styles.trendSection}>
                            <Text style={styles.trendLabel}>Recent readings:</Text>
                            {recentReadings.map((r, i) => (
                                <Text key={i} style={styles.trendItem}>
                                    {r.date}: {r.value}
                                </Text>
                            ))}
                        </View>
                    )}

                    {/* Care flow progress (if part of a flow) */}
                    {isNormal && flowProgress && (
                        <View style={styles.flowProgressSection}>
                            <Ionicons name="trending-up-outline" size={16} color={Colors.success} />
                            <Text style={styles.flowProgressText}>
                                {getFlowProgressMessage(flowProgress)}
                            </Text>
                        </View>
                    )}

                    {/* Tier 3 disclaimer */}
                    <Text style={styles.disclaimer}>
                        Based on the data you've logged. Share with your doctor for clinical interpretation.
                    </Text>

                    {/* Actions */}
                    <View style={styles.actions}>
                        {onViewTrend && (
                            <Pressable
                                style={({ pressed }) => [styles.trendButton, pressed && styles.pressed]}
                                onPress={onViewTrend}
                            >
                                <Text style={styles.trendButtonText}>
                                    View your {label.toLowerCase()} trend
                                </Text>
                                <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                            </Pressable>
                        )}

                        <Pressable
                            style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
                            onPress={onDismiss}
                        >
                            <Text style={styles.dismissText}>Done</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing(6),
    },
    container: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: spacing(6),
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing(4),
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing(2),
    },
    title: {
        fontSize: 22,
        fontFamily: 'Fraunces_700Bold',
        color: Colors.text,
        textAlign: 'center',
    },
    readingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
        marginBottom: spacing(3),
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(3),
        backgroundColor: `${Colors.primary}08`,
        borderRadius: Radius.sm,
    },
    currentValue: {
        fontSize: 16,
        fontFamily: 'PlusJakartaSans_600SemiBold',
        color: Colors.text,
    },
    cautionText: {
        fontSize: 15,
        color: Colors.warning,
        lineHeight: 22,
        marginBottom: spacing(3),
        textAlign: 'center',
    },
    trendSection: {
        marginBottom: spacing(3),
        gap: spacing(1),
    },
    trendLabel: {
        fontSize: 13,
        fontFamily: 'PlusJakartaSans_600SemiBold',
        color: Colors.textMuted,
        marginBottom: spacing(1),
    },
    trendItem: {
        fontSize: 14,
        color: Colors.text,
        lineHeight: 20,
        paddingLeft: spacing(2),
    },
    flowProgressSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
        marginBottom: spacing(3),
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(3),
        backgroundColor: `${Colors.success}10`,
        borderRadius: Radius.sm,
    },
    flowProgressText: {
        flex: 1,
        fontSize: 14,
        color: Colors.success,
        lineHeight: 20,
    },
    disclaimer: {
        fontSize: 12,
        color: Colors.textMuted,
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: spacing(4),
        lineHeight: 16,
    },
    actions: {
        gap: spacing(2),
    },
    trendButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing(3),
        gap: spacing(1),
    },
    trendButtonText: {
        fontSize: 15,
        color: Colors.primary,
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    dismissButton: {
        paddingVertical: spacing(3),
        backgroundColor: Colors.primary,
        borderRadius: Radius.sm,
        alignItems: 'center',
    },
    dismissText: {
        fontSize: 16,
        color: '#fff',
        fontFamily: 'PlusJakartaSans_600SemiBold',
    },
    pressed: {
        opacity: 0.8,
    },
});
