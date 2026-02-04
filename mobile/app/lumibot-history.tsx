/**
 * LumiBot History Screen
 *
 * Displays completed/dismissed nudges with feedback controls.
 */

import React, { useCallback, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, spacing } from '../components/ui';
import { NudgeHistoryCard } from '../components/lumibot/NudgeHistoryCard';
import { useAuth } from '../contexts/AuthContext';
import { useNudgeHistory, useSendNudgeFeedback, useTrackNudgeEvent } from '../lib/api/hooks';
import type { Nudge } from '@lumimd/sdk';

export default function LumiBotHistoryScreen() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const trackedRef = useRef(new Set<string>());

    const {
        data: history = [],
        isLoading,
        refetch,
        isRefetching,
    } = useNudgeHistory(40, { enabled: isAuthenticated });

    const sendFeedback = useSendNudgeFeedback();
    const trackEvent = useTrackNudgeEvent();

    const handleFeedback = useCallback((nudgeId: string, helpful: boolean) => {
        trackEvent.mutate({
            id: nudgeId,
            data: { type: 'feedback', metadata: { helpful, surface: 'history' } },
        });
        sendFeedback.mutate(
            { id: nudgeId, data: { helpful } },
            {
                onSuccess: () => {
                    Alert.alert('Thanks!', 'Your feedback helps improve LumiBot.');
                },
                onError: () => {
                    Alert.alert('Error', 'Failed to send feedback. Please try again.');
                },
            }
        );
    }, [sendFeedback, trackEvent]);

    useEffect(() => {
        history.forEach((nudge: Nudge) => {
            if (trackedRef.current.has(nudge.id)) return;
            trackedRef.current.add(nudge.id);
            trackEvent.mutate({
                id: nudge.id,
                data: { type: 'view', metadata: { surface: 'history' } },
            });
        });
    }, [history, trackEvent]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} hitSlop={8}>
                    <Ionicons name="chevron-back" size={28} color={Colors.text} />
                </Pressable>
                <Text style={styles.headerTitle}>LumiBot History</Text>
                <View style={{ width: 28 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={refetch}
                        tintColor={Colors.primary}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Colors.primary} />
                        <Text style={styles.loadingText}>Loading history...</Text>
                    </View>
                ) : history.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="chatbubble-ellipses-outline" size={48} color={Colors.textMuted} />
                        <Text style={styles.emptyTitle}>No history yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Completed and dismissed LumiBot nudges will appear here.
                        </Text>
                    </View>
                ) : (
                    history.map((nudge) => (
                        <NudgeHistoryCard key={nudge.id} nudge={nudge} onFeedback={handleFeedback} />
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing(4),
        paddingVertical: spacing(3),
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerTitle: {
        fontSize: 17,
        fontFamily: 'PlusJakartaSans_600SemiBold',
        color: Colors.text,
    },
    content: {
        padding: spacing(4),
    },
    loadingContainer: {
        paddingVertical: spacing(8),
        alignItems: 'center',
        gap: spacing(3),
    },
    loadingText: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: spacing(8),
        gap: spacing(3),
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'PlusJakartaSans_600SemiBold',
        color: Colors.text,
    },
    emptySubtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
    },
});
