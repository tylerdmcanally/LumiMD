import React, { useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../../../../components/ui';
import { AlertBanner } from '../../../../components/caregiver/AlertBanner';
import {
  useCareQuickOverview,
  useCareMedicationStatus,
  CareQuickOverviewData,
} from '../../../../lib/api/hooks';

const STATUS_COLORS: Record<string, string> = {
  taken: Colors.success,
  skipped: Colors.warning,
  pending: Colors.textMuted,
  missed: Colors.error,
};

function NavButton({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={navStyles.button} onPress={onPress}>
      <View style={navStyles.iconContainer}>
        <Ionicons name={icon} size={22} color={Colors.primary} />
        {badge != null && badge > 0 && (
          <View style={navStyles.badge}>
            <Text style={navStyles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={navStyles.label}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

const navStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(3),
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.coral,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
  },
});

export default function PatientDetailScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();

  const {
    data: overview,
    isLoading: overviewLoading,
    isRefetching,
    refetch: refetchOverview,
  } = useCareQuickOverview(patientId);

  const { data: medStatus, refetch: refetchMeds } = useCareMedicationStatus(patientId);

  const isLoading = overviewLoading;

  const onRefresh = useCallback(() => {
    refetchOverview();
    refetchMeds();
  }, [refetchOverview, refetchMeds]);

  const needsAttention = useMemo(() => {
    if (!overview?.alerts) return [];
    return overview.alerts.filter((a) => a.severity === 'high' || a.severity === 'medium');
  }, [overview?.alerts]);

  const upcomingActions = overview?.pendingActions ?? 0;
  const overdueActions = overview?.overdueActions ?? 0;

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const patientName = overview?.patientName ?? 'Patient';
  const medSummary = overview?.medicationsToday;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
      >
        {/* Header with back button */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {patientName}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Today's Medications */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="medical-outline" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Today's Medications</Text>
          </View>

          {medStatus && medStatus.medications.length > 0 ? (
            <>
              <View style={styles.medSummaryRow}>
                {medSummary && (
                  <>
                    <MedChip label="Taken" count={medSummary.taken} color={Colors.success} />
                    <MedChip label="Pending" count={medSummary.pending} color={Colors.textMuted} />
                    <MedChip label="Missed" count={medSummary.missed} color={Colors.error} />
                    {medSummary.skipped > 0 && (
                      <MedChip label="Skipped" count={medSummary.skipped} color={Colors.warning} />
                    )}
                  </>
                )}
              </View>
              {medStatus.medications.slice(0, 5).map((med) => (
                <View key={med.id} style={styles.medRow}>
                  <View
                    style={[styles.statusDot, { backgroundColor: STATUS_COLORS[med.status] ?? Colors.textMuted }]}
                  />
                  <Text style={styles.medName} numberOfLines={1}>
                    {med.name}
                  </Text>
                  <Text style={[styles.medDose, { color: STATUS_COLORS[med.status] ?? Colors.textMuted }]}>
                    {med.status}
                  </Text>
                </View>
              ))}
              {medStatus.medications.length > 5 && (
                <Pressable onPress={() => router.push(`/(caregiver)/patient/${patientId}/medications` as any)}>
                  <Text style={styles.seeAll}>See all {medStatus.medications.length} medications</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={styles.emptyText}>No medications scheduled today</Text>
          )}
        </Card>

        {/* Needs Attention */}
        {needsAttention.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitleStandalone}>Needs Attention</Text>
            {needsAttention.map((alert, i) => (
              <AlertBanner
                key={`${alert.type}-${i}`}
                type={alert.type}
                severity={alert.severity}
                title={alert.title}
                description={alert.description}
              />
            ))}
          </View>
        )}

        {/* Upcoming Actions */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="clipboard-outline" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Action Items</Text>
          </View>
          {upcomingActions > 0 || overdueActions > 0 ? (
            <View style={styles.actionRow}>
              {overdueActions > 0 && (
                <View style={styles.actionChip}>
                  <Ionicons name="alert-circle" size={14} color={Colors.error} />
                  <Text style={[styles.actionChipText, { color: Colors.error }]}>
                    {overdueActions} overdue
                  </Text>
                </View>
              )}
              <View style={styles.actionChip}>
                <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.actionChipText}>{upcomingActions} pending</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>No pending action items</Text>
          )}
        </Card>

        {/* Recent Activity */}
        {overview?.recentActivity && overview.recentActivity.length > 0 && (
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Recent Activity</Text>
            </View>
            {overview.recentActivity.slice(0, 5).map((item, i) => (
              <View key={i} style={styles.activityRow}>
                <Text style={styles.activityText} numberOfLines={2}>
                  {item.description}
                </Text>
                <Text style={styles.activityTime}>
                  {new Date(item.timestamp).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* Navigation buttons */}
        <Card style={styles.sectionCard}>
          <NavButton
            icon="document-text-outline"
            label="Visits"
            onPress={() => router.push(`/(caregiver)/patient/${patientId}/visits` as any)}
          />
          <NavButton
            icon="medical-outline"
            label="Medications"
            onPress={() => router.push(`/(caregiver)/patient/${patientId}/medications` as any)}
          />
          <NavButton
            icon="clipboard-outline"
            label="Action Items"
            badge={overdueActions > 0 ? overdueActions : undefined}
            onPress={() => router.push(`/(caregiver)/patient/${patientId}/actions` as any)}
          />
          <NavButton
            icon="chatbubble-outline"
            label="Messages"
            onPress={() => router.push(`/(caregiver)/patient/${patientId}/messages` as any)}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function MedChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={[styles.medChip, { backgroundColor: `${color}15` }]}>
      <Text style={[styles.medChipCount, { color }]}>{count}</Text>
      <Text style={[styles.medChipLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(8),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing(2),
    marginBottom: spacing(4),
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: spacing(2),
  },
  sectionCard: {
    marginBottom: spacing(4),
  },
  section: {
    marginBottom: spacing(4),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginBottom: spacing(3),
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  sectionTitleStandalone: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
    marginBottom: spacing(3),
  },
  medSummaryRow: {
    flexDirection: 'row',
    gap: spacing(2),
    marginBottom: spacing(3),
    flexWrap: 'wrap',
  },
  medChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: Radius.sm,
  },
  medChipCount: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  medChipLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing(2),
  },
  medName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
  },
  medDose: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    textTransform: 'capitalize',
  },
  seeAll: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
    marginTop: spacing(2),
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing(3),
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionChipText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    gap: spacing(2),
  },
  activityText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.text,
    lineHeight: 18,
  },
  activityTime: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
  },
});
