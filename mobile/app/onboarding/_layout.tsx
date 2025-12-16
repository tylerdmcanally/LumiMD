/**
 * Onboarding Layout
 * Simple stack layout for the onboarding flow
 */

import { Stack } from 'expo-router';

export default function OnboardingLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
        </Stack>
    );
}
