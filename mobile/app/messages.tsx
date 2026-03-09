/**
 * Messages Screen
 *
 * Patient inbox showing messages from caregivers.
 * Designed for elderly users — large fonts, high contrast, simple layout.
 */

import React, { useCallback, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { useMyMessages } from '../lib/api/hooks';
import type { CaregiverMessage } from '@lumimd/sdk';

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ============================================================================
// Components
// ============================================================================

function MessageCard({ item }: { item: CaregiverMessage }) {
  return (
    <Card style={styles.messageCard}>
      <View style={styles.messageHeader}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{getInitials(item.senderName)}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.senderName}>{item.senderName}</Text>
          <Text style={styles.timestamp}>{formatRelativeTime(item.createdAt)}</Text>
        </View>
      </View>
      <Text style={styles.messageText}>{item.message}</Text>
    </Card>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="mail-outline" size={48} color={Colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No messages yet</Text>
      <Text style={styles.emptySubtitle}>
        Messages from your caregivers will appear here
      </Text>
    </View>
  );
}

// ============================================================================
// Screen
// ============================================================================

export default function MessagesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, isRefetching, refetch } = useMyMessages();

  const messages = data?.items ?? [];

  // When the inbox is opened, the backend auto-marks messages as read.
  // Invalidate the unread count so the home screen badge updates immediately.
  useEffect(() => {
    if (!isLoading && data) {
      queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] });
    }
  }, [isLoading, data, queryClient]);

  const handleRefresh = useCallback(async () => {
    await refetch();
    // Also refresh unread count after pull-to-refresh
    queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] });
  }, [refetch, queryClient]);

  const renderMessage = useCallback(
    ({ item }: { item: CaregiverMessage }) => <MessageCard item={item} />,
    [],
  );

  const keyExtractor = useCallback((item: CaregiverMessage) => item.id, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : messages.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

// ============================================================================
// Styles — optimized for elderly users (large text, high contrast)
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing(4),
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  listContent: {
    padding: spacing(4),
    paddingBottom: spacing(6),
  },
  separator: {
    height: spacing(3),
  },
  // Message card
  messageCard: {
    padding: spacing(4),
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(3),
  },
  avatarText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.primary,
  },
  headerText: {
    flex: 1,
  },
  senderName: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
  },
  timestamp: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  messageText: {
    fontSize: 18,
    lineHeight: 26,
    color: Colors.text,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing(6),
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surfaceWarm,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing(4),
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    marginBottom: spacing(2),
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
