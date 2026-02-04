/**
 * Completion Step - Screen 4
 * Celebrates completion and offers next actions
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { haptic } from '../../lib/haptics';

type Props = {
    onRecordFirst: () => void;
    onExplore: () => void;
    saving: boolean;
    onBack?: () => void;
};

const features = [
    { icon: 'mic-outline' as const, text: 'Record visits' },
    { icon: 'document-text-outline' as const, text: 'AI summaries' },
    { icon: 'checkmark-circle-outline' as const, text: 'Action items' },
    { icon: 'medkit-outline' as const, text: 'Medication tracking' },
    { icon: 'people-outline' as const, text: 'Caregiver sharing' },
];

export function CompletionStep({ onRecordFirst, onExplore, saving, onBack }: Props) {
    return (
        <View style={styles.container}>
            {/* Back Button */}
            {onBack && (
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => {
                        void haptic.selection();
                        onBack();
                    }}
                >
                    <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
            )}

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.checkContainer}>
                    <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
                </View>
                <Text style={styles.title}>You're All Set!</Text>
                <Text style={styles.subtitle}>
                    LumiMD is ready to help you manage your health journey
                </Text>
            </View>

            {/* Feature Recap */}
            <View style={styles.featuresContainer}>
                <Text style={styles.featuresTitle}>What you can do:</Text>
                <View style={styles.featuresList}>
                    {features.map((feature, index) => (
                        <View key={index} style={styles.featureRow}>
                            <View style={styles.featureIcon}>
                                <Ionicons name={feature.icon} size={20} color={Colors.primary} />
                            </View>
                            <Text style={styles.featureText}>{feature.text}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* CTAs */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => {
                        void haptic.medium();
                        onRecordFirst();
                    }}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="mic-outline" size={22} color="#fff" />
                            <Text style={styles.primaryButtonText}>Record Your First Visit</Text>
                        </>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                        void haptic.selection();
                        onExplore();
                    }}
                    disabled={saving}
                >
                    <Text style={styles.secondaryButtonText}>Explore Dashboard</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: spacing(6),
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
        paddingTop: spacing(10),
    },
    checkContainer: {
        marginBottom: spacing(4),
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: spacing(2),
    },
    subtitle: {
        fontSize: 16,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 22,
    },
    featuresContainer: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: spacing(5),
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    featuresTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.textMuted,
        marginBottom: spacing(4),
    },
    featuresList: {
        gap: spacing(3),
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(3),
    },
    featureIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: `${Colors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureText: {
        fontSize: 16,
        color: Colors.text,
        fontWeight: '500',
    },
    footer: {
        paddingBottom: spacing(4),
        gap: spacing(3),
    },
    primaryButton: {
        backgroundColor: Colors.accent,
        borderRadius: Radius.md,
        paddingVertical: spacing(4),
        paddingHorizontal: spacing(6),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    secondaryButton: {
        borderWidth: 1,
        borderColor: Colors.stroke,
        borderRadius: Radius.md,
        paddingVertical: spacing(4),
        paddingHorizontal: spacing(6),
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        color: Colors.text,
        fontSize: 17,
        fontWeight: '600',
    },
    backButton: {
        position: 'absolute',
        top: spacing(4),
        left: spacing(6),
        padding: spacing(2),
        zIndex: 10,
    },
});

