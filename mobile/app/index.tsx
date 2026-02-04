import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View, StyleSheet, Text, ActivityIndicator, Alert } from 'react-native';
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
import { haptic } from '../lib/haptics';

const LAST_VIEWED_VISIT_KEY_PREFIX = 'lumimd:lastViewedVisit:';

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
  } = useUserProfile({
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  // Fetch data
  const {
    data: actions,
    isLoading: actionsLoading,
    error: actionsError,
  } = useRealtimePendingActions(user?.uid);

  const {
    data: visits,
    isLoading: visitsLoading,
    error: visitsError,
  } = useRealtimeVisits(user?.uid);

  const {
    data: medications,
    isLoading: medsLoading,
    error: medsError,
  } = useRealtimeActiveMedications(user?.uid);

  // Medication schedule for today's dose status
  const {
    data: schedule,
    isLoading: scheduleLoading,
  } = useMedicationSchedule({ enabled: isAuthenticated });

  // Web portal banner state - for placing "Need help?" button below cards
  const { isDismissed: webBannerDismissed, handleDismiss: dismissWebBanner, handleRestore: restoreWebBanner } = useWebPortalBannerState();

  // Visit share prompt - triggers when a visit finishes processing and user has caregivers
  const { pendingShare, clearPendingShare } = useVisitSharePrompt();

  const handleShareComplete = useCallback((sent: number, failed: number) => {
    if (sent > 0) {
      void haptic.success();
      Alert.alert(
        'Shared!',
        `Visit summary sent to ${sent} caregiver${sent > 1 ? 's' : ''}.`,
        [{ text: 'OK' }]
      );
    } else if (failed > 0) {
      void haptic.error();
      Alert.alert(
        'Sharing Failed',
        'Could not send the visit summary. You can try again from the visit details.',
        [{ text: 'OK' }]
      );
    }
  }, []);


  const [lastViewedCompletedVisitId, setLastViewedCompletedVisitIdState] = useState<string | null>(null);
  const latestCompletedVisitIdRef = useRef<string | null>(null);


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

  const isLoadingData = actionsLoading || visitsLoading || medsLoading || profileLoading;
  const hasErrors = actionsError || visitsError || medsError || profileError;

  // Extract medical conditions for HealthKit relevance filtering
  const medicalConditions = useMemo(() => {
    const conditions = (profile as any)?.medicalHistory;
    return Array.isArray(conditions) ? conditions : [];
  }, [profile]);

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
    void haptic.selection();
    router.push('/visits');
  }, [updateLastViewedCompletedVisit, router]);

  const handleActionsPress = useCallback(() => {
    void haptic.selection();
    router.push('/actions');
  }, [router]);

  const handleMedicationsPress = useCallback(() => {
    void haptic.selection();
    router.push('/medications');
  }, [router]);

  const handleSchedulePress = useCallback(() => {
    void haptic.selection();
    router.push('/medication-schedule');
  }, [router]);

  const handleRestoreWebBanner = useCallback(() => {
    void haptic.selection();
    restoreWebBanner();
  }, [restoreWebBanner]);

  const handleDismissWebBanner = useCallback(() => {
    void haptic.light();
    dismissWebBanner();
  }, [dismissWebBanner]);

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
          <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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

              {isLoadingData ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.loadingText}>Loading your data...</Text>
                </View>
              ) : hasErrors ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Unable to load data. Please check your connection.</Text>
                </View>
              ) : (
                <>
                  <GlanceableCard
                    title="Action Items"
                    count={stats.openActions}
                    countLabel="pending"
                    emptyStateText="All caught up!"
                    icon="checkmark-circle-outline"
                    onPress={handleActionsPress}
                  />

                  <GlanceableCard
                    title="Recent Visits"
                    count={stats.recentVisits}
                    countLabel="visits"
                    emptyStateText="Record your first visit"
                    statusBadge={latestVisitBadge}
                    icon="document-text-outline"
                    onPress={handleRecentVisitsPress}
                  />

                  <GlanceableCard
                    title="Medications"
                    count={stats.medications}
                    countLabel="active"
                    emptyStateText="None tracked yet"
                    icon="medkit-outline"
                    onPress={handleMedicationsPress}
                  />

                  {/* Today's Schedule - only show if user has medication reminders */}
                  {schedule && schedule.summary && schedule.summary.total > 0 && (
                    <GlanceableCard
                      title="Today's Schedule"
                      count={schedule.summary.taken}
                      countLabel={`of ${schedule.summary.total} taken`}
                      statusBadge={
                        schedule.summary.taken === schedule.summary.total
                          ? { text: 'All done!', color: Colors.success }
                          : schedule.summary.pending > 0
                            ? { text: `${schedule.summary.pending} pending`, color: Colors.primary }
                            : undefined
                      }
                      icon="today-outline"
                      onPress={handleSchedulePress}
                    />
                  )}

                  {/* Apple Health Integration - shows personalized vitals */}
                  <HealthSnapshotCard
                    medicalConditions={medicalConditions}
                    maxVitals={3}
                  />
                </>
              )}
            </View>

            {/* Web Portal Banner or Need Help button - below Quick Overview */}
            <View style={styles.webPortalSection}>
              {webBannerDismissed ? (
                <NeedHelpButton onPress={handleRestoreWebBanner} />
              ) : (
                <WebPortalBanner
                  isDismissed={webBannerDismissed}
                  onDismiss={handleDismissWebBanner}
                  onRestore={handleRestoreWebBanner}
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
  webPortalSection: {
    marginTop: spacing(5),
  },
});



