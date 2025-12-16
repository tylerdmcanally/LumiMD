/**
 * Onboarding Flow - Main Container
 * 4-screen wizard: Welcome → Profile → Health → Complete
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, spacing } from '../../components/ui';
import { useUpdateUserProfile } from '../../lib/api/mutations';
import { WelcomeStep } from '../../components/onboarding/WelcomeStep';
import { ProfileStep } from '../../components/onboarding/ProfileStep';
import { HealthStep } from '../../components/onboarding/HealthStep';
import { CompletionStep } from '../../components/onboarding/CompletionStep';


export type OnboardingData = {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    allergies: string[];
    medicalHistory: string[];
    noAllergies: boolean;
    noMedicalHistory: boolean;
};

const initialData: OnboardingData = {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    allergies: [],
    medicalHistory: [],
    noAllergies: false,
    noMedicalHistory: false,
};

export default function OnboardingScreen() {
    const router = useRouter();
    const updateProfile = useUpdateUserProfile();
    const [currentStep, setCurrentStep] = useState(0);
    const [data, setData] = useState<OnboardingData>(initialData);
    const [saving, setSaving] = useState(false);

    const updateData = useCallback((updates: Partial<OnboardingData>) => {
        setData(prev => ({ ...prev, ...updates }));
    }, []);

    const handleNext = useCallback(() => {
        if (currentStep < 3) {
            setCurrentStep(prev => prev + 1);
        }
    }, [currentStep]);

    const handleSkip = useCallback(() => {
        // Skip health step - go directly to completion
        setCurrentStep(3);
    }, []);

    const handleComplete = useCallback(async () => {
        setSaving(true);
        try {
            await updateProfile.mutateAsync({
                firstName: data.firstName.trim(),
                lastName: data.lastName.trim(),
                dateOfBirth: data.dateOfBirth.trim(),
                allergies: data.noAllergies ? [] : data.allergies,
                medicalHistory: data.noMedicalHistory ? [] : data.medicalHistory,
                complete: true,
            });
            // Small delay to allow query invalidation to complete
            await new Promise(resolve => setTimeout(resolve, 500));
            router.replace('/');
        } catch (error) {
            console.error('[Onboarding] Failed to save profile:', error);
            router.replace('/');
        } finally {
            setSaving(false);
        }
    }, [data, updateProfile, router]);


    const handleRecordFirst = useCallback(async () => {
        await handleComplete();
        // After completing, navigate to record-visit
        setTimeout(() => router.push('/record-visit'), 100);
    }, [handleComplete, router]);

    const handleBack = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return <WelcomeStep onNext={handleNext} />;
            case 1:
                return (
                    <ProfileStep
                        data={data}
                        onUpdate={updateData}
                        onNext={handleNext}
                        onBack={handleBack}
                    />
                );
            case 2:
                return (
                    <HealthStep
                        data={data}
                        onUpdate={updateData}
                        onNext={handleNext}
                        onSkip={handleSkip}
                        onBack={handleBack}
                    />
                );
            case 3:
                return (
                    <CompletionStep
                        onRecordFirst={handleRecordFirst}
                        onExplore={handleComplete}
                        saving={saving}
                        onBack={handleBack}
                    />
                );
            default:
                return null;
        }
    };


    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                {renderStep()}
            </View>

            {/* Progress Dots */}
            <View style={styles.progressContainer}>
                {[0, 1, 2, 3].map(step => (
                    <View
                        key={step}
                        style={[
                            styles.dot,
                            currentStep === step && styles.dotActive,
                            currentStep > step && styles.dotComplete,
                        ]}
                    />
                ))}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        flex: 1,
    },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: spacing(6),
        gap: spacing(2),
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: Colors.stroke,
    },
    dotActive: {
        backgroundColor: Colors.primary,
        width: 24,
    },
    dotComplete: {
        backgroundColor: Colors.primary,
    },
});
