/**
 * Profile Step - Screen 2
 * Collects name and date of birth (required)
 */

import React, { useMemo, useState } from 'react';
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
import { haptic } from '../../lib/haptics';

export type OnboardingData = {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    allergies: string[];
    medicalHistory: string[];
    noAllergies: boolean;
    noMedicalHistory: boolean;
};

type Props = {
    data: OnboardingData;
    onUpdate: (updates: Partial<OnboardingData>) => void;
    onNext: () => void;
    onBack?: () => void;
};

// Validate DOB format and values
const validateDOB = (dob: string): string | null => {
    if (dob.length !== 10) return null; // Not complete yet

    const parts = dob.split('/');
    if (parts.length !== 3) return 'Invalid date format';

    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (isNaN(month) || isNaN(day) || isNaN(year)) {
        return 'Invalid date';
    }

    if (month < 1 || month > 12) {
        return 'Month must be 01-12';
    }

    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear) {
        return `Year must be 1900-${currentYear}`;
    }

    // Days in each month (accounting for leap year)
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    if (day < 1 || day > daysInMonth[month - 1]) {
        return `Invalid day for ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]}`;
    }

    // Check if date is not in the future
    const inputDate = new Date(year, month - 1, day);
    if (inputDate > new Date()) {
        return 'Date cannot be in the future';
    }

    return null; // Valid
};

export function ProfileStep({ data, onUpdate, onNext, onBack }: Props) {
    const [dobError, setDobError] = useState<string | null>(null);

    const canContinue = useMemo(() => {
        const hasName = data.firstName.trim().length > 0;
        const hasDob = data.dateOfBirth.length === 10;
        const dobValid = hasDob && validateDOB(data.dateOfBirth) === null;
        return hasName && dobValid;
    }, [data.firstName, data.dateOfBirth]);

    const handleDobChange = (text: string) => {
        // Auto-format DOB as MM/DD/YYYY
        const digits = text.replace(/\D/g, '');
        let formatted = '';
        if (digits.length > 0) {
            formatted = digits.substring(0, 2);
        }
        if (digits.length > 2) {
            formatted += '/' + digits.substring(2, 4);
        }
        if (digits.length > 4) {
            formatted += '/' + digits.substring(4, 8);
        }
        onUpdate({ dateOfBirth: formatted });

        // Validate when complete
        if (formatted.length === 10) {
            setDobError(validateDOB(formatted));
        } else {
            setDobError(null);
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
                        <Ionicons name="person-outline" size={32} color={Colors.primary} />
                    </View>
                    <Text style={styles.title}>About You</Text>
                    <Text style={styles.subtitle}>
                        We'll use this to personalize your experience
                    </Text>
                </View>

                {/* Form */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                            First Name <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={data.firstName}
                            onChangeText={(text) => onUpdate({ firstName: text })}
                            placeholder="Enter your first name"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="words"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Last Name</Text>
                        <TextInput
                            style={styles.input}
                            value={data.lastName}
                            onChangeText={(text) => onUpdate({ lastName: text })}
                            placeholder="Enter your last name (optional)"
                            placeholderTextColor={Colors.textMuted}
                            autoCapitalize="words"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                            Date of Birth <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                            style={[styles.input, dobError && styles.inputError]}
                            value={data.dateOfBirth}
                            onChangeText={handleDobChange}
                            placeholder="MM/DD/YYYY"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="number-pad"
                            maxLength={10}
                        />
                        {dobError ? (
                            <Text style={styles.errorText}>{dobError}</Text>
                        ) : (
                            <Text style={styles.hint}>Format: MM/DD/YYYY (e.g., 04/15/1978)</Text>
                        )}
                    </View>

                </View>

                {/* CTA */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.button, !canContinue && styles.buttonDisabled]}
                        onPress={() => {
                            void haptic.medium();
                            onNext();
                        }}
                        disabled={!canContinue}
                    >
                        <Text style={styles.buttonText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" />
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
        paddingTop: spacing(8),
        paddingBottom: spacing(6),
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
    },
    form: {
        gap: spacing(5),
    },
    inputGroup: {
        gap: spacing(2),
    },
    label: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    required: {
        color: Colors.error,
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
    hint: {
        fontSize: 13,
        color: Colors.textMuted,
    },
    footer: {
        paddingVertical: spacing(6),
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
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '600',
    },
    backButton: {
        position: 'absolute',
        top: spacing(4),
        left: 0,
        padding: spacing(2),
        zIndex: 10,
    },
    inputError: {
        borderColor: Colors.error,
    },
    errorText: {
        fontSize: 13,
        color: Colors.error,
    },
});

