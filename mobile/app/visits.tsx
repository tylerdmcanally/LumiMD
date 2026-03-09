import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import { usePaginatedVisits } from '../lib/api/hooks';
import { openWebVisit, openWebDashboard } from '../lib/linking';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useAuth } from '../contexts/AuthContext';

dayjs.extend(relativeTime);

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: 'Ready', color: Colors.success },
  finalizing: { label: 'Finalizing', color: Colors.warning },
  processing: { label: 'Processing', color: Colors.warning },
  transcribing: { label: 'Transcribing', color: Colors.warning },
  summarizing: { label: 'Summarizing', color: Colors.warning },
  failed: { label: 'Failed', color: Colors.error },
  pending: { label: 'Pending', color: Colors.textMuted },
};

const FILTER_OPTIONS: { key: StatusFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', label: 'All', icon: 'list-outline' },
  { key: 'ready', label: 'Ready', icon: 'checkmark-circle-outline' },
  { key: 'processing', label: 'In Progress', icon: 'time-outline' },
  { key: 'failed', label: 'Failed', icon: 'alert-circle-outline' },
];

export default function VisitsScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const {
    items: visits,
    isLoading,
    isRefetching,
    isFetchingNextPage,
    hasMore,
    fetchNextPage,
    error,
    refetch,
  } = usePaginatedVisits({
    limit: 25,
    sort: 'desc',
  }, {
    enabled: isAuthenticated,
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

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts = { all: sortedVisits.length, ready: 0, processing: 0, failed: 0 };
    sortedVisits.forEach(visit => {
      const status = normalizeStatus(visit);
      if (status === 'completed') counts.ready++;
      else if (status === 'failed') counts.failed++;
      else counts.processing++;
    });
    return counts;
  }, [sortedVisits]);

  // Filter by status
  const filteredByStatus = useMemo(() => {
    if (statusFilter === 'all') return sortedVisits;
    return sortedVisits.filter(visit => {
      const status = normalizeStatus(visit);
      switch (statusFilter) {
        case 'ready': return status === 'completed';
        case 'processing': return ['pending', 'transcribing', 'processing', 'summarizing', 'finalizing'].includes(status);
        case 'failed': return status === 'failed';
        default: return true;
      }
    });
  }, [sortedVisits, statusFilter]);

  // Filter by search
  const filteredVisits = useMemo(() => {
    if (!searchQuery.trim()) return filteredByStatus;
    const q = searchQuery.toLowerCase();
    return filteredByStatus.filter((visit: any) =>
      visit.provider?.toLowerCase().includes(q) ||
      visit.specialty?.toLowerCase().includes(q) ||
      visit.location?.toLowerCase().includes(q) ||
      visit.summary?.toLowerCase().includes(q)
    );
  }, [filteredByStatus, searchQuery]);

  // Group by time period
  const groupedVisits = useMemo(() => {
    const today = dayjs().startOf('day');
    const weekAgo = today.subtract(6, 'day');
    const monthAgo = today.subtract(30, 'day');

    const groups: { title: string; visits: any[] }[] = [
      { title: 'Today', visits: [] },
      { title: 'This Week', visits: [] },
      { title: 'This Month', visits: [] },
      { title: 'Older', visits: [] },
    ];

    filteredVisits.forEach((visit: any) => {
      const date = visit.createdAt ? dayjs(visit.createdAt) : null;
      if (!date) {
        groups[3].visits.push(visit);
      } else if (date.isAfter(today) || date.isSame(today, 'day')) {
        groups[0].visits.push(visit);
      } else if (date.isAfter(weekAgo)) {
        groups[1].visits.push(visit);
      } else if (date.isAfter(monthAgo)) {
        groups[2].visits.push(visit);
      } else {
        groups[3].visits.push(visit);
      }
    });

    return groups.filter(g => g.visits.length > 0);
  }, [filteredVisits]);

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return null;
    const mins = Math.round(seconds / 60);
    return mins < 1 ? '<1 min' : `${mins} min`;
  };

  const getVisitStats = (visit: any) => {
    const stats: string[] = [];
    const diagCount = visit.diagnosesDetailed?.length || visit.diagnoses?.length || 0;
    if (diagCount > 0) stats.push(`${diagCount} Diagnos${diagCount === 1 ? 'is' : 'es'}`);

    const medChanges = (visit.medications?.started?.length || 0) +
      (visit.medications?.stopped?.length || 0) +
      (visit.medications?.changed?.length || 0);
    if (medChanges > 0) stats.push(`${medChanges} Med Change${medChanges !== 1 ? 's' : ''}`);

    const followUpCount = visit.followUps?.length || visit.nextSteps?.length || 0;
    if (followUpCount > 0) stats.push(`${followUpCount} Follow-up${followUpCount !== 1 ? 's' : ''}`);

    return stats;
  };

  const getStatusMeta = (visit: any) => {
    const statusKey = normalizeStatus(visit);
    switch (statusKey) {
      case 'completed':
        return visit.processedAt ? `Processed ${dayjs(visit.processedAt).fromNow()}` : 'Processed';
      case 'finalizing': return 'Finalizing summary…';
      case 'failed': return visit.processingError || 'We could not process this visit.';
      case 'transcribing': return 'Transcribing audio…';
      case 'summarizing': return 'Analyzing key points…';
      case 'processing': return 'Processing… tap to view status.';
      case 'pending':
      default: return 'Queued for processing…';
    }
  };

  const renderVisitCard = (visit: any) => {
    const statusKey = normalizeStatus(visit);
    const { label, color } = STATUS_LABELS[statusKey];
    const ready = isSummaryReady(visit);
    const duration = formatDuration(visit.duration);
    const stats = ready ? getVisitStats(visit) : [];
    const providerLine = [visit.provider, visit.specialty].filter(Boolean).join(' · ');

    return (
      <Pressable
        key={visit.id}
        style={styles.visitCardPressable}
        onPress={() => router.push({ pathname: '/visit-detail', params: { id: visit.id } })}
      >
        <Card style={styles.visitCard}>
          {/* Header: Provider + Status */}
          <View style={styles.visitHeader}>
            <View style={styles.visitHeaderLeft}>
              <View style={[styles.visitIcon, { backgroundColor: ready ? Colors.sageMuted : `${color}20` }]}>
                <Ionicons
                  name={ready ? 'document-text' : statusKey === 'failed' ? 'alert-circle' : 'hourglass-outline'}
                  size={16}
                  color={ready ? Colors.primary : color}
                />
              </View>
              <Text style={styles.providerName} numberOfLines={1}>
                {providerLine || 'Visit'}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: color }]}>
              <Text style={styles.statusBadgeText}>{label}</Text>
            </View>
          </View>

          {/* Date + Duration */}
          <View style={styles.visitMeta}>
            <Text style={styles.visitDate}>
              {visit.createdAt ? dayjs(visit.createdAt).format('MMM D, YYYY · h:mm A') : 'Unknown'}
            </Text>
            {duration && (
              <View style={styles.durationBadge}>
                <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
                <Text style={styles.durationText}>{duration}</Text>
              </View>
            )}
          </View>

          {/* Summary preview or processing status */}
          {ready && visit.summary ? (
            <Text style={styles.summaryPreview} numberOfLines={2}>
              {visit.summary}
            </Text>
          ) : (
            <Text style={styles.processingText}>{getStatusMeta(visit)}</Text>
          )}

          {/* Stats chips */}
          {stats.length > 0 && (
            <View style={styles.statsRow}>
              {stats.map((stat, i) => (
                <View key={i} style={styles.statChip}>
                  <Text style={styles.statText}>{stat}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </Pressable>
    );
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/sign-in');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <ErrorBoundary
      title="Unable to load your visits"
      description="Pull to refresh or head back to the dashboard. We'll gather more details and try again."
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerContainer}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Pressable onPress={handleGoBack} style={styles.backButton} hitSlop={10}>
                <Ionicons name="chevron-back" size={24} color={Colors.text} />
              </Pressable>
              <Text style={styles.title}>Visits</Text>
            </View>
            <Pressable
              style={styles.webLink}
              onPress={() => {
                if (sortedVisits[0]?.id) {
                  openWebVisit(sortedVisits[0].id);
                } else {
                  openWebDashboard();
                }
              }}
            >
              <Ionicons name="open-outline" size={18} color={Colors.primary} />
              <Text style={styles.webLinkText}>Web</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading visits...</Text>
            </View>
          ) : error ? (
            <EmptyState
              variant="error"
              icon="cloud-offline-outline"
              title="Unable to load visits"
              description="Check your connection and pull down to refresh."
            />
          ) : sortedVisits.length === 0 ? (
            <EmptyState
              variant="empty"
              icon="document-text-outline"
              title="No visits recorded yet"
              description="Record your next appointment to see AI summaries here."
              actionLabel="Record a Visit"
              onAction={() => router.push('/record-visit')}
            />
          ) : (
            <>
              {/* Search Bar */}
              <View style={styles.searchContainer}>
                <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by provider, specialty, or summary..."
                  placeholderTextColor={Colors.textMuted}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  clearButtonMode="while-editing"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>

              {/* Filter Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {FILTER_OPTIONS.map(option => {
                  const isActive = statusFilter === option.key;
                  const count = statusCounts[option.key];
                  return (
                    <Pressable
                      key={option.key}
                      style={[styles.filterChip, isActive && styles.filterChipActive]}
                      onPress={() => setStatusFilter(option.key)}
                    >
                      <Ionicons
                        name={option.icon}
                        size={14}
                        color={isActive ? Colors.primary : Colors.textMuted}
                      />
                      <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                        {option.label}
                      </Text>
                      {count > 0 && (
                        <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                          <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                            {count}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Search results count */}
              {searchQuery.length > 0 && (
                <Text style={styles.searchResultsText}>
                  {filteredVisits.length} result{filteredVisits.length !== 1 ? 's' : ''}
                </Text>
              )}

              {/* Grouped visit list */}
              {groupedVisits.length === 0 && (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={24} color={Colors.textMuted} />
                  <Text style={styles.noResultsText}>
                    {searchQuery ? `No visits match "${searchQuery}"` : 'No visits match this filter'}
                  </Text>
                </View>
              )}

              {groupedVisits.map(group => (
                <View key={group.title} style={styles.groupSection}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionHeaderLine} />
                    <Text style={styles.sectionHeader}>{group.title}</Text>
                    <View style={styles.sectionHeaderLine} />
                  </View>
                  {group.visits.map(renderVisitCard)}
                </View>
              ))}

              {hasMore && (
                <View style={styles.loadMoreContainer}>
                  <Pressable
                    style={styles.loadMoreButton}
                    onPress={() => {
                      void fetchNextPage();
                    }}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.loadMoreText}>Load older visits</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingSafe: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    paddingHorizontal: spacing(5),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(4),
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
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  webLinkText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  scrollContent: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(8),
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
  // Search bar
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke,
    paddingHorizontal: spacing(3),
    marginBottom: spacing(3),
  },
  searchIcon: {
    marginRight: spacing(2),
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
    paddingVertical: spacing(3),
  },
  searchResultsText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    marginBottom: spacing(2),
  },
  // Filter chips
  filterRow: {
    gap: spacing(2),
    marginBottom: spacing(4),
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    backgroundColor: Colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  filterCount: {
    backgroundColor: 'rgba(38,35,28,0.08)',
    borderRadius: 999,
    paddingHorizontal: spacing(1.5),
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  filterCountActive: {
    backgroundColor: 'rgba(64,201,208,0.2)',
  },
  filterCountText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
  },
  filterCountTextActive: {
    color: Colors.primary,
  },
  // Section headers
  groupSection: {
    marginBottom: spacing(2),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    marginBottom: spacing(3),
  },
  sectionHeaderLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Visit cards
  visitCardPressable: {
    marginBottom: spacing(2),
  },
  visitCard: {
    padding: spacing(4),
  },
  visitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(2),
  },
  visitHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing(3),
    gap: spacing(2.5),
  },
  visitIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    letterSpacing: -0.1,
  },
  statusBadge: {
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: 999,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  visitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  visitDate: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    marginLeft: spacing(2),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(0.5),
    backgroundColor: 'rgba(38,35,28,0.05)',
    borderRadius: 999,
  },
  durationText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  summaryPreview: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textWarm,
    lineHeight: 20,
  },
  processingText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(1.5),
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  statChip: {
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    backgroundColor: Colors.primaryMuted,
    borderRadius: 999,
  },
  statText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.primary,
  },
  // No results
  noResults: {
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(8),
  },
  noResultsText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  // Load more
  loadMoreContainer: {
    marginTop: spacing(3),
    marginBottom: spacing(4),
    alignItems: 'center',
  },
  loadMoreButton: {
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    backgroundColor: Colors.surface,
  },
  loadMoreText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
});
