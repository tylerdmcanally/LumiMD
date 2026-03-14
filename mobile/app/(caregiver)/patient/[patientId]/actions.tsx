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
import { useCareActions, CareActionItem } from '../../../../lib/api/hooks';

const TYPE_LABELS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  lab_draw: { label: 'Lab Work', icon: 'flask-outline' },
  specialist_referral: { label: 'Referral', icon: 'people-outline' },
  imaging_appointment: { label: 'Imaging', icon: 'scan-outline' },
  clinic_follow_up: { label: 'Follow-up', icon: 'calendar-outline' },
  return_to_clinic: { label: 'Return Visit', icon: 'calendar-outline' },
  nurse_visit: { label: 'Nurse Visit', icon: 'medkit-outline' },
  medication_review: { label: 'Med Review', icon: 'medical-outline' },
  follow_up_appointment: { label: 'Follow-up', icon: 'calendar-outline' },
  other: { label: 'Action', icon: 'clipboard-outline' },
};

function isOverdue(dueAt: string | undefined): boolean {
  if (!dueAt) return false;
  return dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function ActionCard({
  action,
  onMessagePress,
}: {
  action: CareActionItem;
  onMessagePress: () => void;
}) {
  const typeCfg = TYPE_LABELS[action.type ?? 'other'] ?? TYPE_LABELS.other;
  const overdue = !action.completed && isOverdue(action.dueAt);
  const dueDate = action.dueAt
    ? new Date(action.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <Card style={actionCardStyles.container}>
      <View style={actionCardStyles.topRow}>
        <View style={[actionCardStyles.iconContainer, action.completed && { opacity: 0.5 }]}>
          <Ionicons name={typeCfg.icon} size={16} color={Colors.primary} />
        </View>
        <View style={actionCardStyles.info}>
          <Text
            style={[
              actionCardStyles.description,
              action.completed && actionCardStyles.completedText,
            ]}
            numberOfLines={2}
          >
            {action.description}
          </Text>
          <View style={actionCardStyles.metaRow}>
            <View style={[actionCardStyles.typeBadge, { backgroundColor: Colors.primaryMuted }]}>
              <Text style={actionCardStyles.typeLabel}>{typeCfg.label}</Text>
            </View>
            {dueDate && (
              <Text style={[actionCardStyles.dueDate, overdue && { color: Colors.error }]}>
                {overdue ? 'Overdue — ' : 'Due '}
                {dueDate}
              </Text>
            )}
            {action.completed && (
              <View style={actionCardStyles.completedBadge}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                <Text style={actionCardStyles.completedLabel}>Done</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {action.details && (
        <Text style={actionCardStyles.details} numberOfLines={3}>
          {action.details}
        </Text>
      )}

      {!action.completed && (
        <Pressable style={actionCardStyles.messageButton} onPress={onMessagePress}>
          <Ionicons name="chatbubble-outline" size={14} color={Colors.primary} />
          <Text style={actionCardStyles.messageLabel}>Message about this</Text>
        </Pressable>
      )}
    </Card>
  );
}

const actionCardStyles = StyleSheet.create({
  container: { marginBottom: spacing(3) },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(3),
    marginTop: 2,
  },
  info: { flex: 1 },
  description: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
    lineHeight: 20,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(1),
    flexWrap: 'wrap',
  },
  typeBadge: {
    paddingHorizontal: spacing(2),
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  typeLabel: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  dueDate: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  completedLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.success,
  },
  details: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: spacing(2),
    paddingLeft: spacing(2) + 32, // align with text
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    marginTop: spacing(2),
    paddingTop: spacing(2),
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  messageLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.primary,
  },
});

export default function CaregiverActionItemsScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();

  const { data: actions, isLoading, isRefetching, refetch } = useCareActions(patientId);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  // Sort: overdue → pending → completed
  const sortedActions = useMemo(() => {
    if (!actions) return [];
    return [...actions].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const aOverdue = !a.completed && isOverdue(a.dueAt);
      const bOverdue = !b.completed && isOverdue(b.dueAt);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return 0;
    });
  }, [actions]);

  const handleMessagePress = useCallback(
    (description: string) => {
      router.push({
        pathname: '/(caregiver)/patient/[patientId]/messages' as any,
        params: { patientId: patientId!, prefill: `Regarding your action item: "${description}"` },
      });
    },
    [router, patientId],
  );

  const renderItem = useCallback(
    ({ item }: { item: CareActionItem }) => (
      <ActionCard
        action={item}
        onMessagePress={() => handleMessagePress(item.description)}
      />
    ),
    [handleMessagePress],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const pendingCount = sortedActions.filter((a) => !a.completed).length;
  const overdueCount = sortedActions.filter((a) => !a.completed && isOverdue(a.dueAt)).length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Action Items</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Summary chips */}
      {sortedActions.length > 0 && (
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipCount}>{pendingCount}</Text>
            <Text style={styles.chipLabel}>pending</Text>
          </View>
          {overdueCount > 0 && (
            <View style={[styles.chip, { backgroundColor: `${Colors.error}15` }]}>
              <Text style={[styles.chipCount, { color: Colors.error }]}>{overdueCount}</Text>
              <Text style={[styles.chipLabel, { color: Colors.error }]}>overdue</Text>
            </View>
          )}
        </View>
      )}

      <FlatList
        data={sortedActions}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No action items</Text>
            <Text style={styles.emptySubtitle}>Follow-up tasks from visits will appear here.</Text>
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
    paddingBottom: spacing(2),
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: spacing(2),
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing(2),
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(3),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: Radius.sm,
    backgroundColor: Colors.primaryMuted,
  },
  chipCount: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.primary,
  },
  chipLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.primary,
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
