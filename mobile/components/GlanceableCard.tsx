import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Card, Colors, spacing } from './ui';
import { Ionicons } from '@expo/vector-icons';

export type GlanceableCardProps = {
  title: string;
  count: number;
  countLabel: string;
  statusBadge?: {
    text: string;
    color: string;
  };
  emptyStateText?: string; // Friendly text when count is 0
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function GlanceableCard({ 
  title, 
  count, 
  countLabel, 
  statusBadge,
  emptyStateText,
  icon = 'arrow-forward',
  onPress 
}: GlanceableCardProps) {
  const isEmpty = count === 0 && emptyStateText;

  return (
    <Pressable 
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed
      ]}
    >
      <Card>
        <View style={styles.container}>
          {/* Soft icon container */}
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={22} color={Colors.primary} />
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
                <Text style={[styles.badgeText, { color: statusBadge.color }]}>
                  {statusBadge.text}
                </Text>
              </View>
            ) : null}
          </View>
          
          {/* Chevron */}
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
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
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(64,201,208,0.12)', // Soft muted background
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    marginBottom: spacing(0.5),
    letterSpacing: 0.1,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: 26,
    fontFamily: 'PlusJakartaSans_700Bold',
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
    color: Colors.text, // Darker for better readability
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing(1),
    borderRadius: 999,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
  },
  badgeText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});


