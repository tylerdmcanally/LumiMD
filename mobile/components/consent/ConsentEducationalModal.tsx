/**
 * ConsentEducationalModal Component
 *
 * Optional educational prompt for one-party consent states.
 * User can skip or opt out of future reminders.
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

export interface ConsentEducationalModalProps {
  visible: boolean;
  onProceed: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

export function ConsentEducationalModal({
  visible,
  onProceed,
  onCancel,
}: ConsentEducationalModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleProceed = () => {
    onProceed(dontShowAgain);
    setDontShowAgain(false);
  };

  const handleCancel = () => {
    setDontShowAgain(false);
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
          <Text style={styles.title}>Recording Tip</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="information-circle-outline" size={48} color={Colors.primary} />
          </View>

          <Text style={styles.description}>
            While not legally required in your state, many providers appreciate being
            informed of recordings.
          </Text>

          {/* Checkbox */}
          <Pressable
            style={styles.checkboxRow}
            onPress={() => setDontShowAgain(!dontShowAgain)}
          >
            <View style={[styles.checkbox, dontShowAgain && styles.checkboxChecked]}>
              {dontShowAgain && (
                <Ionicons name="checkmark" size={16} color="#fff" />
              )}
            </View>
            <Text style={styles.checkboxLabel}>Don't show this again</Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.buttonRow}>
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.skipButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCancel}
            >
              <Text style={styles.skipButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.proceedButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleProceed}
            >
              <Text style={styles.proceedButtonText}>Start Recording</Text>
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
  description: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing(8),
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
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  checkboxChecked: {
    backgroundColor: Colors.textMuted,
    borderColor: Colors.textMuted,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.textMuted,
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(8),
    paddingTop: spacing(4),
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
  skipButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  skipButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  proceedButton: {
    backgroundColor: Colors.primary,
  },
  proceedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
