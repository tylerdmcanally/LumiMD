import React, { useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FlatList,
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
import {
  useCareMedications,
  useCareMedicationStatus,
  CareMedicationItem,
} from '../../../../lib/api/hooks';

const STATUS_COLORS: Record<string, string> = {
  taken: Colors.success,
  skipped: Colors.warning,
  pending: Colors.textMuted,
  missed: Colors.error,
};

function MedicationCard({
  med,
  todayStatus,
}: {
  med: CareMedicationItem;
  todayStatus?: string;
}) {
  const hasWarning = med.medicationWarning && med.medicationWarning.length > 0;

  return (
    <Card style={cardStyles.container}>
      <View style={cardStyles.topRow}>
        <View style={cardStyles.info}>
          <Text style={cardStyles.name} numberOfLines={1}>{med.name}</Text>
          {med.dose && (
            <Text style={cardStyles.dose}>
              {med.dose}{med.frequency ? ` — ${med.frequency}` : ''}
            </Text>
          )}
        </View>
        {todayStatus && (
          <View style={[cardStyles.statusBadge, { backgroundColor: `${STATUS_COLORS[todayStatus] ?? Colors.textMuted}20` }]}>
            <View style={[cardStyles.statusDot, { backgroundColor: STATUS_COLORS[todayStatus] ?? Colors.textMuted }]} />
            <Text style={[cardStyles.statusText, { color: STATUS_COLORS[todayStatus] ?? Colors.textMuted }]}>
              {todayStatus}
            </Text>
          </View>
        )}
      </View>

      {hasWarning && (
        <View style={cardStyles.warningRow}>
          <Ionicons name="warning" size={14} color={Colors.warning} />
          <Text style={cardStyles.warningText} numberOfLines={1}>
            {med.medicationWarning?.[0]?.message ?? 'Medication warning'}
          </Text>
        </View>
      )}

      {!med.active && (
        <View style={cardStyles.inactiveRow}>
          <Text style={cardStyles.inactiveText}>Inactive</Text>
          {med.stoppedAt && (
            <Text style={cardStyles.inactiveDate}>
              Stopped {new Date(med.stoppedAt).toLocaleDateString()}
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

const cardStyles = StyleSheet.create({
  container: { marginBottom: spacing(3) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  info: { flex: 1, marginRight: spacing(2) },
  name: { fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold', color: Colors.text },
  dose: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.textMuted, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing(2),
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold', textTransform: 'capitalize' },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    marginTop: spacing(2),
    paddingTop: spacing(2),
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  warningText: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.warning, flex: 1 },
  inactiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(2),
  },
  inactiveText: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold', color: Colors.textMuted },
  inactiveDate: { fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.textMuted },
});

export default function CaregiverMedicationListScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();

  const { data: meds, isLoading: medsLoading, isRefetching, refetch: refetchMeds } = useCareMedications(patientId);
  const { data: medStatus, refetch: refetchStatus } = useCareMedicationStatus(patientId);

  const onRefresh = useCallback(() => {
    refetchMeds();
    refetchStatus();
  }, [refetchMeds, refetchStatus]);

  // Build a map of today's status per medication ID
  const todayStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (medStatus?.medications) {
      for (const m of medStatus.medications) {
        map[m.id] = m.status;
      }
    }
    return map;
  }, [medStatus]);

  // Active first, then inactive
  const sortedMeds = useMemo(() => {
    if (!meds) return [];
    return [...meds].sort((a, b) => {
      if (a.active !== false && b.active === false) return -1;
      if (a.active === false && b.active !== false) return 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [meds]);

  const renderItem = useCallback(
    ({ item }: { item: CareMedicationItem }) => (
      <MedicationCard med={item} todayStatus={todayStatusMap[item.id]} />
    ),
    [todayStatusMap],
  );

  if (medsLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Medications</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={sortedMeds}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="medical-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No medications</Text>
            <Text style={styles.emptySubtitle}>Medications will appear here after visits are processed.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(4),
    paddingTop: spacing(2),
    paddingBottom: spacing(3),
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: spacing(2),
  },
  listContent: {
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(8),
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing(16),
    paddingHorizontal: spacing(6),
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    marginTop: spacing(3),
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(1),
    lineHeight: 20,
  },
});
