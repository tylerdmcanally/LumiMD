import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Radius, spacing } from './ui';

export function StartVisitCTA({ onPress }: { onPress?: () => void }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ctaWrapper, pressed && styles.ctaPressed]}
      accessibilityHint="Begins recording your visit and creates action items."
    >
      <LinearGradient
        colors={['#0A99A4', '#078A94', '#065F66']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cta}
      >
        {/* Decorative glow */}
        <View style={styles.glowOrb} />

        <View style={styles.content}>
          <Text style={styles.title}>Start a Visit</Text>
          <Text style={styles.subtitle}>Record and summarize a conversation</Text>
        </View>

        <Animated.View
          style={[
            styles.recordRing,
            { transform: [{ scale: pulseAnim }] },
          ]}
        />
        <View style={styles.recordIcon}>
          <View style={styles.recordDot} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ctaWrapper: {
    borderRadius: Radius.xl,
    shadowColor: '#065F66',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(5),
    paddingVertical: spacing(5),
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  ctaPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  glowOrb: {
    position: 'absolute',
    top: -20,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(64,201,208,0.15)',
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    marginTop: 2,
  },
  recordRing: {
    position: 'absolute',
    right: spacing(5) + 2, // Align with recordIcon center
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  recordIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  recordDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
});
