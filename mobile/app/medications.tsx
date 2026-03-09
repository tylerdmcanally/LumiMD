import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  usePaginatedMedications,
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

const resolveDeviceTimezone = (): string | null => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof timezone === 'string' && timezone.trim().length > 0) {
      return timezone;
    }
  } catch {
    // no-op
  }
  return null;
};

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
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [showInactive, setShowInactive] = useState(false);

  // Reminder modal state
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [selectedMed, setSelectedMed] = useState<{ id: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMedIds, setExpandedMedIds] = useState<Set<string>>(new Set());

  const {
    items: medications,
    isLoading,
    isRefetching,
    isFetchingNextPage,
    hasMore,
    fetchNextPage,
    error,
    refetch,
  } = usePaginatedMedications({
    limit: 25,
  }, {
    enabled: isAuthenticated,
    staleTime: 0,
    gcTime: 0,
  });

  // Reminders data
  const { data: reminders = [] } = useMedicationReminders(user?.uid, {
    enabled: isAuthenticated,
  });

  const createReminder = useCreateMedicationReminder();
  const updateReminder = useUpdateMedicationReminder();
  const deleteReminder = useDeleteMedicationReminder();
  const acknowledgeWarnings = useAcknowledgeMedicationWarnings();

  const toggleExpanded = useCallback((medId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedMedIds(prev => {
      const next = new Set(prev);
      if (next.has(medId)) next.delete(medId);
      else next.add(medId);
      return next;
    });
  }, []);

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
        .filter((med) => med.active !== false && !med.stoppedAt)
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
        .filter((med) => med.active === false || Boolean(med.stoppedAt))
        .sort((a, b) => {
          const aTime = a.stoppedAt ? new Date(a.stoppedAt).getTime() : 0;
          const bTime = b.stoppedAt ? new Date(b.stoppedAt).getTime() : 0;
          return bTime - aTime;
        }),
    [meds],
  );

  const filteredActiveMeds = useMemo(() => {
    if (!searchQuery.trim()) return activeMeds;
    const q = searchQuery.toLowerCase();
    return activeMeds.filter(med =>
      med.name?.toLowerCase().includes(q) ||
      med.dose?.toLowerCase().includes(q) ||
      med.frequency?.toLowerCase().includes(q)
    );
  }, [activeMeds, searchQuery]);

  const filteredInactiveMeds = useMemo(() => {
    if (!searchQuery.trim()) return inactiveMeds;
    const q = searchQuery.toLowerCase();
    return inactiveMeds.filter(med =>
      med.name?.toLowerCase().includes(q) ||
      med.dose?.toLowerCase().includes(q)
    );
  }, [inactiveMeds, searchQuery]);

  const medsWithReminders = useMemo(() =>
    activeMeds.filter(med => med.id && getReminderForMed(med.id)?.enabled).length,
    [activeMeds, getReminderForMed]
  );

  const medsWithWarnings = useMemo(() =>
    activeMeds.filter(med => shouldShowWarningBadge(med)).length,
    [activeMeds, shouldShowWarningBadge]
  );

  const handleOpenMedication = (med: any) => {
    if (med.sourceVisitId) {
      openWebVisit(med.sourceVisitId);
      return;
    }
    openWebMeds();
  };

  const renderMedicationCard = (med: any, index: number, isActive: boolean) => {
    const medId = med.id || `${med.name}-${index}`;
    const isExpanded = expandedMedIds.has(medId);
    const details = buildDetails(med);
    const startedLabel = formatDate(med.startedAt);
    const stoppedLabel = formatDate(med.stoppedAt);

    const reminder = med.id ? getReminderForMed(med.id) : undefined;
    const hasReminder = reminder && reminder.enabled;

    const showWarningBadge = shouldShowWarningBadge(med);
    const warnings = med.medicationWarning || [];
    const hasCriticalWarning = warnings.some((w: any) => w.severity === 'critical');
    const hasNonCriticalWarnings = warnings.some((w: any) => w.severity !== 'critical');

    const warningsToShow = warnings.filter((w: any) => {
      if (w.severity === 'critical') return true;
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

    const handleAcknowledgeWarnings = () => {
      if (med.id && hasNonCriticalWarnings && !med.warningAcknowledgedAt) {
        acknowledgeWarnings.mutate(med.id, {
          onSuccess: () => {
            Alert.alert('Got it', 'Warning acknowledged. It will be minimized next time.');
          },
          onError: () => {
            Alert.alert('Error', 'Failed to acknowledge warning. Please try again.');
          }
        });
      }
    };

    return (
      <Pressable
        key={medId}
        style={{ marginTop: index === 0 ? 0 : spacing(2) }}
        onPress={() => toggleExpanded(medId)}
      >
        <Card style={styles.compactCard}>
          {/* Compact row — always visible */}
          <View style={styles.compactRow}>
            <View style={styles.compactIcon}>
              <Ionicons name={isActive ? 'medkit' : 'medkit-outline'} size={18} color={isActive ? Colors.primary : Colors.textMuted} />
              {showWarningBadge && (
                <View style={[styles.warningDot, hasCriticalWarning && styles.warningDotCritical]} />
              )}
            </View>
            <View style={styles.compactInfo}>
              <Text style={styles.compactName} numberOfLines={1}>{med.name || 'Medication'}</Text>
              {details.length > 0 && (
                <Text style={styles.compactDose} numberOfLines={1}>{details.join(' · ')}</Text>
              )}
            </View>
            <View style={styles.compactRight}>
              {hasReminder && (
                <Ionicons name="notifications" size={13} color={Colors.primary} style={{ marginRight: spacing(1.5) }} />
              )}
              <View style={[styles.compactBadge, { backgroundColor: isActive ? 'rgba(52,211,153,0.15)' : 'rgba(255,107,107,0.12)' }]}>
                <Text style={[styles.compactBadgeText, { color: isActive ? Colors.success : Colors.error }]}>
                  {isActive ? 'Active' : 'Stopped'}
                </Text>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.textMuted}
                style={{ marginLeft: spacing(2) }}
              />
            </View>
          </View>

          {/* Expanded details */}
          {isExpanded && (
            <View style={styles.expandedContent}>
              {/* Warning Banner */}
              {warningsToShow.length > 0 && (
                <View
                  onStartShouldSetResponder={() => true}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  <MedicationWarningBanner
                    warnings={warningsToShow}
                    onDismiss={hasNonCriticalWarnings && !hasCriticalWarning ? handleAcknowledgeWarnings : undefined}
                  />
                </View>
              )}

              {/* Reminder Row */}
              {isActive && med.id && (
                <View style={styles.reminderRow}>
                  <Ionicons
                    name={hasReminder ? 'notifications' : 'notifications-outline'}
                    size={16}
                    color={hasReminder ? Colors.primary : Colors.textMuted}
                  />
                  {hasReminder ? (
                    <>
                      <Text style={styles.reminderTimeText}>
                        {formatReminderTimes(reminder.times)}
                      </Text>
                      <Pressable style={styles.reminderEditButton} onPress={handleReminderPress}>
                        <Ionicons name="pencil" size={14} color={Colors.primary} />
                      </Pressable>
                      <Pressable style={styles.reminderRemoveButton} onPress={handleRemoveReminder}>
                        <Ionicons name="trash-outline" size={14} color={Colors.error} />
                      </Pressable>
                    </>
                  ) : (
                    <Pressable style={styles.setReminderButton} onPress={handleReminderPress}>
                      <Text style={styles.setReminderText}>Set Reminder</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Footer */}
              <View style={styles.cardFooter}>
                {med.source === 'visit' && med.sourceVisitId ? (
                  <Pressable
                    style={styles.visitLink}
                    onPress={(e) => { e.stopPropagation(); openWebVisit(med.sourceVisitId); }}
                  >
                    <Ionicons name="link-outline" size={12} color={Colors.primary} />
                    <Text style={styles.visitLinkText}>From visit</Text>
                  </Pressable>
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
            </View>
          )}
        </Card>
      </Pressable>
    );
  };

  // Handle saving reminder from modal
  const handleSaveReminder = useCallback(async (payload: {
    times: string[];
    timingPreference: 'auto' | 'local' | 'anchor';
    anchorTimezone?: string | null;
  }) => {
    if (!selectedMed) return;
    const { times, timingPreference, anchorTimezone } = payload;

    const existingReminder = getReminderForMed(selectedMed.id);
    const resolvedAnchorTimezone = anchorTimezone ?? resolveDeviceTimezone();

    if (timingPreference === 'anchor' && !resolvedAnchorTimezone) {
      Alert.alert('Error', 'Unable to detect timezone for anchored reminder mode.');
      return;
    }

    try {
      if (existingReminder) {
        const updatePayload: {
          times: string[];
          enabled: boolean;
          timingMode?: 'local' | 'anchor';
          anchorTimezone?: string | null;
        } = {
          times,
          enabled: true,
        };

        if (timingPreference !== 'auto') {
          const desiredTimingMode: 'local' | 'anchor' = timingPreference;
          const desiredAnchorTimezone =
            desiredTimingMode === 'anchor' ? resolvedAnchorTimezone : null;
          const existingTimingMode =
            existingReminder.timingMode === 'anchor' || existingReminder.timingMode === 'local'
              ? existingReminder.timingMode
              : null;
          const existingAnchorTimezone = existingReminder.anchorTimezone ?? null;
          const shouldUpdateTimingPolicy =
            existingTimingMode !== desiredTimingMode ||
            existingAnchorTimezone !== desiredAnchorTimezone;

          if (shouldUpdateTimingPolicy) {
            updatePayload.timingMode = desiredTimingMode;
            updatePayload.anchorTimezone = desiredAnchorTimezone;
          }
        }

        // Update existing reminder
        await updateReminder.mutateAsync({
          id: existingReminder.id,
          data: updatePayload,
        });
      } else {
        const createPayload: {
          medicationId: string;
          times: string[];
          timingMode?: 'local' | 'anchor';
          anchorTimezone?: string | null;
        } = {
          medicationId: selectedMed.id,
          times,
        };

        if (timingPreference !== 'auto') {
          createPayload.timingMode = timingPreference;
          createPayload.anchorTimezone =
            timingPreference === 'anchor' ? resolvedAnchorTimezone : null;
        }

        // Create new reminder
        await createReminder.mutateAsync(createPayload);
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
        existingTimingMode={
          selectedMed ? getReminderForMed(selectedMed.id)?.timingMode ?? null : null
        }
        existingAnchorTimezone={
          selectedMed ? getReminderForMed(selectedMed.id)?.anchorTimezone ?? null : null
        }
        reminderCriticality={
          selectedMed ? getReminderForMed(selectedMed.id)?.criticality ?? null : null
        }
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
                  {/* Search Bar */}
                  <View style={styles.searchContainer}>
                    <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search medications..."
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

                  {/* Summary Strip */}
                  {!searchQuery && (
                    <View style={styles.summaryStrip}>
                      <View style={styles.summaryChip}>
                        <View style={[styles.summaryDot, { backgroundColor: Colors.success }]} />
                        <Text style={styles.summaryChipText}>{activeMeds.length} Active</Text>
                      </View>
                      {medsWithReminders > 0 && (
                        <View style={styles.summaryChip}>
                          <Ionicons name="notifications" size={12} color={Colors.primary} />
                          <Text style={styles.summaryChipText}>{medsWithReminders} Reminders</Text>
                        </View>
                      )}
                      {medsWithWarnings > 0 && (
                        <View style={styles.summaryChip}>
                          <Ionicons name="warning" size={12} color={Colors.warning} />
                          <Text style={styles.summaryChipText}>{medsWithWarnings} Warnings</Text>
                        </View>
                      )}
                      {inactiveMeds.length > 0 && (
                        <View style={styles.summaryChip}>
                          <View style={[styles.summaryDot, { backgroundColor: Colors.textMuted }]} />
                          <Text style={styles.summaryChipText}>{inactiveMeds.length} Stopped</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Search results count */}
                  {searchQuery.length > 0 && (
                    <Text style={styles.searchResultsText}>
                      {filteredActiveMeds.length + filteredInactiveMeds.length} result{filteredActiveMeds.length + filteredInactiveMeds.length !== 1 ? 's' : ''}
                    </Text>
                  )}

                  <View style={styles.section}>
                    {filteredActiveMeds.length === 0 && !searchQuery ? (
                      <View style={styles.emptyActive}>
                        <Ionicons name="checkmark-done" size={20} color={Colors.success} />
                        <Text style={styles.emptyActiveText}>No active medications right now.</Text>
                      </View>
                    ) : filteredActiveMeds.length === 0 && searchQuery ? (
                      <View style={styles.emptyActive}>
                        <Ionicons name="search-outline" size={20} color={Colors.textMuted} />
                        <Text style={styles.emptyActiveText}>No medications match "{searchQuery}"</Text>
                      </View>
                    ) : (
                      filteredActiveMeds.map((med, index) => renderMedicationCard(med, index, true))
                    )}
                  </View>

                  {filteredInactiveMeds.length > 0 && (
                    <Card style={styles.inactiveCard}>
                      <Pressable
                        style={styles.inactiveHeader}
                        onPress={() => setShowInactive((prev) => !prev)}
                      >
                        <View style={styles.inactiveHeaderLeft}>
                          <Ionicons name="archive-outline" size={18} color={Colors.textMuted} />
                          <Text style={styles.inactiveTitle}>Recently stopped</Text>
                          <View style={styles.sectionCount}>
                            <Text style={styles.sectionCountText}>{filteredInactiveMeds.length}</Text>
                          </View>
                        </View>
                        <Ionicons
                          name={showInactive ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={Colors.textMuted}
                        />
                      </Pressable>

                      {showInactive &&
                        filteredInactiveMeds.map((med, index) => renderMedicationCard(med, index, false))}
                    </Card>
                  )}
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
                          <Text style={styles.loadMoreText}>Load more medications</Text>
                        )}
                      </Pressable>
                    </View>
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
  section: {
    marginTop: spacing(4),
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
    marginBottom: spacing(3),
  },
  // Summary strip
  summaryStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(2),
    marginBottom: spacing(4),
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    backgroundColor: Colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryChipText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textWarm,
  },
  // Compact medication card
  compactCard: {
    padding: spacing(3),
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.sageMuted,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginRight: spacing(3),
  },
  warningDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F59E0B',
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  warningDotCritical: {
    backgroundColor: Colors.error,
  },
  compactInfo: {
    flex: 1,
    marginRight: spacing(2),
  },
  compactName: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    letterSpacing: -0.1,
  },
  compactDose: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    marginTop: 2,
  },
  compactRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactBadge: {
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 999,
  },
  compactBadgeText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Expanded content
  expandedContent: {
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: spacing(3),
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
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
    fontFamily: 'Fraunces_700Bold',
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
  // Reminder styles
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
    backgroundColor: 'rgba(64,201,208,0.08)',
    borderRadius: Radius.md,
  },
  reminderTimeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
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
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.primary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing(2),
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
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.primary,
  },
  footerDate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  loadMoreContainer: {
    marginTop: spacing(4),
    marginBottom: spacing(4),
    alignItems: 'center',
  },
  loadMoreButton: {
    minWidth: 210,
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
