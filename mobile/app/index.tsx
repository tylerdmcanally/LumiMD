import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View, StyleSheet, Text, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing } from '../components/ui';
import { HeroBanner } from '../components/HeroBanner';
import { StartVisitCTA } from '../components/StartVisitCTA';
import { GlanceableCard } from '../components/GlanceableCard';
import { useAuth } from '../contexts/AuthContext';
import { usePendingActions, useActiveMedications, useVisits, useUserProfile } from '../lib/api/hooks';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { openWebDashboard } from '../lib/linking';

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
    refetch: refetchActions,
  } = usePendingActions({
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });
  const {
    data: visits,
    isLoading: visitsLoading,
    error: visitsError,
    refetch: refetchVisits,
  } = useVisits({
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: (data) => {
      if (!Array.isArray(data)) return false;
      return data.some((visit: any) =>
        ['pending', 'processing', 'transcribing', 'summarizing'].includes(
          visit.processingStatus,
        ),
      )
        ? 5000
        : false;
    },
  });
  const {
    data: medications,
    isLoading: medsLoading,
    error: medsError,
    refetch: refetchMedications,
  } = useActiveMedications({
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  useFocusEffect(
    useCallback(() => {
      if (!authLoading && isAuthenticated) {
        refetchActions();
        refetchVisits();
        refetchMedications();
      }
    }, [authLoading, isAuthenticated, refetchActions, refetchVisits, refetchMedications]),
  );

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

  useEffect(() => {
    if (
      authLoading ||
      profileLoading ||
      !isAuthenticated ||
      !profile ||
      profileError
    ) {
      return;
    }

    if (profile.complete === false) {
      router.replace('/onboarding');
    }
  }, [authLoading, profileLoading, profile, profileError, isAuthenticated, router]);

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

  // Calculate stats from real data - ensure we always have valid numbers
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
  const latestVisitBadge = useMemo(() => {
    if (!latestVisit) return undefined;

    const status = latestVisit.processingStatus;
    const visitReady = isVisitSummaryReady(latestVisit);

    if (status === 'failed') {
      return { text: 'Latest: Needs attention', color: Colors.error };
    }

    if (['processing', 'transcribing', 'summarizing', 'pending'].includes(status)) {
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

  const handleRecentVisitsPress = () => {
    if (latestCompletedVisitIdRef.current) {
      updateLastViewedCompletedVisit(latestCompletedVisitIdRef.current);
    }
    router.push('/visits');
  };

  return (
    <ErrorBoundary title="Unable to load your dashboard" description="Try refreshing the home screen. If this keeps happening, please force close and reopen the app.">
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <HeroBanner />
          
          {/* Primary CTA */}
          <View style={styles.ctaSection}>
            <StartVisitCTA onPress={() => router.push('/record-visit')} />
          </View>
          
          {/* Glanceable Stats Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Overview</Text>
            
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
                  icon="checkmark-circle-outline"
                  onPress={() => router.push('/actions')}
                />
                
                <GlanceableCard
                  title="Recent Visits"
                  count={stats.recentVisits}
                  countLabel="visits"
                  statusBadge={latestVisitBadge}
                  icon="document-text-outline"
                  onPress={handleRecentVisitsPress}
                />
                
                <GlanceableCard
                  title="Medications"
                  count={stats.medications}
                  countLabel="active"
                  icon="medkit-outline"
                  onPress={() => router.push('/medications')}
                />
              </>
            )}
          </View>
          
          {/* Helper text */}
          {!isLoadingData && (
            <Text style={styles.helperText}>
              Tap any card above to view details
            </Text>
          )}

          <Pressable style={styles.portalButton} onPress={openWebDashboard}>
            <Ionicons name="open-outline" size={18} color={Colors.primary} />
            <Text style={styles.portalButtonText}>Go to web portal</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
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
  portalButton: {
    marginTop: spacing(3),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(3),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.stroke,
    backgroundColor: Colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  portalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  section: {
    marginTop: spacing(5),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(3),
  },
  helperText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(5),
    paddingHorizontal: spacing(4),
    marginBottom: spacing(8),
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
});

