import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaView, View, Text, StyleSheet, Pressable } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { navTheme } from '../theme';
import { AuthProvider } from '../contexts/AuthContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Colors, spacing } from '../components/ui';

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
