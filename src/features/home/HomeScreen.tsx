import { IconSymbol } from '@/shared/components/ui/icon-symbol';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import { useAuth } from '@/shared/context/AuthContext';
import { ActionItem as APIActionItem, listActionItems } from '@/shared/services/api/actionItems';
import { listVisits, Visit } from '@/shared/services/api/visits';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HealthProfileReminder } from './HealthProfileReminder';

interface HomeScreenProps {
  onStartVisit: () => void;
  onViewHistory: () => void;
  onViewFolders?: () => void;
  onViewActionItems?: () => void;
  onViewProfile?: () => void;
}

interface HomeStats {
  totalVisits: number;
  pendingActionItems: number;
  recentActionItem: APIActionItem | null;
  recentVisit: Visit | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onStartVisit, onViewHistory, onViewFolders, onViewActionItems, onViewProfile }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<HomeStats>({
    totalVisits: 0,
    pendingActionItems: 0,
    recentActionItem: null,
    recentVisit: null,
  });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);

      /**
       * CRITICAL: Query database for action items - same source as Tasks tab
       * See DATA_CONSISTENCY_GUIDE.md for why we use listActionItems() instead of visit.summary.actionItems
       */
      const [visitsData, actionItems] = await Promise.all([
        listVisits(1, 50),
        listActionItems({ completed: false }), // Only get active items from database
      ]);

      // Count total visits
      const totalVisits = visitsData.pagination.total;

      // Find the most urgent action item (earliest due date)
      let mostUrgentItem: APIActionItem | null = null;
      if (actionItems.length > 0) {
        // Sort by due date (earliest first), items without dates go to end
        const sortedItems = [...actionItems].sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        });
        mostUrgentItem = sortedItems[0];
      }

      // Get most recent visit with a provider
      const recentVisit = visitsData.visits.find(v => v.provider) || null;

      setStats({
        totalVisits,
        pendingActionItems: actionItems.length,
        recentActionItem: mostUrgentItem,
        recentVisit,
      });
    } catch (err: any) {
      console.error('Failed to load home stats', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greetingLabel}>Welcome back</Text>
            <Text style={styles.greetingName}>{user?.firstName ?? 'LumiMD'}</Text>
          </View>
          <TouchableOpacity 
            style={styles.profileButton} 
            onPress={onViewProfile}
            activeOpacity={0.7}
          >
            <IconSymbol name="person.circle.fill" size={36} color={COLORS.PRIMARY} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            Record Your Visit
          </Text>
          <Text style={styles.heroSubtitle} numberOfLines={2}>
            Tap to start recording. We&apos;ll transcribe and summarize everything.
          </Text>
          <TouchableOpacity style={styles.heroCta} onPress={onStartVisit} activeOpacity={0.9}>
            <Text style={styles.heroCtaLabel}>Start New Visit</Text>
          </TouchableOpacity>
        </View>

        {!loading && <HealthProfileReminder />}

        {!loading && (
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={onViewActionItems}
              activeOpacity={0.8}
            >
              {stats.pendingActionItems > 0 && stats.recentActionItem ? (
                <>
                  <View style={styles.actionHeader}>
                    <Text style={styles.actionLabel}>Most urgent task</Text>
                    {stats.recentActionItem.dueDate && (
                      <View style={styles.dueDateBadge}>
                        <Text style={styles.dueDateText}>
                          Due {new Date(stats.recentActionItem.dueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.actionTitle} numberOfLines={2}>
                    {stats.recentActionItem.type.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.actionCopy} numberOfLines={2}>
                    {stats.recentActionItem.description}
                  </Text>
                  <View style={styles.actionFooter}>
                    <Text style={styles.actionFooterText}>
                      {stats.pendingActionItems} {stats.pendingActionItems === 1 ? 'task' : 'tasks'} pending
                    </Text>
                    <Text style={styles.actionLinkLabel}>View all →</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.actionHeader}>
                    <Text style={styles.actionLabel}>Action items</Text>
                    <View style={styles.completeBadge}>
                      <Text style={styles.completeBadgeText}>✓</Text>
                    </View>
                  </View>
                  <Text style={styles.actionTitle}>All caught up!</Text>
                  <Text style={styles.actionCopy}>
                    No pending tasks right now. New action items will appear here.
                  </Text>
                  <View style={styles.actionFooter}>
                    <Text style={styles.actionFooterText}>0 tasks pending</Text>
                    <Text style={styles.actionLinkLabel}>View all →</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {!loading && stats.recentVisit && stats.recentVisit.provider && (
          <View style={styles.quickActions}>
            <View style={styles.scheduleCard}>
              <Text style={styles.scheduleTitle}>Recent visit</Text>
              <View style={styles.scheduleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scheduleDate}>
                    {new Date(stats.recentVisit.visitDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.scheduleProvider} numberOfLines={1}>
                    {stats.recentVisit.provider.name}
                    {stats.recentVisit.provider.specialty && ` · ${stats.recentVisit.provider.specialty}`}
                  </Text>
                </View>
                <TouchableOpacity style={styles.scheduleButton} onPress={onViewHistory}>
                  <Text style={styles.scheduleButtonLabel}>View</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  scroll: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.LG,
    paddingBottom: SIZES.XXL,
    gap: SIZES.LG,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[500],
  },
  greetingName: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.DISPLAY,
    color: COLORS.PRIMARY,
  },
  profileButton: {
    padding: 4,
  },
  heroCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    ...SIZES.SHADOW.MEDIUM,
    gap: SIZES.SM,
  },
  heroTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
    lineHeight: 28,
  },
  heroSubtitle: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  heroCta: {
    marginTop: SIZES.SM,
    backgroundColor: COLORS.ACCENT,
    paddingVertical: SIZES.SM + 4,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    alignItems: 'center',
    shadowColor: COLORS.ACCENT,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  heroCtaLabel: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.BLACK,
  },
  quickActions: {
    gap: SIZES.MD,
  },
  actionCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    padding: SIZES.CARD_PADDING,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    ...SIZES.SHADOW.LIGHT,
    gap: SIZES.SM,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  dueDateBadge: {
    backgroundColor: COLORS.ACCENT + '60',
    paddingHorizontal: SIZES.SM,
    paddingVertical: 4,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  dueDateText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XS,
    color: COLORS.BLACK,
  },
  completeBadge: {
    backgroundColor: COLORS.HEALTH.PALE_MINT,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBadgeText: {
    fontSize: 16,
    color: COLORS.PRIMARY,
  },
  actionTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
    lineHeight: 22,
  },
  actionCopy: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    lineHeight: 18,
  },
  actionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SIZES.XS - 2,
  },
  actionFooterText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  actionLinkLabel: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  scheduleCard: {
    backgroundColor: COLORS.SECTION_BACKGROUND,
    padding: SIZES.CARD_PADDING,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    gap: SIZES.SM,
  },
  scheduleTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scheduleDate: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.BLACK,
  },
  scheduleProvider: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    marginTop: 2,
  },
  scheduleButton: {
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.XS,
    borderRadius: 999,
    backgroundColor: COLORS.PRIMARY,
  },
  scheduleButtonLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.WHITE,
  },
  scheduleNote: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
});

export default HomeScreen;
