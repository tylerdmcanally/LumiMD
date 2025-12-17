/**
 * Terms Step - Screen 4
 * Requires user to accept Privacy Policy and Terms of Service
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';

type Props = {
    onNext: () => void;
    onBack?: () => void;
};

const PRIVACY_POLICY_URL = 'https://lumimd.app/privacy';
const TERMS_OF_SERVICE_URL = 'https://lumimd.app/terms';

export function TermsStep({ onNext, onBack }: Props) {
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);

    const canContinue = acceptedTerms && acceptedPrivacy;

    const openLink = async (url: string) => {
        try {
            const supported = await Linking.canOpenURL(url);
            if (supported) {
                await Linking.openURL(url);
            } else {
                Alert.alert('Error', 'Unable to open link. Please visit ' + url);
            }
        } catch (error) {
            Alert.alert('Error', 'Unable to open link');
        }
    };

    return (
        <View style={styles.container}>
            {/* Back Button */}
            {onBack && (
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <Ionicons name="arrow-back" size={24} color={Colors.text} />
                </TouchableOpacity>
            )}

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.iconContainer}>
                    <Ionicons name="shield-checkmark-outline" size={64} color={Colors.primary} />
                </View>
                <Text style={styles.title}>Review Our Policies</Text>
                <Text style={styles.subtitle}>
                    Please review and accept our Privacy Policy and Terms of Service to continue
                </Text>
            </View>

            {/* Policies Card */}
            <View style={styles.policiesContainer}>
                {/* Privacy Policy */}
                <TouchableOpacity
                    style={styles.policyRow}
                    onPress={() => openLink(PRIVACY_POLICY_URL)}
                    activeOpacity={0.7}
                >
                    <View style={styles.policyIcon}>
                        <Ionicons name="lock-closed-outline" size={22} color={Colors.primary} />
                    </View>
                    <View style={styles.policyContent}>
                        <Text style={styles.policyTitle}>Privacy Policy</Text>
                        <Text style={styles.policyDescription}>
                            How we collect, use, and protect your health information
                        </Text>
                    </View>
                    <Ionicons name="open-outline" size={20} color={Colors.textMuted} />
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Terms of Service */}
                <TouchableOpacity
                    style={styles.policyRow}
                    onPress={() => openLink(TERMS_OF_SERVICE_URL)}
                    activeOpacity={0.7}
                >
                    <View style={styles.policyIcon}>
                        <Ionicons name="document-text-outline" size={22} color={Colors.primary} />
                    </View>
                    <View style={styles.policyContent}>
                        <Text style={styles.policyTitle}>Terms of Service</Text>
                        <Text style={styles.policyDescription}>
                            Terms and conditions for using LumiMD
                        </Text>
                    </View>
                    <Ionicons name="open-outline" size={20} color={Colors.textMuted} />
                </TouchableOpacity>
            </View>

            {/* Acceptance Checkboxes */}
            <View style={styles.acceptanceContainer}>
                <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setAcceptedPrivacy(!acceptedPrivacy)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.checkbox, acceptedPrivacy && styles.checkboxChecked]}>
                        {acceptedPrivacy && (
                            <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                    </View>
                    <Text style={styles.checkboxLabel}>
                        I have read and agree to the{' '}
                        <Text style={styles.linkText} onPress={() => openLink(PRIVACY_POLICY_URL)}>
                            Privacy Policy
                        </Text>
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.checkboxRow}
                    onPress={() => setAcceptedTerms(!acceptedTerms)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
                        {acceptedTerms && (
                            <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                    </View>
                    <Text style={styles.checkboxLabel}>
                        I have read and agree to the{' '}
                        <Text style={styles.linkText} onPress={() => openLink(TERMS_OF_SERVICE_URL)}>
                            Terms of Service
                        </Text>
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Continue Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
                    onPress={onNext}
                    disabled={!canContinue}
                >
                    <Text style={[styles.continueButtonText, !canContinue && styles.continueButtonTextDisabled]}>
                        Continue
                    </Text>
                    <Ionicons
                        name="arrow-forward"
                        size={20}
                        color={canContinue ? '#fff' : Colors.textMuted}
                    />
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
    backButton: {
        position: 'absolute',
        top: spacing(4),
        left: spacing(6),
        padding: spacing(2),
        zIndex: 10,
    },
    header: {
        alignItems: 'center',
        paddingTop: spacing(12),
    },
    iconContainer: {
        marginBottom: spacing(4),
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: spacing(2),
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: spacing(4),
    },
    policiesContainer: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.stroke,
        overflow: 'hidden',
    },
    policyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing(4),
        gap: spacing(3),
    },
    policyIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: `${Colors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    policyContent: {
        flex: 1,
    },
    policyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 2,
    },
    policyDescription: {
        fontSize: 13,
        color: Colors.textMuted,
        lineHeight: 18,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.stroke,
        marginHorizontal: spacing(4),
    },
    acceptanceContainer: {
        gap: spacing(4),
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing(3),
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: Colors.stroke,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 2,
    },
    checkboxChecked: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    checkboxLabel: {
        flex: 1,
        fontSize: 15,
        color: Colors.text,
        lineHeight: 22,
    },
    linkText: {
        color: Colors.primary,
        textDecorationLine: 'underline',
    },
    footer: {
        paddingBottom: spacing(4),
    },
    continueButton: {
        backgroundColor: Colors.primary,
        borderRadius: Radius.md,
        paddingVertical: spacing(4),
        paddingHorizontal: spacing(6),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
    },
    continueButtonDisabled: {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    continueButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    continueButtonTextDisabled: {
        color: Colors.textMuted,
    },
});
