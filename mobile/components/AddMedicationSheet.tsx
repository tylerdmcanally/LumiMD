/**
 * AddMedicationSheet
 *
 * Bottom-sheet form for adding a new medication.
 * After adding, offers to set a reminder (navigates to medication-schedule).
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, spacing, Radius } from './ui';
import { useCreateMedication } from '../lib/api/mutations';

interface AddMedicationSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddMedicationSheet({ visible, onClose }: AddMedicationSheetProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('');
  const [nameError, setNameError] = useState(false);

  const createMedication = useCreateMedication();

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setName('');
      setDose('');
      setFrequency('');
      setNameError(false);
    }
  }, [visible]);

  const handleAdd = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }

    createMedication.mutate(
      {
        name: trimmedName,
        dose: dose.trim() || undefined,
        frequency: frequency.trim() || undefined,
        status: 'active',
        source: 'manual',
      },
      {
        onSuccess: () => {
          onClose();
          Alert.alert(
            'Medication Added',
            `${trimmedName} has been added to your list.`,
            [
              { text: 'Done', style: 'cancel' },
              {
                text: 'Set a Reminder',
                onPress: () => router.push('/medication-schedule'),
              },
            ],
          );
        },
        onError: () => {
          Alert.alert('Error', 'Could not add this medication. Please try again.');
        },
      },
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>Add Medication</Text>
            </View>
            <Pressable
              onPress={handleAdd}
              style={[styles.headerButton, styles.saveButton]}
              disabled={createMedication.isPending}
            >
              {createMedication.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>Add</Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.form}>
              {/* Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Medication Name</Text>
                <TextInput
                  style={[styles.input, nameError && styles.inputError]}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (nameError) setNameError(false);
                  }}
                  placeholder="e.g., Vitamin D"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
                  autoFocus
                  returnKeyType="next"
                />
                {nameError && (
                  <Text style={styles.errorText}>Medication name is required</Text>
                )}
              </View>

              {/* Dose */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Dose</Text>
                <TextInput
                  style={styles.input}
                  value={dose}
                  onChangeText={setDose}
                  placeholder="e.g., 20mg"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>

              {/* Frequency */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Frequency</Text>
                <TextInput
                  style={styles.input}
                  value={frequency}
                  onChangeText={setFrequency}
                  placeholder="e.g., Once daily with food"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  onSubmitEditing={handleAdd}
                />
              </View>
            </View>

            {/* Disclaimer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                You can set a reminder after adding. Always follow your provider's instructions.
              </Text>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  headerButton: {
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(2),
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontFamily: 'Fraunces_600SemiBold',
    color: Colors.text,
  },
  cancelText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  saveButton: {
    backgroundColor: Colors.accent,
    borderRadius: 22,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    minWidth: 60,
  },
  saveText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
  scrollContent: {
    maxHeight: 400,
  },
  form: {
    padding: spacing(5),
    gap: spacing(5),
  },
  fieldGroup: {
    gap: spacing(2),
  },
  label: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textWarm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(4),
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  footer: {
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
    textAlign: 'center',
  },
});
