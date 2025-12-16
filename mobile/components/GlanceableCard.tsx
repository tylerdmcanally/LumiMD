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
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function GlanceableCard({ 
  title, 
  count, 
  countLabel, 
  statusBadge,
  icon = 'arrow-forward',
  onPress 
}: GlanceableCardProps) {
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
                  { backgroundColor: `${statusBadge.color}1A` },
                ]}
              >
                <Text style={[styles.badgeText, { color: statusBadge.color }]}>
                  {statusBadge.text}
                </Text>
              </View>
            ) : null}
          </View>
          
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={24} color={Colors.primary} />
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
    opacity: 0.7,
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
    color: Colors.textMuted,
    marginBottom: spacing(1),
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: 28,
    fontWeight: '600',
    color: Colors.text,
    marginRight: spacing(2),
  },
  countLabel: {
    fontSize: 16,
    color: Colors.text,
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
    fontWeight: '600',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


