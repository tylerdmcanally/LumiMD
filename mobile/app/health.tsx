/**
 * Health Details Screen
 * 
 * Shows UNIFIED health data from all sources:
 * - Manual entries (user-entered)
 * - LumiBot prompts (nudge responses)
 * 
 * All data lives in the same healthLogs collection.
 */

import React, { useCallback, useMemo, useState } from 'react';
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
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { useHealthLogs } from '../lib/api/hooks';
import { cfg } from '../lib/config';
import type { HealthLog, HealthLogSource, BloodPressureValue, GlucoseValue, AlertLevel } from '@lumimd/sdk';
import { BPLogModal, GlucoseLogModal, WeightLogModal } from '../components/lumibot';
import type { WeightValue } from '../components/lumibot';
import { api } from '../lib/api/client';

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getSourceIcon(source: HealthLogSource): { icon: keyof typeof Ionicons.glyphMap; color: string; label: string } {
  switch (source) {
    case 'manual':
      return { icon: 'create-outline', color: Colors.primary, label: 'Manual Entry' };
    case 'nudge':
      return { icon: 'chatbubble-outline', color: '#8B5CF6', label: 'LumiBot' };
    case 'quick_log':
      return { icon: 'flash-outline', color: '#F59E0B', label: 'Quick Log' };
    default:
      return { icon: 'document-outline', color: Colors.textMuted, label: 'Logged' };
  }
}

function getTypeConfig(type: string): { icon: keyof typeof Ionicons.glyphMap; color: string; label: string } {
  switch (type) {
    case 'bp':
      return { icon: 'pulse', color: '#F97316', label: 'Blood Pressure' };
    case 'glucose':
      return { icon: 'water', color: '#8B5CF6', label: 'Blood Glucose' };
    case 'weight':
      return { icon: 'scale', color: '#6366F1', label: 'Weight' };
    case 'heart_rate':
      return { icon: 'heart', color: '#EF4444', label: 'Heart Rate' };
    case 'steps':
      return { icon: 'footsteps', color: '#22C55E', label: 'Steps' };
    case 'oxygen_saturation':
      return { icon: 'fitness', color: '#3B82F6', label: 'Oxygen' };
    default:
      return { icon: 'analytics', color: Colors.primary, label: type };
  }
}

function formatValue(type: string, value: any): { main: string; unit: string } {
  switch (type) {
    case 'bp':
      return { main: `${value.systolic}/${value.diastolic}`, unit: 'mmHg' };
    case 'glucose':
      return { main: String(Math.round(value.reading)), unit: 'mg/dL' };
    case 'weight':
      return { main: String(value.weight), unit: value.unit };
    case 'heart_rate':
      return { main: String(value.bpm), unit: 'bpm' };
    case 'steps':
      return { main: value.count?.toLocaleString() || '0', unit: 'steps' };
    case 'oxygen_saturation':
      return { main: String(value.percentage), unit: '%' };
    default:
      return { main: JSON.stringify(value), unit: '' };
  }
}

// ============================================================================
// Components
// ============================================================================

interface VitalCardProps {
  log: HealthLog;
  isLatest?: boolean;
}

function VitalCard({ log, isLatest }: VitalCardProps) {
  const typeConfig = getTypeConfig(log.type);
  const sourceConfig = getSourceIcon(log.source);
  const formatted = formatValue(log.type, log.value);

  return (
    <Card style={[styles.vitalCard, isLatest && styles.vitalCardLatest]}>
      <View style={styles.vitalHeader}>
        <View style={[styles.vitalIcon, { backgroundColor: `${typeConfig.color}15` }]}>
          <Ionicons name={typeConfig.icon} size={24} color={typeConfig.color} />
        </View>
        <View style={styles.vitalTitleContainer}>
          <Text style={styles.vitalTitle}>{typeConfig.label}</Text>
          <View style={styles.sourceRow}>
            <Ionicons name={sourceConfig.icon} size={12} color={sourceConfig.color} />
            <Text style={styles.sourceLabel}>{sourceConfig.label}</Text>
            <Text style={styles.vitalTimestamp}> • {formatRelativeTime(log.createdAt)}</Text>
          </View>
        </View>
        {isLatest && (
          <View style={styles.latestBadge}>
            <Text style={styles.latestBadgeText}>Latest</Text>
          </View>
        )}
      </View>
      
      <View style={styles.vitalValueContainer}>
        <Text style={[styles.vitalValue, { color: typeConfig.color }]}>{formatted.main}</Text>
        <Text style={styles.vitalUnit}>{formatted.unit}</Text>
      </View>

      {log.alertLevel && log.alertLevel !== 'normal' && (
        <View style={[styles.alertBadge, 
          log.alertLevel === 'warning' && styles.alertWarning,
          log.alertLevel === 'caution' && styles.alertCaution,
          log.alertLevel === 'emergency' && styles.alertEmergency,
        ]}>
          <Ionicons 
            name={log.alertLevel === 'emergency' ? 'warning' : 'alert-circle'} 
            size={14} 
            color={log.alertLevel === 'emergency' ? '#DC2626' : log.alertLevel === 'warning' ? '#F59E0B' : '#6B7280'} 
          />
          <Text style={styles.alertText}>{log.alertMessage || log.alertLevel}</Text>
        </View>
      )}
    </Card>
  );
}

function EmptyState() {
  const router = useRouter();
  
  return (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={48} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>No Health Data Yet</Text>
      <Text style={styles.emptySubtitle}>
        Log your vitals manually or respond to LumiBot check-ins.
      </Text>
      <Pressable 
        style={styles.emptyButton}
        onPress={() => router.back()}
      >
        <Text style={styles.emptyButtonText}>Start Logging</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function HealthScreen() {
  const router = useRouter();
  const healthEnabled = cfg.flags.health;
  
  // Logging modal state
  const [showLogMenu, setShowLogMenu] = useState(false);
  const [showBPModal, setShowBPModal] = useState(false);
  const [showGlucoseModal, setShowGlucoseModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Collapsible sections
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  
  // Fetch unified health logs (all sources)
  const { 
    data: logs = [], 
    isLoading, 
    error,
    refetch, 
    isRefetching 
  } = useHealthLogs({ limit: 50 }, { enabled: healthEnabled });

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Logging handlers
  const handleLogOption = useCallback((option: 'bp' | 'glucose' | 'weight') => {
    setShowLogMenu(false);
    if (option === 'bp') setShowBPModal(true);
    else if (option === 'glucose') setShowGlucoseModal(true);
    else if (option === 'weight') setShowWeightModal(true);
  }, []);

  const handleBPSubmit = useCallback(async (value: BloodPressureValue): Promise<{
    alertLevel?: AlertLevel;
    alertMessage?: string;
    shouldShowAlert?: boolean;
  }> => {
    setIsSubmitting(true);
    try {
      const response = await api.healthLogs.create({
        type: 'bp',
        value: { systolic: value.systolic, diastolic: value.diastolic, pulse: value.pulse },
        source: 'manual',
      });
      Alert.alert('Success', 'Blood pressure logged successfully');
      setShowBPModal(false);
      refetch();
      return { alertLevel: response.alertLevel, alertMessage: response.alertMessage, shouldShowAlert: response.shouldShowAlert };
    } catch (error) {
      Alert.alert('Error', 'Failed to log blood pressure. Please try again.');
      return {};
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  const handleGlucoseSubmit = useCallback(async (value: GlucoseValue): Promise<{
    alertLevel?: AlertLevel;
    alertMessage?: string;
    shouldShowAlert?: boolean;
  }> => {
    setIsSubmitting(true);
    try {
      const response = await api.healthLogs.create({
        type: 'glucose',
        value: { reading: value.reading, timing: value.timing },
        source: 'manual',
      });
      Alert.alert('Success', 'Blood glucose logged successfully');
      setShowGlucoseModal(false);
      refetch();
      return { alertLevel: response.alertLevel, alertMessage: response.alertMessage, shouldShowAlert: response.shouldShowAlert };
    } catch (error) {
      Alert.alert('Error', 'Failed to log blood glucose. Please try again.');
      return {};
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  const handleWeightSubmit = useCallback(async (value: WeightValue): Promise<{
    alertLevel?: AlertLevel;
    alertMessage?: string;
    shouldShowAlert?: boolean;
  }> => {
    setIsSubmitting(true);
    try {
      await api.healthLogs.create({
        type: 'weight',
        value: { weight: value.weight, unit: value.unit },
        source: 'manual',
      });
      Alert.alert('Success', 'Weight logged successfully');
      setShowWeightModal(false);
      refetch();
      return {};
    } catch (error) {
      Alert.alert('Error', 'Failed to log weight. Please try again.');
      return {};
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  // Group logs by type and find latest for each
  const groupedLogs = useMemo(() => {
    const groups: Record<string, HealthLog[]> = {};
    const latestByType: Record<string, HealthLog> = {};

    // Filter to just the vital types we care about
    const vitalTypes = ['bp', 'glucose', 'weight', 'heart_rate', 'steps', 'oxygen_saturation'];
    
    logs.forEach((log) => {
      if (!vitalTypes.includes(log.type)) return;
      
      if (!groups[log.type]) {
        groups[log.type] = [];
        latestByType[log.type] = log;
      }
      groups[log.type].push(log);
      
      // Update latest if this one is newer
      if (new Date(log.createdAt) > new Date(latestByType[log.type].createdAt)) {
        latestByType[log.type] = log;
      }
    });

    return { groups, latestByType };
  }, [logs]);

  // Get ordered list of latest readings
  const latestReadings = useMemo(() => {
    return Object.values(groupedLogs.latestByType)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [groupedLogs.latestByType]);

  const infoDataSourcesText = 'All health data is unified from manual entries and LumiBot check-ins.';

  if (!healthEnabled) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Health</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.disabledContainer}>
          <Card style={styles.disabledCard}>
            <Ionicons name="fitness-outline" size={28} color={Colors.textMuted} />
            <Text style={styles.disabledTitle}>Health metrics are disabled</Text>
            <Text style={styles.disabledSubtitle}>
              Health metrics are out of scope for now while we focus on core workflows.
            </Text>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Health Data</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Collapsible Data Sources */}
        <Pressable 
          style={styles.collapsibleHeader}
          onPress={() => setSourcesExpanded(!sourcesExpanded)}
        >
            <View style={styles.collapsibleLeft}>
              <Ionicons name="swap-horizontal" size={18} color={Colors.textMuted} />
              <Text style={styles.collapsibleTitle}>Data Sources</Text>
              {/* Quick status indicator */}
              <View style={[styles.quickStatusDot, styles.sourceDotActive]} />
            </View>
          <Ionicons 
            name={sourcesExpanded ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color={Colors.textMuted} 
          />
        </Pressable>
        
        {sourcesExpanded && (
          <Card style={styles.statusCard}>
            <View style={styles.sourcesList}>
              <View style={styles.sourceItem}>
                <View style={[styles.sourceDot, styles.sourceDotActive]} />
                <Ionicons name="create-outline" size={16} color={Colors.primary} />
                <Text style={styles.sourceItemText}>Manual Entry</Text>
                <Text style={styles.sourceStatus}>Always Available</Text>
              </View>
              <View style={styles.sourceItem}>
                <View style={[styles.sourceDot, styles.sourceDotActive]} />
                <Ionicons name="chatbubble-outline" size={16} color="#8B5CF6" />
                <Text style={styles.sourceItemText}>LumiBot Prompts</Text>
                <Text style={styles.sourceStatus}>Active</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading health data...</Text>
          </View>
        )}

        {/* Empty State */}
        {!isLoading && error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.error} />
            <Text style={styles.errorTitle}>Unable to load health data</Text>
            <Text style={styles.errorSubtitle}>Pull to refresh and try again.</Text>
          </View>
        )}

        {!isLoading && !error && latestReadings.length === 0 && <EmptyState />}

        {/* Latest Readings */}
        {!isLoading && !error && latestReadings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest Readings</Text>
            <Text style={styles.sectionSubtitle}>
              Your most recent data from all sources
            </Text>
            
            {latestReadings.map((log) => (
              <VitalCard key={log.id} log={log} isLatest />
            ))}
          </View>
        )}

        {/* Collapsible Info Footer */}
        <Pressable 
          style={styles.infoToggle}
          onPress={() => setInfoExpanded(!infoExpanded)}
        >
          <Ionicons 
            name="information-circle-outline" 
            size={22} 
            color={Colors.textMuted} 
          />
          <Text style={styles.infoToggleText}>About this data</Text>
          <Ionicons 
            name={infoExpanded ? 'chevron-up' : 'chevron-down'} 
            size={18} 
            color={Colors.textMuted} 
          />
        </Pressable>
        
        {infoExpanded && (
          <View style={styles.infoSection}>
            <Text style={styles.infoText}>
              {infoDataSourcesText}{' '}
              Your caregivers can view this data on your shared dashboard.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <Pressable
        style={styles.fab}
        onPress={() => setShowLogMenu(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {/* Log Menu Modal */}
      <Modal
        visible={showLogMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogMenu(false)}
      >
        <Pressable
          style={styles.menuOverlay}
          onPress={() => setShowLogMenu(false)}
        >
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>Log Reading</Text>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleLogOption('bp')}
            >
              <Ionicons name="pulse-outline" size={28} color="#F97316" />
              <Text style={styles.menuItemText}>Blood Pressure</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleLogOption('glucose')}
            >
              <Ionicons name="water-outline" size={28} color="#8B5CF6" />
              <Text style={styles.menuItemText}>Blood Glucose</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleLogOption('weight')}
            >
              <Ionicons name="scale-outline" size={28} color="#6366F1" />
              <Text style={styles.menuItemText}>Weight</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuItem, styles.cancelItem]}
              onPress={() => setShowLogMenu(false)}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Log Modals */}
      <BPLogModal
        visible={showBPModal}
        onClose={() => setShowBPModal(false)}
        onSubmit={handleBPSubmit}
        isSubmitting={isSubmitting}
      />
      <GlucoseLogModal
        visible={showGlucoseModal}
        onClose={() => setShowGlucoseModal(false)}
        onSubmit={handleGlucoseSubmit}
        isSubmitting={isSubmitting}
      />
      <WeightLogModal
        visible={showWeightModal}
        onClose={() => setShowWeightModal(false)}
        onSubmit={handleWeightSubmit}
        isSubmitting={isSubmitting}
      />
    </SafeAreaView>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  disabledContainer: {
    padding: spacing(4),
  },
  disabledCard: {
    padding: spacing(5),
    alignItems: 'center',
    gap: spacing(2),
  },
  disabledTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    textAlign: 'center',
  },
  disabledSubtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
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
  scrollContent: {
    padding: spacing(4),
    paddingBottom: spacing(8),
  },

  // Collapsible Header
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(1),
    marginBottom: spacing(2),
  },
  collapsibleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  collapsibleTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  quickStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Status Card
  statusCard: {
    marginBottom: spacing(4),
  },
  sourcesList: {
    gap: spacing(2),
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  sourceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },
  sourceDotActive: {
    backgroundColor: Colors.success,
  },
  sourceItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  sourceStatus: {
    fontSize: 12,
    color: Colors.textMuted,
  },

  // Loading
  loadingContainer: {
    paddingVertical: spacing(8),
    alignItems: 'center',
    gap: spacing(3),
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: spacing(8),
    gap: spacing(2),
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  errorSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
  },

  // Empty State
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
    paddingHorizontal: spacing(4),
  },
  emptyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    borderRadius: Radius.lg,
    marginTop: spacing(2),
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },

  // Section
  section: {
    marginBottom: spacing(4),
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    marginBottom: spacing(1),
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: spacing(4),
  },

  // Vital Card
  vitalCard: {
    marginBottom: spacing(3),
  },
  vitalCardLatest: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  vitalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  vitalIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  vitalTitleContainer: {
    flex: 1,
  },
  vitalTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    marginTop: 2,
  },
  sourceLabel: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  vitalTimestamp: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  latestBadge: {
    backgroundColor: `${Colors.primary}15`,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: Radius.sm,
  },
  latestBadgeText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  vitalValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing(2),
  },
  vitalValue: {
    fontSize: 36,
    fontFamily: 'PlusJakartaSans_700Bold',
    letterSpacing: -1,
  },
  vitalUnit: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },

  // Alert Badge
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    marginTop: spacing(2),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    alignSelf: 'flex-start',
  },
  alertCaution: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  alertWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  alertEmergency: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  alertText: {
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: 'capitalize',
  },

  // Info Toggle & Section
  infoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    paddingVertical: spacing(3),
    marginTop: spacing(2),
  },
  infoToggleText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  infoSection: {
    backgroundColor: 'rgba(64, 201, 208, 0.08)',
    padding: spacing(4),
    borderRadius: Radius.lg,
    marginTop: spacing(1),
  },
  infoText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing(6),
    right: spacing(5),
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  // Log Menu Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    width: '80%',
    maxWidth: 320,
    paddingVertical: spacing(4),
  },
  menuTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: spacing(4),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(5),
    gap: spacing(3),
  },
  menuItemText: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
  },
  cancelItem: {
    marginTop: spacing(2),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: spacing(4),
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
