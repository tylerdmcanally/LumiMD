import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { openWebMeds, openWebVisit } from '../lib/linking';
import { useAuth } from '../contexts/AuthContext';
import { useMedications } from '../lib/api/hooks';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MedicationWarningBanner } from '../components/MedicationWarningBanner';

const formatDate = (value?: string | null) => {
  if (!value) return null;
  try {
    return dayjs(value).format('MMM D, YYYY');
  } catch {
    return null;
  }
};

const getSourceBadge = (source?: string) => {
  if (source === 'visit') {
    return { label: 'From Visit', background: 'rgba(64,201,208,0.15)', color: Colors.primary };
  }
  if (source === 'manual') {
    return { label: 'Added Manually', background: 'rgba(100,116,139,0.12)', color: Colors.textMuted };
  }
  return { label: 'Synced', background: 'rgba(64,201,208,0.1)', color: Colors.textMuted };
};

const buildDetails = (med: any) => {
  const dose = med.dose || med.dosage;
  const freq = med.frequency;
  const notes = med.notes;

  const lines: string[] = [];
  if (dose) lines.push(dose);
  if (freq) lines.push(freq);
  if (notes && notes !== dose && notes !== freq) lines.push(notes);

  return lines;
};

export default function MedicationsScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [showInactive, setShowInactive] = useState(false);

  const {
    data: medications,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useMedications({
    enabled: isAuthenticated,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/sign-in');
    }
  }, [isAuthenticated, authLoading]);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const meds = Array.isArray(medications) ? medications : [];

  const activeMeds = useMemo(
    () =>
      meds
        .filter((med) => med.active !== false)
        .sort((a, b) => {
          const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bTime - aTime;
        }),
    [meds],
  );

  const inactiveMeds = useMemo(
    () =>
      meds
        .filter((med) => med.active === false)
        .sort((a, b) => {
          const aTime = a.stoppedAt ? new Date(a.stoppedAt).getTime() : 0;
          const bTime = b.stoppedAt ? new Date(b.stoppedAt).getTime() : 0;
          return bTime - aTime;
        }),
    [meds],
  );

  const handleOpenMedication = (med: any) => {
    if (med.sourceVisitId) {
      openWebVisit(med.sourceVisitId);
      return;
    }
    openWebMeds();
  };

  const renderMedicationCard = (med: any, index: number, isActive: boolean) => {
    const badge = getSourceBadge(med.source);
    const details = buildDetails(med);
    const updatedLabel = formatDate(med.updatedAt);
    const startedLabel = formatDate(med.startedAt);
    const stoppedLabel = formatDate(med.stoppedAt);

    return (
      <Pressable
        key={med.id || `${med.name}-${index}`}
        style={{ marginTop: index === 0 ? 0 : spacing(3) }}
        onPress={() => handleOpenMedication(med)}
      >
        <Card style={styles.medCard}>
          <View style={styles.medHeader}>
            <View style={styles.medIcon}>
              <Ionicons name={isActive ? 'medkit' : 'medkit-outline'} size={20} color={Colors.primary} />
              {med.medicationWarning && med.medicationWarning.length > 0 && (
                <View style={styles.warningIndicator}>
                  <Ionicons name="warning" size={12} color="#fff" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.medName}>{med.name || 'Medication'}</Text>
              {details.length > 0 ? (
                <Text style={styles.medDose}>{details[0]}</Text>
              ) : (
                <Text style={styles.medDose}>No additional details</Text>
              )}
            </View>
            <View style={styles.badgeContainer}>
              {med.medicationWarning && med.medicationWarning.length > 0 && (
                <View style={styles.warningBadge}>
                  <Ionicons name="warning-outline" size={14} color={Colors.error} />
                  <Text style={styles.warningBadgeText}>{med.medicationWarning.length}</Text>
                </View>
              )}
              <View style={[styles.statusBadge, { backgroundColor: isActive ? 'rgba(52,211,153,0.15)' : 'rgba(255,107,107,0.12)' }]}>
                <Text style={[styles.statusLabel, { color: isActive ? Colors.success : Colors.error }]}>
                  {isActive ? 'Active' : 'Stopped'}
                </Text>
              </View>
            </View>
          </View>

          {med.medicationWarning && med.medicationWarning.length > 0 && (
            <View style={{ marginBottom: spacing(3) }}>
              <MedicationWarningBanner warnings={med.medicationWarning} />
            </View>
          )}

          <View style={styles.medMeta}>
            <View style={[styles.sourceBadge, { backgroundColor: badge.background }]}>
              <Ionicons name="sparkles-outline" size={12} color={badge.color} />
              <Text style={[styles.sourceLabel, { color: badge.color }]}>{badge.label}</Text>
            </View>
            {updatedLabel && (
              <Text style={styles.syncedText}>Updated {updatedLabel}</Text>
            )}
          </View>

          {details.slice(1).map((line, idx) => (
            <View key={idx} style={styles.detailRow}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.detailText}>{line}</Text>
            </View>
          ))}

          <View style={styles.timeline}>
            {startedLabel && (
              <View style={styles.timelineItem}>
                <Ionicons name="play-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.timelineText}>Started {startedLabel}</Text>
              </View>
            )}
            {!isActive && stoppedLabel && (
              <View style={styles.timelineItem}>
                <Ionicons name="stop-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.timelineText}>Stopped {stoppedLabel}</Text>
              </View>
            )}
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <ErrorBoundary
      title="Unable to load medications"
      description="Please pull to refresh or open the web portal while we double-check your medication list."
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle}>Medications</Text>
            <Pressable onPress={openWebMeds} style={styles.webLink}>
              <Ionicons name="open-outline" size={18} color={Colors.primary} />
              <Text style={styles.webLinkText}>Manage on Web</Text>
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
            }
          >
            {isLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.emptyDescription}>Loading medications…</Text>
              </View>
            ) : error ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
                </View>
                <Text style={styles.emptyTitle}>Unable to load medications</Text>
                <Text style={styles.emptyDescription}>
                  We couldn’t sync your medication list. Pull down to refresh or visit the web portal.
                </Text>
                <Pressable style={styles.emptyButton} onPress={openWebMeds}>
                  <Text style={styles.emptyButtonText}>Open Web Portal</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </Pressable>
              </View>
            ) : meds.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="medkit-outline" size={48} color={Colors.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>No medications yet</Text>
                <Text style={styles.emptyDescription}>
                  Start a visit or add medications in your web portal to see them here.
                </Text>
                <Pressable style={styles.emptyButton} onPress={openWebMeds}>
                  <Text style={styles.emptyButtonText}>Open Web Portal</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.sectionSubtitle}>
                  Active medications automatically update as your visit summaries note changes.
                </Text>

                <View style={styles.section}>
                  {activeMeds.length === 0 ? (
                    <View style={styles.emptyActive}>
                      <Ionicons name="checkmark-done" size={20} color={Colors.success} />
                      <Text style={styles.emptyActiveText}>No active medications right now.</Text>
                    </View>
                  ) : (
                    activeMeds.map((med, index) => renderMedicationCard(med, index, true))
                  )}
                </View>

                {inactiveMeds.length > 0 && (
                  <Card style={styles.inactiveCard}>
                    <Pressable
                      style={styles.inactiveHeader}
                      onPress={() => setShowInactive((prev) => !prev)}
                    >
                      <View style={styles.inactiveHeaderLeft}>
                        <Ionicons name="archive-outline" size={18} color={Colors.textMuted} />
                        <Text style={styles.inactiveTitle}>Recently stopped</Text>
                        <View style={styles.sectionCount}>
                          <Text style={styles.sectionCountText}>{inactiveMeds.length}</Text>
                        </View>
                      </View>
                      <Ionicons
                        name={showInactive ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Colors.textMuted}
                      />
                    </Pressable>

                    {showInactive &&
                      inactiveMeds.map((med, index) => renderMedicationCard(med, index, false))}
                  </Card>
                )}
              </>
            )}
          </ScrollView>
        </View>
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
  container: {
    flex: 1,
    paddingHorizontal: spacing(5),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(4),
  },
  backButton: {
    padding: spacing(1),
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  webLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  section: {
    marginTop: spacing(4),
  },
  medCard: {
    padding: spacing(4),
  },
  medHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(3),
    gap: spacing(2),
  },
  medIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  warningIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  medName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  medDose: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
    marginTop: spacing(1),
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 999,
    backgroundColor: 'rgba(255,107,107,0.12)',
  },
  warningBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.error,
  },
  statusBadge: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  medMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing(2),
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 8,
  },
  sourceLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  syncedText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(2),
  },
  detailText: {
    fontSize: 14,
    color: Colors.textMuted,
    flex: 1,
  },
  timeline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(3),
    marginTop: spacing(3),
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  timelineText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  inactiveCard: {
    marginTop: spacing(6),
    padding: spacing(3),
    gap: spacing(3),
  },
  inactiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inactiveHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  inactiveTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  sectionCount: {
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 8,
    backgroundColor: 'rgba(64,201,208,0.15)',
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  emptyActive: {
    paddingVertical: spacing(6),
    alignItems: 'center',
    gap: spacing(2),
  },
  emptyActiveText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing(12),
    paddingHorizontal: spacing(6),
    gap: spacing(4),
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyDescription: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(5),
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    gap: spacing(2),
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

