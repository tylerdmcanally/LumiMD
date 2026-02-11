import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View, StyleSheet, Text, ActivityIndicator, Alert, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, spacing } from '../components/ui';
import { HeroBanner } from '../components/HeroBanner';
import { WebPortalBanner, useWebPortalBannerState, NeedHelpButton } from '../components/WebPortalBanner';
import { StartVisitCTA } from '../components/StartVisitCTA';
import { GlanceableCard } from '../components/GlanceableCard';
import { useAuth } from '../contexts/AuthContext';
import {
  useRealtimePendingActions,
  useRealtimeActiveMedications,
  useRealtimeVisits,
  useUserProfile,
  useMedicationSchedule,
  cleanupOrphanedReminders,
  cleanupOrphanedNudges,
} from '../lib/api/hooks';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LumiBotContainer } from '../components/lumibot';
import { ShareConfirmationSheet } from '../components/ShareConfirmationSheet';
import { useVisitSharePrompt } from '../lib/hooks/useVisitSharePrompt';
import { HealthSnapshotCard } from '../components/HealthSnapshotCard';
import { trackEvent } from '../lib/telemetry';

const LAST_VIEWED_VISIT_KEY_PREFIX = 'lumimd:lastViewedVisit:';
type RefreshSource = 'pull_to_refresh' | 'banner_retry' | 'card_retry';

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    isRefetching: profileRefetching,
    refetch: refetchProfile,
    error: profileError,
  } = useUserProfile({
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  // Fetch data
  const {
    data: actions,
    isLoading: actionsLoading,
    isRefetching: actionsRefetching,
    refetch: refetchActions,
    error: actionsError,
  } = useRealtimePendingActions(user?.uid);

  const {
    data: visits,
    isLoading: visitsLoading,
    isRefetching: visitsRefetching,
    refetch: refetchVisits,
    error: visitsError,
  } = useRealtimeVisits(user?.uid);

  const {
    data: medications,
    isLoading: medsLoading,
    isRefetching: medsRefetching,
    refetch: refetchMeds,
    error: medsError,
  } = useRealtimeActiveMedications(user?.uid);

  // Medication schedule for today's dose status
  const {
    data: schedule,
    isLoading: scheduleLoading,
    isRefetching: scheduleRefetching,
    refetch: refetchSchedule,
    error: scheduleError,
  } = useMedicationSchedule(user?.uid, { enabled: isAuthenticated });

  // Web portal banner state - for placing "Need help?" button below cards
  const { isDismissed: webBannerDismissed, handleDismiss: dismissWebBanner, handleRestore: restoreWebBanner } = useWebPortalBannerState();

  // Visit share prompt - triggers when a visit finishes processing and user has caregivers
  const { pendingShare, clearPendingShare } = useVisitSharePrompt();

  const handleShareComplete = useCallback((sent: number, failed: number) => {
    if (sent > 0) {
      Alert.alert(
        'Shared!',
        `Visit summary sent to ${sent} caregiver${sent > 1 ? 's' : ''}.`,
        [{ text: 'OK' }]
      );
    } else if (failed > 0) {
      Alert.alert(
        'Sharing Failed',
        'Could not send the visit summary. You can try again from the visit details.',
        [{ text: 'OK' }]
      );
    }
  }, []);


  const [lastViewedCompletedVisitId, setLastViewedCompletedVisitIdState] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestCompletedVisitIdRef = useRef<string | null>(null);
  const previousFailureSignatureRef = useRef<string>('');


  const persistLastViewedVisit = useCallback(async (visitId: string | null) => {
    if (!user?.uid) return;
    const storageKey = `${LAST_VIEWED_VISIT_KEY_PREFIX}${user.uid}`;
    try {
      if (visitId) {
        await AsyncStorage.setItem(storageKey, visitId);
      } else {
        await AsyncStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.warn('[Home] Failed to persist last viewed visit id', error);
    }
  }, [user?.uid]);

  const updateLastViewedCompletedVisit = useCallback(
    (visitId: string | null) => {
      setLastViewedCompletedVisitIdState(visitId);
      if (user?.uid) {
        persistLastViewedVisit(visitId);
      }
    },
    [persistLastViewedVisit, user?.uid],
  );

  useEffect(() => {
    let isMounted = true;

    const loadLastViewedVisit = async () => {
      if (!user?.uid) {
        setLastViewedCompletedVisitIdState(null);
        return;
      }

      const storageKey = `${LAST_VIEWED_VISIT_KEY_PREFIX}${user.uid}`;

      try {
        const storedValue = await AsyncStorage.getItem(storageKey);
        if (isMounted) {
          setLastViewedCompletedVisitIdState(storedValue ?? null);
        }
      } catch (error) {
        console.warn('[Home] Failed to load last viewed visit id', error);
        if (isMounted) {
          setLastViewedCompletedVisitIdState(null);
        }
      }
    };

    loadLastViewedVisit();

    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/sign-in');
    }
  }, [isAuthenticated, authLoading]);

  // Redirect to onboarding if profile is not complete
  useEffect(() => {
    if (
      !authLoading &&
      !profileLoading &&
      isAuthenticated &&
      profile &&
      profile.complete !== true
    ) {
      router.replace('/onboarding');
    }
  }, [authLoading, profileLoading, isAuthenticated, profile, router]);

  // Silently cleanup orphaned reminders and nudges on authenticated launch
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      cleanupOrphanedReminders();
      cleanupOrphanedNudges();
    }
  }, [isAuthenticated, authLoading]);



  // Calculate stats from real data - ensure we always have valid numbers
  // NOTE: All hooks must be called unconditionally before any early returns
  // to satisfy React's Rules of Hooks
  const recentVisits = useMemo(() => {
    if (!Array.isArray(visits)) return [];
    return visits.slice(0, 3);
  }, [visits]);

  const isVisitSummaryReady = useCallback((visit: any | null) => {
    if (!visit) return false;
    if (visit.processingStatus !== 'completed') return false;
    if (typeof visit.summary !== 'string') return false;
    return visit.summary.trim().length > 0;
  }, []);

  const latestVisit = recentVisits.length > 0 ? recentVisits[0] : null;
  const totalVisits = Array.isArray(visits) ? visits.length : 0;

  const latestCompletedVisitId =
    latestVisit && isVisitSummaryReady(latestVisit) ? latestVisit.id : null;

  useEffect(() => {
    latestCompletedVisitIdRef.current = latestCompletedVisitId;
  }, [latestCompletedVisitId]);

  const showReadyBadge =
    latestCompletedVisitId !== null && lastViewedCompletedVisitId !== latestCompletedVisitId;

  const stats = {
    openActions: Array.isArray(actions) ? actions.length : 0,
    recentVisits: totalVisits,
    medications: Array.isArray(medications) ? medications.length : 0,
  };

  const handleRefresh = useCallback(async (source: RefreshSource = 'pull_to_refresh') => {
    const currentFailures = [
      actionsError ? 'Action Items' : null,
      visitsError ? 'Recent Visits' : null,
      medsError ? 'Medications' : null,
      scheduleError ? "Today's Schedule" : null,
      profileError ? 'Profile' : null,
    ].filter(Boolean) as string[];

    trackEvent('home_recovery_attempt', {
      source,
      hadFailures: currentFailures.length > 0,
      failedCards: currentFailures.join('|') || 'none',
    });

    setIsRefreshing(true);
    try {
      const results = await Promise.allSettled([
        refetchProfile(),
        refetchActions(),
        refetchVisits(),
        refetchMeds(),
        refetchSchedule(),
      ]);
      const rejectedCount = results.filter(result => result.status === 'rejected').length;
      const erroredCount = results.filter((result) => {
        if (result.status !== 'fulfilled') return false;
        return Boolean((result.value as { error?: unknown } | undefined)?.error);
      }).length;

      trackEvent('home_recovery_result', {
        source,
        rejectedCount,
        erroredCount,
        success: rejectedCount === 0 && erroredCount === 0,
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [
    actionsError,
    medsError,
    profileError,
    refetchActions,
    refetchMeds,
    refetchProfile,
    refetchSchedule,
    refetchVisits,
    scheduleError,
    visitsError,
  ]);

  const isRefreshInFlight =
    isRefreshing ||
    profileRefetching ||
    actionsRefetching ||
    visitsRefetching ||
    medsRefetching ||
    scheduleRefetching;

  const hasLoadedAnyData =
    Array.isArray(actions) ||
    Array.isArray(visits) ||
    Array.isArray(medications) ||
    schedule !== undefined ||
    Boolean(profile);

  const isInitialLoading =
    !hasLoadedAnyData &&
    (actionsLoading || visitsLoading || medsLoading || profileLoading || scheduleLoading);

  const failedOverviewCards: string[] = [];
  if (actionsError) failedOverviewCards.push('Action Items');
  if (visitsError) failedOverviewCards.push('Recent Visits');
  if (medsError) failedOverviewCards.push('Medications');
  if (scheduleError) failedOverviewCards.push("Today's Schedule");

  const failedCards = [...failedOverviewCards];
  if (profileError) failedCards.push('Profile');
  const showPartialErrorBanner = failedCards.length > 0;
  const failureSignature = `${failedCards.join('|')}|profile:${profileError ? '1' : '0'}`;
  const hasFullOverviewFailure =
    failedOverviewCards.length > 0 &&
    failedOverviewCards.length === 4;

  useEffect(() => {
    if (isInitialLoading) return;

    const previous = previousFailureSignatureRef.current;
    if (previous === failureSignature) return;

    if (failedCards.length === 0) {
      if (previous) {
        trackEvent('home_load_recovered', {
          previousFailure: previous,
        });
      }
    } else {
      trackEvent(hasFullOverviewFailure ? 'home_load_full_failure' : 'home_load_partial_failure', {
        failedCount: failedCards.length,
        overviewFailedCount: failedOverviewCards.length,
        failedCards: failedCards.join('|'),
      });
    }

    previousFailureSignatureRef.current = failedCards.length === 0 ? '' : failureSignature;
  }, [
    failedCards,
    failedOverviewCards.length,
    failureSignature,
    hasFullOverviewFailure,
    isInitialLoading,
  ]);

  const latestVisitBadge = useMemo(() => {
    if (!latestVisit) return undefined;

    const status = latestVisit.processingStatus;
    const visitReady = isVisitSummaryReady(latestVisit);

    if (status === 'failed') {
      return { text: 'Latest: Needs attention', color: Colors.error };
    }

    if (status && ['processing', 'transcribing', 'summarizing', 'pending'].includes(status)) {
      return { text: 'Latest: Processing…', color: Colors.warning };
    }

    if (status === 'completed' && !visitReady) {
      return { text: 'Latest: Finalizing…', color: Colors.warning };
    }

    if (status === 'completed' && visitReady && showReadyBadge) {
      return { text: 'Latest: Ready to review', color: Colors.success };
    }

    return undefined;
  }, [isVisitSummaryReady, latestVisit, showReadyBadge]);

  const handleRecentVisitsPress = useCallback(() => {
    if (latestCompletedVisitIdRef.current) {
      updateLastViewedCompletedVisit(latestCompletedVisitIdRef.current);
    }
    router.push('/visits');
  }, [updateLastViewedCompletedVisit, router]);

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ marginTop: spacing(4), color: Colors.textMuted }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  // Don't render home screen if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <ErrorBoundary title="Unable to load your dashboard" description="Try refreshing the home screen. If this keeps happening, please force close and reopen the app.">
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                  refreshing={isRefreshInFlight}
                  onRefresh={() => {
                    void handleRefresh('pull_to_refresh');
                  }}
                  tintColor={Colors.primary}
                />
              }
            >
            <HeroBanner userName={(profile as any)?.firstName} />

            {/* LumiBot - Only shows when there are active nudges */}
            <LumiBotContainer userId={user?.uid} enabled={isAuthenticated} />

            {/* Primary CTA */}
            <View style={styles.ctaSection}>
              <StartVisitCTA onPress={() => router.push('/record-visit')} />
            </View>

            {/* Glanceable Stats Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Quick Overview</Text>
              </View>

              {showPartialErrorBanner && (
                <View style={styles.warningBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.warningTitle}>Some dashboard data could not refresh</Text>
                    <Text style={styles.warningText}>
                      {failedCards.join(', ')} {failedCards.length === 1 ? 'is' : 'are'} currently unavailable.
                    </Text>
                  </View>
                  <Pressable
                    style={styles.retryButton}
                    onPress={() => {
                      void handleRefresh('banner_retry');
                    }}
                  >
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </Pressable>
                </View>
              )}

              {isInitialLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.loadingText}>Loading your data...</Text>
                </View>
              ) : (
                <>
                  <GlanceableCard
                    title="Action Items"
                    count={actionsError ? 0 : stats.openActions}
                    countLabel={actionsError ? 'unavailable' : 'pending'}
                    emptyStateText={actionsError ? 'Unable to load. Tap to retry.' : 'All caught up!'}
                    icon="checkmark-circle-outline"
                    onPress={
                      actionsError
                        ? () => {
                            void handleRefresh('card_retry');
                          }
                        : () => router.push('/actions')
                    }
                  />

                  <GlanceableCard
                    title="Recent Visits"
                    count={visitsError ? 0 : stats.recentVisits}
                    countLabel={visitsError ? 'unavailable' : 'visits'}
                    emptyStateText={visitsError ? 'Unable to load. Tap to retry.' : 'Record your first visit'}
                    statusBadge={visitsError ? undefined : latestVisitBadge}
                    icon="document-text-outline"
                    onPress={
                      visitsError
                        ? () => {
                            void handleRefresh('card_retry');
                          }
                        : handleRecentVisitsPress
                    }
                  />

                  <GlanceableCard
                    title="Medications"
                    count={medsError ? 0 : stats.medications}
                    countLabel={medsError ? 'unavailable' : 'active'}
                    emptyStateText={medsError ? 'Unable to load. Tap to retry.' : 'None tracked yet'}
                    icon="medkit-outline"
                    onPress={
                      medsError
                        ? () => {
                            void handleRefresh('card_retry');
                          }
                        : () => router.push('/medications')
                    }
                  />

                  {/* Today's Schedule - show when data exists or load failed */}
                  {((schedule && schedule.summary && schedule.summary.total > 0) || scheduleError) && (
                    <GlanceableCard
                      title="Today's Schedule"
                      count={scheduleError ? 0 : schedule?.summary?.taken ?? 0}
                      countLabel={
                        scheduleError
                          ? 'unavailable'
                          : `of ${schedule?.summary?.total ?? 0} taken`
                      }
                      emptyStateText={scheduleError ? 'Unable to load. Tap to retry.' : undefined}
                      statusBadge={
                        scheduleError
                          ? undefined
                          : schedule && schedule.summary.taken === schedule.summary.total
                          ? { text: 'All done!', color: Colors.success }
                          : schedule && schedule.summary.pending > 0
                            ? { text: `${schedule.summary.pending} pending`, color: Colors.primary }
                            : undefined
                      }
                      icon="today-outline"
                      onPress={
                        scheduleError
                          ? () => {
                              void handleRefresh('card_retry');
                            }
                          : () => router.push('/medication-schedule')
                      }
                    />
                  )}

                  <HealthSnapshotCard />
                </>
              )}
            </View>

            {/* Web Portal Banner or Need Help button - below Quick Overview */}
            <View style={styles.webPortalSection}>
              {webBannerDismissed ? (
                <NeedHelpButton onPress={restoreWebBanner} />
              ) : (
                <WebPortalBanner
                  isDismissed={webBannerDismissed}
                  onDismiss={dismissWebBanner}
                  onRestore={restoreWebBanner}
                />
              )}
            </View>




          </ScrollView>
        </View>
      </SafeAreaView>

      {/* Share Confirmation Sheet - shown when visit processing completes */}
      <ShareConfirmationSheet
        visible={pendingShare !== null}
        visitId={pendingShare?.visitId || ''}
        onClose={clearPendingShare}
        onShareComplete={handleShareComplete}
      />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
  },
  ctaSection: {
    marginTop: spacing(5),
    marginBottom: spacing(2),
  },
  section: {
    marginTop: spacing(5),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(8),
    gap: spacing(3),
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    borderRadius: spacing(3),
    borderWidth: 1,
    borderColor: `${Colors.warning}66`,
    backgroundColor: `${Colors.warning}14`,
    padding: spacing(3),
    marginBottom: spacing(3),
  },
  warningTitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.warning,
  },
  warningText: {
    marginTop: spacing(0.5),
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  retryButton: {
    borderRadius: spacing(2),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    backgroundColor: Colors.warning,
  },
  retryButtonText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
  webPortalSection: {
    marginTop: spacing(5),
  },
});
