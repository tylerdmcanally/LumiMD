import { Stack, useRouter } from 'expo-router';
import { useColorScheme, AppState } from 'react-native';
import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { Fraunces_400Regular, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { navTheme } from '../theme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Colors, spacing } from '../components/ui';
import { usePendingActions, useVisits, useMedicationSchedule, useCareOverview, prefetchOnAuth } from '../lib/api/hooks';
import {
  setBadgeCount,
  getExpoPushToken,
  registerPushToken,
  syncTimezone,
  registerNotificationCategories,
  MED_ACTION_TOOK_IT,
  MED_ACTION_SKIPPED,
} from '../lib/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../lib/api/client';
import { initializeTelemetryConsent } from '../lib/telemetry';
import * as Sentry from '@sentry/react-native';
import { cfg } from '../lib/config';

Sentry.init({
  dsn: cfg.sentryDsn,
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.extra) {
      delete event.extra.visitData;
      delete event.extra.medications;
      delete event.extra.healthLogs;
    }
    return event;
  },
});

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    },
  },
});

function RootFallback({ reset }: { reset: () => void }) {
  return (
    <SafeAreaView style={styles.fallbackContainer}>
      <View style={styles.fallbackContent}>
        <Text style={styles.fallbackTitle}>Something went wrong</Text>
        <Text style={styles.fallbackSubtitle}>
          We ran into an unexpected issue. You can restart the app and we'll reset things for you.
        </Text>
        <Pressable style={styles.fallbackButton} onPress={reset}>
          <Text style={styles.fallbackButtonText}>Restart App</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// Patient notification types that route to patient screens
const PATIENT_NOTIFICATION_TYPES = ['medication_reminder', 'medication_reminder_batch', 'visit-ready', 'nudge', 'caregiver_message'];
// Caregiver notification types that route to caregiver screens
const CAREGIVER_NOTIFICATION_TYPES = ['daily_briefing', 'missed_medication_caregiver', 'overdue_action_caregiver', 'visit_ready_caregiver'];

/** AsyncStorage key for deduplicating notification-based medication logs */
function medLogDedupKey(medicationId: string, scheduledTime: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `medlog:${medicationId}:${scheduledTime}:${today}`;
}

function NotificationHandler() {
  const router = useRouter();
  const { isAuthenticated, user, role } = useAuth();
  const qc = useQueryClient();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const appState = useRef(AppState.currentState);

  // Refs to always access current auth/role state inside stable callbacks.
  // Without these, the response listener closes over a stale role value from
  // the render in which it was created — causing action taps to be silently
  // dropped when role resolves after the notification event fires.
  const isAuthenticatedRef = useRef(isAuthenticated);
  const roleRef = useRef(role);
  useEffect(() => { isAuthenticatedRef.current = isAuthenticated; }, [isAuthenticated]);
  useEffect(() => { roleRef.current = role; }, [role]);

  // Only fetch patient badge data when authenticated as patient
  const isPatient = role === 'patient';
  const isCaregiver = role === 'caregiver';
  const { data: pendingActions } = usePendingActions({ enabled: isAuthenticated && !!user && isPatient });
  const { data: visits } = useVisits({ enabled: isAuthenticated && !!user && isPatient });
  const { data: medicationSchedule, refetch: refetchSchedule } = useMedicationSchedule(user?.uid, {
    enabled: isAuthenticated && !!user && isPatient,
  });
  const { data: careOverview } = useCareOverview({ enabled: isAuthenticated && !!user && isCaregiver });

  // Update badge count when actions or visits change (patient only)
  useEffect(() => {
    const updateBadge = async () => {
      if (!isAuthenticated) {
        await setBadgeCount(0);
        return;
      }

      if (isCaregiver) {
        // Caregiver badge: count of high-severity alerts across all patients
        const highSeverityCount = careOverview?.patients?.reduce((count, patient) => {
          return count + (patient.alerts?.filter((a) => a.severity === 'high').length ?? 0);
        }, 0) ?? 0;
        await setBadgeCount(highSeverityCount);
        return;
      }

      if (!isPatient) {
        await setBadgeCount(0);
        return;
      }

      // Only count actions that are due within 7 days or are overdue
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const urgentActionsCount = Array.isArray(pendingActions)
        ? pendingActions.filter((action: any) => {
          if (!action.dueAt) return true; // No due date = show in badge (needs attention)
          const dueDate = new Date(action.dueAt);
          return dueDate <= sevenDaysFromNow; // Due within 7 days or already overdue
        }).length
        : 0;

      // Count visits that are completed but might need review
      const visitsCount = Array.isArray(visits)
        ? visits.filter((v: any) => v.processingStatus === 'completed').length
        : 0;
      // Use urgent pending actions as primary badge indicator, fallback to visits
      await setBadgeCount(Math.max(urgentActionsCount, visitsCount > 0 ? 1 : 0));
    };

    updateBadge();
  }, [isAuthenticated, isPatient, isCaregiver, careOverview, pendingActions, visits]);

  // Register notification categories on mount (before any notifications arrive)
  useEffect(() => {
    registerNotificationCategories();
  }, []);

  // Auto-register push token when authenticated (shared — both roles need push)
  useEffect(() => {
    const autoRegisterPushToken = async () => {
      if (!isAuthenticated || !user) return;

      try {
        const token = await getExpoPushToken();
        if (token) {
          await registerPushToken(token);
          if (__DEV__) console.log('[Notifications] Auto-registered push token on app launch');
        }
        // Sync timezone in case device timezone changed since last launch
        await syncTimezone();
      } catch (error) {
        console.error('[Notifications] Error auto-registering push token:', error);
      }
    };

    autoRegisterPushToken();
  }, [isAuthenticated, user]);

  // Handle notification received while app is foregrounded
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      if (__DEV__) console.log('[Notifications] Notification received:', notification);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, []);

  // Handle notification tapped (deep linking) — role-aware routing.
  // Intentionally stable (deps: [router, qc]). Auth state is read from refs so
  // action taps are handled correctly even when the event fires before role resolves.
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const actionId = response.actionIdentifier;
      const currentRole = roleRef.current;
      const currentIsAuthenticated = isAuthenticatedRef.current;
      if (__DEV__) console.log('[Notifications] Notification tapped:', data, 'action:', actionId);

      if (!currentIsAuthenticated) {
        if (__DEV__) console.log('[Notifications] User not authenticated, ignoring tap');
        return;
      }

      const notificationType = data?.type as string;

      // Handle medication reminder action buttons (Took it / Skipped)
      if (
        notificationType === 'medication_reminder' &&
        currentRole === 'patient' &&
        (actionId === MED_ACTION_TOOK_IT || actionId === MED_ACTION_SKIPPED)
      ) {
        const medicationId = data?.medicationId as string;
        const medicationName = data?.medicationName as string;
        const scheduledTime = data?.scheduledTime as string;
        const reminderId = data?.reminderId as string | undefined;

        if (medicationId && medicationName && scheduledTime) {
          const dedupKey = medLogDedupKey(medicationId, scheduledTime);

          // Dedup: skip if this dose was already logged via notification today
          AsyncStorage.getItem(dedupKey)
            .then((existing) => {
              if (existing) {
                if (__DEV__) console.log(`[Notifications] Duplicate tap ignored for ${medicationName} ${scheduledTime}`);
                return;
              }

              return api.medicationLogs
                .create({
                  medicationId,
                  medicationName,
                  action: actionId === MED_ACTION_TOOK_IT ? 'taken' : 'skipped',
                  scheduledTime,
                  reminderId,
                })
                .then(() => {
                  if (__DEV__) {
                  console.log(
                    `[Notifications] Logged ${actionId === MED_ACTION_TOOK_IT ? 'taken' : 'skipped'} for ${medicationName}`,
                  );
                  }
                  // Mark as logged to prevent duplicates
                  AsyncStorage.setItem(dedupKey, '1');
                  // Invalidate medication-related caches so UI reflects the log
                  qc.invalidateQueries({ queryKey: ['medicationSchedule'] });
                  qc.invalidateQueries({ queryKey: ['medications'] });
                });
            })
            .catch((err) => {
              console.error('[Notifications] Failed to log medication action:', err);
            });
        }
        return;
      }

      // Patient notification routing
      if (PATIENT_NOTIFICATION_TYPES.includes(notificationType) && currentRole === 'patient') {
        if (notificationType === 'medication_reminder' || notificationType === 'medication_reminder_batch') {
          router.push('/(patient)/medication-schedule');
        } else if (notificationType === 'visit-ready' && data?.visitId) {
          router.push(`/visit-detail?id=${data.visitId}`);
        } else if (notificationType === 'nudge') {
          router.replace('/(patient)/');
        } else if (notificationType === 'caregiver_message') {
          router.push('/messages');
        }
      }

      // Caregiver notification routing
      if (CAREGIVER_NOTIFICATION_TYPES.includes(notificationType) && currentRole === 'caregiver') {
        if (notificationType === 'daily_briefing') {
          router.replace('/(caregiver)/');
        } else if (data?.patientId) {
          // missed_medication_caregiver, overdue_action_caregiver, visit_ready_caregiver
          router.push(`/(caregiver)/patient/${data.patientId}`);
        }
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [router, qc]);

  // Prefetch high-priority patient data as soon as auth is confirmed
  useEffect(() => {
    if (isAuthenticated && user && isPatient) {
      prefetchOnAuth(qc, user.uid);
    }
  }, [isAuthenticated, user, isPatient, qc]);

  // Sync timezone + refresh data on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isAuthenticated
      ) {
        if (__DEV__) console.log('[AppState] App came to foreground, refreshing data');
        // Sync timezone for all roles (handles patient travel across timezones)
        syncTimezone();
        if (isPatient) {
          refetchSchedule();
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, isPatient, refetchSchedule]);

  return null;
}

function RootLayout() {
  const scheme = useColorScheme();

  // Load fonts (non-blocking): Plus Jakarta Sans (body) + Fraunces (display)
  useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  useEffect(() => {
    void initializeTelemetryConsent();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary
          onReset={() => queryClient.clear()}
          renderFallback={({ reset }) => <RootFallback reset={reset} />}
        >
          <ThemeProvider value={navTheme(scheme ?? 'light')}>
            <NotificationHandler />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(patient)" options={{ headerShown: false }} />
              <Stack.Screen name="(caregiver)" options={{ headerShown: false }} />
              <Stack.Screen
                name="sign-in"
                options={{
                  headerShown: false,
                  animation: 'fade',
                }}
              />
              <Stack.Screen
                name="sign-up"
                options={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="forgot-password"
                options={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              />
            </Stack>
          </ThemeProvider>
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackContent: {
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(6),
    alignItems: 'center',
    gap: spacing(4),
  },
  fallbackTitle: {
    fontSize: 24,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  fallbackSubtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  fallbackButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    borderRadius: spacing(3),
  },
  fallbackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});

export default Sentry.wrap(RootLayout);
