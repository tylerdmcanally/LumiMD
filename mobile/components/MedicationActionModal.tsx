/**
 * MedicationActionModal
 * 
 * Shows when user taps a medication reminder notification.
 * Offers options: Took It, Skipped, Remind Later (30 min)
 */

import React, { useState } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';

export interface MedicationActionData {
    reminderId?: string;
    medicationId: string;
    medicationName: string;
    medicationDose?: string;
    scheduledTime: string; // HH:MM format
}

interface MedicationActionModalProps {
    visible: boolean;
    medication: MedicationActionData | null;
    onAction: (action: 'taken' | 'skipped' | 'snoozed') => Promise<void>;
    onClose: () => void;
}

export function MedicationActionModal({
    visible,
    medication,
    onAction,
    onClose,
}: MedicationActionModalProps) {
    const [isLoading, setIsLoading] = useState<'taken' | 'skipped' | 'snoozed' | null>(null);

    const handleAction = async (action: 'taken' | 'skipped' | 'snoozed') => {
        setIsLoading(action);
        try {
            await onAction(action);
            onClose();
        } catch (error) {
            console.error('[MedicationActionModal] Error:', error);
        } finally {
            setIsLoading(null);
        }
    };

    if (!medication) return null;

    const doseText = medication.medicationDose ? ` (${medication.medicationDose})` : '';

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modal}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.pillIcon}>
                            <Text style={styles.pillEmoji}>💊</Text>
                        </View>
                        <Text style={styles.title}>Medication Reminder</Text>
                    </View>

                    {/* Medication Info */}
                    <View style={styles.medInfo}>
                        <Text style={styles.medName}>{medication.medicationName}</Text>
                        {medication.medicationDose && (
                            <Text style={styles.medDose}>{medication.medicationDose}</Text>
                        )}
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actions}>
                        {/* Took It */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.actionButton,
                                styles.takenButton,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={() => handleAction('taken')}
                            disabled={isLoading !== null}
                        >
                            {isLoading === 'taken' ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                                    <Text style={styles.takenButtonText}>Took It</Text>
                                </>
                            )}
                        </Pressable>

                        {/* Skip */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.actionButton,
                                styles.skipButton,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={() => handleAction('skipped')}
                            disabled={isLoading !== null}
                        >
                            {isLoading === 'skipped' ? (
                                <ActivityIndicator color={Colors.textMuted} size="small" />
                            ) : (
                                <>
                                    <Ionicons name="close-circle-outline" size={24} color={Colors.textMuted} />
                                    <Text style={styles.skipButtonText}>Skip</Text>
                                </>
                            )}
                        </Pressable>

                        {/* Remind Later */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.actionButton,
                                styles.remindButton,
                                pressed && styles.buttonPressed,
                            ]}
                            onPress={() => handleAction('snoozed')}
                            disabled={isLoading !== null}
                        >
                            {isLoading === 'snoozed' ? (
                                <ActivityIndicator color={Colors.primary} size="small" />
                            ) : (
                                <>
                                    <Ionicons name="alarm-outline" size={24} color={Colors.primary} />
                                    <Text style={styles.remindButtonText}>Remind in 30 min</Text>
                                </>
                            )}
                        </Pressable>
                    </View>

                    {/* Dismiss */}
                    <Pressable style={styles.dismissButton} onPress={onClose}>
                        <Text style={styles.dismissText}>Dismiss</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing(4),
    },
    modal: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: spacing(5),
        width: '100%',
        maxWidth: 340,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 10,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing(4),
    },
    pillIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(64,201,208,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing(3),
    },
    pillEmoji: {
        fontSize: 28,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    medInfo: {
        alignItems: 'center',
        marginBottom: spacing(5),
        paddingVertical: spacing(3),
        paddingHorizontal: spacing(4),
        backgroundColor: 'rgba(64,201,208,0.08)',
        borderRadius: Radius.md,
    },
    medName: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text,
        textAlign: 'center',
    },
    medDose: {
        fontSize: 15,
        color: Colors.textMuted,
        marginTop: spacing(1),
    },
    actions: {
        gap: spacing(3),
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing(4),
        paddingHorizontal: spacing(4),
        borderRadius: Radius.md,
        gap: spacing(2),
    },
    buttonPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    takenButton: {
        backgroundColor: Colors.success,
    },
    takenButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    skipButton: {
        backgroundColor: 'rgba(142,142,147,0.12)',
    },
    skipButtonText: {
        color: Colors.textMuted,
        fontSize: 17,
        fontWeight: '500',
    },
    remindButton: {
        backgroundColor: 'rgba(64,201,208,0.12)',
    },
    remindButtonText: {
        color: Colors.primary,
        fontSize: 17,
        fontWeight: '500',
    },
    dismissButton: {
        marginTop: spacing(4),
        paddingVertical: spacing(3),
        alignItems: 'center',
    },
    dismissText: {
        color: Colors.textMuted,
        fontSize: 15,
    },
});
