import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';

interface AlertBannerProps {
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  patientName?: string;
  timestamp?: string;
  onPress?: () => void;
}

const severityConfig = {
  high: {
    borderColor: Colors.error,
    iconColor: Colors.error,
    icon: 'alert-circle' as const,
  },
  medium: {
    borderColor: Colors.warning,
    iconColor: Colors.warning,
    icon: 'warning' as const,
  },
  low: {
    borderColor: Colors.textMuted,
    iconColor: Colors.textMuted,
    icon: 'information-circle' as const,
  },
};

export const AlertBanner: React.FC<AlertBannerProps> = ({
  type,
  severity,
  title,
  description,
  patientName,
  timestamp,
  onPress,
}) => {
  const config = severityConfig[severity] || severityConfig.low;

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={[styles.container, { borderLeftColor: config.borderColor }]}>
        <View style={styles.iconContainer}>
          <Ionicons name={config.icon} size={22} color={config.iconColor} />
        </View>
        <View style={styles.content}>
          {patientName && (
            <Text style={styles.patientName}>{patientName}</Text>
          )}
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Text style={styles.description} numberOfLines={2}>{description}</Text>
        </View>
        {onPress && (
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} style={styles.chevron} />
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderLeftWidth: 4,
    padding: spacing(3),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: 'rgba(38,35,28,0.5)',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  iconContainer: {
    marginRight: spacing(3),
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  patientName: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    lineHeight: 18,
  },
  chevron: {
    marginLeft: spacing(2),
    marginTop: 2,
  },
});
