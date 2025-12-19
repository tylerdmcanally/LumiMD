/**
 * ReminderTimePickerModal
 * 
 * Allows users to set medication reminder times.
 */

import React, { useState, useCallback } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    Platform,
    ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';

interface ReminderTimePickerModalProps {
    visible: boolean;
    medicationName: string;
    existingTimes?: string[]; // HH:MM format
    onSave: (times: string[]) => void;
    onCancel: () => void;
    isLoading?: boolean;
}

function formatTimeDisplay(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function dateToTimeString(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function timeStringToDate(time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
}

export function ReminderTimePickerModal({
    visible,
    medicationName,
    existingTimes = [],
    onSave,
    onCancel,
    isLoading = false,
}: ReminderTimePickerModalProps) {
    const [times, setTimes] = useState<string[]>(existingTimes.length > 0 ? existingTimes : ['08:00']);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [showPicker, setShowPicker] = useState(false);

    const handleAddTime = useCallback(() => {
        // Add a new time 12 hours after the last one
        const lastTime = times[times.length - 1] || '08:00';
        const [hours] = lastTime.split(':').map(Number);
        const newHours = (hours + 12) % 24;
        const newTime = `${newHours.toString().padStart(2, '0')}:00`;
        setTimes([...times, newTime]);
    }, [times]);

    const handleRemoveTime = useCallback((index: number) => {
        if (times.length <= 1) return; // Keep at least one time
        setTimes(times.filter((_, i) => i !== index));
    }, [times]);

    const handleTimePress = useCallback((index: number) => {
        setEditingIndex(index);
        setShowPicker(true);
    }, []);

    const handleTimeChange = useCallback((_event: any, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowPicker(false);
        }

        if (selectedDate && editingIndex !== null) {
            const newTime = dateToTimeString(selectedDate);
            const newTimes = [...times];
            newTimes[editingIndex] = newTime;
            // Sort times chronologically
            newTimes.sort((a, b) => {
                const [aH, aM] = a.split(':').map(Number);
                const [bH, bM] = b.split(':').map(Number);
                return (aH * 60 + aM) - (bH * 60 + bM);
            });
            setTimes(newTimes);
        }
    }, [times, editingIndex]);

    const handleDone = useCallback(() => {
        setShowPicker(false);
        setEditingIndex(null);
    }, []);

    const handleSave = useCallback(() => {
        onSave(times);
    }, [times, onSave]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onCancel}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Pressable onPress={onCancel} style={styles.headerButton}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Text style={styles.title}>Set Reminder</Text>
                        <Pressable
                            onPress={handleSave}
                            style={styles.headerButton}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                                <Text style={styles.saveText}>Save</Text>
                            )}
                        </Pressable>
                    </View>

                    {/* Medication name */}
                    <View style={styles.medInfo}>
                        <Ionicons name="medkit" size={24} color={Colors.primary} />
                        <Text style={styles.medName}>{medicationName}</Text>
                    </View>

                    {/* Time slots */}
                    <View style={styles.timesContainer}>
                        <Text style={styles.sectionLabel}>Reminder Times</Text>

                        {times.map((time, index) => (
                            <View key={index} style={styles.timeRow}>
                                <Pressable
                                    style={styles.timeButton}
                                    onPress={() => handleTimePress(index)}
                                >
                                    <Ionicons name="alarm-outline" size={20} color={Colors.primary} />
                                    <Text style={styles.timeText}>{formatTimeDisplay(time)}</Text>
                                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                                </Pressable>

                                {times.length > 1 && (
                                    <Pressable
                                        style={styles.removeButton}
                                        onPress={() => handleRemoveTime(index)}
                                    >
                                        <Ionicons name="close-circle" size={24} color={Colors.error} />
                                    </Pressable>
                                )}
                            </View>
                        ))}

                        {times.length < 4 && (
                            <Pressable style={styles.addButton} onPress={handleAddTime}>
                                <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
                                <Text style={styles.addButtonText}>Add another time</Text>
                            </Pressable>
                        )}
                    </View>

                    {/* Info text */}
                    <Text style={styles.infoText}>
                        You'll receive a push notification at each time to remind you to take your medication.
                    </Text>

                    {/* Native time picker (iOS) */}
                    {showPicker && Platform.OS === 'ios' && editingIndex !== null && (
                        <View style={styles.pickerContainer}>
                            <View style={styles.pickerHeader}>
                                <Text style={styles.pickerTitle}>Select Time</Text>
                                <Pressable onPress={handleDone}>
                                    <Text style={styles.doneText}>Done</Text>
                                </Pressable>
                            </View>
                            <DateTimePicker
                                value={timeStringToDate(times[editingIndex])}
                                mode="time"
                                display="spinner"
                                onChange={handleTimeChange}
                                style={styles.picker}
                            />
                        </View>
                    )}

                    {/* Android time picker */}
                    {showPicker && Platform.OS === 'android' && editingIndex !== null && (
                        <DateTimePicker
                            value={timeStringToDate(times[editingIndex])}
                            mode="time"
                            display="default"
                            onChange={handleTimeChange}
                        />
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(4),
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerButton: {
        minWidth: 60,
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    cancelText: {
        fontSize: 16,
        color: Colors.textMuted,
    },
    saveText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.primary,
        textAlign: 'right',
    },
    medInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(3),
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(4),
        backgroundColor: Colors.accent,
    },
    medName: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    timesContainer: {
        padding: spacing(4),
    },
    sectionLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing(3),
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing(2),
    },
    timeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(3),
        backgroundColor: Colors.background,
        padding: spacing(4),
        borderRadius: Radius.md,
    },
    timeText: {
        flex: 1,
        fontSize: 18,
        fontWeight: '500',
        color: Colors.text,
    },
    removeButton: {
        padding: spacing(2),
        marginLeft: spacing(2),
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
        paddingVertical: spacing(3),
        marginTop: spacing(2),
    },
    addButtonText: {
        fontSize: 16,
        fontWeight: '500',
        color: Colors.primary,
    },
    infoText: {
        fontSize: 14,
        color: Colors.textMuted,
        lineHeight: 20,
        paddingHorizontal: spacing(4),
        textAlign: 'center',
    },
    pickerContainer: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    pickerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(3),
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    pickerTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: Colors.text,
    },
    doneText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.primary,
    },
    picker: {
        height: 200,
    },
});
