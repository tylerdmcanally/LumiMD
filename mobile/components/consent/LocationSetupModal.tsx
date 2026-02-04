/**
 * LocationSetupModal Component
 *
 * Prompts user to enable location services or manually select their state
 * before proceeding with recording consent flow.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { haptic } from '../../lib/haptics';

export interface LocationSetupModalProps {
  visible: boolean;
  isLoading: boolean;
  onEnableLocation: () => Promise<boolean>;
  onSelectManually: () => void;
  onCancel: () => void;
}

export function LocationSetupModal({
  visible,
  isLoading,
  onEnableLocation,
  onSelectManually,
  onCancel,
}: LocationSetupModalProps) {
  const [isRequesting, setIsRequesting] = useState(false);

  const handleEnableLocation = async () => {
    void haptic.medium();
    setIsRequesting(true);
    try {
      const granted = await onEnableLocation();
      if (!granted) {
        void haptic.warning();
        // Permission denied - user can still select manually
      } else {
        void haptic.success();
      }
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void haptic.light();
              onCancel();
            }}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Set Your Location</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="location-outline" size={48} color={Colors.primary} />
          </View>

          <Text style={styles.heading}>
            Recording consent laws vary by state
          </Text>

          <Text style={styles.description}>
            To ensure compliance, we need to know your location. Some states 
            require consent from all parties before recording.
          </Text>

          {/* Options */}
          <View style={styles.optionsContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.optionButton,
                styles.primaryOption,
                (isRequesting || isLoading) && styles.optionDisabled,
                pressed && styles.optionPressed,
              ]}
              onPress={handleEnableLocation}
              disabled={isRequesting || isLoading}
            >
              {isRequesting || isLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={styles.primaryOptionText}>Use My Location</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.orText}>or</Text>

            <Pressable
              style={({ pressed }) => [
                styles.optionButton,
                styles.secondaryOption,
                pressed && styles.optionPressed,
              ]}
              onPress={() => {
                void haptic.selection();
                onSelectManually();
              }}
              disabled={isRequesting || isLoading}
            >
              <Ionicons name="list" size={20} color={Colors.primary} />
              <Text style={styles.secondaryOptionText}>Select State Manually</Text>
            </Pressable>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Your location is only used to determine consent requirements and is 
            not shared with third parties.
          </Text>
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
    marginBottom: spacing(8),
  },
  optionsContainer: {
    alignItems: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(6),
    borderRadius: Radius.md,
    gap: spacing(2),
    width: '100%',
  },
  primaryOption: {
    backgroundColor: Colors.primary,
  },
  primaryOptionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryOption: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  secondaryOptionText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  optionDisabled: {
    opacity: 0.6,
  },
  optionPressed: {
    opacity: 0.8,
  },
  orText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginVertical: spacing(4),
  },
  footer: {
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(8),
    paddingTop: spacing(4),
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
