/**
 * AddActionSheet
 *
 * Bottom-sheet form for adding a new action item.
 * After adding, offers to add to device calendar if a due date was set.
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
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { Colors, spacing, Radius } from './ui';
import { useCreateAction } from '../lib/api/mutations';

interface AddActionSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddActionSheet({ visible, onClose }: AddActionSheetProps) {
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [descError, setDescError] = useState(false);

  const createAction = useCreateAction();

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setDescription('');
      setDueDate(null);
      setShowDatePicker(false);
      setDescError(false);
    }
  }, [visible]);

  const handleAdd = () => {
    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      setDescError(true);
      return;
    }

    createAction.mutate(
      {
        description: trimmedDesc,
        dueAt: dueDate ? dueDate.toISOString() : undefined,
        type: 'other',
        source: 'manual',
      },
      {
        onSuccess: () => {
          onClose();
          Alert.alert(
            'Action Item Added',
            trimmedDesc,
            [{ text: 'OK' }],
          );
        },
        onError: () => {
          Alert.alert('Error', 'Could not add this action item. Please try again.');
        },
      },
    );
  };

  const handleDateChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setDueDate(selectedDate);
    }
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
              <Text style={styles.title}>Add Action Item</Text>
            </View>
            <Pressable
              onPress={handleAdd}
              style={[styles.headerButton, styles.saveButton]}
              disabled={createAction.isPending}
            >
              {createAction.isPending ? (
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
              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>What do you need to do?</Text>
                <TextInput
                  style={[styles.input, styles.textArea, descError && styles.inputError]}
                  value={description}
                  onChangeText={(text) => {
                    setDescription(text);
                    if (descError) setDescError(false);
                  }}
                  placeholder="e.g., Schedule a blood test"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="sentences"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoFocus
                />
                {descError && (
                  <Text style={styles.errorText}>Description is required</Text>
                )}
              </View>

              {/* Due Date */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Due Date (optional)</Text>
                <Pressable
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(!showDatePicker)}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={dueDate ? Colors.primary : Colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.dateButtonText,
                      dueDate && { color: Colors.text },
                    ]}
                  >
                    {dueDate ? dayjs(dueDate).format('MMM D, YYYY') : 'Set a due date'}
                  </Text>
                  {dueDate && (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setDueDate(null);
                        setShowDatePicker(false);
                      }}
                      hitSlop={8}
                    >
                      <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                    </Pressable>
                  )}
                </Pressable>

                {showDatePicker && (
                  <DateTimePicker
                    value={dueDate || new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={handleDateChange}
                    style={styles.datePicker}
                  />
                )}
              </View>
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
    maxHeight: '75%',
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
    maxHeight: 450,
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
  textArea: {
    minHeight: 80,
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(4),
  },
  dateButtonText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  datePicker: {
    marginTop: spacing(1),
  },
});
