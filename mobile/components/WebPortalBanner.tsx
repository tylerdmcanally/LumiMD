import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, spacing } from './ui';
import { openWebDashboard } from '../lib/linking';

const STORAGE_KEY = 'lumimd:webPortalBannerDismissed';

export function WebPortalBanner() {
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      setIsDismissed(value === 'true');
    });
  }, []);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    AsyncStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const handleRestore = useCallback(() => {
    setIsDismissed(false);
    AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const handleOpenPortal = useCallback(() => {
    openWebDashboard();
  }, []);

  // Don't render anything while loading from storage
  if (isDismissed === null) {
    return null;
  }

  // Collapsed "Need help?" button
  if (isDismissed) {
    return (
      <View style={styles.collapsedContainer}>
        <Pressable
          onPress={handleRestore}
          style={({ pressed }) => [
            styles.needHelpButton,
            pressed && styles.needHelpButtonPressed,
          ]}
        >
          <Ionicons name="help-circle-outline" size={16} color={Colors.accent} />
          <Text style={styles.needHelpText}>Need help?</Text>
        </Pressable>
      </View>
    );
  }

  // Full banner
  return (
    <View style={styles.banner}>
      {/* Dismiss button */}
      <Pressable
        onPress={handleDismiss}
        style={styles.dismissButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={20} color={Colors.textMuted} />
      </Pressable>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="desktop-outline" size={24} color="#fff" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>LumiMD Web Portal</Text>
          <Text style={styles.subtitle}>Access your health data on any device</Text>
        </View>
      </View>

      {/* Feature list */}
      <View style={styles.features}>
        <FeatureItem text="Review visit transcripts & AI insights" />
        <FeatureItem text="Manage your medication list" />
        <FeatureItem text="Track action items & follow-ups" />
        <FeatureItem text="Share summaries with caregivers" />
      </View>

      {/* CTA */}
      <Pressable
        onPress={handleOpenPortal}
        style={({ pressed }) => [
          styles.ctaButton,
          pressed && styles.ctaButtonPressed,
        ]}
      >
        <Text style={styles.ctaText}>Open Web Portal</Text>
        <Ionicons name="open-outline" size={18} color="#fff" />
      </Pressable>

      {/* Helper text */}
      <Text style={styles.helperText}>
        Dismiss this banner anytime. Tap "Need help?" to see it again.
      </Text>
    </View>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  needHelpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 153, 164, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10, 153, 164, 0.15)',
  },
  needHelpButtonPressed: {
    opacity: 0.7,
  },
  needHelpText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  banner: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: spacing(5),
    marginBottom: spacing(4),
    borderWidth: 1,
    borderColor: 'rgba(64, 201, 208, 0.25)',
    shadowColor: Colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  dismissButton: {
    position: 'absolute',
    top: spacing(3),
    right: spacing(3),
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    marginBottom: spacing(3),
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  features: {
    gap: spacing(2),
    marginBottom: spacing(4),
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  featureText: {
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: spacing(3),
    borderRadius: Radius.md,
    marginBottom: spacing(3),
  },
  ctaButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});

