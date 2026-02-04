/**
 * UpgradeNudgeCard Component
 * 
 * A contextual card shown to free users after performing manual actions
 * that premium automates. Designed to drive subscription conversion.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';
import { NudgeType, getNudgeConfig, markNudgeShown, dismissNudge } from '../lib/conversionNudges';
import { haptic } from '../lib/haptics';

interface UpgradeNudgeCardProps {
  type: NudgeType;
  onDismiss?: () => void;
  onSeePlans?: () => void;
}

export function UpgradeNudgeCard({ type, onDismiss, onSeePlans }: UpgradeNudgeCardProps) {
  const router = useRouter();
  const config = getNudgeConfig(type);

  const handleSeePlans = async () => {
    void haptic.medium();
    await markNudgeShown(type);
    if (onSeePlans) {
      onSeePlans();
    } else {
      router.push('/paywall');
    }
  };

  const handleMaybeLater = async () => {
    void haptic.light();
    await markNudgeShown(type);
    onDismiss?.();
  };

  const handleDontShowAgain = async () => {
    void haptic.warning();
    await dismissNudge(type);
    onDismiss?.();
  };

  return (
    <View style={styles.container}>
      {/* Header with icon */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name="sparkles" size={18} color={Colors.primary} />
        </View>
        <Text style={styles.title}>{config.title}</Text>
      </View>

      {/* Message */}
      <Text style={styles.message}>{config.message}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={handleSeePlans}>
          <Text style={styles.primaryButtonText}>See Plans</Text>
        </Pressable>
        
        <Pressable style={styles.secondaryButton} onPress={handleMaybeLater}>
          <Text style={styles.secondaryButtonText}>Maybe Later</Text>
        </Pressable>
      </View>

      {/* Don't show again link */}
      <Pressable style={styles.dontShowButton} onPress={handleDontShowAgain}>
        <Text style={styles.dontShowText}>Don't show again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
    padding: spacing(4),
    marginTop: spacing(4),
    marginHorizontal: spacing(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(2),
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  message: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing(4),
  },
  actions: {
    flexDirection: 'row',
    gap: spacing(3),
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: spacing(3),
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: Colors.surface,
    paddingVertical: spacing(3),
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  dontShowButton: {
    alignItems: 'center',
    paddingTop: spacing(3),
  },
  dontShowText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});

export default UpgradeNudgeCard;
