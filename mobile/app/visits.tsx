import React, { useMemo } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Colors, spacing, Card } from '../components/ui';
import { useVisits } from '../lib/api/hooks';
import { openWebDashboard } from '../lib/linking';
import { ErrorBoundary } from '../components/ErrorBoundary';

dayjs.extend(relativeTime);

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: 'Ready', color: Colors.success },
  finalizing: { label: 'Finalizing', color: Colors.warning },
  processing: { label: 'Processing', color: Colors.warning },
  transcribing: { label: 'Transcribing', color: Colors.warning },
  summarizing: { label: 'Summarizing', color: Colors.warning },
  failed: { label: 'Failed', color: Colors.error },
  pending: { label: 'Pending', color: Colors.textMuted },
};

export default function VisitsScreen() {
  const router = useRouter();

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const {
    data: visits,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useVisits({
    staleTime: 60 * 1000,
  });

  const sortedVisits = useMemo(() => {
    if (!Array.isArray(visits)) return [];
    return [...visits].sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [visits]);

  const isSummaryReady = (visit: any) =>
    Boolean(visit?.processingStatus === 'completed' && typeof visit.summary === 'string' && visit.summary.trim().length > 0);

  const normalizeStatus = (visit: any) => {
    if (!visit) return 'pending';
    if (visit.processingStatus === 'completed' && !isSummaryReady(visit)) {
      return 'finalizing';
    }
    const key = visit.processingStatus;
    return key && STATUS_LABELS[key] ? key : 'pending';
  };

  const renderStatusBadge = (visit: any) => {
    const key = normalizeStatus(visit);
    const { label, color } = STATUS_LABELS[key];

    return (
      <View style={[styles.statusBadge, { backgroundColor: color }]}>
        <Text style={styles.statusBadgeText}>{label}</Text>
      </View>
    );
  };

  return (
    <ErrorBoundary
      title="Unable to load your visits"
      description="Pull to refresh or head back to the dashboard. We’ll gather more details and try again."
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Pressable onPress={handleGoBack} style={styles.backButton} hitSlop={10}>
                <Ionicons name="chevron-back" size={24} color={Colors.text} />
              </Pressable>
              <Text style={styles.title}>Recent Visits</Text>
            </View>
            <Pressable onPress={openWebDashboard}>
              <Text style={styles.link}>Open web portal</Text>
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Tap any visit for the full AI summary, transcript, and action items.
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading visits...</Text>
            </View>
          ) : error ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Unable to load visits</Text>
              <Text style={styles.emptySubtitle}>
                Check your connection and pull down to refresh.
              </Text>
            </Card>
          ) : sortedVisits.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No visits recorded yet</Text>
              <Text style={styles.emptySubtitle}>
                Record your next appointment to see AI summaries here.
              </Text>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {sortedVisits.map((visit: any, index: number) => (
                <Pressable
                  key={visit.id}
                  onPress={() => router.push({ pathname: '/visit-detail', params: { id: visit.id } })}
                  style={[styles.row, index < sortedVisits.length - 1 && styles.rowDivider]}
                >
                  <View style={{ flex: 1, paddingRight: spacing(3) }}>
                    <Text style={styles.rowDate}>
                      {visit.createdAt ? dayjs(visit.createdAt).format('MMM D, YYYY h:mm A') : 'Unknown'}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {(() => {
                        const statusKey = normalizeStatus(visit);
                        switch (statusKey) {
                          case 'completed':
                            return `Processed ${
                              visit.processedAt ? dayjs(visit.processedAt).fromNow() : ''
                            }`;
                          case 'finalizing':
                            return 'Finalizing summary…';
                          case 'failed':
                            return visit.processingError || 'We could not process this visit.';
                          case 'transcribing':
                            return 'Transcribing audio…';
                          case 'summarizing':
                            return 'Analyzing key points…';
                          case 'processing':
                            return 'Processing… tap to view status.';
                          case 'pending':
                          default:
                            return 'Queued for processing…';
                        }
                      })()}
                    </Text>
                  </View>
                  {renderStatusBadge(visit)}
                </Pressable>
              ))}
            </Card>
          )}
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(6),
    gap: spacing(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  backButton: {
    padding: spacing(1),
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(8),
  },
  loadingText: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing(2),
    padding: spacing(5),
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  listCard: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.stroke,
  },
  rowDate: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: spacing(1),
  },
  rowMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: spacing(1),
  },
  statusBadge: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});


