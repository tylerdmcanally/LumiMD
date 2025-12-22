/**
 * TodayDoseHistory
 * 
 * Collapsible card showing today's medication doses - did I take my AM dose?
 * Shows checks for taken, X for skipped, and pending for upcoming.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Colors, spacing, Radius } from './ui';
import { getMedicationLogs, MedicationLog } from '../lib/api/medicationLogs';
import dayjs from 'dayjs';

interface TodayDoseHistoryProps {
    onRefresh?: () => void;
}

export function TodayDoseHistory({ onRefresh }: TodayDoseHistoryProps) {
    const [logs, setLogs] = useState<MedicationLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTodayLogs = async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Get today's logs only
            const startOfDay = dayjs().startOf('day').toISOString();
            const endOfDay = dayjs().endOf('day').toISOString();

            const data = await getMedicationLogs({
                startDate: startOfDay,
                endDate: endOfDay,
                limit: 50,
            });

            setLogs(data);
        } catch (err) {
            console.error('[TodayDoseHistory] Error fetching logs:', err);
            setError('Unable to load');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTodayLogs();
    }, []);

    // Group logs by medication and time window (AM/PM)
    const getTimeLabel = (timeString: string): string => {
        const [hours] = timeString.split(':').map(Number);
        if (hours < 12) return 'Morning';
        if (hours < 17) return 'Afternoon';
        return 'Evening';
    };

    const formatTime = (isoString: string): string => {
        return dayjs(isoString).format('h:mm A');
    };

    // Count stats
    const takenCount = logs.filter(l => l.action === 'taken').length;
    const skippedCount = logs.filter(l => l.action === 'skipped').length;
    const totalCount = logs.length;

    // Don't show if no logs today
    if (!isLoading && logs.length === 0) {
        return null;
    }

    return (
        <Pressable
            onPress={() => setIsExpanded(!isExpanded)}
            style={styles.container}
        >
            <Card style={styles.card}>
                {/* Header - always visible */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Ionicons
                            name={isExpanded ? "chevron-down" : "chevron-forward"}
                            size={18}
                            color={Colors.textMuted}
                        />
                        <Text style={styles.title}>Today's Doses</Text>
                    </View>

                    {isLoading ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                        <View style={styles.summaryBadges}>
                            {takenCount > 0 && (
                                <View style={[styles.badge, styles.takenBadge]}>
                                    <Ionicons name="checkmark" size={12} color={Colors.success} />
                                    <Text style={[styles.badgeText, { color: Colors.success }]}>{takenCount}</Text>
                                </View>
                            )}
                            {skippedCount > 0 && (
                                <View style={[styles.badge, styles.skippedBadge]}>
                                    <Ionicons name="close" size={12} color={Colors.error} />
                                    <Text style={[styles.badgeText, { color: Colors.error }]}>{skippedCount}</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* Expanded content */}
                {isExpanded && !isLoading && (
                    <View style={styles.content}>
                        {logs.length === 0 ? (
                            <Text style={styles.emptyText}>No doses logged yet today</Text>
                        ) : (
                            logs.map((log, index) => (
                                <View
                                    key={log.id}
                                    style={[
                                        styles.logRow,
                                        index < logs.length - 1 && styles.logRowBorder
                                    ]}
                                >
                                    <View style={styles.logIcon}>
                                        {log.action === 'taken' && (
                                            <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                                        )}
                                        {log.action === 'skipped' && (
                                            <Ionicons name="close-circle" size={20} color={Colors.error} />
                                        )}
                                        {log.action === 'snoozed' && (
                                            <Ionicons name="alarm-outline" size={20} color={Colors.warning} />
                                        )}
                                    </View>
                                    <View style={styles.logInfo}>
                                        <Text style={styles.logMedName}>{log.medicationName}</Text>
                                        <Text style={styles.logTime}>
                                            {log.action === 'taken' ? 'Taken' : log.action === 'skipped' ? 'Skipped' : 'Snoozed'} at {formatTime(log.loggedAt)}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                )}
            </Card>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing(3),
    },
    card: {
        padding: spacing(3),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(2),
    },
    title: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    summaryBadges: {
        flexDirection: 'row',
        gap: spacing(2),
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing(2),
        paddingVertical: spacing(1),
        borderRadius: 100,
        gap: 2,
    },
    takenBadge: {
        backgroundColor: 'rgba(52,211,153,0.12)',
    },
    skippedBadge: {
        backgroundColor: 'rgba(248,113,113,0.12)',
    },
    badgeText: {
        fontSize: 13,
        fontWeight: '600',
    },
    content: {
        marginTop: spacing(3),
        paddingTop: spacing(3),
        borderTopWidth: 1,
        borderTopColor: Colors.stroke,
    },
    emptyText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        paddingVertical: spacing(2),
    },
    logRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing(2),
    },
    logRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: Colors.stroke,
    },
    logIcon: {
        marginRight: spacing(3),
    },
    logInfo: {
        flex: 1,
    },
    logMedName: {
        fontSize: 15,
        fontWeight: '500',
        color: Colors.text,
    },
    logTime: {
        fontSize: 13,
        color: Colors.textMuted,
        marginTop: 2,
    },
});
