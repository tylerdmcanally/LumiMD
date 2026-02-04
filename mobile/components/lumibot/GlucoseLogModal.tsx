/**
 * GlucoseLogModal Component
 * 
 * Modal for logging blood glucose readings with safety checking.
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
import type { GlucoseValue, AlertLevel } from '@lumimd/sdk';
import { haptic } from '../../lib/haptics';

export type GlucoseTiming = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random';

export interface GlucoseLogModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (value: GlucoseValue) => Promise<{
        alertLevel?: AlertLevel;
        alertMessage?: string;
        shouldShowAlert?: boolean;
    }>;
    isSubmitting?: boolean;
    nudgeId?: string;
}

const TIMING_OPTIONS: { value: GlucoseTiming; label: string }[] = [
    { value: 'fasting', label: 'Fasting' },
    { value: 'before_meal', label: 'Before Meal' },
    { value: 'after_meal', label: 'After Meal' },
    { value: 'bedtime', label: 'Bedtime' },
    { value: 'random', label: 'Random' },
];

export function GlucoseLogModal({
    visible,
    onClose,
    onSubmit,
    isSubmitting = false,
}: GlucoseLogModalProps) {
    const [reading, setReading] = useState('');
    const [timing, setTiming] = useState<GlucoseTiming>('random');
    const [error, setError] = useState<string | null>(null);

    const handleClose = useCallback((withHaptic: boolean = true) => {
        if (withHaptic) {
            void haptic.light();
        }
        setReading('');
        setTiming('random');
        setError(null);
        onClose();
    }, [onClose]);

    const handleSubmit = useCallback(async () => {
        const value = parseInt(reading, 10);

        // Validation
        if (isNaN(value) || value < 20 || value > 700) {
            void haptic.warning();
            setError('Please enter a valid glucose reading (20-700 mg/dL)');
            return;
        }

        setError(null);

        const result = await onSubmit({
            reading: value,
            timing,
        });

        // If not showing immediate alert, close the modal
        if (!result.shouldShowAlert) {
            void haptic.success();
            handleClose(false);
        }
    }, [reading, timing, onSubmit, handleClose]);

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
                    <Text style={styles.title}>Log Blood Glucose</Text>
                    <View style={styles.closeButton} />
                </View>

                {/* Content */}
                <View style={styles.content}>
                    <View style={styles.readingContainer}>
                        <TextInput
                            style={styles.readingInput}
                            value={reading}
                            onChangeText={setReading}
                            placeholder="120"
                            keyboardType="number-pad"
                            maxLength={3}
                            autoFocus
                        />
                        <Text style={styles.unit}>mg/dL</Text>
                    </View>

                    {/* Timing Selection */}
                    <Text style={styles.sectionLabel}>When was this taken?</Text>
                    <View style={styles.timingOptions}>
                        {TIMING_OPTIONS.map(option => (
                            <Pressable
                                key={option.value}
                                style={[
                                    styles.timingOption,
                                    timing === option.value && styles.timingOptionSelected,
                                ]}
                                onPress={() => {
                                    void haptic.selection();
                                    setTiming(option.value);
                                }}
                            >
                                <Text
                                    style={[
                                        styles.timingOptionText,
                                        timing === option.value && styles.timingOptionTextSelected,
                                    ]}
                                >
                                    {option.label}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {error && (
                        <View style={styles.errorContainer}>
                            <Ionicons name="alert-circle" size={16} color={Colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <Text style={styles.helperText}>
                        Target range varies by timing. Your doctor can help you understand your goals.
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.submitButton,
                            (!reading || isSubmitting) && styles.submitButtonDisabled,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={handleSubmit}
                        disabled={!reading || isSubmitting}
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
    readingContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
        marginBottom: spacing(8),
    },
    readingInput: {
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
        fontSize: 20,
        color: Colors.textMuted,
        marginLeft: spacing(2),
    },
    sectionLabel: {
        fontSize: 15,
        fontWeight: '500',
        color: Colors.text,
        marginBottom: spacing(3),
        textAlign: 'center',
    },
    timingOptions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing(2),
        marginBottom: spacing(6),
    },
    timingOption: {
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(2.5),
        borderRadius: Radius.sm,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    timingOptionSelected: {
        backgroundColor: `${Colors.primary}15`,
        borderColor: Colors.primary,
    },
    timingOptionText: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    timingOptionTextSelected: {
        color: Colors.primary,
        fontWeight: '500',
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
