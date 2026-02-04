/**
 * SideEffectsModal Component
 * 
 * Modal for capturing side effects when patient reports issues with medication.
 * Includes quick-select chips for common side effects and free text input.
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
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { haptic } from '../../lib/haptics';

// Common medication side effects for quick selection
const COMMON_SIDE_EFFECTS = [
    { id: 'nausea', label: 'Nausea', icon: 'medical-outline' as const },
    { id: 'dizziness', label: 'Dizziness', icon: 'sync-outline' as const },
    { id: 'headache', label: 'Headache', icon: 'flash-outline' as const },
    { id: 'fatigue', label: 'Fatigue', icon: 'bed-outline' as const },
    { id: 'stomach_upset', label: 'Stomach Upset', icon: 'body-outline' as const },
    { id: 'rash', label: 'Rash/Skin', icon: 'hand-left-outline' as const },
    { id: 'appetite_changes', label: 'Appetite Changes', icon: 'restaurant-outline' as const },
    { id: 'sleep_issues', label: 'Sleep Issues', icon: 'moon-outline' as const },
    { id: 'dry_mouth', label: 'Dry Mouth', icon: 'water-outline' as const },
    { id: 'constipation', label: 'Constipation', icon: 'ellipse-outline' as const },
    { id: 'muscle_aches', label: 'Muscle Aches', icon: 'fitness-outline' as const },
    { id: 'cough', label: 'Cough', icon: 'chatbubble-outline' as const },
];

export interface SideEffectResponse {
    sideEffects: string[];
    notes?: string;
}

export interface SideEffectsModalProps {
    visible: boolean;
    medicationName?: string;
    onClose: () => void;
    onSubmit: (response: SideEffectResponse) => Promise<void>;
    isSubmitting?: boolean;
}

export function SideEffectsModal({
    visible,
    medicationName,
    onClose,
    onSubmit,
    isSubmitting = false,
}: SideEffectsModalProps) {
    const [selectedEffects, setSelectedEffects] = useState<Set<string>>(new Set());
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleClose = useCallback((withHaptic: boolean = true) => {
        if (withHaptic) {
            void haptic.light();
        }
        setSelectedEffects(new Set());
        setNotes('');
        setError(null);
        onClose();
    }, [onClose]);

    const toggleEffect = useCallback((effectId: string) => {
        void haptic.selection();
        setSelectedEffects(prev => {
            const next = new Set(prev);
            if (next.has(effectId)) {
                next.delete(effectId);
            } else {
                next.add(effectId);
            }
            return next;
        });
    }, []);

    const handleSubmit = useCallback(async () => {
        if (selectedEffects.size === 0 && !notes.trim()) {
            void haptic.warning();
            setError('Please select at least one side effect or add a note');
            return;
        }

        setError(null);

        void haptic.medium();
        await onSubmit({
            sideEffects: Array.from(selectedEffects),
            notes: notes.trim() || undefined,
        });

        void haptic.success();
        handleClose(false);
    }, [selectedEffects, notes, onSubmit, handleClose]);

    const title = medicationName
        ? `Issues with ${medicationName}`
        : 'Side Effects';

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
                    <Text style={styles.title}>{title}</Text>
                    <View style={styles.closeButton} />
                </View>

                {/* Content */}
                <ScrollView style={styles.scrollContent} contentContainerStyle={styles.content}>
                    <Text style={styles.sectionTitle}>
                        What are you experiencing?
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                        Select all that apply
                    </Text>

                    {/* Side Effect Chips */}
                    <View style={styles.chipsContainer}>
                        {COMMON_SIDE_EFFECTS.map(effect => {
                            const isSelected = selectedEffects.has(effect.id);
                            return (
                                <Pressable
                                    key={effect.id}
                                    style={[
                                        styles.chip,
                                        isSelected && styles.chipSelected,
                                    ]}
                                    onPress={() => toggleEffect(effect.id)}
                                >
                                    <Ionicons
                                        name={effect.icon}
                                        size={16}
                                        color={isSelected ? '#fff' : Colors.textMuted}
                                    />
                                    <Text style={[
                                        styles.chipText,
                                        isSelected && styles.chipTextSelected,
                                    ]}>
                                        {effect.label}
                                    </Text>
                                    {isSelected && (
                                        <Ionicons name="checkmark" size={14} color="#fff" />
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Free Text Input */}
                    <Text style={styles.notesLabel}>
                        Additional details (optional)
                    </Text>
                    <TextInput
                        style={styles.notesInput}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Describe your symptoms or concerns..."
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />

                    {error && (
                        <View style={styles.errorContainer}>
                            <Ionicons name="alert-circle" size={16} color={Colors.error} />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <Text style={styles.helperText}>
                        This information will be saved and can be shared with your provider
                        at your next visit.
                    </Text>
                </ScrollView>

                {/* Footer */}
                <View style={styles.footer}>
                    <Pressable
                        style={({ pressed }) => [
                            styles.submitButton,
                            isSubmitting && styles.submitButtonDisabled,
                            pressed && styles.buttonPressed,
                        ]}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.submitButtonText}>Save Response</Text>
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
    scrollContent: {
        flex: 1,
    },
    content: {
        paddingHorizontal: spacing(6),
        paddingTop: spacing(6),
        paddingBottom: spacing(4),
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: spacing(1),
    },
    sectionSubtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        marginBottom: spacing(5),
    },
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing(2),
        marginBottom: spacing(6),
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1.5),
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2.5),
        borderRadius: 999,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    chipSelected: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    chipText: {
        fontSize: 14,
        color: Colors.text,
    },
    chipTextSelected: {
        color: '#fff',
        fontWeight: '500',
    },
    notesLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.text,
        marginBottom: spacing(2),
    },
    notesInput: {
        borderWidth: 1,
        borderColor: Colors.stroke,
        borderRadius: Radius.md,
        padding: spacing(4),
        fontSize: 16,
        color: Colors.text,
        backgroundColor: Colors.surface,
        minHeight: 100,
        marginBottom: spacing(4),
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
        marginBottom: spacing(4),
    },
    errorText: {
        fontSize: 14,
        color: Colors.error,
    },
    helperText: {
        fontSize: 13,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 18,
    },
    footer: {
        paddingHorizontal: spacing(6),
        paddingBottom: spacing(8),
        paddingTop: spacing(4),
        borderTopWidth: 1,
        borderTopColor: Colors.stroke,
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
