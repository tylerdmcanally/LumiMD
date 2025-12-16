import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors, Radius, spacing, Shadows } from './ui';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';
import { LinearGradient } from 'expo-linear-gradient';

export function StartVisitCTA({ onPress }: { onPress?: () => void }) {
  const handlePress = () => {
    haptics.heavy();
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressablePressed,
      ]}
      accessibilityHint="Begins recording your visit and creates action items."
    >
      <LinearGradient
        colors={[Colors.accent, Colors.accentDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cta}
      >
        <View style={styles.iconContainer}>
          <View style={styles.recordIcon}>
            <View style={styles.recordDot} />
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Start Visit</Text>
          <Text style={styles.subtitle}>Record and summarize a conversation</Text>
        </View>

        <View style={styles.arrowContainer}>
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: Radius.xl,
    ...Shadows.colored(Colors.accent),
  },
  pressablePressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(5),
    paddingVertical: spacing(6),
    borderRadius: Radius.xl,
  },
  iconContainer: {
    marginRight: spacing(4),
  },
  recordIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  recordDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: spacing(1),
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '500',
  },
  arrowContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

