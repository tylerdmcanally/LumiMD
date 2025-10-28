import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';

import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import { listVisits, Visit } from '@/shared/services/api/visits';
import { listActionItems, ActionItem as APIActionItem, updateActionItem } from '@/shared/services/api/actionItems';

interface ActionItem {
  type?: string;
  title?: string;
  detail?: string;
  dueDate?: string;
}

interface ActionItemWithVisit {
  id: string; // Unique ID for tracking
  actionItem: ActionItem;
  visit: Visit;
  completed: boolean;
  completedAt?: string;
}

interface ActionItemsListProps {
  onBack?: () => void;
}

export const ActionItemsList: React.FC<ActionItemsListProps> = ({ onBack }) => {
  const [actionItems, setActionItems] = useState<ActionItemWithVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const load = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);

      /**
       * CRITICAL: Always use listActionItems() API - DO NOT extract from visit.summary.actionItems
       *
       * The action_items table is the single source of truth. Visit summaries are static snapshots
       * that don't reflect updates (completion, deletion, etc.).
       *
       * This ensures HomeScreen and ActionItemsList display the same data.
       * See DATA_CONSISTENCY_GUIDE.md for details.
       */
      const [activeItemsData, completedItemsData, visitsData] = await Promise.all([
        listActionItems({ completed: false }), // Get active items from database
        listActionItems({ completed: true }),  // Get completed items for collapsible section
        listVisits(1, 100),
      ]);

      // Combine both active and completed items
      const allActionItems = [...activeItemsData, ...completedItemsData];

      // Create a map of visits by ID for quick lookup
      const visitsMap = new Map(visitsData.visits.map(v => [v.id, v]));

      // Map action items to include visit info
      const items: ActionItemWithVisit[] = allActionItems.map((item) => {
        const visit = visitsMap.get(item.visitId);
        return {
          id: item.id,
          actionItem: {
            type: item.type,
            title: item.type.replace(/_/g, ' '),
            detail: item.description,
            dueDate: item.dueDate,
          },
          visit: visit || ({} as Visit),
          completed: item.completed,
          completedAt: item.completedAt,
        };
      });

      setActionItems(items);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load action items', err);
      setError(err.response?.data?.error?.message ?? 'Unable to load action items');
    } finally {
      if (showSpinner) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load(false);
  };

  const toggleComplete = useCallback(async (item: ActionItemWithVisit) => {
    const newCompleted = !item.completed;

    // Update local state optimistically
    setActionItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? { ...i, completed: newCompleted, completedAt: newCompleted ? new Date().toISOString() : undefined }
          : i
      )
    );

    // Update database via API
    try {
      await updateActionItem(item.id, {
        completed: newCompleted
      });
    } catch (err) {
      console.error('Failed to update action item', err);
      // Revert on error
      setActionItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, completed: !newCompleted, completedAt: item.completedAt }
            : i
        )
      );
    }
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  // Split items into active and completed
  const activeItems = actionItems.filter((item) => !item.completed);
  const completedItems = actionItems.filter((item) => item.completed);

  const renderActionItem = (item: ActionItemWithVisit) => {
    const dueDate = formatDate(item.actionItem.dueDate);
    const visitDate = new Date(item.visit.visitDate).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric' }
    );

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.actionCard}
        onPress={() => toggleComplete(item)}
        activeOpacity={0.7}
      >
        <View style={styles.actionRow}>
          <View style={styles.checkbox}>
            <View
              style={[
                styles.checkboxInner,
                item.completed && styles.checkboxChecked,
              ]}
            >
              {item.completed && <Text style={styles.checkmark}>✓</Text>}
            </View>
          </View>

          <View style={styles.actionContent}>
            <View style={styles.actionHeader}>
              <Text
                style={[
                  styles.actionTitle,
                  item.completed && styles.actionTitleCompleted,
                ]}
                numberOfLines={2}
              >
                {item.actionItem.title || 'Action item'}
              </Text>
              {dueDate && !item.completed && (
                <View style={styles.dueDateBadge}>
                  <Text style={styles.dueDateText}>{dueDate}</Text>
                </View>
              )}
            </View>

            {item.actionItem.detail && (
              <Text
                style={[
                  styles.actionDetail,
                  item.completed && styles.actionDetailCompleted,
                ]}
                numberOfLines={2}
              >
                {item.actionItem.detail}
              </Text>
            )}

            <View style={styles.actionFooter}>
              <Text style={styles.visitInfo}>
                From: {item.visit.provider?.name || 'Healthcare visit'}
              </Text>
              <Text style={styles.visitDate}>• {visitDate}</Text>
            </View>

            <TouchableOpacity
              style={styles.viewVisitLink}
              onPress={(e) => {
                e.stopPropagation();
                router.push(`/(app)/(visits)/${item.visit.id}`);
              }}
            >
              <Text style={styles.viewVisitText}>View visit →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.PRIMARY} />
          <Text style={styles.loadingText}>Loading action items…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Action Items</Text>
          <Text style={styles.headerSubtitle}>
            Track follow-up tasks from your visits
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Active Items */}
        {activeItems.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Active Tasks</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{activeItems.length}</Text>
              </View>
            </View>
            {activeItems.map((item) => renderActionItem(item))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active action items</Text>
            <Text style={styles.emptyCopy}>
              Action items from your visit summaries will appear here.
            </Text>
          </View>
        )}

        {/* Completed Items - Collapsible */}
        {completedItems.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.completedHeader}
              onPress={() => setShowCompleted(!showCompleted)}
              activeOpacity={0.7}
            >
              <View style={styles.completedHeaderLeft}>
                <Text style={styles.completedHeaderText}>Completed Tasks</Text>
                <View style={styles.completedCountBadge}>
                  <Text style={styles.completedCountText}>{completedItems.length}</Text>
                </View>
              </View>
              <Text style={styles.chevron}>{showCompleted ? '▼' : '▶'}</Text>
            </TouchableOpacity>

            {showCompleted && (
              <>
                <Text style={styles.completedHint}>
                  Tap any completed task to mark it as active again
                </Text>
                <View style={styles.completedList}>
                  {completedItems.map((item) => renderActionItem(item))}
                </View>
              </>
            )}
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.SM,
  },
  loadingText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  header: {
    paddingHorizontal: SIZES.PADDING,
    paddingTop: SIZES.LG,
    paddingBottom: SIZES.MD,
    gap: SIZES.SM,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  headerCopy: {
    gap: SIZES.XS,
  },
  headerTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.HEADING,
    color: COLORS.PRIMARY,
  },
  headerSubtitle: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 22,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.LG,
    paddingBottom: SIZES.XXL,
  },
  section: {
    marginBottom: SIZES.LG,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.MD,
    gap: SIZES.SM,
  },
  sectionTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  countBadge: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: SIZES.SM,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XS,
    color: COLORS.WHITE,
  },
  completedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    backgroundColor: COLORS.GRAY[100],
    borderRadius: SIZES.BORDER_RADIUS,
    marginBottom: SIZES.SM,
  },
  completedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
  },
  completedHeaderText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.SECONDARY,
  },
  completedCountBadge: {
    backgroundColor: COLORS.GRAY[300],
    paddingHorizontal: SIZES.XS,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 20,
    alignItems: 'center',
  },
  completedCountText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XS,
    color: COLORS.WHITE,
  },
  chevron: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  completedHint: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[400],
    fontStyle: 'italic',
    marginBottom: SIZES.SM,
    paddingHorizontal: SIZES.XS,
  },
  completedList: {
    gap: SIZES.MD,
  },
  actionCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    marginBottom: SIZES.MD,
    ...SIZES.SHADOW.LIGHT,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  checkbox: {
    marginTop: 2,
  },
  checkboxInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.GRAY[400],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.WHITE,
  },
  checkboxChecked: {
    backgroundColor: COLORS.PRIMARY,
    borderColor: COLORS.PRIMARY,
  },
  checkmark: {
    color: COLORS.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionContent: {
    flex: 1,
    gap: SIZES.XS,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SIZES.SM,
  },
  actionTitle: {
    flex: 1,
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
    lineHeight: 22,
  },
  actionTitleCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.SECONDARY,
  },
  dueDateBadge: {
    backgroundColor: COLORS.ACCENT + '40',
    paddingHorizontal: SIZES.XS,
    paddingVertical: 2,
    borderRadius: SIZES.BORDER_RADIUS - 2,
  },
  dueDateText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XS,
    color: COLORS.BLACK,
  },
  actionDetail: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  actionDetailCompleted: {
    textDecorationLine: 'line-through',
  },
  actionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.XS - 2,
    marginTop: SIZES.XS - 2,
  },
  visitInfo: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  visitDate: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[400],
  },
  viewVisitLink: {
    alignSelf: 'flex-start',
    marginTop: SIZES.XS - 2,
    paddingVertical: 2,
  },
  viewVisitText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.PADDING,
    gap: SIZES.SM,
  },
  emptyTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  emptyCopy: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    marginTop: SIZES.SM,
    textAlign: 'center',
    fontFamily: FONTS.MEDIUM,
    color: COLORS.DANGER,
  },
});

export default ActionItemsList;
