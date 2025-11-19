import { Stack, useRouter, useSegments } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { navTheme } from '../theme';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Colors, spacing } from '../components/ui';
import { usePendingActions, useVisits } from '../lib/api/hooks';
import { setBadgeCount } from '../lib/notifications';

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
          We ran into an unexpected issue. You can restart the app and we’ll reset things for you.
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
  const segments = useSegments();
  const { isAuthenticated } = useAuth();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const { data: pendingActions } = usePendingActions();
  const { data: visits } = useVisits();

  // Update badge count when actions or visits change
  useEffect(() => {
    const updateBadge = async () => {
      if (!isAuthenticated) {
        await setBadgeCount(0);
        return;
      }

      const pendingCount = Array.isArray(pendingActions) ? pendingActions.length : 0;
      // Count visits that are completed but might need review
      const visitsCount = Array.isArray(visits)
        ? visits.filter((v: any) => v.processingStatus === 'completed').length
        : 0;
      // Use pending actions as primary badge indicator, fallback to visits
      await setBadgeCount(Math.max(pendingCount, visitsCount > 0 ? 1 : 0));
    };

    updateBadge();
  }, [isAuthenticated, pendingActions, visits]);

  // Handle notification received while app is foregrounded
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Notifications] Notification received:', notification);
      // Badge will be updated by the useEffect above when data refetches
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
    };
  }, []);

  // Handle notification tapped (deep linking)
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('[Notifications] Notification tapped:', data);

      if (data?.type === 'visit-ready' && data?.visitId) {
        // Navigate to visit detail if authenticated
        if (isAuthenticated) {
          router.push(`/visit-detail?id=${data.visitId}`);
        }
      }
    });

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [isAuthenticated, router]);

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
                name="onboarding"
                options={{
                  headerShown: false,
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
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
