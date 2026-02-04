/**
 * ReminderTimePickerModal
 * 
 * Allows users to set medication reminder times.
 * Uses a pure JS time picker to avoid native module issues.
 */

import React, { useState, useCallback, useEffect } from 'react';
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
import { haptic } from '../lib/haptics';

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

// Compact time picker with preset options
function TimePicker({
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

    const handleHourChange = (newHour: number) => {
        void haptic.selection();
        let h = newHour;
        if (isPM && newHour !== 12) h = newHour + 12;
        else if (!isPM && newHour === 12) h = 0;
        onChange(`${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    };

    const handleMinuteChange = (newMinute: number) => {
        void haptic.selection();
        onChange(`${hours.toString().padStart(2, '0')}:${newMinute.toString().padStart(2, '0')}`);
    };

    const togglePeriod = () => {
        void haptic.selection();
        const newPeriod = isPM ? 'AM' : 'PM';
        let h = displayHour;
        if (newPeriod === 'PM' && displayHour !== 12) h = displayHour + 12;
        else if (newPeriod === 'AM' && displayHour === 12) h = 0;
        else if (newPeriod === 'AM') h = displayHour;
        onChange(`${h.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    };

    return (
        <View style={pickerStyles.container}>
            <View style={pickerStyles.row}>
                {/* Hours */}
                <View style={pickerStyles.section}>
                    <Text style={pickerStyles.label}>Hour</Text>
                    <View style={pickerStyles.optionsGrid}>
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
                    </View>
                </View>

                {/* Minutes */}
                <View style={pickerStyles.section}>
                    <Text style={pickerStyles.label}>Minutes</Text>
                    <View style={pickerStyles.optionsRow}>
                        {minuteOptions.map(m => (
                            <Pressable
                                key={m}
                                style={[pickerStyles.option, minutes === m && pickerStyles.optionSelected]}
                                onPress={() => handleMinuteChange(m)}
                            >
                                <Text style={[pickerStyles.optionText, minutes === m && pickerStyles.optionTextSelected]}>
                                    :{m.toString().padStart(2, '0')}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </View>

                {/* AM/PM Toggle */}
                <View style={pickerStyles.section}>
                    <Text style={pickerStyles.label}>Period</Text>
                    <Pressable style={pickerStyles.periodToggle} onPress={togglePeriod}>
                        <View style={[pickerStyles.periodOption, !isPM && pickerStyles.periodActive]}>
                            <Text style={[pickerStyles.periodText, !isPM && pickerStyles.periodTextActive]}>AM</Text>
                        </View>
                        <View style={[pickerStyles.periodOption, isPM && pickerStyles.periodActive]}>
                            <Text style={[pickerStyles.periodText, isPM && pickerStyles.periodTextActive]}>PM</Text>
                        </View>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const pickerStyles = StyleSheet.create({
    container: {
        padding: spacing(3),
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    row: {
        gap: spacing(4),
    },
    section: {
        gap: spacing(2),
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing(1.5),
    },
    optionsRow: {
        flexDirection: 'row',
        gap: spacing(2),
    },
    option: {
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(3),
        borderRadius: Radius.sm,
        backgroundColor: Colors.background,
        minWidth: 44,
        alignItems: 'center',
    },
    optionSelected: {
        backgroundColor: Colors.primary,
    },
    optionText: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    optionTextSelected: {
        color: '#FFFFFF',
    },
    periodToggle: {
        flexDirection: 'row',
        backgroundColor: Colors.background,
        borderRadius: Radius.sm,
        padding: 2,
    },
    periodOption: {
        paddingVertical: spacing(2),
        paddingHorizontal: spacing(4),
        borderRadius: Radius.sm - 2,
    },
    periodActive: {
        backgroundColor: Colors.primary,
    },
    periodText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    periodTextActive: {
        color: '#FFFFFF',
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
        void haptic.selection();
        const lastTime = times[times.length - 1] || '08:00';
        const [hours] = lastTime.split(':').map(Number);
        const newHours = (hours + 12) % 24;
        const newTime = `${newHours.toString().padStart(2, '0')}:00`;
        setTimes([...times, newTime]);
        setEditingIndex(times.length); // Auto-expand new time
    }, [times]);

    const handleRemoveTime = useCallback((index: number) => {
        if (times.length <= 1) return;
        void haptic.warning();
        setTimes(times.filter((_, i) => i !== index));
        if (editingIndex === index) setEditingIndex(null);
    }, [times, editingIndex]);

    const handleTimePress = useCallback((index: number) => {
        void haptic.selection();
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
        void haptic.success();
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
                        <Pressable
                            onPress={() => {
                                void haptic.light();
                                onCancel();
                            }}
                            style={styles.headerButton}
                        >
                            <Ionicons name="close" size={24} color={Colors.textMuted} />
                        </Pressable>
                        <View style={styles.headerCenter}>
                            <Text style={styles.title}>Set Reminder</Text>
                            <Text style={styles.subtitle} numberOfLines={1}>{medicationName}</Text>
                        </View>
                        <Pressable
                            onPress={handleSave}
                            style={[styles.headerButton, styles.saveButton]}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={styles.saveText}>Save</Text>
                            )}
                        </Pressable>
                    </View>

                    <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        {/* Time slots */}
                        <View style={styles.timesContainer}>
                            {times.map((time, index) => (
                                <View key={index} style={styles.timeSlot}>
                                    <Pressable
                                        style={[
                                            styles.timeButton,
                                            editingIndex === index && styles.timeButtonActive
                                        ]}
                                        onPress={() => handleTimePress(index)}
                                    >
                                        <View style={styles.timeIcon}>
                                            <Ionicons name="notifications" size={20} color={Colors.primary} />
                                        </View>
                                        <View style={styles.timeInfo}>
                                            <Text style={styles.timeLabel}>Reminder {index + 1}</Text>
                                            <Text style={styles.timeText}>{formatTimeDisplay(time)}</Text>
                                        </View>
                                        <Ionicons
                                            name={editingIndex === index ? "chevron-up" : "chevron-down"}
                                            size={20}
                                            color={Colors.textMuted}
                                        />
                                        {times.length > 1 && (
                                            <Pressable
                                                style={styles.removeButton}
                                                onPress={() => handleRemoveTime(index)}
                                                hitSlop={8}
                                            >
                                                <Ionicons name="trash-outline" size={18} color={Colors.error} />
                                            </Pressable>
                                        )}
                                    </Pressable>

                                    {/* Inline time picker when editing this slot */}
                                    {editingIndex === index && (
                                        <View style={styles.inlinePicker}>
                                            <TimePicker
                                                value={time}
                                                onChange={handleTimeChange}
                                            />
                                        </View>
                                    )}
                                </View>
                            ))}

                            {times.length < 4 && (
                                <Pressable style={styles.addButton} onPress={handleAddTime}>
                                    <View style={styles.addIcon}>
                                        <Ionicons name="add" size={20} color={Colors.primary} />
                                    </View>
                                    <Text style={styles.addButtonText}>Add another reminder</Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Minimal disclaimer */}
                        <View style={styles.footer}>
                            <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
                            <Text style={styles.footerText}>
                                Reminders are for convenience only. Always follow your provider's instructions.
                            </Text>
                        </View>
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
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
        maxHeight: '85%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(3),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.border,
    },
    headerButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: spacing(2),
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        color: Colors.text,
    },
    subtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 2,
    },
    saveButton: {
        backgroundColor: Colors.primary,
        paddingHorizontal: spacing(4),
        width: 'auto',
    },
    saveText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    scrollContent: {
        maxHeight: 500,
    },
    timesContainer: {
        padding: spacing(4),
        gap: spacing(3),
    },
    timeSlot: {
        gap: spacing(2),
    },
    timeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        padding: spacing(3),
        borderRadius: Radius.md,
        gap: spacing(3),
    },
    timeButtonActive: {
        backgroundColor: 'rgba(64,201,208,0.1)',
        borderWidth: 1,
        borderColor: Colors.primary,
    },
    timeIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(64,201,208,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeInfo: {
        flex: 1,
    },
    timeLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        marginBottom: 2,
    },
    timeText: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    removeButton: {
        padding: spacing(2),
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
        paddingVertical: spacing(3),
        borderWidth: 1,
        borderColor: Colors.border,
        borderStyle: 'dashed',
        borderRadius: Radius.md,
    },
    addIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(64,201,208,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonText: {
        fontSize: 15,
        fontWeight: '500',
        color: Colors.primary,
    },
    inlinePicker: {
        marginTop: spacing(1),
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing(2),
        paddingHorizontal: spacing(5),
        paddingVertical: spacing(4),
        marginTop: spacing(2),
    },
    footerText: {
        flex: 1,
        fontSize: 12,
        color: Colors.textMuted,
        lineHeight: 16,
    },
});
