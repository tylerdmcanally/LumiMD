import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Colors, Radius, spacing } from './ui';
import { Ionicons } from '@expo/vector-icons';

export function StartVisitCTA({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable 
      onPress={onPress} 
      style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]} 
      accessibilityHint="Begins recording your visit and creates action items."
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
      
      <Ionicons name="chevron-forward" size={20} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(5),
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    shadowColor: Colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  iconContainer: {
    marginRight: spacing(4),
  },
  recordIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
});
