/**
 * Welcome Step - Screen 1
 * Introduces the app and key features
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { haptic } from '../../lib/haptics';

type Props = {
    onNext: () => void;
};

const features = [
    {
        icon: 'mic-outline' as const,
        title: 'Record your visits',
        description: 'Capture every detail from your doctor appointments',
    },
    {
        icon: 'document-text-outline' as const,
        title: 'AI-powered summaries',
        description: 'Get clear, organized notes automatically',
    },
    {
        icon: 'people-outline' as const,
        title: 'Share with caregivers',
        description: 'Keep family members informed and involved',
    },
];

export function WelcomeStep({ onNext }: Props) {
    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.logo}>LumiMD</Text>
                <Text style={styles.tagline}>Your personal health companion</Text>
            </View>

            {/* Features */}
            <View style={styles.features}>
                {features.map((feature, index) => (
                    <View key={index} style={styles.featureCard}>
                        <View style={styles.iconContainer}>
                            <Ionicons name={feature.icon} size={28} color={Colors.primary} />
                        </View>
                        <View style={styles.featureText}>
                            <Text style={styles.featureTitle}>{feature.title}</Text>
                            <Text style={styles.featureDescription}>{feature.description}</Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* CTA */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => {
                        void haptic.selection();
                        onNext();
                    }}
                >
                    <Text style={styles.buttonText}>Get Started</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
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
        paddingTop: spacing(12),
    },
    logo: {
        fontSize: 42,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: spacing(2),
    },
    tagline: {
        fontSize: 18,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    features: {
        gap: spacing(4),
    },
    featureCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: spacing(4),
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: `${Colors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing(4),
    },
    featureText: {
        flex: 1,
    },
    featureTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: spacing(1),
    },
    featureDescription: {
        fontSize: 14,
        color: Colors.textMuted,
        lineHeight: 20,
    },
    footer: {
        paddingBottom: spacing(4),
    },
    button: {
        backgroundColor: Colors.accent,
        borderRadius: Radius.md,
        paddingVertical: spacing(4),
        paddingHorizontal: spacing(6),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
    },
    buttonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
});
