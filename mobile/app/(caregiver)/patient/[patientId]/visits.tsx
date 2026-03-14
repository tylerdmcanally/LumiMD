import React, { useCallback } from 'react';
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
import { useCareVisits, CareVisitListItem } from '../../../../lib/api/hooks';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  completed: { label: 'Ready', color: Colors.success },
  processing: { label: 'Processing', color: Colors.primary },
  transcribing: { label: 'Transcribing', color: Colors.primary },
  pending: { label: 'Pending', color: Colors.warning },
  failed: { label: 'Failed', color: Colors.error },
};

function VisitCard({ visit, onPress }: { visit: CareVisitListItem; onPress: () => void }) {
  const date = visit.visitDate || visit.createdAt;
  const formattedDate = date ? new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : 'Unknown date';

  const statusCfg = STATUS_CONFIG[visit.processingStatus ?? ''] ?? STATUS_CONFIG.pending;
  const diagnosisPreview = visit.diagnoses?.slice(0, 2).join(', ');

  return (
    <Pressable onPress={onPress}>
      <Card style={cardStyles.container}>
        <View style={cardStyles.topRow}>
          <View style={cardStyles.info}>
            {visit.provider && (
              <Text style={cardStyles.provider} numberOfLines={1}>
                {visit.provider}
                {visit.specialty ? ` — ${visit.specialty}` : ''}
              </Text>
            )}
            <Text style={cardStyles.date}>{formattedDate}</Text>
          </View>
          <View style={[cardStyles.statusBadge, { backgroundColor: `${statusCfg.color}20` }]}>
            <Text style={[cardStyles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>

        {visit.summary && (
          <Text style={cardStyles.summary} numberOfLines={2}>
            {visit.summary}
          </Text>
        )}

        {diagnosisPreview && (
          <Text style={cardStyles.diagnoses} numberOfLines={1}>
            {diagnosisPreview}
          </Text>
        )}
      </Card>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: { marginBottom: spacing(3) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing(2) },
  info: { flex: 1, marginRight: spacing(2) },
  provider: { fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', color: Colors.text },
  date: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: spacing(2), paddingVertical: 2, borderRadius: Radius.sm },
  statusText: { fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' },
  summary: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.text, lineHeight: 20, marginBottom: spacing(1) },
  diagnoses: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.textMuted },
});

export default function CaregiverVisitListScreen() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  const router = useRouter();

  const {
    data: visits,
    isLoading,
    isRefetching,
    refetch,
  } = useCareVisits(patientId);

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const handleVisitPress = useCallback(
    (visitId: string) => {
      router.push({
        pathname: '/(caregiver)/patient/[patientId]/visit-detail' as any,
        params: { patientId: patientId!, visitId },
      });
    },
    [router, patientId],
  );

  const renderItem = useCallback(
    ({ item }: { item: CareVisitListItem }) => (
      <VisitCard visit={item} onPress={() => handleVisitPress(item.id)} />
    ),
    [handleVisitPress],
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Visits</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={visits ?? []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No visits yet</Text>
            <Text style={styles.emptySubtitle}>Visit summaries will appear here after appointments.</Text>
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
