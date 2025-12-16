import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { GradientHero, Colors, spacing } from './ui';
import { Ionicons } from '@expo/vector-icons';

export function HeroBanner() {
  const router = useRouter();

  return (
    <GradientHero style={styles.hero}>
      <View style={styles.header}>
        <Text style={styles.brandText}>LumiMD</Text>
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [
            styles.profileButton,
            pressed && styles.profileButtonPressed,
          ]}
        >
          <Ionicons name="person-circle" size={32} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Your health, simplified.</Text>
      </View>
    </GradientHero>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingVertical: spacing(6),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(3),
  },
  brandText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonPressed: {
    opacity: 0.7,
  },
  content: {
    marginTop: spacing(2),
  },
  subtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 17,
    fontWeight: '400',
  },
});

