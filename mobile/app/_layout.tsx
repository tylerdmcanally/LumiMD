import { Stack, useRouter } from 'expo-router';
import { useColorScheme, AppState } from 'react-native';
import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { navTheme } from '../theme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Colors, spacing } from '../components/ui';
import { usePendingActions, useVisits, useMedicationSchedule } from '../lib/api/hooks';
import { setBadgeCount, getExpoPushToken, registerPushToken } from '../lib/notifications';
import { syncMedicationScheduleToWidget } from '../lib/widget/widgetSync';

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

function NotificationHandler() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const appState = useRef(AppState.currentState);

  // Only fetch data when authenticated to prevent SDK errors
  const { data: pendingActions } = usePendingActions({ enabled: isAuthenticated && !!user });
  const { data: visits } = useVisits({ enabled: isAuthenticated && !!user });
  const { data: medicationSchedule, refetch: refetchSchedule } = useMedicationSchedule({ 
    enabled: isAuthenticated && !!user 
  });

  // Update badge count when actions or visits change
  useEffect(() => {
    const updateBadge = async () => {
      if (!isAuthenticated) {
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
  }, [isAuthenticated, pendingActions, visits]);

  // Auto-register push token when authenticated
  // This ensures new builds (e.g., TestFlight) get fresh tokens registered
  useEffect(() => {
    const autoRegisterPushToken = async () => {
      if (!isAuthenticated || !user) return;

      try {
        const token = await getExpoPushToken();
        if (token) {
          await registerPushToken(token);
          console.log('[Notifications] Auto-registered push token on app launch');
        }
      } catch (error) {
        console.error('[Notifications] Error auto-registering push token:', error);
      }
    };

    autoRegisterPushToken();
  }, [isAuthenticated, user]);

  // Handle notification received while app is foregrounded
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Notifications] Notification received:', notification);
      // Badge will be updated by the useEffect above when data refetches
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
    };
  }, []);

  // Handle notification tapped (deep linking)
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[Notifications] Notification tapped:', data);

      if (!isAuthenticated) {
        console.log('[Notifications] User not authenticated, ignoring tap');
        return;
      }

      if (data?.type === 'medication_reminder') {
        // Navigate to medication schedule screen
        console.log('[Notifications] Navigating to medication schedule');
        router.push('/medication-schedule');
      } else if (data?.type === 'visit-ready' && data?.visitId) {
        // Navigate to visit detail
        router.push(`/visit-detail?id=${data.visitId}`);
      } else if (data?.type === 'nudge') {
        // Navigate to home screen where LumiBot section will show the nudge
        console.log('[Notifications] Navigating to home for nudge:', data.nudgeId);
        router.replace('/(tabs)');
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated, router]);

  // Sync widget on app foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isAuthenticated
      ) {
        // App has come to the foreground - refresh schedule and sync widget
        console.log('[AppState] App came to foreground, refreshing medication schedule');
        refetchSchedule().then((result) => {
          // Widget sync will happen automatically via useWidgetSync in medication-schedule screen
          // But also sync here in case user doesn't open that screen
          const latestSchedule = result?.data ?? medicationSchedule;
          if (latestSchedule) {
            syncMedicationScheduleToWidget(latestSchedule).catch(err => {
              console.warn('[AppState] Failed to sync widget on foreground:', err);
            });
          }
        });
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, medicationSchedule, refetchSchedule]);

  // Sync widget whenever schedule data changes (handles both foreground and data updates)
  useEffect(() => {
    if (isAuthenticated && medicationSchedule) {
      syncMedicationScheduleToWidget(medicationSchedule).catch(err => {
        console.warn('[NotificationHandler] Failed to sync widget:', err);
      });
    }
  }, [isAuthenticated, medicationSchedule]);

  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
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
              <Stack.Screen
                name="settings"
                options={{
                  headerShown: false,
                  presentation: 'modal',
                  animation: 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="medications"
                options={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="medication-schedule"
                options={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="record-visit"
                options={{
                  headerShown: false,
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name="visits"
                options={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="visit-detail"
                options={{
                  headerShown: false,
                  animation: 'slide_from_right',
                }}
              />
              <Stack.Screen
                name="caregiver-sharing"
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
    fontWeight: '700',
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
    fontWeight: '600',
  },
});
