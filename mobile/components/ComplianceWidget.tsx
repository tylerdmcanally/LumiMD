/**
 * ComplianceWidget
 * 
 * Displays medication adherence percentage on the dashboard.
 * Self-contained component that fetches its own data.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Colors, spacing, Radius } from './ui';
import { getComplianceSummary, ComplianceSummary } from '../lib/api/medicationLogs';

interface ComplianceWidgetProps {
    onPress?: () => void;
}

export function ComplianceWidget({ onPress }: ComplianceWidgetProps) {
    const [summary, setSummary] = useState<ComplianceSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const data = await getComplianceSummary(30);
                setSummary(data);
            } catch (err) {
                console.error('[ComplianceWidget] Error fetching summary:', err);
                setError('Unable to load');
            } finally {
                setIsLoading(false);
            }
        };

        fetchSummary();
    }, []);

    // Don't show widget if there's no data
    if (!isLoading && (error || !summary || summary.overall.total === 0)) {
        return null;
    }

    const complianceRate = summary?.overall.complianceRate ?? 0;
    const getComplianceColor = (rate: number) => {
        if (rate >= 80) return Colors.success;
        if (rate >= 60) return Colors.warning;
        return Colors.error;
    };
    const complianceColor = getComplianceColor(complianceRate);

    const content = (
        <Card>
            <View style={styles.container}>
                <View style={styles.content}>
                    <Text style={styles.title}>Medication Adherence</Text>

                    {isLoading ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                        <>
                            <View style={styles.rateRow}>
                                <Text style={[styles.rate, { color: complianceColor }]}>
                                    {complianceRate}%
                                </Text>
                                <Text style={styles.period}>last 30 days</Text>
                            </View>

                            <View style={styles.statsRow}>
                                <View style={styles.stat}>
                                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                                    <Text style={styles.statText}>{summary?.overall.taken ?? 0} taken</Text>
                                </View>
                                <View style={styles.stat}>
                                    <Ionicons name="close-circle" size={14} color={Colors.error} />
                                    <Text style={styles.statText}>{summary?.overall.skipped ?? 0} skipped</Text>
                                </View>
                            </View>
                        </>
                    )}
                </View>

                <View style={[styles.iconContainer, { backgroundColor: `${complianceColor}20` }]}>
                    <Ionicons name="pulse-outline" size={24} color={complianceColor} />
                </View>
            </View>
        </Card>
    );

    if (onPress) {
        return (
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
            >
                {content}
            </Pressable>
        );
    }

    return <View style={styles.pressable}>{content}</View>;
}

const styles = StyleSheet.create({
    pressable: {
        marginBottom: spacing(3),
    },
    pressed: {
        opacity: 0.7,
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    content: {
        flex: 1,
    },
    title: {
        fontSize: 13,
        color: Colors.textMuted,
        marginBottom: spacing(1),
    },
    rateRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    rate: {
        fontSize: 28,
        fontWeight: '700',
        marginRight: spacing(2),
    },
    period: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    statsRow: {
        flexDirection: 'row',
        marginTop: spacing(2),
        gap: spacing(4),
    },
    stat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1),
    },
    statText: {
        fontSize: 13,
        color: Colors.textMuted,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
