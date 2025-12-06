import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, spacing, Radius } from './ui';

type PaywallScreenProps = {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  daysLeft?: number;
};

export function PaywallScreen({ visible, onClose, onSubscribe, daysLeft }: PaywallScreenProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Upgrade to keep using AI summaries</Text>
          <Text style={styles.subtitle}>
            14-day free trial. Cancel anytime. Unlock AI visit summaries and medication insights.
          </Text>
          {typeof daysLeft === 'number' && (
            <Text style={styles.daysLeft}>{daysLeft} days left in your trial</Text>
          )}

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.primary]} onPress={onSubscribe}>
              <Text style={styles.primaryText}>Subscribe</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondary]} onPress={onClose}>
              <Text style={styles.secondaryText}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: spacing(5),
    gap: spacing(3),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    lineHeight: 22,
  },
  daysLeft: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  actions: {
    gap: spacing(2),
  },
  button: {
    paddingVertical: spacing(3),
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  primaryText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  secondary: {
    backgroundColor: Colors.muted,
  },
  secondaryText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});


