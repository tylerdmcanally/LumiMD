/**
 * BPLogModal Component
 * 
 * Modal for logging blood pressure readings with safety checking.
 */

import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet,
    Modal,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import type { BloodPressureValue, AlertLevel } from '@lumimd/sdk';

export interface BPLogModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (value: BloodPressureValue) => Promise<{
        alertLevel?: AlertLevel;
        alertMessage?: string;
        shouldShowAlert?: boolean;
    }>;
    isSubmitting?: boolean;
    nudgeId?: string;
}

export function BPLogModal({
    visible,
    onClose,
    onSubmit,
    isSubmitting = false,
}: BPLogModalProps) {
    const [systolic, setSystolic] = useState('');
    const [diastolic, setDiastolic] = useState('');
    const [pulse, setPulse] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleClose = useCallback(() => {
        setSystolic('');
        setDiastolic('');
        setPulse('');
        setError(null);
        onClose();
    }, [onClose]);

    const handleSubmit = useCallback(async () => {
        const sys = parseInt(systolic, 10);
        const dia = parseInt(diastolic, 10);
        const pul = pulse ? parseInt(pulse, 10) : undefined;

        // Validation
        if (isNaN(sys) || sys < 60 || sys > 300) {
            setError('Please enter a valid systolic value (60-300)');
            return;
        }
        if (isNaN(dia) || dia < 30 || dia > 200) {
            setError('Please enter a valid diastolic value (30-200)');
            return;
        }
        if (pul !== undefined && (pul < 30 || pul > 250)) {
            setError('Please enter a valid pulse value (30-250)');
            return;
        }

        setError(null);

        const result = await onSubmit({
            systolic: sys,
            diastolic: dia,
            pulse: pul,
        });

        // If not showing immediate alert, close the modal
        if (!result.shouldShowAlert) {
            handleClose();
        }
    }, [systolic, diastolic, pulse, onSubmit, handleClose]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleClose}
        >
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={handleClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color={Colors.text} />
                    </Pressable>
                    <Text style={styles.title}>Log Blood Pressure</Text>
                    <View style={styles.closeButton} />
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <View style={styles.inputRow}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Systolic (top)</Text>
                            <TextInput
                                style={styles.input}
                                value={systolic}
                                onChangeText={setSystolic}
                                placeholder="120"
                                keyboardType="number-pad"
                                maxLength={3}
                                autoFocus
                            />
                        </View>

                        <Text style={styles.divider}>/</Text>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Diastolic (bottom)</Text>
                            <TextInput
                                style={styles.input}
                                value={diastolic}
                                onChangeText={setDiastolic}
                                placeholder="80"
                                keyboardType="number-pad"
                                maxLength={3}
                            />
                        </View>
                    </View>

                    <View style={styles.pulseGroup}>
                        <Text style={styles.label}>Pulse (optional)</Text>
                        <TextInput
                            style={[styles.input, styles.pulseInput]}
                            value={pulse}
                            onChangeText={setPulse}
                            placeholder="72"
                            keyboardType="number-pad"
                            maxLength={3}
                        />
                        <Text style={styles.unit}>bpm</Text>
                    </View>

                    {error && (
                        <View style={styles.errorContainer}>
                            <Ionicons name="alert-circle" size={16} color={Colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <Text style={styles.helperText}>
                        For best results, sit quietly for 5 minutes before taking your reading.
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.submitButton,
                            (!systolic || !diastolic || isSubmitting) && styles.submitButtonDisabled,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={handleSubmit}
                        disabled={!systolic || !diastolic || isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.submitButtonText}>Save Reading</Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(4),
        borderBottomWidth: 1,
        borderBottomColor: Colors.stroke,
    },
    closeButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        color: Colors.text,
    },
    content: {
        flex: 1,
        paddingHorizontal: spacing(6),
        paddingTop: spacing(8),
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        marginBottom: spacing(8),
    },
    inputGroup: {
        alignItems: 'center',
    },
    label: {
        fontSize: 13,
        color: Colors.textMuted,
        marginBottom: spacing(2),
    },
    input: {
        fontSize: 48,
        fontWeight: '600',
        color: Colors.text,
        textAlign: 'center',
        minWidth: 100,
        padding: spacing(2),
        borderBottomWidth: 2,
        borderBottomColor: Colors.primary,
    },
    divider: {
        fontSize: 48,
        fontWeight: '300',
        color: Colors.textMuted,
        marginHorizontal: spacing(3),
    },
    pulseGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing(6),
    },
    pulseInput: {
        fontSize: 32,
        minWidth: 80,
        marginHorizontal: spacing(2),
    },
    unit: {
        fontSize: 16,
        color: Colors.textMuted,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
        marginBottom: spacing(4),
    },
    errorText: {
        fontSize: 14,
        color: Colors.error,
    },
    helperText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
    footer: {
        paddingHorizontal: spacing(6),
        paddingBottom: spacing(8),
        paddingTop: spacing(4),
    },
    submitButton: {
        backgroundColor: Colors.primary,
        paddingVertical: spacing(4),
        borderRadius: Radius.md,
        alignItems: 'center',
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    buttonPressed: {
        opacity: 0.8,
    },
});
