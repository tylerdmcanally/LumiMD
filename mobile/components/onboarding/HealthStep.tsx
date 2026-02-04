/**
 * Health Step - Screen 3
 * Collects medical history and allergies (skippable)
 */

import React from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { OnboardingData } from './ProfileStep';
import { haptic } from '../../lib/haptics';

type Props = {
    data: OnboardingData;
    onUpdate: (updates: Partial<OnboardingData>) => void;
    onNext: () => void;
    onSkip: () => void;
    onBack?: () => void;
};

const sanitizeListInput = (value: string): string[] =>
    value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

export function HealthStep({ data, onUpdate, onNext, onSkip, onBack }: Props) {
    const [conditionsText, setConditionsText] = React.useState(
        data.medicalHistory.join(', ')
    );
    const [allergiesText, setAllergiesText] = React.useState(
        data.allergies.join(', ')
    );

    const handleConditionsChange = (text: string) => {
        setConditionsText(text);
        onUpdate({ medicalHistory: sanitizeListInput(text) });
        if (text.trim() && data.noMedicalHistory) {
            onUpdate({ noMedicalHistory: false });
        }
    };

    const handleAllergiesChange = (text: string) => {
        setAllergiesText(text);
        onUpdate({ allergies: sanitizeListInput(text) });
        if (text.trim() && data.noAllergies) {
            onUpdate({ noAllergies: false });
        }
    };

    const toggleNoMedicalHistory = () => {
        void haptic.selection();
        const newValue = !data.noMedicalHistory;
        onUpdate({ noMedicalHistory: newValue });
        if (newValue) {
            setConditionsText('');
            onUpdate({ medicalHistory: [] });
        }
    };

    const toggleNoAllergies = () => {
        void haptic.selection();
        const newValue = !data.noAllergies;
        onUpdate({ noAllergies: newValue });
        if (newValue) {
            setAllergiesText('');
            onUpdate({ allergies: [] });
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
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
                    <View style={styles.iconContainer}>
                        <Ionicons name="heart-outline" size={32} color={Colors.primary} />
                    </View>
                    <Text style={styles.title}>Health Background</Text>
                    <Text style={styles.subtitle}>
                        This helps us catch medication interactions and personalize your care
                    </Text>
                </View>


                {/* Form */}
                <View style={styles.form}>
                    {/* Medical Conditions */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Medical Conditions</Text>
                        <TextInput
                            style={[styles.input, styles.multilineInput]}
                            value={conditionsText}
                            onChangeText={handleConditionsChange}
                            placeholder="Hypertension, Type 2 Diabetes..."
                            placeholderTextColor={Colors.textMuted}
                            multiline
                            editable={!data.noMedicalHistory}
                        />
                        <Text style={styles.hint}>Separate conditions with commas</Text>

                        <Pressable style={styles.checkboxRow} onPress={toggleNoMedicalHistory}>
                            <View style={[styles.checkbox, data.noMedicalHistory && styles.checkboxChecked]}>
                                {data.noMedicalHistory && (
                                    <Ionicons name="checkmark" size={14} color="#fff" />
                                )}
                            </View>
                            <Text style={styles.checkboxLabel}>No past medical history</Text>
                        </Pressable>
                    </View>

                    {/* Allergies */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Allergies</Text>
                        <TextInput
                            style={[styles.input, styles.multilineInput]}
                            value={allergiesText}
                            onChangeText={handleAllergiesChange}
                            placeholder="Penicillin, Shellfish..."
                            placeholderTextColor={Colors.textMuted}
                            multiline
                            editable={!data.noAllergies}
                        />
                        <Text style={styles.hint}>Include medication and food allergies</Text>

                        <Pressable style={styles.checkboxRow} onPress={toggleNoAllergies}>
                            <View style={[styles.checkbox, data.noAllergies && styles.checkboxChecked]}>
                                {data.noAllergies && (
                                    <Ionicons name="checkmark" size={14} color="#fff" />
                                )}
                            </View>
                            <Text style={styles.checkboxLabel}>No known allergies</Text>
                        </Pressable>
                    </View>
                </View>

                {/* CTAs */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => {
                            void haptic.medium();
                            onNext();
                        }}
                    >
                        <Text style={styles.buttonText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.skipButton}
                        onPress={() => {
                            void haptic.light();
                            onSkip();
                        }}
                    >
                        <Text style={styles.skipText}>I'll add this later</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: spacing(6),
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
        paddingTop: spacing(6),
        paddingBottom: spacing(4),
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: `${Colors.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing(4),
    },
    title: {
        fontSize: 28,
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
    form: {
        gap: spacing(6),
    },
    inputGroup: {
        gap: spacing(2),
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    input: {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.stroke,
        borderRadius: Radius.md,
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(4),
        fontSize: 16,
        color: Colors.text,
    },
    multilineInput: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    hint: {
        fontSize: 13,
        color: Colors.textMuted,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
        paddingTop: spacing(2),
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: Colors.stroke,
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        borderColor: Colors.primary,
        backgroundColor: Colors.primary,
    },
    checkboxLabel: {
        fontSize: 15,
        color: Colors.text,
    },
    footer: {
        paddingVertical: spacing(4),
        gap: spacing(3),
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
    skipButton: {
        alignItems: 'center',
        paddingVertical: spacing(2),
    },
    skipText: {
        color: Colors.textMuted,
        fontSize: 15,
        fontWeight: '500',
    },
    backButton: {
        position: 'absolute',
        top: spacing(4),
        left: 0,
        padding: spacing(2),
        zIndex: 10,
    },
});

