import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const Colors = {
  primary: '#40C9D0', // cyan
  primaryLight: '#5DD3D9',
  secondary: '#89D8C6', // mint
  accent: '#0A99A4', // deep teal for CTA
  accentDark: '#078A94',
  warning: '#FBBF24',
  error: '#F87171',
  success: '#34D399',
  surface: '#FFFFFF',
  background: '#F8FAFB',
  text: '#1A2332',
  textMuted: '#4A5568',
  stroke: 'rgba(26,35,50,0.08)',
  border: 'rgba(26,35,50,0.08)',
} as const;

export const Radius = { sm: 10, md: 14, lg: 20 } as const;
export const spacing = (n: number) => n * 4; // 4pt grid

export const Card: React.FC<React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const PillLabel = ({ text, leftIcon }: { text: string; leftIcon?: React.ReactNode }) => (
  <View style={styles.pill}>
    {leftIcon ? <View style={{ marginRight: 6 }}>{leftIcon}</View> : null}
    <Text style={styles.pillText}>{text}</Text>
  </View>
);

export const GradientHero: React.FC<React.PropsWithChildren<{ style?: ViewStyle }>> = ({ children, style }) => (
  <LinearGradient colors={[Colors.primary, Colors.secondary]} style={[styles.hero, style]}>
    {children}
  </LinearGradient>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: Colors.stroke,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(64,201,208,0.15)'
  },
  pillText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  hero: {
    borderRadius: Radius.lg,
    padding: spacing(5),
    shadowColor: Colors.accentDark,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
});
