import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, spacing, Radius } from './ui';
import { Ionicons } from '@expo/vector-icons';

function getGreeting(): { greeting: string; subtitle: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: 'Good morning', subtitle: 'Start your day with clarity' };
  if (hour < 17) return { greeting: 'Good afternoon', subtitle: 'How are you feeling today?' };
  return { greeting: 'Good evening', subtitle: 'Take a moment to reflect' };
}

type HeroBannerProps = {
  userName?: string;
};

export function HeroBanner({ userName }: HeroBannerProps) {
  const router = useRouter();
  const { greeting, subtitle } = getGreeting();
  const displayName = userName || '';

  return (
    <LinearGradient
      colors={['#0A99A4', '#2DB5B9', '#7ECDB5']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      {/* Decorative overlay circle */}
      <View style={styles.decorCircle} />

      <View style={styles.header}>
        <Text style={styles.brandText}>LumiMD</Text>
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [
            styles.profileButton,
            pressed && styles.profileButtonPressed,
          ]}
        >
          {displayName ? (
            <Text style={styles.avatarInitial}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          ) : (
            <Ionicons name="person" size={18} color="#fff" />
          )}
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.greetingText}>
          {greeting}{displayName ? `, ${displayName}` : ''}
        </Text>
        <Text style={styles.subtitleText}>{subtitle}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: Radius.xl,
    paddingHorizontal: spacing(6),
    paddingTop: spacing(7),
    paddingBottom: spacing(8),
    overflow: 'hidden',
    shadowColor: '#0A99A4',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  decorCircle: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(5),
  },
  brandText: {
    color: '#fff',
    fontSize: 26,
    fontFamily: 'Fraunces_700Bold',
    letterSpacing: -0.5,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  content: {
    gap: spacing(1),
  },
  greetingText: {
    color: '#fff',
    fontSize: 24,
    fontFamily: 'Fraunces_600SemiBold',
    letterSpacing: -0.3,
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    marginTop: spacing(1),
  },
});
