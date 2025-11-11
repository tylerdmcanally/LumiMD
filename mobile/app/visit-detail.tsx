/**
 * Visit Detail Screen
 * Displays AI-generated summary, transcript, and action items for a visit
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, Card, spacing } from '../components/ui';
import { useVisit, queryKeys } from '../lib/api/hooks';
import { api } from '../lib/api/client';
import { openWebDashboard } from '../lib/linking';
import { ErrorBoundary } from '../components/ErrorBoundary';

dayjs.extend(relativeTime);

type TabKey = 'summary' | 'transcript' | 'actions';

const tabs: Array<{ key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'summary', label: 'Summary', icon: 'reader' },
  { key: 'transcript', label: 'Transcript', icon: 'document-text' },
  { key: 'actions', label: 'Next Steps', icon: 'checkmark-circle' },
];

function getStatusBadge(status: string | undefined) {
  switch (status) {
    case 'completed':
      return { label: 'Completed', color: Colors.success };
    case 'transcribing':
      return { label: 'Transcribing', color: Colors.warning };
    case 'summarizing':
      return { label: 'Summarizing', color: Colors.warning };
    case 'processing':
      return { label: 'Processing', color: Colors.warning };
    case 'pending':
      return { label: 'Pending', color: Colors.textMuted };
    case 'failed':
      return { label: 'Failed', color: Colors.error };
    default:
      return { label: 'Pending', color: Colors.textMuted };
  }
}

function formatList(items: string[] | undefined) {
  return (items ?? []).filter(item => item.trim().length > 0);
}

type MedicationListEntry = {
  primary: string;
  secondary?: string;
};

const sanitizeMedicationText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildMedicationEntry = (item: any): MedicationListEntry | null => {
  if (!item) return null;

  if (typeof item === 'string') {
    const text = item.trim();
    if (!text) return null;
    return { primary: text };
  }

  if (typeof item === 'object') {
    const name = sanitizeMedicationText(item.name);
    const display = sanitizeMedicationText(item.display);
    const note = sanitizeMedicationText(item.note);
    const original = sanitizeMedicationText(item.original);
    const dose = sanitizeMedicationText(item.dose);
    const frequency = sanitizeMedicationText(item.frequency);

    const primary = name ?? display ?? original ?? note ?? 'Medication';

    let secondary: string | undefined;

    if (
      display &&
      display !== primary &&
      !display.toLowerCase().startsWith(primary.toLowerCase())
    ) {
      secondary = display;
    } else {
      const parts = [dose, frequency].filter(Boolean) as string[];
      if (note && !parts.includes(note)) {
        parts.push(note);
      }
      if (parts.length > 0) {
        secondary = parts.join(' • ');
      } else if (original && original !== primary) {
        secondary = original;
      }
    }

    return {
      primary,
      secondary,
    };
  }

  return null;
};

const buildMedicationEntries = (items: any): MedicationListEntry[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map(buildMedicationEntry)
    .filter((entry): entry is MedicationListEntry => entry !== null);
};

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

export default function VisitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const visitId = params.id;

  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [retrying, setRetrying] = useState(false);
  const processingStates = ['pending', 'processing', 'transcribing', 'summarizing'];
  const queryClient = useQueryClient();

  const {
    data: visit,
    isLoading,
    isRefetching,
    refetch,
  } = useVisit(visitId ?? '', {
    enabled: Boolean(visitId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const currentData: any = query.state.data;
      if (
        currentData?.processingStatus &&
        processingStates.includes(currentData.processingStatus)
      ) {
        return 5000;
      }
      if (
        currentData?.processingStatus === 'completed' &&
        (!currentData?.summary || `${currentData.summary}`.trim().length === 0)
      ) {
        return 5000;
      }
      return false;
    },
  });

  const statusBadge = useMemo(() => getStatusBadge(visit?.processingStatus), [visit]);

  const medications = useMemo(
    () => ({
      started: buildMedicationEntries(visit?.medications?.started),
      stopped: buildMedicationEntries(visit?.medications?.stopped),
      changed: buildMedicationEntries(visit?.medications?.changed),
    }),
    [visit?.medications],
  );

  const diagnoses = useMemo(() => formatList(visit?.diagnoses), [visit?.diagnoses]);
  const imaging = useMemo(() => formatList(visit?.imaging), [visit?.imaging]);
  const nextSteps = useMemo(() => formatList(visit?.nextSteps), [visit?.nextSteps]);

  const isProcessing =
    visit?.processingStatus && processingStates.includes(visit.processingStatus);

  const lastProcessingUpdate =
    visit?.transcriptionSubmittedAt ||
    visit?.updatedAt ||
    visit?.createdAt ||
    null;
  const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
  const lastUpdateMs = lastProcessingUpdate ? new Date(lastProcessingUpdate).getTime() : null;
  const isStuck =
    isProcessing && lastUpdateMs ? Date.now() - lastUpdateMs > STUCK_THRESHOLD_MS : false;
  const stuckMinutes =
    isStuck && lastUpdateMs ? Math.floor((Date.now() - lastUpdateMs) / (60 * 1000)) : null;

  const processingMessage = useMemo(() => {
    switch (visit?.processingStatus) {
      case 'pending':
        return 'Queued to start processing. This may take a moment.';
      case 'processing':
        return 'Processing your visit. This usually takes under a minute.';
      case 'transcribing':
        return 'Transcribing your visit audio…';
      case 'summarizing':
        return 'Summarizing the key points…';
      default:
        return null;
    }
  }, [visit?.processingStatus]);

  const handleRetry = async () => {
    if (!visitId) return;
    try {
      setRetrying(true);
      const updatedVisit = await api.visits.retry(visitId);
      queryClient.setQueryData(queryKeys.visit(visitId), (current: any) => {
        if (!current) return updatedVisit;
        return {
          ...current,
          ...updatedVisit,
        };
      });
      Alert.alert(
        'Retry started',
        'We’ll reprocess this visit now. This usually takes under a minute.'
      );
      await refetch();
    } catch (error) {
      console.error('[VisitDetail] Retry error:', error);
      const status = (error as any)?.status;
      if (status === 409) {
        Alert.alert(
          'Already processing',
          'This visit is currently being processed. Please wait a moment and refresh.'
        );
      } else if (status === 429) {
        let message = 'Please wait a bit longer before retrying.';
        try {
          const body = (error as any)?.body;
          if (body) {
            const parsed = JSON.parse(body);
            if (parsed?.message) message = parsed.message;
          }
        } catch {
          // ignore
        }
        Alert.alert('Too soon to retry', message);
      } else {
        Alert.alert(
          'Retry failed',
          'We could not restart AI processing. Please try again in a moment.'
        );
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <ErrorBoundary
      title="Unable to open visit details"
      description="We couldn’t load this visit. Pull to refresh or go back and try again."
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Visit Details</Text>
          <View style={{ width: 28 }} />
        </View>

        {isLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading visit details...</Text>
          </View>
        )}

        {!isLoading && visit && (
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={refetch}
                  tintColor={Colors.primary}
                />
              }
            >
              <View style={styles.metaContainer}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Recorded</Text>
                  <Text style={styles.metaValue}>
                    {visit.createdAt ? dayjs(visit.createdAt).format('MMM D, YYYY h:mm A') : 'Unknown'}
                  </Text>
                </View>
                {visit.processedAt && (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>Processed</Text>
                    <Text style={styles.metaValue}>{dayjs(visit.processedAt).fromNow()}</Text>
                  </View>
                )}
                <View style={[styles.badge, { backgroundColor: statusBadge.color }]}>
                  <Text style={styles.badgeText}>{statusBadge.label}</Text>
                </View>
              </View>

              {isProcessing && processingMessage && (
                <View style={styles.processingBanner}>
                  <ActivityIndicator color={Colors.warning} />
                  <Text style={styles.processingText}>{processingMessage}</Text>
                </View>
              )}

              {isStuck && (
                <View style={styles.stuckBanner}>
                  <Ionicons name="warning-outline" size={20} color={Colors.warning} />
                  <View style={{ flex: 1, gap: spacing(1) }}>
                    <Text style={styles.stuckTitle}>Taking longer than expected</Text>
                    <Text style={styles.stuckText}>
                      {stuckMinutes
                        ? `This visit has been processing for about ${stuckMinutes} minutes.`
                        : 'This visit has been processing for a while.'}{' '}
                      You can retry now or reach out to support if it continues.
                    </Text>
                  </View>
                </View>
              )}

              {visit.processingStatus &&
                (visit.processingStatus === 'failed' || visit.processingStatus === 'pending') && (
                  <Card style={styles.failureCard}>
                    <View style={{ flex: 1, gap: spacing(1) }}>
                      <Text style={styles.failureTitle}>
                        {visit.processingStatus === 'failed'
                          ? 'We couldn’t process this visit'
                          : 'Processing hasn’t started yet'}
                      </Text>
                      <Text style={styles.failureText}>
                        {visit.processingStatus === 'failed'
                          ? visit.processingError ||
                            'The transcription request failed. Please retry in a moment.'
                          : 'Tap the button to kick off AI processing now.'}
                      </Text>
                    </View>
                    <Pressable
                      style={[
                        styles.retryButton,
                        (retrying || isProcessing) && styles.retryButtonDisabled,
                      ]}
                      onPress={handleRetry}
                      disabled={retrying || isProcessing}
                    >
                      {retrying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isProcessing ? (
                        <View style={styles.retryButtonContent}>
                          <ActivityIndicator size="small" color="#fff" />
                          <Text style={styles.retryButtonText}>Processing…</Text>
                        </View>
                      ) : (
                        <Text style={styles.retryButtonText}>
                          {visit.processingStatus === 'failed' ? 'Retry' : 'Start'}
                        </Text>
                      )}
                    </Pressable>
                  </Card>
                )}

              <View style={styles.tabRow}>
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <Pressable
                      key={tab.key}
                      style={[
                        styles.tabButton,
                        isActive ? styles.tabButtonActive : styles.tabButtonInactive,
                      ]}
                      onPress={() => setActiveTab(tab.key)}
                    >
                      <Ionicons
                        name={tab.icon}
                        size={18}
                        color={isActive ? '#fff' : Colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.tabLabel,
                          { color: isActive ? '#fff' : Colors.textMuted },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {activeTab === 'summary' && (
                <View>
                  <SummarySection title="Visit Summary">
                    {visit.summary ? (
                      <Text style={styles.summaryText}>{visit.summary}</Text>
                    ) : (
                      <Text style={styles.placeholderText}>
                        Summary will appear here once processing is complete.
                      </Text>
                    )}
                  </SummarySection>

                  <SummarySection title="Diagnoses Discussed">
                    {diagnoses.length > 0 ? (
                      diagnoses.map((item, idx) => (
                        <View key={idx} style={styles.listRow}>
                          <Ionicons name="medical" size={16} color={Colors.primary} />
                          <Text style={styles.listRowText}>{item}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.placeholderText}>No diagnoses captured.</Text>
                    )}
                  </SummarySection>

                  <SummarySection title="Medications">
                    {medications.started.length === 0 &&
                    medications.stopped.length === 0 &&
                    medications.changed.length === 0 ? (
                      <Text style={styles.placeholderText}>No medication changes noted.</Text>
                    ) : (
                      <View style={{ gap: spacing(3) }}>
                        {(['started', 'stopped', 'changed'] as Array<keyof typeof medications>).map(
                          (typedKey) => {
                            const labelMap: Record<typeof typedKey, string> = {
                              started: 'Started',
                              stopped: 'Stopped',
                              changed: 'Changed',
                            };
                            const items = medications[typedKey];
                            if (!items.length) return null;
                            return (
                              <View key={typedKey}>
                                <Text style={styles.medSubheading}>{labelMap[typedKey]}</Text>
                                {items.map((item, idx) => (
                                  <View key={idx} style={styles.listRow}>
                                    <Ionicons name="medkit" size={16} color={Colors.primary} />
                                    <View style={styles.listRowContent}>
                                      <Text style={styles.listRowText}>{item.primary}</Text>
                                      {item.secondary && (
                                        <Text style={styles.listRowSubText}>{item.secondary}</Text>
                                      )}
                                    </View>
                                  </View>
                                ))}
                              </View>
                            );
                          },
                        )}
                      </View>
                    )}
                  </SummarySection>

                  <SummarySection title="Imaging & Labs Ordered">
                    {imaging.length > 0 ? (
                      imaging.map((item, idx) => (
                        <View key={idx} style={styles.listRow}>
                          <Ionicons name="image" size={16} color={Colors.primary} />
                          <Text style={styles.listRowText}>{item}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.placeholderText}>No imaging or studies recorded.</Text>
                    )}
                  </SummarySection>
                </View>
              )}

              {activeTab === 'transcript' && (
                <Card style={styles.transcriptCard}>
                  {visit.transcript ? (
                    <Text style={styles.transcriptText}>{visit.transcript}</Text>
                  ) : (
                    <Text style={styles.placeholderText}>
                      Transcript will appear here once processing is complete.
                    </Text>
                  )}
                </Card>
              )}

              {activeTab === 'actions' && (
                <Card style={styles.actionsCard}>
                  {nextSteps.length > 0 ? (
                    nextSteps.map((item, idx) => (
                      <View key={idx} style={styles.actionRow}>
                        <Ionicons name="ellipse-outline" size={16} color={Colors.primary} />
                        <Text style={styles.actionText}>{item}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.placeholderText}>
                      Action items will appear here once processing is complete.
                    </Text>
                  )}
                  <Pressable
                    style={styles.manageOnWeb}
                    onPress={openWebDashboard}
                  >
                    <Text style={styles.manageOnWebText}>Manage on Web Portal</Text>
                    <Ionicons name="open-outline" size={18} color={Colors.primary} />
                  </Pressable>
                </Card>
              )}
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(4),
  },
  headerButton: {
    padding: spacing(1),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing(3),
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  content: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(8),
  },
  metaContainer: {
    marginBottom: spacing(4),
    gap: spacing(2),
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  metaValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: `${Colors.warning}1A`,
    borderRadius: spacing(3),
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  processingText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 14,
  },
  stuckBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(3),
    backgroundColor: `${Colors.warning}12`,
    borderRadius: spacing(3),
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  stuckTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.warning,
  },
  stuckText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  failureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    padding: spacing(4),
    backgroundColor: `${Colors.error}10`,
  },
  failureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  failureText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderRadius: spacing(2),
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing(3),
    marginBottom: spacing(4),
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(3),
    borderRadius: spacing(3),
  },
  tabButtonActive: {
    backgroundColor: Colors.primary,
  },
  tabButtonInactive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: spacing(4),
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(2),
  },
  sectionCard: {
    padding: spacing(4),
    gap: spacing(3),
  },
  summaryText: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
  },
  medSubheading: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(2),
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(1),
  },
  listRowContent: {
    flex: 1,
    gap: spacing(1),
  },
  listRowText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  listRowSubText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  transcriptCard: {
    padding: spacing(4),
  },
  transcriptText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  actionsCard: {
    padding: spacing(4),
    gap: spacing(2),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  actionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  manageOnWeb: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(4),
  },
  manageOnWebText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600',
  },
});


