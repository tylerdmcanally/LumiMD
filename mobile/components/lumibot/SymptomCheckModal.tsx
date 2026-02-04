/**
 * SymptomCheckModal Component
 * 
 * Interactive modal for heart failure symptom check-in.
 * Uses sliders and quick-select for fast, engaging input.
 */

import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    Modal,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import Slider from '@react-native-assets/slider';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { haptic } from '../../lib/haptics';

// =============================================================================
// Types
// =============================================================================

export interface SymptomCheckValue {
    breathingDifficulty: number;  // 1-5 scale
    swelling: 'none' | 'mild' | 'moderate' | 'severe';
    swellingLocations?: string[];
    energyLevel: number;  // 1-5 scale
    cough: boolean;
    orthopnea?: boolean;  // Needed extra pillows / woken up short of breath
    otherSymptoms?: string;
}

export interface SymptomCheckModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (value: SymptomCheckValue) => Promise<{
        alertLevel?: string;
        alertMessage?: string;
        shouldShowAlert?: boolean;
    }>;
    isSubmitting?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const BREATHING_LABELS = [
    'Breathing easy',
    'A little winded',
    'Short of breath',
    'Hard to catch breath',
    "Can't catch breath"
];

const ENERGY_LABELS = [
    'Very low',
    'Low',
    'Moderate',
    'Good',
    'Great'
];

const SWELLING_OPTIONS = [
    { value: 'none', label: 'None', icon: 'checkmark-circle' as const },
    { value: 'mild', label: 'Mild', icon: 'water-outline' as const },
    { value: 'moderate', label: 'Moderate', icon: 'water' as const },
    { value: 'severe', label: 'Severe', icon: 'warning' as const },
];

const SWELLING_LOCATIONS = [
    { id: 'ankles', label: 'Ankles' },
    { id: 'feet', label: 'Feet' },
    { id: 'legs', label: 'Legs' },
    { id: 'stomach', label: 'Stomach' },
];

// =============================================================================
// Component
// =============================================================================

export function SymptomCheckModal({
    visible,
    onClose,
    onSubmit,
    isSubmitting = false,
}: SymptomCheckModalProps) {
    const [breathingDifficulty, setBreathingDifficulty] = useState(1);
    const [swelling, setSwelling] = useState<'none' | 'mild' | 'moderate' | 'severe'>('none');
    const [swellingLocations, setSwellingLocations] = useState<string[]>([]);
    const [energyLevel, setEnergyLevel] = useState(3);
    const [cough, setCough] = useState(false);
    const [orthopnea, setOrthopnea] = useState(false);

    const handleClose = useCallback(() => {
        void haptic.light();
        // Reset state
        setBreathingDifficulty(1);
        setSwelling('none');
        setSwellingLocations([]);
        setEnergyLevel(3);
        setCough(false);
        setOrthopnea(false);
        onClose();
    }, [onClose]);

    const toggleSwellingLocation = useCallback((location: string) => {
        void haptic.selection();
        setSwellingLocations(prev =>
            prev.includes(location)
                ? prev.filter(l => l !== location)
                : [...prev, location]
        );
    }, []);

    const handleSubmit = useCallback(async () => {
        void haptic.medium();
        const result = await onSubmit({
            breathingDifficulty,
            swelling,
            swellingLocations: swelling !== 'none' ? swellingLocations : undefined,
            energyLevel,
            cough,
            orthopnea,
        });

        if (!result.shouldShowAlert) {
            void haptic.success();
            handleClose();
        }
    }, [breathingDifficulty, swelling, swellingLocations, energyLevel, cough, orthopnea, onSubmit, handleClose]);

    const getBreathingColor = () => {
        if (breathingDifficulty <= 2) return Colors.success;
        if (breathingDifficulty <= 3) return Colors.warning;
        return Colors.error;
    };

    const getEnergyColor = () => {
        if (energyLevel >= 4) return Colors.success;
        if (energyLevel >= 2) return Colors.warning;
        return Colors.error;
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={handleClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable onPress={handleClose} style={styles.closeButton}>
                        <Ionicons name="close" size={24} color={Colors.text} />
                    </Pressable>
                    <Text style={styles.title}>Daily Check-In</Text>
                    <View style={styles.closeButton} />
                </View>

                <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                    {/* Breathing Difficulty */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="fitness" size={22} color={Colors.primary} />
                            <Text style={styles.sectionTitle}>Breathing Today</Text>
                        </View>
                        <Text style={styles.sliderLabel}>
                            {BREATHING_LABELS[breathingDifficulty - 1]}
                        </Text>
                        <View style={styles.sliderContainer}>
                            <Text style={styles.sliderEndLabel}>Easy</Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={1}
                                maximumValue={5}
                                step={1}
                                value={breathingDifficulty}
                                onValueChange={setBreathingDifficulty}
                                minimumTrackTintColor={getBreathingColor()}
                                maximumTrackTintColor={Colors.stroke}
                                thumbTintColor={getBreathingColor()}
                            />
                            <Text style={styles.sliderEndLabel}>Hard</Text>
                        </View>
                    </View>

                    {/* Swelling */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="body" size={22} color={Colors.primary} />
                            <Text style={styles.sectionTitle}>Any Swelling?</Text>
                        </View>
                        <View style={styles.optionsRow}>
                            {SWELLING_OPTIONS.map(option => (
                                <Pressable
                                    key={option.value}
                                    style={[
                                        styles.optionButton,
                                        swelling === option.value && styles.optionButtonSelected,
                                    ]}
                                    onPress={() => {
                                        void haptic.selection();
                                        setSwelling(option.value as typeof swelling);
                                    }}
                                >
                                    <Ionicons
                                        name={option.icon}
                                        size={20}
                                        color={swelling === option.value ? '#fff' : Colors.textMuted}
                                    />
                                    <Text style={[
                                        styles.optionLabel,
                                        swelling === option.value && styles.optionLabelSelected,
                                    ]}>
                                        {option.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        {swelling !== 'none' && (
                            <View style={styles.locationsContainer}>
                                <Text style={styles.locationsLabel}>Where?</Text>
                                <View style={styles.locationsRow}>
                                    {SWELLING_LOCATIONS.map(loc => (
                                        <Pressable
                                            key={loc.id}
                                            style={[
                                                styles.locationChip,
                                                swellingLocations.includes(loc.id) && styles.locationChipSelected,
                                            ]}
                                            onPress={() => toggleSwellingLocation(loc.id)}
                                        >
                                            <Text style={[
                                                styles.locationChipText,
                                                swellingLocations.includes(loc.id) && styles.locationChipTextSelected,
                                            ]}>
                                                {loc.label}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Energy Level */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="flash" size={22} color={Colors.primary} />
                            <Text style={styles.sectionTitle}>Energy Level</Text>
                        </View>
                        <Text style={styles.sliderLabel}>
                            {ENERGY_LABELS[energyLevel - 1]}
                        </Text>
                        <View style={styles.sliderContainer}>
                            <Text style={styles.sliderEndLabel}>Low</Text>
                            <Slider
                                style={styles.slider}
                                minimumValue={1}
                                maximumValue={5}
                                step={1}
                                value={energyLevel}
                                onValueChange={setEnergyLevel}
                                minimumTrackTintColor={getEnergyColor()}
                                maximumTrackTintColor={Colors.stroke}
                                thumbTintColor={getEnergyColor()}
                            />
                            <Text style={styles.sliderEndLabel}>High</Text>
                        </View>
                    </View>

                    {/* Cough */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="medical" size={22} color={Colors.primary} />
                            <Text style={styles.sectionTitle}>Any Cough?</Text>
                        </View>
                        <View style={styles.yesNoRow}>
                            <Pressable
                                style={[
                                    styles.yesNoButton,
                                    !cough && styles.yesNoButtonSelected,
                                ]}
                                onPress={() => {
                                    void haptic.selection();
                                    setCough(false);
                                }}
                            >
                                <Text style={[
                                    styles.yesNoText,
                                    !cough && styles.yesNoTextSelected,
                                ]}>No</Text>
                            </Pressable>
                            <Pressable
                                style={[
                                    styles.yesNoButton,
                                    cough && styles.yesNoButtonSelected,
                                ]}
                                onPress={() => {
                                    void haptic.selection();
                                    setCough(true);
                                }}
                            >
                                <Text style={[
                                    styles.yesNoText,
                                    cough && styles.yesNoTextSelected,
                                ]}>Yes</Text>
                            </Pressable>
                        </View>
                    </View>

                    {/* Orthopnea - Sleeping/Nighttime Breathing */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="bed" size={22} color={Colors.primary} />
                            <Text style={styles.sectionTitle}>Sleep Breathing</Text>
                        </View>
                        <Text style={styles.helpText}>
                            Needed extra pillows or woken up short of breath?
                        </Text>
                        <View style={styles.yesNoRow}>
                            <Pressable
                                style={[
                                    styles.yesNoButton,
                                    !orthopnea && styles.yesNoButtonSelected,
                                ]}
                                onPress={() => {
                                    void haptic.selection();
                                    setOrthopnea(false);
                                }}
                            >
                                <Text style={[
                                    styles.yesNoText,
                                    !orthopnea && styles.yesNoTextSelected,
                                ]}>No</Text>
                            </Pressable>
                            <Pressable
                                style={[
                                    styles.yesNoButton,
                                    orthopnea && styles.yesNoButtonSelected,
                                ]}
                                onPress={() => {
                                    void haptic.selection();
                                    setOrthopnea(true);
                                }}
                            >
                                <Text style={[
                                    styles.yesNoText,
                                    orthopnea && styles.yesNoTextSelected,
                                ]}>Yes</Text>
                            </Pressable>
                        </View>
                    </View>

                    <View style={{ height: spacing(8) }} />
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
                            <Text style={styles.submitButtonText}>Save Check-In</Text>
                        )}
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

// =============================================================================
// Styles
// =============================================================================

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
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: spacing(4),
    },
    section: {
        marginTop: spacing(6),
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing(3),
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginLeft: spacing(2),
    },
    sliderLabel: {
        fontSize: 24,
        fontWeight: '700',
        color: Colors.text,
        textAlign: 'center',
        marginBottom: spacing(2),
    },
    sliderContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing(1),
    },
    slider: {
        flex: 1,
        height: 40,
        marginHorizontal: spacing(2),
    },
    sliderEndLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        width: 32,
        textAlign: 'center',
    },
    optionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    optionButton: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing(3),
        marginHorizontal: spacing(1),
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    optionButtonSelected: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    optionLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: spacing(1),
    },
    optionLabelSelected: {
        color: '#fff',
    },
    locationsContainer: {
        marginTop: spacing(3),
    },
    locationsLabel: {
        fontSize: 14,
        color: Colors.textMuted,
        marginBottom: spacing(2),
    },
    locationsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    locationChip: {
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2),
        backgroundColor: Colors.surface,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: Colors.stroke,
        marginRight: spacing(2),
        marginBottom: spacing(2),
    },
    locationChipSelected: {
        backgroundColor: Colors.accent,
        borderColor: Colors.primary,
    },
    locationChipText: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    locationChipTextSelected: {
        color: Colors.primary,
        fontWeight: '600',
    },
    helpText: {
        fontSize: 14,
        color: Colors.textMuted,
        marginBottom: spacing(2),
    },
    yesNoRow: {
        flexDirection: 'row',
    },
    yesNoButton: {
        flex: 1,
        paddingVertical: spacing(3),
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.stroke,
        marginHorizontal: spacing(1),
    },
    yesNoButtonSelected: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    yesNoText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    yesNoTextSelected: {
        color: '#fff',
    },
    footer: {
        padding: spacing(4),
        borderTopWidth: 1,
        borderTopColor: Colors.stroke,
    },
    submitButton: {
        backgroundColor: Colors.primary,
        paddingVertical: spacing(4),
        borderRadius: Radius.lg,
        alignItems: 'center',
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    buttonPressed: {
        opacity: 0.8,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
