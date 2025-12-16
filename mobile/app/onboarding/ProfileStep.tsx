/**
 * Profile Step - Screen 2
 * Collects name and date of birth (required)
 */

import React, { useMemo } from 'react';
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
import { Colors, spacing, Radius } from '../../components/ui';
import { OnboardingData } from './index';

type Props = {
    data: OnboardingData;
    onUpdate: (updates: Partial<OnboardingData>) => void;
    onNext: () => void;
};

export function ProfileStep({ data, onUpdate, onNext }: Props) {
    const canContinue = useMemo(() => {
        return data.firstName.trim().length > 0 && data.dateOfBirth.trim().length > 0;
    }, [data.firstName, data.dateOfBirth]);

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
                            style={styles.input}
                            value={data.dateOfBirth}
                            onChangeText={(text) => onUpdate({ dateOfBirth: text })}
                            placeholder="MM/DD/YYYY"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                        />
                        <Text style={styles.hint}>Format: MM/DD/YYYY (e.g., 04/15/1978)</Text>
                    </View>
                </View>

                {/* CTA */}
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={[styles.button, !canContinue && styles.buttonDisabled]}
                        onPress={onNext}
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
});
