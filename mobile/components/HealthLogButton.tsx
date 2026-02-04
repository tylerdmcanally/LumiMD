import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    Pressable,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';
import { BPLogModal, GlucoseLogModal, WeightLogModal } from './lumibot';
import { api } from '../lib/api/client';
import { haptic } from '../lib/haptics';
import type { BloodPressureValue, GlucoseValue, AlertLevel } from '@lumimd/sdk';
import type { WeightValue } from './lumibot';

interface HealthLogButtonProps {
    onHistoryPress?: () => void;
}

/**
 * Compact health logging button that opens action sheet to log BP, glucose, weight.
 * Designed to be placed inline (e.g., in a section header).
 */
export function HealthLogButton({ onHistoryPress }: HealthLogButtonProps) {
    const [showBPModal, setShowBPModal] = useState(false);
    const [showGlucoseModal, setShowGlucoseModal] = useState(false);
    const [showWeightModal, setShowWeightModal] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handlePress = () => {
        void haptic.selection();
        // Toggle the menu
        setShowMenu(prev => !prev);
    };

    const handleMenuOption = (option: 'bp' | 'glucose' | 'weight') => {
        void haptic.light();
        setShowMenu(false);
        if (option === 'bp') {
            setShowBPModal(true);
        } else if (option === 'glucose') {
            setShowGlucoseModal(true);
        } else if (option === 'weight') {
            setShowWeightModal(true);
        }
    };


    // Handler for BP submission
    const handleBPSubmit = useCallback(async (value: BloodPressureValue): Promise<{
        alertLevel?: AlertLevel;
        alertMessage?: string;
        shouldShowAlert?: boolean;
    }> => {
        setIsSubmitting(true);
        try {
            const response = await api.healthLogs.create({
                type: 'bp',
                value: {
                    systolic: value.systolic,
                    diastolic: value.diastolic,
                    pulse: value.pulse,
                },
                source: 'manual',
            });

            Alert.alert('Success', 'Blood pressure logged successfully');
            void haptic.success();
            setShowBPModal(false);

            return {
                alertLevel: response.alertLevel,
                alertMessage: response.alertMessage,
                shouldShowAlert: response.shouldShowAlert,
            };
        } catch (error) {
            console.error('[HealthLogButton] Error logging BP:', error);
            Alert.alert('Error', 'Failed to log blood pressure. Please try again.');
            void haptic.error();
            return {};
        } finally {
            setIsSubmitting(false);
        }
    }, []);

    // Handler for Glucose submission  
    const handleGlucoseSubmit = useCallback(async (value: GlucoseValue): Promise<{
        alertLevel?: AlertLevel;
        alertMessage?: string;
        shouldShowAlert?: boolean;
    }> => {
        setIsSubmitting(true);
        try {
            const response = await api.healthLogs.create({
                type: 'glucose',
                value: {
                    reading: value.reading,
                    timing: value.timing,
                },
                source: 'manual',
            });

            Alert.alert('Success', 'Blood glucose logged successfully');
            void haptic.success();
            setShowGlucoseModal(false);

            return {
                alertLevel: response.alertLevel,
                alertMessage: response.alertMessage,
                shouldShowAlert: response.shouldShowAlert,
            };
        } catch (error) {
            console.error('[HealthLogButton] Error logging glucose:', error);
            Alert.alert('Error', 'Failed to log blood glucose. Please try again.');
            void haptic.error();
            return {};
        } finally {
            setIsSubmitting(false);
        }
    }, []);

    // Handler for Weight submission
    const handleWeightSubmit = useCallback(async (value: WeightValue): Promise<{
        alertLevel?: AlertLevel;
        alertMessage?: string;
        shouldShowAlert?: boolean;
    }> => {
        setIsSubmitting(true);
        try {
            await api.healthLogs.create({
                type: 'weight',
                value: {
                    weight: value.weight,
                    unit: value.unit,
                },
                source: 'manual',
            });

            Alert.alert('Success', 'Weight logged successfully');
            void haptic.success();
            setShowWeightModal(false);

            return {};
        } catch (error) {
            console.error('[HealthLogButton] Error logging weight:', error);
            Alert.alert('Error', 'Failed to log weight. Please try again.');
            void haptic.error();
            return {};
        } finally {
            setIsSubmitting(false);
        }
    }, []);

    return (
        <>
            {/* Inline Button */}
            <TouchableOpacity
                style={styles.button}
                onPress={handlePress}
                activeOpacity={0.7}
            >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.buttonText}>Log</Text>
            </TouchableOpacity>

            {/* BP Modal */}
            <BPLogModal
                visible={showBPModal}
                onClose={() => setShowBPModal(false)}
                onSubmit={handleBPSubmit}
                isSubmitting={isSubmitting}
            />

            {/* Glucose Modal */}
            <GlucoseLogModal
                visible={showGlucoseModal}
                onClose={() => setShowGlucoseModal(false)}
                onSubmit={handleGlucoseSubmit}
                isSubmitting={isSubmitting}
            />

            {/* Weight Modal */}
            <WeightLogModal
                visible={showWeightModal}
                onClose={() => setShowWeightModal(false)}
                onSubmit={handleWeightSubmit}
                isSubmitting={isSubmitting}
            />

            {/* Menu Modal */}
            <Modal
                visible={showMenu}
                transparent
                animationType="fade"
                onRequestClose={() => setShowMenu(false)}
            >
                <Pressable
                    style={styles.menuOverlay}
                    onPress={() => setShowMenu(false)}
                >
                    <View style={styles.menuContainer}>
                        <Text style={styles.menuTitle}>Log Reading</Text>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleMenuOption('bp')}
                        >
                            <Ionicons name="heart-outline" size={28} color={Colors.error} />
                            <Text style={styles.menuItemText}>Blood Pressure</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleMenuOption('glucose')}
                        >
                            <Ionicons name="water-outline" size={28} color={Colors.primary} />
                            <Text style={styles.menuItemText}>Blood Glucose</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleMenuOption('weight')}
                        >
                            <Ionicons name="scale-outline" size={28} color={Colors.success} />
                            <Text style={styles.menuItemText}>Weight</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.menuItem, styles.cancelItem]}
                            onPress={() => setShowMenu(false)}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingVertical: spacing(1.5),
        paddingHorizontal: spacing(3),
        borderRadius: 999,
        gap: spacing(1),
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '600',
    },
    // Menu styles
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuContainer: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        width: '80%',
        maxWidth: 320,
        paddingVertical: spacing(4),
    },
    menuTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
        textAlign: 'center',
        marginBottom: spacing(4),
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing(4),
        paddingHorizontal: spacing(5),
        gap: spacing(3),
    },
    menuItemText: {
        fontSize: 18,
        fontWeight: '500',
        color: Colors.text,
    },
    cancelItem: {
        marginTop: spacing(2),
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingTop: spacing(4),
        justifyContent: 'center',
    },
    cancelText: {
        fontSize: 16,
        color: Colors.textMuted,
        textAlign: 'center',
    },
});
