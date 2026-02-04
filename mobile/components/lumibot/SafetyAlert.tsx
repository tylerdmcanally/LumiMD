/**
 * SafetyAlert Component
 * 
 * Full-screen or modal alert for warning and emergency situations.
 */

import React from 'react';
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    Modal,
    Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import type { AlertLevel } from '@lumimd/sdk';
import { haptic } from '../../lib/haptics';

export interface SafetyAlertProps {
    visible: boolean;
    alertLevel: AlertLevel;
    message: string;
    onDismiss: () => void;
}

const ALERT_CONFIGS = {
    normal: {
        icon: 'checkmark-circle' as const,
        iconColor: Colors.success,
        backgroundColor: `${Colors.success}10`,
        title: 'Looking Good',
    },
    caution: {
        icon: 'alert-circle' as const,
        iconColor: Colors.warning,
        backgroundColor: `${Colors.warning}10`,
        title: 'Heads Up',
    },
    warning: {
        icon: 'warning' as const,
        iconColor: '#F59E0B', // Amber
        backgroundColor: '#FEF3C7',
        title: 'Attention Needed',
    },
    emergency: {
        icon: 'alert' as const,
        iconColor: '#DC2626', // Red
        backgroundColor: '#FEE2E2',
        title: 'Seek Help Now',
    },
};

export function SafetyAlert({
    visible,
    alertLevel,
    message,
    onDismiss,
}: SafetyAlertProps) {
    const config = ALERT_CONFIGS[alertLevel];
    const isEmergency = alertLevel === 'emergency';

    const handleCall911 = () => {
        void haptic.heavy();
        Linking.openURL('tel:911');
    };

    const handleDismiss = () => {
        if (alertLevel === 'emergency') {
            void haptic.warning();
        } else if (alertLevel === 'warning') {
            void haptic.warning();
        } else if (alertLevel === 'caution') {
            void haptic.light();
        } else {
            void haptic.success();
        }
        onDismiss();
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={!isEmergency}
            presentationStyle={isEmergency ? 'fullScreen' : 'overFullScreen'}
        >
            <View style={[
                styles.overlay,
                isEmergency && styles.emergencyOverlay,
            ]}>
                <View style={[
                    styles.container,
                    isEmergency && styles.emergencyContainer,
                    { backgroundColor: config.backgroundColor },
                ]}>
                    {/* Icon */}
                    <View style={[styles.iconContainer, { backgroundColor: `${config.iconColor}20` }]}>
                        <Ionicons name={config.icon} size={isEmergency ? 64 : 48} color={config.iconColor} />
                    </View>

                    {/* Title */}
                    <Text style={[
                        styles.title,
                        isEmergency && styles.emergencyTitle,
                        { color: config.iconColor },
                    ]}>
                        {config.title}
                    </Text>

                    {/* Message */}
                    <Text style={[
                        styles.message,
                        isEmergency && styles.emergencyMessage,
                    ]}>
                        {message}
                    </Text>

                    {/* Emergency Actions */}
                    {isEmergency && (
                        <View style={styles.emergencyActions}>
                            <Pressable
                                style={({ pressed }) => [
                                    styles.emergencyButton,
                                    pressed && styles.buttonPressed,
                                ]}
                                onPress={handleCall911}
                            >
                                <Ionicons name="call" size={24} color="#fff" />
                                <Text style={styles.emergencyButtonText}>Call 911</Text>
                            </Pressable>
                        </View>
                    )}

                    {/* Dismiss Button */}
                    <Pressable
                        style={({ pressed }) => [
                            styles.dismissButton,
                            isEmergency && styles.emergencyDismissButton,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={handleDismiss}
                    >
                        <Text style={[
                            styles.dismissButtonText,
                            isEmergency && styles.emergencyDismissText,
                        ]}>
                            {isEmergency ? "I'm with someone who can help" : 'Got it'}
                        </Text>
                    </Pressable>

                    {/* Disclaimer */}
                    <Text style={styles.disclaimer}>
                        LumiMD is not a substitute for emergency medical services.
                    </Text>
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
    emergencyOverlay: {
        backgroundColor: '#DC2626',
        padding: 0,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        borderRadius: Radius.lg,
        padding: spacing(6),
        alignItems: 'center',
    },
    emergencyContainer: {
        flex: 1,
        width: '100%',
        maxWidth: undefined,
        borderRadius: 0,
        justifyContent: 'center',
        paddingHorizontal: spacing(8),
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing(4),
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: spacing(3),
        textAlign: 'center',
    },
    emergencyTitle: {
        fontSize: 32,
    },
    message: {
        fontSize: 16,
        color: Colors.text,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: spacing(6),
    },
    emergencyMessage: {
        fontSize: 18,
        lineHeight: 28,
        color: '#7F1D1D',
    },
    emergencyActions: {
        width: '100%',
        marginBottom: spacing(4),
    },
    emergencyButton: {
        backgroundColor: '#DC2626',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing(5),
        borderRadius: Radius.md,
        gap: spacing(3),
    },
    emergencyButtonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    dismissButton: {
        paddingVertical: spacing(3),
        paddingHorizontal: spacing(6),
        backgroundColor: Colors.surface,
        borderRadius: Radius.sm,
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    emergencyDismissButton: {
        backgroundColor: 'transparent',
        borderColor: '#7F1D1D',
    },
    dismissButtonText: {
        fontSize: 16,
        color: Colors.text,
        fontWeight: '500',
    },
    emergencyDismissText: {
        color: '#7F1D1D',
    },
    disclaimer: {
        fontSize: 12,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: spacing(4),
        fontStyle: 'italic',
    },
    buttonPressed: {
        opacity: 0.8,
    },
});
