import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import { openWebMeds, openWebVisit } from '../lib/linking';
import { useAuth } from '../contexts/AuthContext';
import {
  useMedications,
  useMedicationReminders,
  useCreateMedicationReminder,
  useUpdateMedicationReminder,
  useDeleteMedicationReminder,
  useAcknowledgeMedicationWarnings,
} from '../lib/api/hooks';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MedicationWarningBanner } from '../components/MedicationWarningBanner';
import { ReminderTimePickerModal } from '../components/ReminderTimePickerModal';
import type { MedicationReminder } from '@lumimd/sdk';


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

  // Only include dose and frequency for clean, glanceable display
  // Notes often contain verbose doctor quotes from the transcript
  const lines: string[] = [];
  if (dose) lines.push(dose);
  if (freq) lines.push(freq);

  return lines;
};

export default function MedicationsScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [showInactive, setShowInactive] = useState(false);

  // Reminder modal state
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [selectedMed, setSelectedMed] = useState<{ id: string; name: string } | null>(null);

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

  // Reminders data
  const { data: reminders = [] } = useMedicationReminders({
    enabled: isAuthenticated,
  });

  const createReminder = useCreateMedicationReminder();
  const updateReminder = useUpdateMedicationReminder();
  const deleteReminder = useDeleteMedicationReminder();
  const acknowledgeWarnings = useAcknowledgeMedicationWarnings();

  // Get reminder for a specific medication
  const getReminderForMed = useCallback((medId: string): MedicationReminder | undefined => {
    return reminders.find(r => r.medicationId === medId);
  }, [reminders]);

  // Helper to determine if warning badge should be shown
  // Badge persists for critical warnings, clears after first view for moderate/low
  const shouldShowWarningBadge = useCallback((med: any): boolean => {
    const warnings = med.medicationWarning || [];
    if (warnings.length === 0) return false;
    
    // Always show badge for critical warnings
    const hasCriticalWarning = warnings.some((w: any) => w.severity === 'critical');
    if (hasCriticalWarning) return true;
    
    // For non-critical warnings, check if already acknowledged
    if (med.warningAcknowledgedAt) return false;
    
    return true;
  }, []);

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

    // Get reminder for this medication
    const reminder = med.id ? getReminderForMed(med.id) : undefined;
    const hasReminder = reminder && reminder.enabled;

    // Warning badge logic
    const showWarningBadge = shouldShowWarningBadge(med);
    const warnings = med.medicationWarning || [];
    const hasCriticalWarning = warnings.some((w: any) => w.severity === 'critical');
    const hasNonCriticalWarnings = warnings.some((w: any) => w.severity !== 'critical');
    
    // Filter warnings for display based on severity and acknowledgment
    const warningsToShow = warnings.filter((w: any) => {
      // Always show critical warnings
      if (w.severity === 'critical') return true;
      // Show non-critical only if not yet acknowledged
      return !med.warningAcknowledgedAt;
    });

    const handleReminderPress = (e: any) => {
      e.stopPropagation();
      setSelectedMed({ id: med.id, name: med.name || 'Medication' });
      setReminderModalVisible(true);
    };

    const handleRemoveReminder = (e: any) => {
      e.stopPropagation();
      if (reminder) {
        Alert.alert(
          'Remove Reminder',
          `Stop reminding you to take ${med.name}?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => deleteReminder.mutate(reminder.id),
            },
          ]
        );
      }
    };

    const formatReminderTimes = (times: string[]) => {
      return times.map(time => {
        const [hours, minutes] = time.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
      }).join(', ');
    };

    // Handler to acknowledge warnings when banner is dismissed
    const handleAcknowledgeWarnings = () => {
      if (med.id && hasNonCriticalWarnings && !med.warningAcknowledgedAt) {
        acknowledgeWarnings.mutate(med.id);
      }
    };

    return (
      <Pressable
        key={med.id || `${med.name}-${index}`}
        style={{ marginTop: index === 0 ? 0 : spacing(3) }}
        onPress={() => handleOpenMedication(med)}
      >
        <Card style={styles.medCard}>
          {/* Topline: Name + Status Badge */}
          <View style={styles.medHeader}>
            <View style={styles.medIcon}>
              <Ionicons name={isActive ? 'medkit' : 'medkit-outline'} size={20} color={Colors.primary} />
              {showWarningBadge && (
                <View style={[
                  styles.warningIndicator,
                  hasCriticalWarning && styles.warningIndicatorCritical
                ]}>
                  <Ionicons name="warning" size={10} color="#fff" />
                </View>
              )}
            </View>
            <Text style={styles.medName} numberOfLines={1}>{med.name || 'Medication'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: isActive ? 'rgba(52,211,153,0.15)' : 'rgba(255,107,107,0.12)' }]}>
              <Text style={[styles.statusLabel, { color: isActive ? Colors.success : Colors.error }]}>
                {isActive ? 'Active' : 'Stopped'}
              </Text>
            </View>
          </View>

          {/* Glanceable Details Row: Dose • Frequency */}
          {(details.length > 0) && (
            <View style={styles.glanceRow}>
              <Text style={styles.glanceText} numberOfLines={1}>
                {details.join(' • ')}
              </Text>
            </View>
          )}

          {/* Warning Banner - Only show relevant warnings */}
          {warningsToShow.length > 0 && (
            <View style={{ marginTop: spacing(2) }}>
              <MedicationWarningBanner 
                warnings={warningsToShow} 
                onDismiss={hasNonCriticalWarnings && !hasCriticalWarning ? handleAcknowledgeWarnings : undefined}
              />
            </View>
          )}

          {/* Reminder Row - Only show for active medications */}
          {isActive && med.id && (
            <View style={styles.reminderRow}>
              <Ionicons
                name={hasReminder ? 'notifications' : 'notifications-outline'}
                size={18}
                color={hasReminder ? Colors.primary : Colors.textMuted}
              />
              {hasReminder ? (
                <>
                  <Text style={styles.reminderTimeText}>
                    {formatReminderTimes(reminder.times)}
                  </Text>
                  <Pressable
                    style={styles.reminderEditButton}
                    onPress={handleReminderPress}
                  >
                    <Ionicons name="pencil" size={14} color={Colors.primary} />
                  </Pressable>
                  <Pressable
                    style={styles.reminderRemoveButton}
                    onPress={handleRemoveReminder}
                  >
                    <Ionicons name="trash-outline" size={14} color={Colors.error} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={styles.setReminderButton}
                  onPress={handleReminderPress}
                >
                  <Text style={styles.setReminderText}>Set Reminder</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Compact Footer: Source + Date */}
          <View style={styles.cardFooter}>
            {med.source === 'visit' && med.sourceVisitId ? (
              <View style={styles.visitLink}>
                <Ionicons name="link-outline" size={12} color={Colors.primary} />
                <Text style={styles.visitLinkText}>From visit</Text>
              </View>
            ) : (
              <View style={styles.visitLink}>
                <Ionicons name="create-outline" size={12} color={Colors.textMuted} />
                <Text style={[styles.visitLinkText, { color: Colors.textMuted }]}>Added manually</Text>
              </View>
            )}
            {(startedLabel || stoppedLabel) && (
              <Text style={styles.footerDate}>
                {isActive ? (startedLabel ? `Started ${startedLabel}` : '') : (stoppedLabel ? `Stopped ${stoppedLabel}` : '')}
              </Text>
            )}
          </View>
        </Card>
      </Pressable>
    );
  };

  // Handle saving reminder from modal
  const handleSaveReminder = useCallback(async (times: string[]) => {
    if (!selectedMed) return;

    const existingReminder = getReminderForMed(selectedMed.id);

    try {
      if (existingReminder) {
        // Update existing reminder
        await updateReminder.mutateAsync({
          id: existingReminder.id,
          data: { times, enabled: true },
        });
      } else {
        // Create new reminder
        await createReminder.mutateAsync({
          medicationId: selectedMed.id,
          times,
        });
      }
      setReminderModalVisible(false);
      setSelectedMed(null);
    } catch (error) {
      Alert.alert('Error', 'Failed to save reminder. Please try again.');
    }
  }, [selectedMed, getReminderForMed, createReminder, updateReminder]);

  const handleCancelReminder = useCallback(() => {
    setReminderModalVisible(false);
    setSelectedMed(null);
  }, []);

  // Get existing times for the modal
  const getExistingTimes = useCallback(() => {
    if (!selectedMed) return [];
    const reminder = getReminderForMed(selectedMed.id);
    return reminder?.times || [];
  }, [selectedMed, getReminderForMed]);

  return (
    <>
      {/* Reminder Time Picker Modal */}
      <ReminderTimePickerModal
        visible={reminderModalVisible}
        medicationName={selectedMed?.name || ''}
        existingTimes={getExistingTimes()}
        onSave={handleSaveReminder}
        onCancel={handleCancelReminder}
        isLoading={createReminder.isPending || updateReminder.isPending}
      />
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
                <EmptyState
                  variant="error"
                  icon="cloud-offline-outline"
                  title="Unable to load medications"
                  description="We couldn't sync your medication list. Pull down to refresh or visit the web portal."
                  actionLabel="Open Web Portal"
                  onAction={openWebMeds}
                />
              ) : meds.length === 0 ? (
                <EmptyState
                  variant="empty"
                  icon="medkit-outline"
                  title="No medications yet"
                  description="Start a visit or add medications in your web portal to see them here."
                  actionLabel="Open Web Portal"
                  onAction={openWebMeds}
                />
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
    </>
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
    backgroundColor: '#F59E0B', // Amber for moderate/low warnings
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  warningIndicatorCritical: {
    backgroundColor: Colors.error, // Red for critical warnings - always visible
  },
  medName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginHorizontal: spacing(2),
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
  // Reminder styles
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3),
    marginBottom: spacing(3),
    backgroundColor: 'rgba(64,201,208,0.08)',
    borderRadius: Radius.md,
  },
  reminderTimeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
  },
  reminderEditButton: {
    padding: spacing(2),
  },
  reminderRemoveButton: {
    padding: spacing(2),
  },
  setReminderButton: {
    flex: 1,
  },
  setReminderText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary,
  },
  // Glanceable card styles
  glanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing(2),
    marginBottom: spacing(2),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    backgroundColor: 'rgba(64,201,208,0.08)',
    borderRadius: Radius.sm,
  },
  glanceText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  visitLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  visitLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.primary,
  },
  footerDate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
