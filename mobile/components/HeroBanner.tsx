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
        <View style={styles.iconCircle}>
          <Ionicons name="medical" size={28} color="#fff" />
        </View>
        <View style={{ flex: 1 }} />
        <Pressable 
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [
            styles.profileButton,
            pressed && styles.profileButtonPressed,
          ]}
        >
          <Ionicons name="person-circle" size={28} color="#fff" />
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
    paddingVertical: spacing(6),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(4),
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: spacing(1),
  },
  subtitle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 16,
    fontWeight: '400',
  },
});
