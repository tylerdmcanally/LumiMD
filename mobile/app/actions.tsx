import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { useQueryClient } from '@tanstack/react-query';
import { Colors, spacing, Card } from '../components/ui';
import { EmptyState } from '../components/EmptyState';
import { useActionItems, queryKeys } from '../lib/api/hooks';
import { openWebActions } from '../lib/linking';
import { useCompleteAction } from '../lib/api/mutations';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { addActionToCalendar, removeCalendarEvent } from '../lib/calendar';
import { api } from '../lib/api/client';
import { useAuth } from '../contexts/AuthContext';
import { haptic } from '../lib/haptics';

const formatDate = (date?: string | null) => {
  if (!date) return '';
  try {
    return dayjs(date).format('MMM D, YYYY');
  } catch {
    return '';
  }
};

const getActionTitle = (description?: string | null) => {
  if (!description || typeof description !== 'string') {
    return 'Action item';
  }
  const [title] = description.split(/[-–—]/);
  return title.trim() || description.trim();
};

export default function ActionsScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [showCompleted, setShowCompleted] = useState(false);
  const queryClient = useQueryClient();
  const platformKey = Platform.OS === 'ios' ? 'ios' : 'android';

  const {
    data: actions,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useActionItems({
    enabled: isAuthenticated,
    staleTime: 2 * 60 * 1000,
  });

  const { mutate: toggleAction, isPending: isUpdating } = useCompleteAction();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/sign-in');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

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
    void haptic.light();
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

  const updateCachedCalendarEvents = (actionId: string, calendarEvents: Record<string, any> | null) => {
    const updater = (list: any[] | undefined) => {
      if (!Array.isArray(list)) return list;
      return list.map((item) =>
        item.id === actionId ? { ...item, calendarEvents } : item,
      );
    };

    queryClient.setQueryData(queryKeys.actions, updater);
    queryClient.setQueryData([...queryKeys.actions, 'pending'], updater);
  };

  const handleAddToCalendar = async (action: any) => {
    void haptic.medium();
    if (!action.dueAt) {
      void haptic.warning();
      Alert.alert(
        'No Due Date',
        'This action item does not have a due date set. Please add a due date first.',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await addActionToCalendar(action);

    if (result.success) {
      void haptic.success();
      const updatedEvents = {
        ...(action.calendarEvents || {}),
        [platformKey]: {
          platform: Platform.OS,
          calendarId: result.calendarId ?? null,
          eventId: result.eventId!,
          addedAt: new Date().toISOString(),
        },
      };

      try {
        await api.actions.update(action.id, { calendarEvents: updatedEvents });
        updateCachedCalendarEvents(action.id, updatedEvents);
      } catch (error) {
        console.error('Failed to sync calendar metadata:', error);
      }

      Alert.alert(
        'Added to Calendar',
        'This action item has been added to your device calendar.',
        [{ text: 'OK' }]
      );
    } else {
      void haptic.error();
      Alert.alert(
        'Calendar Error',
        result.error || 'Failed to add action item to calendar. Please check your calendar permissions.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleRemoveFromCalendar = async (action: any) => {
    const platformEvent = action.calendarEvents?.[platformKey];
    if (!platformEvent) {
      void haptic.warning();
      Alert.alert('Not in Calendar', 'This action item is not currently added to your calendar.', [
        { text: 'OK' },
      ]);
      return;
    }

    void haptic.warning();
    const confirmed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'Remove from Calendar',
        'This will remove the calendar reminder for this action item. Continue?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });

    if (!confirmed) return;

    const removalResult = await removeCalendarEvent(platformEvent);
    if (!removalResult.success) {
      void haptic.error();
      Alert.alert(
        'Calendar Error',
        removalResult.error || 'Unable to remove this event from your calendar. Please try again.',
        [{ text: 'OK' }],
      );
      return;
    }

    const updatedEvents = { ...(action.calendarEvents || {}) };
    delete updatedEvents[platformKey];
    const payload = Object.keys(updatedEvents).length > 0 ? updatedEvents : null;

    try {
      await api.actions.update(action.id, { calendarEvents: payload });
      updateCachedCalendarEvents(action.id, payload);
    } catch (error) {
      console.error('Failed to sync calendar metadata after removal:', error);
    }

    Alert.alert('Removed', 'The calendar event has been removed.', [{ text: 'OK' }]);
    void haptic.success();
  };

  const renderActionRow = (action: any, isLast: boolean = false) => {
    const dueDate = formatDate(action.dueAt);
    const visitDate = formatDate(action.createdAt);
    const displayTitle = getActionTitle(action.description);
    const hasDueDate = Boolean(action.dueAt);
    const platformEvent = action.calendarEvents?.[platformKey];
    const isInCalendar = Boolean(platformEvent && !platformEvent.removedAt);

    return (
      <View key={action.id} style={[styles.actionRow, !isLast && styles.rowDivider]}>
        <Pressable
          onPress={() => handleToggle(action)}
          style={styles.actionMainContent}
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
              {displayTitle}
            </Text>
            <Text style={styles.actionMeta}>
              {action.completed
                ? `Completed ${formatDate(action.completedAt)}`
                : dueDate
                  ? `Due on ${dueDate}`
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
        {!action.completed && hasDueDate && (
          <Pressable
            onPress={() =>
              isInCalendar ? handleRemoveFromCalendar(action) : handleAddToCalendar(action)
            }
            style={styles.calendarButton}
            hitSlop={8}
          >
            <Ionicons
              name={isInCalendar ? 'calendar' : 'calendar-outline'}
              size={20}
              color={isInCalendar ? Colors.success : Colors.primary}
            />
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <ErrorBoundary
      title="Unable to load action items"
      description="Pull to refresh or go back to the home screen. If this continues, we'll look into it."
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />
          }
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void haptic.selection();
                router.back();
              }}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color={Colors.text} />
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.title}>Action Items</Text>
            </View>
            <Pressable
              style={styles.webLink}
              onPress={() => {
                void haptic.selection();
                openWebActions();
              }}
            >
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
            <EmptyState
              variant="error"
              icon="cloud-offline-outline"
              title="Unable to load action items"
              description="Check your connection and pull down to refresh."
            />
          ) : (

            <>
              <Card style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Pending</Text>
                  <Text style={styles.sectionCount}>{pendingActions.length}</Text>
                </View>

                {pendingActions.length === 0 ? (
                  <EmptyState
                    variant="success"
                    icon="checkmark-circle-outline"
                    title="All caught up"
                    description="You have no open action items. They'll appear here as your doctor recommends new follow-ups."
                    compact
                  />
                ) : (
                  pendingActions.map((action: any, index: number) =>
                    renderActionRow(action, index === pendingActions.length - 1),
                  )
                )}
              </Card>

              <Card style={styles.sectionCard}>
                <Pressable
                  style={styles.sectionHeader}
                  onPress={() => {
                    void haptic.selection();
                    setShowCompleted((prev) => !prev);
                  }}
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
    fontFamily: 'PlusJakartaSans_700Bold',
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  sectionCount: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
    backgroundColor: 'rgba(64,201,208,0.12)',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 8,
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
    gap: spacing(2),
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.stroke,
  },
  actionMainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
  },
  actionIcon: {
    width: 28,
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
    gap: spacing(1),
  },
  calendarButton: {
    padding: spacing(2),
    borderRadius: 8,
    backgroundColor: 'rgba(10, 153, 164, 0.1)',
  },
  actionTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
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



