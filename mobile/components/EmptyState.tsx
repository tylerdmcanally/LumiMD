/**
 * EmptyState - Unified empty state component
 * Use for empty lists, error states, and success states
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, spacing, Card } from './ui';
import { haptic } from '../lib/haptics';

type EmptyStateVariant = 'empty' | 'error' | 'success';

type EmptyStateProps = {
    variant?: EmptyStateVariant;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    compact?: boolean;
};

const variantConfig = {
    empty: {
        iconColor: Colors.textMuted,
        iconBg: 'rgba(74, 85, 104, 0.08)',
    },
    error: {
        iconColor: Colors.error,
        iconBg: 'rgba(248, 113, 113, 0.1)',
    },
    success: {
        iconColor: Colors.success,
        iconBg: 'rgba(52, 211, 153, 0.1)',
    },
};

export function EmptyState({
    variant = 'empty',
    icon,
    title,
    description,
    actionLabel,
    onAction,
    compact = false,
}: EmptyStateProps) {
    const config = variantConfig[variant];

    if (compact) {
        return (
            <View style={styles.compactContainer}>
                <View style={[styles.compactIconCircle, { backgroundColor: config.iconBg }]}>
                    <Ionicons name={icon} size={24} color={config.iconColor} />
                </View>
                <View style={styles.compactContent}>
                    <Text style={styles.compactTitle}>{title}</Text>
                    <Text style={styles.compactDescription}>{description}</Text>
                </View>
            </View>
        );
    }

    return (
        <Card style={styles.card}>
            <View style={[styles.iconCircle, { backgroundColor: config.iconBg }]}>
                <Ionicons name={icon} size={40} color={config.iconColor} />
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>

            {actionLabel && onAction && (
                <Pressable
                    style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.actionButtonPressed,
                    ]}
                    onPress={() => {
                        void haptic.selection();
                        onAction();
                    }}
                >
                    <Text style={styles.actionButtonText}>{actionLabel}</Text>
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                </Pressable>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        alignItems: 'center',
        paddingVertical: spacing(8),
        paddingHorizontal: spacing(6),
        gap: spacing(3),
    },
    iconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing(2),
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
        textAlign: 'center',
    },
    description: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 21,
        maxWidth: 280,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
        paddingVertical: spacing(3),
        paddingHorizontal: spacing(5),
        backgroundColor: Colors.accent,
        borderRadius: Radius.md,
        marginTop: spacing(2),
    },
    actionButtonPressed: {
        opacity: 0.9,
        transform: [{ scale: 0.98 }],
    },
    actionButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    // Compact variant styles
    compactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing(5),
        paddingHorizontal: spacing(4),
        gap: spacing(4),
    },
    compactIconCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactContent: {
        flex: 1,
        gap: spacing(1),
    },
    compactTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    compactDescription: {
        fontSize: 13,
        color: Colors.textMuted,
        lineHeight: 18,
    },
});
