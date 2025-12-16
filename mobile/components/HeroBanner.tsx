import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { GradientHero, Colors, spacing, Radius, Typography } from './ui';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';

export function HeroBanner() {
  const router = useRouter();

  const handleProfilePress = () => {
    haptics.light();
    router.push('/settings');
  };

  return (
    <GradientHero style={styles.hero}>
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={handleProfilePress}
          style={({ pressed }) => [
            styles.profileButton,
            pressed && styles.profileButtonPressed,
          ]}
        >
          <Ionicons name="person-circle" size={26} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>LumiMD</Text>
        <Text style={styles.subtitle}>Your health, simplified.</Text>
      </View>
    </GradientHero>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingVertical: spacing(7),
    paddingHorizontal: spacing(5),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(5),
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  profileButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  profileButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  content: {
    marginTop: spacing(1),
  },
  title: {
    color: '#fff',
    ...Typography.hero,
    marginBottom: spacing(2),
  },
  subtitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});

