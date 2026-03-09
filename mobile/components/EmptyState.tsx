/**
 * EmptyState - Unified empty state component
 * Warm aesthetic with coral/sage gradient accent strip (matching web portal)
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, spacing, Card } from './ui';

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
        iconColor: Colors.coral,
        iconBg: Colors.coralMuted,
        gradientColors: [Colors.primary, Colors.sage, Colors.coral] as const,
    },
    error: {
        iconColor: Colors.error,
        iconBg: 'rgba(248, 113, 113, 0.1)',
        gradientColors: [Colors.error, '#F59E0B', Colors.coral] as const,
    },
    success: {
        iconColor: Colors.success,
        iconBg: Colors.sageMuted,
        gradientColors: [Colors.sage, Colors.primary, Colors.success] as const,
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
            {/* Gradient accent strip */}
            <LinearGradient
                colors={[...config.gradientColors]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.accentStrip}
            />

            <View style={[styles.iconCircle, { backgroundColor: config.iconBg }]}>
                <Ionicons name={icon} size={36} color={config.iconColor} />
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>

            {actionLabel && onAction && (
                <Pressable
                    style={({ pressed }) => [
                        styles.actionButton,
                        pressed && styles.actionButtonPressed,
                    ]}
                    onPress={onAction}
                >
                    <Text style={styles.actionButtonText}>{actionLabel}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                </Pressable>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        alignItems: 'center',
        paddingTop: spacing(2),
        paddingBottom: spacing(8),
        paddingHorizontal: spacing(6),
        gap: spacing(3),
        overflow: 'hidden',
    },
    accentStrip: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        borderTopLeftRadius: Radius.lg,
        borderTopRightRadius: Radius.lg,
    },
    iconCircle: {
        width: 76,
        height: 76,
        borderRadius: 38,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing(6),
        marginBottom: spacing(1),
    },
    title: {
        fontSize: 18,
        fontFamily: 'Fraunces_600SemiBold',
        color: Colors.text,
        textAlign: 'center',
    },
    description: {
        fontSize: 14,
        fontFamily: 'PlusJakartaSans_500Medium',
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
        fontFamily: 'PlusJakartaSans_600SemiBold',
        color: '#fff',
    },
    // Compact variant
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
        fontFamily: 'PlusJakartaSans_600SemiBold',
        color: Colors.text,
    },
    compactDescription: {
        fontSize: 13,
        fontFamily: 'PlusJakartaSans_500Medium',
        color: Colors.textMuted,
        lineHeight: 18,
    },
});
