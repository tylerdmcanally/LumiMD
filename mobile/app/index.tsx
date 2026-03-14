import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { Colors } from '../components/ui';

/**
 * Root role router — thin redirect component with no UI beyond a loading spinner.
 * Routes users to the correct experience based on their resolved role.
 */
export default function RoleRouter() {
  const router = useRouter();
  const { isAuthenticated, loading, role, roleLoading } = useAuth();

  useEffect(() => {
    if (loading || roleLoading) return;

    if (!isAuthenticated) {
      router.replace('/sign-in');
      return;
    }

    if (role === 'caregiver') {
      router.replace('/(caregiver)/');
    } else {
      // Default to patient (includes fallback when role is null)
      router.replace('/(patient)/');
    }
  }, [loading, roleLoading, isAuthenticated, role, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
