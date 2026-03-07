/**
 * CollapsibleSection — reusable animated expand/collapse section.
 * Used in visit detail for secondary content (medication review, transcript).
 */

import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Colors, spacing, Radius } from './ui';

export interface CollapsibleSectionProps {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  defaultExpanded?: boolean;
  count?: number;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  defaultExpanded = true,
  count,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.section}>
      <Pressable onPress={toggle} style={styles.header}>
        <View style={styles.headerLeft}>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={Colors.primary}
              style={styles.headerIcon}
            />
          )}
          <Text style={styles.headerTitle}>{title}</Text>
          {count !== undefined && count > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{count}</Text>
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textMuted}
        />
      </Pressable>
      {expanded && <Card style={styles.content}>{children}</Card>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(1),
    marginBottom: spacing(2),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    marginRight: spacing(2),
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  countBadge: {
    marginLeft: spacing(2),
    backgroundColor: 'rgba(64,201,208,0.15)',
    borderRadius: 999,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.5),
  },
  countBadgeText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  content: {
    gap: spacing(3),
  },
});
