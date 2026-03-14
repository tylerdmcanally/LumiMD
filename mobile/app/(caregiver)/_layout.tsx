import { Stack, Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../components/ui';

export default function CaregiverLayout() {
  const { role, roleLoading, isAuthenticated } = useAuth();

  if (roleLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/sign-in" />;
  }

  if (role !== 'caregiver') {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="patient/[patientId]" />
    </Stack>
  );
}
