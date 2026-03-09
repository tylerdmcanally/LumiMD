import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const Colors = {
  primary: '#40C9D0',        // brand cyan
  primaryLight: '#5DD3D9',
  primaryMuted: 'rgba(64,201,208,0.12)',
  secondary: '#89D8C6',     // mint
  accent: '#0A99A4',        // deep teal for CTA
  accentDark: '#078A94',
  coral: '#E07A5F',         // warm accent (alerts, decorative)
  coralMuted: 'rgba(224,122,95,0.12)',
  sage: '#7ECDB5',          // sage green (gradients, secondary)
  sageMuted: 'rgba(126,205,181,0.12)',
  warning: '#FBBF24',
  error: '#F87171',
  success: '#34D399',
  surface: '#FFFFFF',
  surfaceWarm: '#FDFCF9',   // warm cream for backgrounds
  background: '#FDFCF9',    // warm cream (was cold #F8FAFB)
  text: '#1A2332',
  textMuted: '#6B7280',
  textWarm: '#4A4540',      // warm muted text
  stroke: 'rgba(38,35,28,0.08)',   // warm-tinted border
  border: 'rgba(38,35,28,0.08)',
  borderSubtle: 'rgba(38,35,28,0.05)',
} as const;

export const Radius = { sm: 10, md: 14, lg: 20, xl: 24 } as const;
export const spacing = (n: number) => n * 4; // 4pt grid

export const Card: React.FC<React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const PillLabel = ({ text, leftIcon, color }: { text: string; leftIcon?: React.ReactNode; color?: string }) => (
  <View style={[styles.pill, color ? { backgroundColor: `${color}1A` } : undefined]}>
    {leftIcon ? <View style={{ marginRight: 6 }}>{leftIcon}</View> : null}
    <Text style={[styles.pillText, color ? { color } : undefined]}>{text}</Text>
  </View>
);

export const GradientHero: React.FC<React.PropsWithChildren<{ style?: ViewStyle }>> = ({ children, style }) => (
  <LinearGradient
    colors={['#0A99A4', '#40C9D0', '#7ECDB5']}
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
    borderColor: Colors.stroke,
    shadowColor: 'rgba(38,35,28,0.5)',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.primaryMuted,
  },
  pillText: { color: Colors.primary, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' },
  hero: {
    borderRadius: Radius.xl,
    padding: spacing(5),
    shadowColor: '#0A99A4',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
});
