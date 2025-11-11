import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import dayjs from 'dayjs';
import { Colors, spacing, Card } from '../components/ui';
import { useActionItems } from '../lib/api/hooks';
import { openWebActions } from '../lib/linking';
import { useCompleteAction } from '../lib/api/mutations';
import { ErrorBoundary } from '../components/ErrorBoundary';

const formatDate = (date?: string | null) => {
  if (!date) return '';
  try {
    return dayjs(date).format('MMM D, YYYY');
  } catch {
    return '';
  }
};

export default function ActionsScreen() {
  const router = useRouter();
  const [showCompleted, setShowCompleted] = useState(false);

  const {
    data: actions,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useActionItems({
    staleTime: 2 * 60 * 1000,
  });

  const { mutate: toggleAction, isPending: isUpdating } = useCompleteAction();

  const pendingActions = useMemo(() => {
    if (!Array.isArray(actions)) return [];
    return actions
      .filter((item) => !item.completed)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [actions]);

  const completedActions = useMemo(() => {
    if (!Array.isArray(actions)) return [];
    return actions
      .filter((item) => item.completed)
      .sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [actions]);

  const handleToggle = (action: any) => {
    toggleAction({
      id: action.id,
      completed: !action.completed,
      optimisticData: {
        ...action,
        completed: !action.completed,
        completedAt: !action.completed ? new Date().toISOString() : null,
      },
    });
  };

  const renderActionRow = (action: any, isLast: boolean = false) => {
    const visitDate = formatDate(action.createdAt);

    return (
      <Pressable
        key={action.id}
        onPress={() => handleToggle(action)}
        style={[styles.actionRow, !isLast && styles.rowDivider]}
      >
        <View style={styles.actionIcon}>
          <Ionicons
            name={action.completed ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={action.completed ? Colors.success : Colors.primary}
          />
        </View>
        <View style={styles.actionContent}>
          <Text style={[styles.actionTitle, action.completed && styles.actionTitleCompleted]}>
            {action.description || 'Action item'}
          </Text>
          <Text style={styles.actionMeta}>
            {action.completed
              ? `Completed ${formatDate(action.completedAt)}`
              : visitDate
              ? `From visit on ${visitDate}`
              : 'Tap to mark complete'}
          </Text>
        </View>
        <Ionicons
          name={action.completed ? 'arrow-undo' : 'checkmark'}
          size={20}
          color={Colors.textMuted}
        />
      </Pressable>
    );
  };

  return (
    <ErrorBoundary
      title="Unable to load action items"
      description="Pull to refresh or go back to the home screen. If this continues, we’ll look into it."
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
        >
          <View style={styles.header}>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.title}>Action Items</Text>
            </View>
            <Pressable style={styles.webLink} onPress={openWebActions}>
              <Ionicons name="open-outline" size={18} color={Colors.primary} />
              <Text style={styles.webLinkText}>Manage on Web</Text>
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Keep track of follow-ups, tasks, and reminders captured from your visit summaries.
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading action items…</Text>
            </View>
          ) : error ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Unable to load action items</Text>
              <Text style={styles.emptySubtitle}>Check your connection and pull down to refresh.</Text>
            </Card>
          ) : (
            <>
              <Card style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Pending</Text>
                  <Text style={styles.sectionCount}>{pendingActions.length}</Text>
                </View>

                {pendingActions.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="checkmark-done-circle" size={36} color={Colors.success} />
                    <Text style={styles.emptyStateTitle}>All caught up</Text>
                    <Text style={styles.emptyStateSubtitle}>
                      You have no open action items. They’ll appear here as your doctor recommends new
                      follow-ups.
                    </Text>
                  </View>
                ) : (
                  pendingActions.map((action: any, index: number) =>
                    renderActionRow(action, index === pendingActions.length - 1),
                  )
                )}
              </Card>

              <Card style={styles.sectionCard}>
                <Pressable
                  style={styles.sectionHeader}
                  onPress={() => setShowCompleted((prev) => !prev)}
                >
                  <View style={styles.sectionHeaderLeft}>
                    <Text style={styles.sectionTitle}>Completed</Text>
                    <Text style={styles.sectionCount}>{completedActions.length}</Text>
                  </View>
                  <Ionicons
                    name={showCompleted ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={Colors.textMuted}
                  />
                </Pressable>

                {showCompleted && (
                  <>
                    {completedActions.length === 0 ? (
                      <Text style={styles.emptyCompleted}>Completed items will appear here.</Text>
                    ) : (
                      completedActions.map((action: any, index: number) =>
                        renderActionRow(action, index === completedActions.length - 1),
                      )
                    )}
                  </>
                )}
              </Card>

              {isUpdating && (
                <View style={styles.updatingOverlay}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.updatingText}>Updating…</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
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
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(6),
    gap: spacing(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing(2),
  },
  backButton: {
    padding: spacing(1),
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  webLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
  },
  webLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(8),
  },
  loadingText: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing(2),
    padding: spacing(5),
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  sectionCard: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    gap: spacing(1),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(2),
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
    backgroundColor: 'rgba(10,153,164,0.1)',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 8,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(6),
    paddingHorizontal: spacing(4),
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCompleted: {
    fontSize: 13,
    color: Colors.textMuted,
    paddingVertical: spacing(2),
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
    gap: spacing(3),
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.stroke,
  },
  actionIcon: {
    width: 28,
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
    gap: spacing(1),
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  actionTitleCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  actionMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  updatingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    alignSelf: 'center',
  },
  updatingText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});



