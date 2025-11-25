import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const Colors = {
  primary: '#5CCFCF',
  primaryDark: '#88C9B5',
  accent: '#A3E0D8',
  warning: '#FFD166',
  error: '#FF6B6B',
  success: '#34D399',
  surface: '#FFFFFF',
  background: '#F9FAFB',
  text: '#1E293B',
  textMuted: '#64748B',
  stroke: 'rgba(0,0,0,0.06)',
  border: 'rgba(0,0,0,0.06)',
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
  <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={[styles.hero, style]}>
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
    backgroundColor: 'rgba(92,207,207,0.15)'
  },
  pillText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  hero: {
    borderRadius: Radius.lg,
    padding: spacing(5),
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
});
