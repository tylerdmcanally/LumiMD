import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../ui';

interface PatientStatusCardProps {
  name: string;
  medicationsToday: { taken: number; total: number } | null;
  pendingActions: number;
  lastActive: string | null;
  onPress: () => void;
}

function formatLastActive(timestamp: string | null): string {
  if (!timestamp) return 'No recent activity';

  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (isNaN(then)) return 'No recent activity';

  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

export const PatientStatusCard: React.FC<PatientStatusCardProps> = ({
  name,
  medicationsToday,
  pendingActions,
  lastActive,
  onPress,
}) => {
  const hasMeds = medicationsToday && medicationsToday.total > 0;
  const taken = medicationsToday?.taken ?? 0;
  const total = medicationsToday?.total ?? 0;
  const progressRatio = hasMeds ? taken / total : 0;

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.container}>
        {/* Name row */}
        <View style={styles.nameRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(name || 'P').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.nameContent}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.lastActive}>{formatLastActive(lastActive)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </View>

        {/* Medication progress */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="medkit-outline" size={16} color={Colors.primary} />
            <Text style={styles.sectionLabel}>Medications</Text>
            <Text style={styles.sectionValue}>
              {hasMeds ? `${taken}/${total}` : 'No medications'}
            </Text>
          </View>
          {hasMeds && (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(progressRatio * 100)}%`,
                    backgroundColor: progressRatio === 1 ? Colors.success : Colors.primary,
                  },
                ]}
              />
            </View>
          )}
        </View>

        {/* Pending actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="clipboard-outline" size={16} color={pendingActions > 0 ? Colors.coral : Colors.textMuted} />
            <Text style={styles.sectionLabel}>Pending Actions</Text>
            <Text style={[styles.sectionValue, pendingActions > 0 && styles.actionsBadge]}>
              {pendingActions}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing(3),
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(3),
  },
  avatarText: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.primary,
  },
  nameContent: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  lastActive: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
  },
  section: {
    marginTop: spacing(2),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  sectionLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  sectionValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  actionsBadge: {
    color: Colors.coral,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.borderSubtle,
    marginTop: spacing(2),
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});
