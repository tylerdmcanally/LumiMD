/**
 * ReminderTimePickerModal
 * 
 * Allows users to set medication reminder times.
 * Uses a pure JS time picker to avoid native module issues.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
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

// Time picker wheel component
function TimePickerWheel({
    value,
    onChange
}: {
    value: string;
    onChange: (time: string) => void;
}) {
    const [hours, minutes] = value.split(':').map(Number);
    const isPM = hours >= 12;
    const displayHour = hours % 12 || 12;

    const hourOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const minuteOptions = [0, 15, 30, 45];
    const periodOptions = ['AM', 'PM'];

    const handleHourChange = (newHour: number) => {
        let h = newHour;
        if (isPM && newHour !== 12) h = newHour + 12;
        else if (!isPM && newHour === 12) h = 0;
        onChange(`${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    };

    const handleMinuteChange = (newMinute: number) => {
        onChange(`${hours.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`);
    };

    const handlePeriodChange = (newPeriod: string) => {
        let h = displayHour;
        if (newPeriod === 'PM' && displayHour !== 12) h = displayHour + 12;
        else if (newPeriod === 'AM' && displayHour === 12) h = 0;
        else if (newPeriod === 'AM') h = displayHour;
        onChange(`${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    };

    return (
        <View style={pickerStyles.container}>
            {/* Hour */}
            <View style={pickerStyles.column}>
                <Text style={pickerStyles.columnLabel}>Hour</Text>
                <ScrollView style={pickerStyles.scrollColumn} showsVerticalScrollIndicator={false}>
                    {hourOptions.map(h => (
                        <Pressable
                            key={h}
                            style={[pickerStyles.option, displayHour === h && pickerStyles.optionSelected]}
                            onPress={() => handleHourChange(h)}
                        >
                            <Text style={[pickerStyles.optionText, displayHour === h && pickerStyles.optionTextSelected]}>
                                {h}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>
            </View>

            {/* Separator */}
            <Text style={pickerStyles.separator}>:</Text>

            {/* Minute */}
            <View style={pickerStyles.column}>
                <Text style={pickerStyles.columnLabel}>Min</Text>
                <ScrollView style={pickerStyles.scrollColumn} showsVerticalScrollIndicator={false}>
                    {minuteOptions.map(m => (
                        <Pressable
                            key={m}
                            style={[pickerStyles.option, minutes === m && pickerStyles.optionSelected]}
                            onPress={() => handleMinuteChange(m)}
                        >
                            <Text style={[pickerStyles.optionText, minutes === m && pickerStyles.optionTextSelected]}>
                                {m.toString().padStart(2, '0')}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>
            </View>

            {/* AM/PM */}
            <View style={pickerStyles.column}>
                <Text style={pickerStyles.columnLabel}></Text>
                <View style={pickerStyles.periodColumn}>
                    {periodOptions.map(p => (
                        <Pressable
                            key={p}
                            style={[pickerStyles.periodOption, (isPM ? 'PM' : 'AM') === p && pickerStyles.optionSelected]}
                            onPress={() => handlePeriodChange(p)}
                        >
                            <Text style={[pickerStyles.optionText, (isPM ? 'PM' : 'AM') === p && pickerStyles.optionTextSelected]}>
                                {p}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>
        </View>
    );
}

const pickerStyles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingVertical: spacing(5),
        paddingHorizontal: spacing(3),
        gap: spacing(4),
    },
    column: {
        alignItems: 'center',
        minWidth: 70,
    },
    columnLabel: {
        fontSize: 11,
        color: Colors.primary,
        marginBottom: spacing(2),
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    scrollColumn: {
        maxHeight: 200,
    },
    periodColumn: {
        gap: spacing(2),
    },
    option: {
        paddingVertical: spacing(3),
        paddingHorizontal: spacing(4),
        borderRadius: Radius.md,
        marginVertical: spacing(1),
        backgroundColor: Colors.background,
        borderWidth: 2,
        borderColor: 'transparent',
        minWidth: 60,
        alignItems: 'center',
    },
    optionSelected: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    periodOption: {
        paddingVertical: spacing(3),
        paddingHorizontal: spacing(4),
        borderRadius: Radius.md,
        backgroundColor: Colors.background,
        borderWidth: 2,
        borderColor: 'transparent',
        minWidth: 60,
        alignItems: 'center',
    },
    optionText: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    optionTextSelected: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    separator: {
        fontSize: 28,
        fontWeight: '700',
        color: Colors.primary,
        marginTop: spacing(7),
    },
});

export function ReminderTimePickerModal({
    visible,
    medicationName,
    existingTimes = [],
    onSave,
    onCancel,
    isLoading = false,
}: ReminderTimePickerModalProps) {
    const [times, setTimes] = useState<string[]>(['08:00']);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Reset state when modal opens
    useEffect(() => {
        if (visible) {
            setTimes(existingTimes.length > 0 ? [...existingTimes] : ['08:00']);
            setEditingIndex(null);
        }
    }, [visible, existingTimes]);

    const handleAddTime = useCallback(() => {
        const lastTime = times[times.length - 1] || '08:00';
        const [hours] = lastTime.split(':').map(Number);
        const newHours = (hours + 12) % 24;
        const newTime = `${newHours.toString().padStart(2, '0')}:00`;
        setTimes([...times, newTime]);
    }, [times]);

    const handleRemoveTime = useCallback((index: number) => {
        if (times.length <= 1) return;
        setTimes(times.filter((_, i) => i !== index));
        if (editingIndex === index) setEditingIndex(null);
    }, [times, editingIndex]);

    const handleTimePress = useCallback((index: number) => {
        setEditingIndex(editingIndex === index ? null : index);
    }, [editingIndex]);

    const handleTimeChange = useCallback((newTime: string) => {
        if (editingIndex === null) return;
        const newTimes = [...times];
        newTimes[editingIndex] = newTime;
        newTimes.sort((a, b) => {
            const [aH, aM] = a.split(':').map(Number);
            const [bH, bM] = b.split(':').map(Number);
            return (aH * 60 + aM) - (bH * 60 + bM);
        });
        setTimes(newTimes);
    }, [times, editingIndex]);

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

                    <ScrollView style={styles.scrollContent}>
                        {/* Time slots */}
                        <View style={styles.timesContainer}>
                            <Text style={styles.sectionLabel}>Reminder Times</Text>

                            {times.map((time, index) => (
                                <View key={index}>
                                    <View style={styles.timeRow}>
                                        <Pressable
                                            style={[
                                                styles.timeButton,
                                                editingIndex === index && styles.timeButtonActive
                                            ]}
                                            onPress={() => handleTimePress(index)}
                                        >
                                            <Ionicons name="alarm-outline" size={20} color={Colors.primary} />
                                            <Text style={styles.timeText}>{formatTimeDisplay(time)}</Text>
                                            <Ionicons
                                                name={editingIndex === index ? "chevron-up" : "chevron-down"}
                                                size={18}
                                                color={Colors.primary}
                                            />
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

                                    {/* Inline time picker when editing this slot */}
                                    {editingIndex === index && (
                                        <View style={styles.inlinePicker}>
                                            <TimePickerWheel
                                                value={time}
                                                onChange={handleTimeChange}
                                            />
                                        </View>
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
                            Tap a time to change it. You'll receive a push notification at each time.
                        </Text>
                        <Text style={styles.disclaimerText}>
                            ⚠️ Reminders are for convenience only and are not a substitute for medical advice.
                            Always follow your healthcare provider's instructions.
                        </Text>
                    </ScrollView>
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
        paddingVertical: spacing(4),
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
    doneButton: {
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(4),
        backgroundColor: Colors.accent,
        borderRadius: Radius.md,
    },
    doneText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.primary,
    },
    picker: {
        height: 200,
        backgroundColor: Colors.surface,
    },
    timeButtonActive: {
        borderWidth: 2,
        borderColor: Colors.primary,
    },
    tapToEdit: {
        fontSize: 12,
        color: Colors.textMuted,
        fontStyle: 'italic',
    },
    scrollContent: {
        maxHeight: 500,
    },
    inlinePicker: {
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        marginBottom: spacing(3),
        marginTop: spacing(2),
        borderWidth: 1,
        borderColor: Colors.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    disclaimerText: {
        fontSize: 12,
        color: Colors.textMuted,
        lineHeight: 18,
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(3),
        textAlign: 'center',
        backgroundColor: Colors.accent,
        marginTop: spacing(3),
        borderRadius: Radius.md,
        marginHorizontal: spacing(4),
    },
});
