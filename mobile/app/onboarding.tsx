/**
 * Onboarding Screen
 * Collects basic patient profile data after sign-up.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';

import { Colors, spacing, Card } from '../components/ui';
import { useUserProfile } from '../lib/api/hooks';
import { useUpdateUserProfile } from '../lib/api/mutations';

const sanitizeListInput = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export default function OnboardingScreen() {
  const router = useRouter();
  const { data: profile, isLoading: loadingProfile } = useUserProfile();
  const updateProfile = useUpdateUserProfile();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [allergiesInput, setAllergiesInput] = useState('');
  const [medicalHistoryInput, setMedicalHistoryInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.firstName ?? '');
    setLastName(profile.lastName ?? '');
    setDateOfBirth(profile.dateOfBirth ?? '');
    setAllergiesInput((profile.allergies ?? []).join(', '));
    setMedicalHistoryInput((profile.medicalHistory ?? []).join(', '));
  }, [profile]);

  const isSaving = submitting || updateProfile.isPending;
  const disabled = isSaving || loadingProfile;

  const formattedDobPlaceholder = useMemo(() => {
    if (!profile?.dateOfBirth) return 'MM/DD/YYYY';
    const parsed = dayjs(profile.dateOfBirth);
    return parsed.isValid() ? parsed.format('MM/DD/YYYY') : 'MM/DD/YYYY';
  }, [profile?.dateOfBirth]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      await updateProfile.mutateAsync({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth.trim(),
        allergies: sanitizeListInput(allergiesInput),
        medicalHistory: sanitizeListInput(medicalHistoryInput),
      });
      router.replace('/');
    } catch (err: any) {
      console.error('[Onboarding] Failed to save profile', err);
      setError(err?.userMessage || 'Unable to save your profile right now.');
    } finally {
      setSubmitting(false);
    }
  }, [
    updateProfile,
    firstName,
    lastName,
    dateOfBirth,
    allergiesInput,
    medicalHistoryInput,
    router,
  ]);

  const handleSkip = () => {
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Tell us about yourself</Text>
          <Text style={styles.subtitle}>
            We’ll use this information to personalize your summaries and follow-ups.
          </Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Basic details</Text>
          <View style={styles.row}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Jane"
                editable={!disabled}
                autoCapitalize="words"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Doe"
                editable={!disabled}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date of birth</Text>
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder={formattedDobPlaceholder}
              editable={!disabled}
              autoCapitalize="none"
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            />
            <Text style={styles.helper}>
              Format: MM/DD/YYYY (example: 04/15/1978)
            </Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Medical history</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Medical conditions</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={medicalHistoryInput}
              onChangeText={setMedicalHistoryInput}
              placeholder="Hypertension, Type 2 diabetes..."
              editable={!disabled}
              multiline
            />
            <Text style={styles.helper}>
              Separate conditions with commas. We’ll turn each one into its own entry.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Allergies</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={allergiesInput}
              onChangeText={setAllergiesInput}
              placeholder="Penicillin, Shellfish..."
              editable={!disabled}
              multiline
            />
            <Text style={styles.helper}>
              Include medication and food allergies. Separate each with a comma.
            </Text>
          </View>
        </Card>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={disabled}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
            onPress={handleSubmit}
            disabled={disabled}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Save and continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: spacing(5),
    gap: spacing(4),
  },
  header: {
    gap: spacing(2),
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    lineHeight: 22,
  },
  card: {
    padding: spacing(4),
    gap: spacing(3),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: spacing(3),
  },
  inputGroup: {
    flex: 1,
    gap: spacing(1),
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stroke,
    borderRadius: spacing(2),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: Colors.text,
    backgroundColor: '#fff',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helper: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  errorBanner: {
    padding: spacing(3),
    borderRadius: spacing(2),
    backgroundColor: '#fee2e2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fecaca',
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing(2),
    alignItems: 'center',
  },
  skipButton: {
    flex: 1,
    paddingVertical: spacing(4),
    borderRadius: spacing(3),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.stroke,
    alignItems: 'center',
  },
  skipText: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: spacing(4),
    borderRadius: spacing(3),
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});


