import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const Colors = {
  // Primary palette
  primary: '#40C9D0',
  primaryLight: '#5DD3D9',
  primaryDark: '#2BA8AE',

  // Secondary palette
  secondary: '#89D8C6',
  secondaryLight: '#A8E4D6',

  // Accent for CTAs and emphasis
  accent: '#0A99A4',
  accentDark: '#078A94',
  accentDeep: '#066B73',

  // Status colors
  warning: '#FBBF24',
  warningLight: '#FCD34D',
  error: '#F87171',
  errorLight: '#FCA5A5',
  success: '#34D399',
  successLight: '#6EE7B7',

  // Surface & backgrounds
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#F7FAFA',
  background: '#F3F7F8',

  // Text
  text: '#1A2332',
  textSecondary: '#4A5568',
  textMuted: '#6B7280',
  textLight: '#9CA3AF',

  // Borders & strokes
  stroke: 'rgba(26,35,50,0.06)',
  border: 'rgba(26,35,50,0.08)',
  borderLight: 'rgba(26,35,50,0.04)',

  // Overlays
  overlay: 'rgba(26,35,50,0.5)',
  overlayLight: 'rgba(26,35,50,0.1)',
} as const;

// Typography scale
export const Typography = {
  hero: { fontSize: 36, fontWeight: '700' as const, letterSpacing: -0.8 },
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' as const, letterSpacing: 0 },
  bodyBold: { fontSize: 16, fontWeight: '600' as const, letterSpacing: 0 },
  caption: { fontSize: 14, fontWeight: '400' as const, letterSpacing: 0.1 },
  captionBold: { fontSize: 14, fontWeight: '600' as const, letterSpacing: 0.1 },
  small: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 },
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 22,
  xl: 28,
  full: 999,
} as const;

export const spacing = (n: number) => n * 4; // 4pt grid

// Elevated shadow presets
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  colored: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  }),
} as const;

export const Card: React.FC<React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const PillLabel = ({ text, leftIcon, color = Colors.primary }: { text: string; leftIcon?: React.ReactNode; color?: string }) => (
  <View style={[styles.pill, { backgroundColor: `${color}15` }]}>
    {leftIcon ? <View style={{ marginRight: 6 }}>{leftIcon}</View> : null}
    <Text style={[styles.pillText, { color }]}>{text}</Text>
  </View>
);

export const GradientHero: React.FC<React.PropsWithChildren<{ style?: ViewStyle }>> = ({ children, style }) => (
  <LinearGradient
    colors={[Colors.primary, Colors.secondary]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[styles.hero, style]}
  >
    {children}
  </LinearGradient>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: Colors.borderLight,
    ...Shadows.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  hero: {
    borderRadius: Radius.xl,
    padding: spacing(6),
    ...Shadows.colored(Colors.accentDark),
  },
});

