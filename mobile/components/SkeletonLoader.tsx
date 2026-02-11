/**
 * SkeletonLoader - Loading placeholder
 * Simple, calm loading experience without heavy animation dependencies
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import { Colors, Radius, spacing } from './ui';

type SkeletonVariant = 'card' | 'text' | 'avatar' | 'button';

type SkeletonLoaderProps = {
  variant?: SkeletonVariant;
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

const variantStyles: Record<SkeletonVariant, ViewStyle> = {
  card: {
    height: 80,
    borderRadius: Radius.lg,
  },
  text: {
    height: 16,
    borderRadius: Radius.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  button: {
    height: 48,
    borderRadius: Radius.md,
  },
};

export function SkeletonLoader({
  variant = 'card',
  width = '100%',
  height,
  style,
}: SkeletonLoaderProps) {
  const variantStyle = variantStyles[variant];
  const finalHeight = (height ?? variantStyle.height) as DimensionValue | undefined;

  return (
    <View
      style={[
        styles.container,
        variantStyle,
        { width, height: finalHeight },
        style,
      ]}
    />
  );
}

// Pre-built skeleton layouts for common patterns
export function CardSkeleton() {
  return (
    <View style={styles.cardSkeleton}>
      <SkeletonLoader variant="card" />
    </View>
  );
}

export function GlanceableCardSkeleton() {
  return (
    <View style={styles.glanceableCard}>
      <View style={styles.glanceableContent}>
        <SkeletonLoader variant="text" width="40%" style={{ marginBottom: spacing(2) }} />
        <SkeletonLoader variant="text" width="60%" height={24} />
      </View>
      <SkeletonLoader variant="avatar" />
    </View>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.listSkeleton}>
      {Array.from({ length: count }).map((_, index) => (
        <GlanceableCardSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(45, 55, 72, 0.06)',
    overflow: 'hidden',
  },
  cardSkeleton: {
    marginBottom: spacing(3),
  },
  glanceableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke,
    marginBottom: spacing(3),
  },
  glanceableContent: {
    flex: 1,
    marginRight: spacing(4),
  },
  listSkeleton: {
    gap: spacing(3),
  },
});
