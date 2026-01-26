import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, spacing } from './ui';

export function StartVisitCTA({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ctaWrapper, pressed && styles.ctaPressed]}
      accessibilityHint="Begins recording your visit and creates action items."
    >
      <LinearGradient
        colors={['#0A99A4', '#078A94']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cta}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Start Visit</Text>
          <Text style={styles.subtitle}>Record and summarize a conversation</Text>
        </View>

        <View style={styles.recordIcon}>
          <View style={styles.recordDot} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ctaWrapper: {
    borderRadius: Radius.lg,
    shadowColor: '#0A99A4',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(5),
    borderRadius: Radius.lg,
  },
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  recordIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    marginLeft: spacing(4),
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
    fontFamily: 'PlusJakartaSans_700Bold',
    marginBottom: 3,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
});
