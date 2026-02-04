/**
 * WeightLogModal Component
 * 
 * Modal for logging weight readings - matches BP/Glucose modal style.
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
import type { AlertLevel } from '@lumimd/sdk';
import { haptic } from '../../lib/haptics';

export interface WeightValue {
    weight: number;
    unit: 'lbs' | 'kg';
}

export interface WeightLogModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (value: WeightValue) => Promise<{
        alertLevel?: AlertLevel;
        alertMessage?: string;
        shouldShowAlert?: boolean;
    }>;
    isSubmitting?: boolean;
}

export function WeightLogModal({
    visible,
    onClose,
    onSubmit,
    isSubmitting = false,
}: WeightLogModalProps) {
    const [weight, setWeight] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleClose = useCallback((withHaptic: boolean = true) => {
        if (withHaptic) {
            void haptic.light();
        }
        setWeight('');
        setError(null);
        onClose();
    }, [onClose]);

    const handleSubmit = useCallback(async () => {
        const weightValue = parseFloat(weight);

        // Validation
        if (isNaN(weightValue) || weightValue < 50 || weightValue > 700) {
            void haptic.warning();
            setError('Please enter a valid weight (50-700 lbs)');
            return;
        }

        setError(null);

        const result = await onSubmit({
            weight: weightValue,
            unit: 'lbs',
        });

        // If not showing immediate alert, close the modal
        if (!result.shouldShowAlert) {
            void haptic.success();
            handleClose(false);
        }
    }, [weight, onSubmit, handleClose]);

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
                    <Text style={styles.title}>Log Weight</Text>
                    <View style={styles.closeButton} />
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <View style={styles.inputContainer}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Weight</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={weight}
                                    onChangeText={setWeight}
                                    placeholder="150"
                                    keyboardType="decimal-pad"
                                    maxLength={5}
                                    autoFocus
                                />
                                <Text style={styles.unit}>lbs</Text>
                            </View>
                        </View>
                    </View>

                    {error && (
                        <View style={styles.errorContainer}>
                            <Ionicons name="alert-circle" size={16} color={Colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <Text style={styles.helperText}>
                        For consistent results, weigh yourself at the same time each day.
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.submitButton,
                            (!weight || isSubmitting) && styles.submitButtonDisabled,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={handleSubmit}
                        disabled={!weight || isSubmitting}
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
    inputContainer: {
        alignItems: 'center',
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
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    input: {
        fontSize: 64,
        fontWeight: '600',
        color: Colors.text,
        textAlign: 'center',
        minWidth: 150,
        padding: spacing(2),
        borderBottomWidth: 2,
        borderBottomColor: Colors.primary,
    },
    unit: {
        fontSize: 24,
        fontWeight: '500',
        color: Colors.textMuted,
        marginLeft: spacing(2),
        marginBottom: spacing(2),
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
