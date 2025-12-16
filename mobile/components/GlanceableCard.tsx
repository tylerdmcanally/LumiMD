import React from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Card, Colors, spacing, Radius, Typography } from './ui';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';
import { LinearGradient } from 'expo-linear-gradient';

export type GlanceableCardProps = {
  title: string;
  count: number;
  countLabel: string;
  statusBadge?: {
    text: string;
    color: string;
  };
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onLongPress?: () => void;
};

export function GlanceableCard({
  title,
  count,
  countLabel,
  statusBadge,
  icon = 'arrow-forward',
  onPress,
  onLongPress,
}: GlanceableCardProps) {
  const handlePress = () => {
    haptics.light();
    onPress();
  };

  const handleLongPress = onLongPress ? () => {
    haptics.medium();
    onLongPress();
  } : undefined;

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed
      ]}
    >
      <Card>
        <View style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.countRow}>
              <Text style={styles.count}>{count}</Text>
              <Text style={styles.countLabel}>{countLabel}</Text>
            </View>
            {statusBadge ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: `${statusBadge.color}15` },
                ]}
              >
                <View style={[styles.badgeDot, { backgroundColor: statusBadge.color }]} />
                <Text style={[styles.badgeText, { color: statusBadge.color }]}>
                  {statusBadge.text}
                </Text>
              </View>
            ) : null}
          </View>

          <LinearGradient
            colors={[Colors.primary, Colors.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconContainer}
          >
            <Ionicons name={icon} size={22} color="#fff" />
          </LinearGradient>
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
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
    marginBottom: spacing(1),
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text,
    marginRight: spacing(2),
    letterSpacing: -0.5,
  },
  countLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing(2),
    borderRadius: Radius.full,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing(1.5),
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
