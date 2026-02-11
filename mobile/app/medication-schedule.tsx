import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
    Alert,
    Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useMedicationSchedule, useMarkDose, useMarkBatch, useSnoozeDose, type ScheduledDose } from '../lib/api/hooks';
import { ErrorBoundary } from '../components/ErrorBoundary';

export default function MedicationScheduleScreen() {
    const router = useRouter();
    const { isAuthenticated, user } = useAuth();

    // Snooze modal state
    const [snoozeModalVisible, setSnoozeModalVisible] = useState(false);
    const [snoozeDose, setSnoozeDose] = useState<ScheduledDose | null>(null);

    const {
        data: schedule,
        isLoading,
        isRefetching,
        refetch,
        error,
    } = useMedicationSchedule(user?.uid, { enabled: isAuthenticated });

    const markDose = useMarkDose();
    const markBatch = useMarkBatch();
    const snooze = useSnoozeDose();

    // Group doses by time period
    const groupedDoses = useMemo(() => {
        if (!schedule?.scheduledDoses) return { morning: [], afternoon: [], evening: [] };

        const morning: ScheduledDose[] = [];
        const afternoon: ScheduledDose[] = [];
        const evening: ScheduledDose[] = [];

        schedule.scheduledDoses.forEach(dose => {
            const hour = parseInt(dose.scheduledTime.split(':')[0], 10);
            if (hour < 12) {
                morning.push(dose);
            } else if (hour < 17) {
                afternoon.push(dose);
            } else {
                evening.push(dose);
            }
        });

        return { morning, afternoon, evening };
    }, [schedule?.scheduledDoses]);

    const handleMarkDose = async (dose: ScheduledDose, action: 'taken' | 'skipped') => {
        try {
            await markDose.mutateAsync({
                medicationId: dose.medicationId,
                scheduledTime: dose.scheduledTime,
                action,
            });
        } catch (err) {
            Alert.alert('Error', 'Failed to mark dose. Please try again.');
        }
    };

    const handleMarkAll = async (doses: ScheduledDose[], action: 'taken' | 'skipped') => {
        const pendingDoses = doses.filter(d => d.status === 'pending');
        if (pendingDoses.length === 0) return;

        try {
            await markBatch.mutateAsync({
                doses: pendingDoses.map(d => ({
                    medicationId: d.medicationId,
                    scheduledTime: d.scheduledTime,
                })),
                action,
            });
        } catch (err) {
            Alert.alert('Error', 'Failed to mark doses. Please try again.');
        }
    };

    const handleSnooze = async (minutes: '15' | '30' | '60') => {
        if (!snoozeDose) return;
        try {
            await snooze.mutateAsync({
                medicationId: snoozeDose.medicationId,
                scheduledTime: snoozeDose.scheduledTime,
                snoozeMinutes: minutes,
            });
            setSnoozeModalVisible(false);
            setSnoozeDose(null);
        } catch (err) {
            Alert.alert('Error', 'Failed to snooze dose. Please try again.');
        }
    };

    const openSnoozeModal = (dose: ScheduledDose) => {
        setSnoozeDose(dose);
        setSnoozeModalVisible(true);
    };

    const formatTime = (time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        const period = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    };

    const renderDoseItem = (dose: ScheduledDose, isLast: boolean) => {
        const isPending = dose.status === 'pending';
        const isOverdue = dose.status === 'overdue';
        const isTaken = dose.status === 'taken';
        const isSkipped = dose.status === 'skipped';

        return (
            <View
                key={`${dose.medicationId}-${dose.scheduledTime}`}
                style={[styles.doseItem, !isLast && styles.doseItemBorder]}
            >
                <View style={styles.doseInfo}>
                    <View style={[
                        styles.statusIcon,
                        isTaken && styles.statusTaken,
                        isSkipped && styles.statusSkipped,
                        isOverdue && styles.statusOverdue,
                        isPending && styles.statusPending,
                    ]}>
                        {isTaken && <Ionicons name="checkmark" size={16} color="#fff" />}
                        {isSkipped && <Ionicons name="close" size={16} color="#fff" />}
                        {isOverdue && <Ionicons name="alert" size={16} color="#fff" />}
                        {isPending && <Ionicons name="time-outline" size={16} color={Colors.textMuted} />}
                    </View>
                    <View style={styles.doseDetails}>
                        <Text style={styles.doseName}>{dose.name}</Text>
                        {dose.dose && <Text style={styles.doseDosage}>{dose.dose}</Text>}
                        {isOverdue && <Text style={styles.overdueText}>Overdue</Text>}
                    </View>
                    <Text style={styles.doseTime}>{formatTime(dose.scheduledTime)}</Text>
                </View>

                {(isPending || isOverdue) && (
                    <View style={styles.doseActions}>
                        <Pressable
                            style={[styles.actionButton, styles.takenButton]}
                            onPress={() => handleMarkDose(dose, 'taken')}
                            disabled={markDose.isPending}
                        >
                            <Ionicons name="checkmark" size={16} color={Colors.success} />
                            <Text style={[styles.actionText, { color: Colors.success }]}>Taken</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.actionButton, styles.snoozeButton]}
                            onPress={() => openSnoozeModal(dose)}
                            disabled={markDose.isPending}
                        >
                            <Ionicons name="alarm-outline" size={16} color={Colors.warning} />
                            <Text style={[styles.actionText, { color: Colors.warning }]}>Snooze</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.actionButton, styles.skippedButton]}
                            onPress={() => handleMarkDose(dose, 'skipped')}
                            disabled={markDose.isPending}
                        >
                            <Ionicons name="close" size={16} color={Colors.error} />
                            <Text style={[styles.actionText, { color: Colors.error }]}>Skip</Text>
                        </Pressable>
                    </View>
                )}
            </View>
        );
    };

    const renderSection = (title: string, icon: string, doses: ScheduledDose[]) => {
        if (doses.length === 0) return null;

        const pendingCount = doses.filter(d => d.status === 'pending' || d.status === 'overdue').length;
        const showMarkAll = pendingCount > 1;

        return (
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                        <Ionicons name={icon as any} size={18} color={Colors.textMuted} />
                        <Text style={styles.sectionTitle}>{title}</Text>
                        <Text style={styles.sectionCount}>({doses.length})</Text>
                    </View>
                    {showMarkAll && (
                        <Pressable
                            style={styles.markAllButton}
                            onPress={() => handleMarkAll(doses, 'taken')}
                            disabled={markBatch.isPending}
                        >
                            <Ionicons name="checkmark-done" size={16} color={Colors.success} />
                            <Text style={styles.markAllText}>Mark All</Text>
                        </Pressable>
                    )}
                </View>
                <Card style={styles.sectionCard}>
                    {doses.map((dose, index) => renderDoseItem(dose, index === doses.length - 1))}
                </Card>
            </View>
        );
    };

    const summary = schedule?.summary;
    const hasDoses = summary && summary.total > 0;

    return (
        <ErrorBoundary title="Unable to load schedule">
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Pressable onPress={() => {
                            // Handle back navigation from widget deep link (cold start has no back stack)
                            if (router.canGoBack()) {
                                router.back();
                            } else {
                                // No back stack = came from widget, navigate to home
                                router.replace('/');
                            }
                        }} style={styles.backButton}>
                            <Ionicons name="chevron-back" size={28} color={Colors.text} />
                        </Pressable>
                        <Text style={styles.headerTitle}>Today's Schedule</Text>
                        <View style={{ width: 28 }} />
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
                        }
                    >
                        {isLoading ? (
                            <View style={styles.centered}>
                                <ActivityIndicator size="large" color={Colors.primary} />
                                <Text style={styles.loadingText}>Loading schedule...</Text>
                            </View>
                        ) : error ? (
                            <View style={styles.centered}>
                                <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
                                <Text style={styles.errorText}>Unable to load schedule</Text>
                            </View>
                        ) : !hasDoses ? (
                            <View style={styles.centered}>
                                <Ionicons name="calendar-outline" size={48} color={Colors.textMuted} />
                                <Text style={styles.emptyTitle}>No medications scheduled</Text>
                                <Text style={styles.emptyText}>Set up reminders on your medications to see your daily schedule here.</Text>
                                <Pressable style={styles.setupButton} onPress={() => router.push('/medications')}>
                                    <Text style={styles.setupButtonText}>Set Up Reminders</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <>
                                {/* Summary */}
                                <Card style={styles.summaryCard}>
                                    <View style={styles.summaryRow}>
                                        <View style={styles.summaryItem}>
                                            <Text style={[styles.summaryNumber, { color: Colors.success }]}>{summary.taken}</Text>
                                            <Text style={styles.summaryLabel}>Taken</Text>
                                        </View>
                                        <View style={styles.summaryDivider} />
                                        <View style={styles.summaryItem}>
                                            <Text style={[styles.summaryNumber, { color: Colors.primary }]}>{summary.pending}</Text>
                                            <Text style={styles.summaryLabel}>Pending</Text>
                                        </View>
                                        <View style={styles.summaryDivider} />
                                        <View style={styles.summaryItem}>
                                            <Text style={[styles.summaryNumber, { color: Colors.error }]}>{summary.skipped}</Text>
                                            <Text style={styles.summaryLabel}>Skipped</Text>
                                        </View>
                                    </View>
                                </Card>

                                {renderSection('Morning', 'sunny-outline', groupedDoses.morning)}
                                {renderSection('Afternoon', 'partly-sunny-outline', groupedDoses.afternoon)}
                                {renderSection('Evening', 'moon-outline', groupedDoses.evening)}
                            </>
                        )}
                    </ScrollView>
                </View>

                {/* Snooze Modal */}
                <Modal
                    visible={snoozeModalVisible}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setSnoozeModalVisible(false)}
                >
                    <Pressable style={styles.modalOverlay} onPress={() => setSnoozeModalVisible(false)}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Snooze Reminder</Text>
                            <Text style={styles.modalSubtitle}>
                                {snoozeDose?.name} - {snoozeDose?.scheduledTime && formatTime(snoozeDose.scheduledTime)}
                            </Text>

                            <View style={styles.snoozeOptions}>
                                <Pressable
                                    style={styles.snoozeOption}
                                    onPress={() => handleSnooze('15')}
                                >
                                    <Ionicons name="alarm-outline" size={24} color={Colors.primary} />
                                    <Text style={styles.snoozeOptionText}>15 min</Text>
                                </Pressable>
                                <Pressable
                                    style={styles.snoozeOption}
                                    onPress={() => handleSnooze('30')}
                                >
                                    <Ionicons name="alarm-outline" size={24} color={Colors.primary} />
                                    <Text style={styles.snoozeOptionText}>30 min</Text>
                                </Pressable>
                                <Pressable
                                    style={styles.snoozeOption}
                                    onPress={() => handleSnooze('60')}
                                >
                                    <Ionicons name="alarm-outline" size={24} color={Colors.primary} />
                                    <Text style={styles.snoozeOptionText}>1 hour</Text>
                                </Pressable>
                            </View>

                            <Pressable
                                style={styles.cancelButton}
                                onPress={() => setSnoozeModalVisible(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </Pressable>
                        </View>
                    </Pressable>
                </Modal>
            </SafeAreaView>
        </ErrorBoundary>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    container: {
        flex: 1,
        paddingHorizontal: spacing(5),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(4),
    },
    backButton: {
        padding: spacing(1),
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: Colors.text,
    },
    centered: {
        alignItems: 'center',
        paddingVertical: spacing(12),
        gap: spacing(3),
    },
    loadingText: {
        fontSize: 15,
        color: Colors.textMuted,
    },
    errorText: {
        fontSize: 16,
        color: Colors.error,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: Colors.text,
    },
    emptyText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        paddingHorizontal: spacing(6),
    },
    setupButton: {
        marginTop: spacing(3),
        paddingHorizontal: spacing(5),
        paddingVertical: spacing(3),
        backgroundColor: Colors.primary,
        borderRadius: Radius.md,
    },
    setupButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    summaryCard: {
        marginBottom: spacing(4),
        padding: spacing(4),
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    summaryItem: {
        alignItems: 'center',
    },
    summaryNumber: {
        fontSize: 28,
        fontWeight: '700',
    },
    summaryLabel: {
        fontSize: 13,
        color: Colors.textMuted,
        marginTop: spacing(1),
    },
    summaryDivider: {
        width: 1,
        height: 40,
        backgroundColor: Colors.border,
    },
    section: {
        marginBottom: spacing(4),
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing(2),
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    sectionCount: {
        fontSize: 13,
        color: Colors.textMuted,
    },
    markAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1),
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1.5),
        backgroundColor: 'rgba(52,211,153,0.12)',
        borderRadius: Radius.sm,
    },
    markAllText: {
        fontSize: 13,
        fontWeight: '600',
        color: Colors.success,
    },
    sectionCard: {
        padding: spacing(3),
    },
    doseItem: {
        paddingVertical: spacing(3),
    },
    doseItemBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: Colors.border,
    },
    doseInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing(3),
    },
    statusTaken: {
        backgroundColor: Colors.success,
    },
    statusSkipped: {
        backgroundColor: Colors.error,
    },
    statusOverdue: {
        backgroundColor: Colors.error,
    },
    statusPending: {
        backgroundColor: 'rgba(100,116,139,0.15)',
    },
    doseDetails: {
        flex: 1,
    },
    doseName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    doseDosage: {
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 2,
    },
    overdueText: {
        fontSize: 12,
        color: Colors.error,
        fontWeight: '600',
        marginTop: 2,
    },
    doseTime: {
        fontSize: 14,
        fontWeight: '500',
        color: Colors.textMuted,
    },
    doseActions: {
        flexDirection: 'row',
        gap: spacing(2),
        marginTop: spacing(3),
        paddingLeft: spacing(8),
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(2),
        borderRadius: Radius.sm,
        gap: spacing(1),
    },
    takenButton: {
        backgroundColor: 'rgba(52,211,153,0.12)',
    },
    snoozeButton: {
        backgroundColor: 'rgba(251,191,36,0.12)',
    },
    skippedButton: {
        backgroundColor: 'rgba(248,113,113,0.12)',
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing(6),
    },
    modalContent: {
        backgroundColor: Colors.background,
        borderRadius: Radius.lg,
        padding: spacing(5),
        width: '100%',
        maxWidth: 320,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text,
        textAlign: 'center',
        marginBottom: spacing(1),
    },
    modalSubtitle: {
        fontSize: 15,
        color: Colors.textMuted,
        textAlign: 'center',
        marginBottom: spacing(4),
    },
    snoozeOptions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: spacing(4),
    },
    snoozeOption: {
        alignItems: 'center',
        padding: spacing(3),
        borderRadius: Radius.md,
        backgroundColor: 'rgba(64,201,208,0.1)',
        minWidth: 80,
    },
    snoozeOptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
        marginTop: spacing(1),
    },
    cancelButton: {
        paddingVertical: spacing(3),
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.textMuted,
    },
});
