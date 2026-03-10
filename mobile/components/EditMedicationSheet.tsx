/**
 * EditMedicationSheet
 *
 * Bottom-sheet form for editing an existing medication.
 * Follows the ReminderTimePickerModal pattern (Modal, slide-up, half-screen).
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
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';
import { useUpdateMedication } from '../lib/api/mutations';
import type { Medication } from '@lumimd/sdk';

interface EditMedicationSheetProps {
  medication: Medication | null;
  visible: boolean;
  onClose: () => void;
}

export function EditMedicationSheet({
  medication,
  visible,
  onClose,
}: EditMedicationSheetProps) {
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [frequency, setFrequency] = useState('');
  const [nameError, setNameError] = useState(false);

  const updateMedication = useUpdateMedication();

  // Reset form when modal opens
  useEffect(() => {
    if (visible && medication) {
      setName(medication.name || '');
      setDose(medication.dose || '');
      setFrequency(medication.frequency || '');
      setNameError(false);
    }
  }, [visible, medication]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }
    if (!medication) return;

    updateMedication.mutate(
      {
        id: medication.id,
        data: {
          name: trimmedName,
          dose: dose.trim() || null,
          frequency: frequency.trim() || null,
        },
      },
      {
        onSuccess: () => onClose(),
        onError: () => {
          Alert.alert('Error', 'Could not update this medication. Please try again.');
        },
      },
    );
  };

  const handleStop = () => {
    if (!medication) return;
    Alert.alert(
      'Stop Medication',
      `Stop taking ${medication.name}? This will move it to your inactive list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => {
            updateMedication.mutate(
              {
                id: medication.id,
                data: { active: false, stoppedAt: new Date().toISOString() },
              },
              {
                onSuccess: () => onClose(),
                onError: () => {
                  Alert.alert('Error', 'Could not stop this medication. Please try again.');
                },
              },
            );
          },
        },
      ],
    );
  };

  const isActive = medication ? medication.active !== false && !medication.stoppedAt : true;

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
              <Text style={styles.title}>Edit Medication</Text>
            </View>
            <Pressable
              onPress={handleSave}
              style={[styles.headerButton, styles.saveButton]}
              disabled={updateMedication.isPending}
            >
              {updateMedication.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
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
                  placeholder="e.g., Lisinopril"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="words"
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
                />
              </View>

              {/* Stop Medication */}
              {isActive && (
                <Pressable style={styles.stopButton} onPress={handleStop}>
                  <Ionicons name="close-circle-outline" size={20} color={Colors.error} />
                  <Text style={styles.stopButtonText}>Stop This Medication</Text>
                </Pressable>
              )}
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
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    paddingVertical: spacing(4),
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    backgroundColor: 'rgba(248,113,113,0.08)',
    marginTop: spacing(2),
  },
  stopButtonText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.error,
  },
});
