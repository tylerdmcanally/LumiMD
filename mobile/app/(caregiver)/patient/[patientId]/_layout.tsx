import { Stack } from 'expo-router';
import { Colors } from '../../../../components/ui';

export default function PatientDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="visits" />
      <Stack.Screen name="visit-detail" />
      <Stack.Screen name="medications" />
      <Stack.Screen name="actions" />
      <Stack.Screen name="messages" />
    </Stack>
  );
}
