import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Card, Colors, spacing, Radius } from './ui';
import { Ionicons } from '@expo/vector-icons';

/** Per-card icon color mapping for visual variety */
const ICON_THEMES: Record<string, { bg: string; fg: string }> = {
  'checkmark-circle-outline': { bg: Colors.coralMuted, fg: Colors.coral },         // Actions
  'mail-outline':             { bg: 'rgba(139,92,246,0.12)', fg: '#8B5CF6' },       // Messages (purple)
  'document-text-outline':    { bg: Colors.primaryMuted, fg: Colors.primary },      // Visits (cyan)
  'medkit-outline':           { bg: Colors.sageMuted, fg: '#2D9D78' },              // Medications (sage)
  'today-outline':            { bg: 'rgba(251,191,36,0.12)', fg: '#D97706' },       // Schedule (amber)
};

const DEFAULT_ICON_THEME = { bg: Colors.primaryMuted, fg: Colors.primary };

export type GlanceableCardProps = {
  title: string;
  count: number;
  countLabel: string;
  statusBadge?: {
    text: string;
    color: string;
  };
  emptyStateText?: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function GlanceableCard({
  title,
  count,
  countLabel,
  statusBadge,
  emptyStateText,
  subtitle,
  icon = 'arrow-forward',
  onPress
}: GlanceableCardProps) {
  const isEmpty = count === 0 && emptyStateText;
  const theme = ICON_THEMES[icon as string] || DEFAULT_ICON_THEME;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed,
      ]}
    >
      <Card style={styles.cardOverride}>
        <View style={styles.container}>
          {/* Icon with per-card color */}
          <View style={[styles.iconContainer, { backgroundColor: theme.bg }]}>
            <Ionicons name={icon} size={22} color={theme.fg} />
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            {isEmpty ? (
              <Text style={styles.emptyText}>{emptyStateText}</Text>
            ) : (
              <View style={styles.countRow}>
                <Text style={styles.count}>{count}</Text>
                <Text style={styles.countLabel}>{countLabel}</Text>
              </View>
            )}
            {statusBadge && !isEmpty ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: `${statusBadge.color}1A` },
                ]}
              >
                <View style={[styles.badgeDot, { backgroundColor: statusBadge.color }]} />
                <Text style={[styles.badgeText, { color: statusBadge.color }]}>
                  {statusBadge.text}
                </Text>
              </View>
            ) : null}
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {/* Chevron */}
          <View style={styles.chevronContainer}>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    marginBottom: spacing(3),
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  cardOverride: {
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(4),
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3.5),
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
    marginBottom: spacing(0.5),
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: 28,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    marginRight: spacing(1.5),
    letterSpacing: -0.5,
  },
  countLabel: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textWarm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing(1.5),
    borderRadius: 999,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    gap: spacing(1.5),
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: spacing(1),
  },
  chevronContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing(2),
  },
});
