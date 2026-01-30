/**
 * ConsentRequiredModal Component
 *
 * Blocking modal for two-party consent states.
 * User must confirm provider consent before recording.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { US_STATES } from '../../lib/location';

export interface ConsentRequiredModalProps {
  visible: boolean;
  stateCode: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConsentRequiredModal({
  visible,
  stateCode,
  onConfirm,
  onCancel,
}: ConsentRequiredModalProps) {
  const [isChecked, setIsChecked] = useState(false);

  const stateName = stateCode
    ? US_STATES.find((s) => s.code === stateCode)?.name || stateCode
    : 'your state';

  const handleConfirm = () => {
    if (isChecked) {
      setIsChecked(false);
      onConfirm();
    }
  };

  const handleCancel = () => {
    setIsChecked(false);
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleCancel} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Consent Required</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="shield-checkmark-outline" size={48} color={Colors.primary} />
          </View>

          <Text style={styles.heading}>
            {stateName} requires all-party consent to record.
          </Text>

          <Text style={styles.description}>
            Before recording, obtain verbal consent from your healthcare provider.
          </Text>

          <View style={styles.suggestionBox}>
            <Text style={styles.suggestionLabel}>Suggested:</Text>
            <Text style={styles.suggestionText}>
              "Do you mind if I record this visit so I can review the information later?"
            </Text>
          </View>

          {/* Checkbox */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setIsChecked(!isChecked)}
          >
            <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
              {isChecked && (
                <Ionicons name="checkmark" size={16} color="#fff" />
              )}
            </View>
            <Text style={styles.checkboxLabel}>
              I confirm my provider has consented to recording
            </Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {/* Legal Disclaimer */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>
              LumiMD cannot provide legal advice. Recording laws vary by jurisdiction.
              When in doubt, obtain consent from all parties before recording.
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                !isChecked && styles.buttonDisabled,
                pressed && isChecked && styles.buttonPressed,
              ]}
              onPress={handleConfirm}
              disabled={!isChecked}
            >
              <Text style={styles.confirmButtonText}>Start Recording</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing(6),
    paddingTop: spacing(8),
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing(6),
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: spacing(4),
  },
  description: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing(6),
  },
  suggestionBox: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: spacing(4),
    marginBottom: spacing(8),
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  suggestionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: spacing(2),
  },
  suggestionText: {
    fontSize: 15,
    color: Colors.text,
    fontStyle: 'italic',
    lineHeight: 22,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(8),
    paddingTop: spacing(4),
  },
  disclaimer: {
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(3),
    marginBottom: spacing(4),
    borderTopWidth: 1,
    borderTopColor: Colors.stroke,
  },
  disclaimerText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing(3),
  },
  button: {
    flex: 1,
    paddingVertical: spacing(4),
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  cancelButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
