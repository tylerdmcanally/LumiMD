/**
 * Caregiver Step - Onboarding
 * Optional step to add caregivers who will receive visit summaries
 * 
 * UX Flow:
 * - Primary caregiver fields always visible at top
 * - "Add Another" button to reveal additional caregiver form
 * - Added caregivers show as removable cards
 * - Continue saves all caregivers (form fields + cards) at once
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';

export type CaregiverEntry = {
    id: string;
    name: string;
    email: string;
    relationship: string;
};

type Props = {
    caregivers: CaregiverEntry[];
    onUpdate: (caregivers: CaregiverEntry[]) => void;
    onNext: () => void;
    onBack?: () => void;
    onSkip?: () => void;
};

const RELATIONSHIPS = [
    'Parent',
    'Spouse/Partner',
    'Child',
    'Sibling',
    'Aide',
    'Other',
];

const MAX_CAREGIVERS = 5;

type CaregiverFormData = {
    name: string;
    email: string;
    relationship: string;
};

const emptyForm: CaregiverFormData = { name: '', email: '', relationship: '' };

export function CaregiverStep({ caregivers, onUpdate, onNext, onBack, onSkip }: Props) {
    // Primary caregiver form (always visible)
    const [primaryForm, setPrimaryForm] = useState<CaregiverFormData>(emptyForm);
    const [primaryEmailError, setPrimaryEmailError] = useState<string | null>(null);
    const [primaryRelationshipOpen, setPrimaryRelationshipOpen] = useState(false);

    // Additional caregivers that have been "added"
    const [additionalCaregivers, setAdditionalCaregivers] = useState<CaregiverEntry[]>([]);

    // Additional caregiver form (shown when expanding)
    const [showAdditionalForm, setShowAdditionalForm] = useState(false);
    const [additionalForm, setAdditionalForm] = useState<CaregiverFormData>(emptyForm);
    const [additionalEmailError, setAdditionalEmailError] = useState<string | null>(null);
    const [additionalRelationshipOpen, setAdditionalRelationshipOpen] = useState(false);

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const hasPrimaryInput = primaryForm.name.trim().length > 0 || primaryForm.email.trim().length > 0;
    const hasValidPrimaryInput = primaryForm.name.trim().length > 0 && primaryForm.email.trim().length > 0;

    const hasAdditionalInput = additionalForm.name.trim().length > 0 || additionalForm.email.trim().length > 0;
    const hasValidAdditionalInput = additionalForm.name.trim().length > 0 && additionalForm.email.trim().length > 0;

    const totalCaregivers = additionalCaregivers.length + (hasValidPrimaryInput ? 1 : 0);
    const canAddMore = totalCaregivers < MAX_CAREGIVERS;

    // Add the additional form caregiver to the list
    const handleAddAnother = () => {
        if (!hasValidAdditionalInput) {
            if (showAdditionalForm) {
                // Just hide if nothing entered
                setShowAdditionalForm(false);
            } else {
                // Show the form
                setShowAdditionalForm(true);
            }
            return;
        }

        // Validate email
        if (!validateEmail(additionalForm.email.trim())) {
            setAdditionalEmailError('Please enter a valid email address');
            return;
        }

        // Add to list
        const newCaregiver: CaregiverEntry = {
            id: `cg_${Date.now()}`,
            name: additionalForm.name.trim(),
            email: additionalForm.email.trim().toLowerCase(),
            relationship: additionalForm.relationship || 'Other',
        };

        setAdditionalCaregivers([...additionalCaregivers, newCaregiver]);
        setAdditionalForm(emptyForm);
        setAdditionalEmailError(null);
        setShowAdditionalForm(false);
    };

    const handleRemoveCaregiver = (id: string) => {
        setAdditionalCaregivers(additionalCaregivers.filter(c => c.id !== id));
    };

    // Collect all caregivers and proceed
    const handleContinue = () => {
        const allCaregivers: CaregiverEntry[] = [...additionalCaregivers];

        // Add primary caregiver if filled
        if (hasValidPrimaryInput) {
            if (!validateEmail(primaryForm.email.trim())) {
                setPrimaryEmailError('Please enter a valid email address');
                return;
            }

            allCaregivers.push({
                id: `cg_${Date.now()}`,
                name: primaryForm.name.trim(),
                email: primaryForm.email.trim().toLowerCase(),
                relationship: primaryForm.relationship || 'Other',
            });
        }

        // Add additional form caregiver if filled
        if (hasValidAdditionalInput) {
            if (!validateEmail(additionalForm.email.trim())) {
                setAdditionalEmailError('Please enter a valid email address');
                return;
            }

            allCaregivers.push({
                id: `cg_${Date.now() + 1}`,
                name: additionalForm.name.trim(),
                email: additionalForm.email.trim().toLowerCase(),
                relationship: additionalForm.relationship || 'Other',
            });
        }

        // Update parent with all caregivers
        onUpdate(allCaregivers);

        // Give state time to propagate, then proceed
        setTimeout(() => onNext(), 100);
    };

    const renderCaregiverForm = (
        form: CaregiverFormData,
        setForm: (f: CaregiverFormData) => void,
        emailError: string | null,
        setEmailError: (e: string | null) => void,
        relationshipOpen: boolean,
        setRelationshipOpen: (o: boolean) => void,
        label: string
    ) => (
        <View style={styles.formSection}>
            {label && <Text style={styles.formLabel}>{label}</Text>}

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                    style={styles.input}
                    value={form.name}
                    onChangeText={(text) => setForm({ ...form, name: text })}
                    placeholder="e.g., Mom, Dr. Smith"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="words"
                    autoCorrect={false}
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                    style={[styles.input, emailError && styles.inputError]}
                    value={form.email}
                    onChangeText={(text) => {
                        setForm({ ...form, email: text });
                        setEmailError(null);
                    }}
                    placeholder="caregiver@email.com"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {emailError && (
                    <Text style={styles.errorText}>{emailError}</Text>
                )}
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>Relationship (optional)</Text>
                <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setRelationshipOpen(!relationshipOpen)}
                >
                    <Text style={form.relationship ? styles.pickerText : styles.pickerPlaceholder}>
                        {form.relationship || 'Select relationship'}
                    </Text>
                    <Ionicons
                        name={relationshipOpen ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={Colors.textMuted}
                    />
                </TouchableOpacity>
                {relationshipOpen && (
                    <View style={styles.pickerOptions}>
                        {RELATIONSHIPS.map((rel) => (
                            <TouchableOpacity
                                key={rel}
                                style={[
                                    styles.pickerOption,
                                    form.relationship === rel && styles.pickerOptionSelected,
                                ]}
                                onPress={() => {
                                    setForm({ ...form, relationship: rel });
                                    setRelationshipOpen(false);
                                }}
                            >
                                <Text
                                    style={[
                                        styles.pickerOptionText,
                                        form.relationship === rel && styles.pickerOptionTextSelected,
                                    ]}
                                >
                                    {rel}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>
        </View>
    );

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
                    <TouchableOpacity style={styles.backButton} onPress={onBack}>
                        <Ionicons name="arrow-back" size={24} color={Colors.text} />
                    </TouchableOpacity>
                )}

                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="people-outline" size={32} color={Colors.primary} />
                    </View>
                    <Text style={styles.title}>Keep loved ones in the loop</Text>
                    <Text style={styles.subtitle}>
                        Add caregivers to automatically receive email summaries after your visits
                    </Text>
                </View>

                {/* Already Added Caregivers */}
                {additionalCaregivers.length > 0 && (
                    <View style={styles.addedSection}>
                        <Text style={styles.sectionLabel}>Added Caregivers</Text>
                        {additionalCaregivers.map((caregiver) => (
                            <View key={caregiver.id} style={styles.caregiverCard}>
                                <View style={styles.caregiverInfo}>
                                    <Text style={styles.caregiverName}>
                                        {caregiver.name}
                                    </Text>
                                    <Text style={styles.caregiverEmail}>
                                        {caregiver.email}
                                    </Text>
                                    {caregiver.relationship && (
                                        <Text style={styles.caregiverRelationship}>
                                            {caregiver.relationship}
                                        </Text>
                                    )}
                                </View>
                                <TouchableOpacity
                                    onPress={() => handleRemoveCaregiver(caregiver.id)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Ionicons name="close-circle" size={24} color={Colors.textMuted} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                {/* Primary Caregiver Form */}
                {renderCaregiverForm(
                    primaryForm,
                    setPrimaryForm,
                    primaryEmailError,
                    setPrimaryEmailError,
                    primaryRelationshipOpen,
                    setPrimaryRelationshipOpen,
                    additionalCaregivers.length > 0 ? 'Add Another Caregiver' : ''
                )}

                {/* Add Another Button */}
                {canAddMore && hasValidPrimaryInput && !showAdditionalForm && (
                    <TouchableOpacity
                        style={styles.addAnotherButton}
                        onPress={() => {
                            // Move current primary to additional list
                            if (!validateEmail(primaryForm.email.trim())) {
                                setPrimaryEmailError('Please enter a valid email address');
                                return;
                            }

                            const newCaregiver: CaregiverEntry = {
                                id: `cg_${Date.now()}`,
                                name: primaryForm.name.trim(),
                                email: primaryForm.email.trim().toLowerCase(),
                                relationship: primaryForm.relationship || 'Other',
                            };

                            setAdditionalCaregivers([...additionalCaregivers, newCaregiver]);
                            setPrimaryForm(emptyForm);
                            setPrimaryEmailError(null);
                        }}
                    >
                        <Ionicons name="add" size={20} color={Colors.primary} />
                        <Text style={styles.addAnotherButtonText}>Add Another Caregiver</Text>
                    </TouchableOpacity>
                )}

                {/* Footer */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleContinue}
                    >
                        <Text style={styles.buttonText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </TouchableOpacity>

                    {onSkip && !hasPrimaryInput && additionalCaregivers.length === 0 && (
                        <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
                            <Text style={styles.skipButtonText}>Skip for now</Text>
                        </TouchableOpacity>
                    )}

                    <Text style={styles.helperText}>
                        You can always add or manage caregivers later in Settings
                    </Text>
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
    },
    header: {
        alignItems: 'center',
        paddingTop: spacing(8),
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
        fontSize: 26,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: spacing(2),
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 22,
    },
    sectionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textMuted,
        marginBottom: spacing(2),
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    addedSection: {
        marginTop: spacing(4),
        marginBottom: spacing(4),
    },
    caregiverCard: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.stroke,
        padding: spacing(4),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing(2),
    },
    caregiverInfo: {
        flex: 1,
    },
    caregiverName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    caregiverEmail: {
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 2,
    },
    caregiverRelationship: {
        fontSize: 13,
        color: Colors.primary,
        marginTop: 4,
    },
    formSection: {
        marginTop: spacing(2),
    },
    formLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textMuted,
        marginBottom: spacing(3),
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputGroup: {
        marginBottom: spacing(4),
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: spacing(2),
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
    inputError: {
        borderColor: Colors.error,
    },
    errorText: {
        fontSize: 13,
        color: Colors.error,
        marginTop: spacing(1),
    },
    pickerButton: {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.stroke,
        borderRadius: Radius.md,
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(4),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    pickerText: {
        fontSize: 16,
        color: Colors.text,
    },
    pickerPlaceholder: {
        fontSize: 16,
        color: Colors.textMuted,
    },
    pickerOptions: {
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.stroke,
        borderRadius: Radius.md,
        marginTop: spacing(2),
        overflow: 'hidden',
    },
    pickerOption: {
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(3),
        borderBottomWidth: 1,
        borderBottomColor: Colors.stroke,
    },
    pickerOptionSelected: {
        backgroundColor: `${Colors.primary}15`,
    },
    pickerOptionText: {
        fontSize: 15,
        color: Colors.text,
    },
    pickerOptionTextSelected: {
        color: Colors.primary,
        fontWeight: '600',
    },
    addAnotherButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
        paddingVertical: spacing(3),
        marginTop: spacing(2),
        borderWidth: 2,
        borderColor: Colors.primary,
        borderRadius: Radius.md,
        borderStyle: 'dashed',
    },
    addAnotherButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.primary,
    },
    footer: {
        paddingVertical: spacing(6),
        marginTop: 'auto',
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
        paddingVertical: spacing(4),
    },
    skipButtonText: {
        fontSize: 15,
        color: Colors.textMuted,
    },
    helperText: {
        fontSize: 13,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: spacing(3),
    },
    backButton: {
        position: 'absolute',
        top: spacing(4),
        left: 0,
        padding: spacing(2),
        zIndex: 10,
    },
});
