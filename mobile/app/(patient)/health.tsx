/**
 * Health Metrics Hub
 *
 * Shows UNIFIED health data from all sources with trend charts,
 * trend insights, and history sections for BP, glucose, and weight.
 *
 * Accepts optional navigation params:
 *   type: 'bp' | 'glucose' | 'weight' — pre-selects the metric type
 *   highlight: string — health log ID to scroll to (future)
 */

import React, { useCallback, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Dimensions,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../../components/ui';
import { useHealthLogs, useHealthInsights } from '../../lib/api/hooks';
import type { HealthLog, HealthLogSource, TrendInsight } from '@lumimd/sdk';
import { BPLogModal, GlucoseLogModal, WeightLogModal } from '../../components/lumibot';
import type { WeightValue } from '../../components/lumibot';
import { api } from '../../lib/api/client';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';

// ============================================================================
// Types
// ============================================================================

type MetricType = 'bp' | 'glucose' | 'weight';
type PeriodDays = 7 | 30 | 90;

const METRIC_CONFIGS: Record<MetricType, {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  unit: string;
}> = {
  bp: { icon: 'pulse', color: '#F97316', label: 'Blood Pressure', unit: 'mmHg' },
  glucose: { icon: 'water', color: '#8B5CF6', label: 'Blood Glucose', unit: 'mg/dL' },
  weight: { icon: 'scale', color: '#6366F1', label: 'Weight', unit: 'lbs' },
};

// ============================================================================
// Chart Component — Simple SVG Line Chart
// ============================================================================

interface ChartDataPoint {
  date: Date;
  value: number;
  label: string;
  value2?: number; // For BP diastolic
}

interface TrendChartProps {
  data: ChartDataPoint[];
  color: string;
  color2?: string; // For BP diastolic line
  unit: string;
  height?: number;
}

const CHART_PADDING = { top: 20, right: 16, bottom: 30, left: 48 };
const screenWidth = Dimensions.get('window').width;

function TrendChart({ data, color, color2, unit, height = 180 }: TrendChartProps) {
  if (data.length === 0) return null;

  const chartWidth = screenWidth - spacing(8) - CHART_PADDING.left - CHART_PADDING.right - 32;
  const chartHeight = height - CHART_PADDING.top - CHART_PADDING.bottom;
  const totalWidth = screenWidth - spacing(8) - 32;

  if (data.length === 1) {
    return (
      <View style={styles.singlePointContainer}>
        <Text style={[styles.singlePointValue, { color }]}>{data[0].label}</Text>
        <Text style={styles.singlePointUnit}>{unit}</Text>
        <Text style={styles.singlePointDate}>
          {data[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Text>
      </View>
    );
  }

  // Calculate bounds
  const allValues = data.flatMap(d => d.value2 !== undefined ? [d.value, d.value2] : [d.value]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 10;
  const yMin = minVal - range * 0.1;
  const yMax = maxVal + range * 0.1;

  const scaleX = (i: number) => CHART_PADDING.left + (i / (data.length - 1)) * chartWidth;
  const scaleY = (v: number) => CHART_PADDING.top + chartHeight - ((v - yMin) / (yMax - yMin)) * chartHeight;

  // Build polyline points
  const points = data.map((d, i) => `${scaleX(i)},${scaleY(d.value)}`).join(' ');
  const points2 = color2
    ? data.filter(d => d.value2 !== undefined).map((d) => `${scaleX(data.indexOf(d))},${scaleY(d.value2!)}`).join(' ')
    : '';

  // Y-axis labels (3 lines)
  const yLabels = [yMax, (yMax + yMin) / 2, yMin].map(v => Math.round(v));

  // X-axis labels (first, middle, last)
  const xIndices = data.length <= 3 ? data.map((_, i) => i) : [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <Svg width={totalWidth} height={height}>
      {/* Grid lines */}
      {yLabels.map((v, i) => (
        <React.Fragment key={`grid-${i}`}>
          <Line
            x1={CHART_PADDING.left}
            y1={scaleY(v)}
            x2={CHART_PADDING.left + chartWidth}
            y2={scaleY(v)}
            stroke="rgba(0,0,0,0.06)"
            strokeWidth={1}
          />
          <SvgText
            x={CHART_PADDING.left - 8}
            y={scaleY(v) + 4}
            textAnchor="end"
            fill="rgba(0,0,0,0.4)"
            fontSize={11}
          >
            {v}
          </SvgText>
        </React.Fragment>
      ))}

      {/* X-axis labels */}
      {xIndices.map(idx => (
        <SvgText
          key={`x-${idx}`}
          x={scaleX(idx)}
          y={height - 6}
          textAnchor="middle"
          fill="rgba(0,0,0,0.4)"
          fontSize={10}
        >
          {data[idx].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </SvgText>
      ))}

      {/* Secondary line (diastolic for BP) */}
      {points2 ? (
        <Polyline
          points={points2}
          fill="none"
          stroke={color2!}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.6}
        />
      ) : null}

      {/* Primary line */}
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {data.map((d, i) => (
        <Circle
          key={`pt-${i}`}
          cx={scaleX(i)}
          cy={scaleY(d.value)}
          r={3.5}
          fill={color}
        />
      ))}
    </Svg>
  );
}

// ============================================================================
// Insight Card
// ============================================================================

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string }> = {
  positive: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.2)', icon: 'checkmark-circle', iconColor: '#22C55E' },
  info: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.2)', icon: 'information-circle', iconColor: '#3B82F6' },
  attention: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.2)', icon: 'alert-circle', iconColor: '#F59E0B' },
  concern: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)', icon: 'warning', iconColor: '#EF4444' },
};

function InsightCard({ insight }: { insight: TrendInsight }) {
  const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;

  return (
    <View style={[styles.insightCard, { backgroundColor: style.bg, borderColor: style.border }]}>
      <View style={styles.insightHeader}>
        <Ionicons name={style.icon} size={20} color={style.iconColor} />
        <Text style={styles.insightTitle}>{insight.title}</Text>
      </View>
      <Text style={styles.insightMessage}>{insight.message}</Text>
      {insight.severity !== 'positive' && (
        <Text style={styles.insightDisclaimer}>
          Share this pattern with your doctor.
        </Text>
      )}
    </View>
  );
}

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

function getSourceLabel(source: HealthLogSource): string {
  switch (source) {
    case 'manual': return 'Manual';
    case 'nudge': return 'LumiBot';
    case 'quick_log': return 'Quick Log';
    default: return 'Logged';
  }
}

function formatLogValue(type: string, value: any): string {
  switch (type) {
    case 'bp': return `${value.systolic}/${value.diastolic}`;
    case 'glucose': return `${Math.round(value.reading)}`;
    case 'weight': return `${value.weight}`;
    default: return JSON.stringify(value);
  }
}

function logsToChartData(logs: HealthLog[], type: MetricType): ChartDataPoint[] {
  return logs
    .filter(l => l.type === type)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(l => {
      const date = new Date(l.createdAt);
      if (type === 'bp') {
        const v = l.value as { systolic: number; diastolic: number };
        return { date, value: v.systolic, value2: v.diastolic, label: `${v.systolic}/${v.diastolic}` };
      }
      if (type === 'glucose') {
        const v = l.value as { reading: number };
        return { date, value: v.reading, label: `${Math.round(v.reading)}` };
      }
      const v = l.value as { weight: number };
      return { date, value: v.weight, label: `${v.weight}` };
    });
}

// ============================================================================
// Main Screen
// ============================================================================

export default function HealthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; highlight?: string }>();

  // State
  const [selectedType, setSelectedType] = useState<MetricType>(
    (params.type as MetricType) || 'bp',
  );
  const [period, setPeriod] = useState<PeriodDays>(30);
  const [showLogMenu, setShowLogMenu] = useState(false);
  const [showBPModal, setShowBPModal] = useState(false);
  const [showGlucoseModal, setShowGlucoseModal] = useState(false);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data — fetch all logs for the selected type (up to 100)
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - period);
    return d.toISOString();
  }, [period]);

  const {
    data: logs = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useHealthLogs(
    { type: selectedType, limit: 100 },
    { enabled: true },
  );

  const {
    data: insightsData,
  } = useHealthInsights(
    { type: selectedType, days: period },
    { enabled: true },
  );

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Chart data — filter to period
  const chartData = useMemo(() => {
    const periodStart = new Date(startDate);
    const filtered = logs.filter(l => new Date(l.createdAt) >= periodStart);
    return logsToChartData(filtered, selectedType);
  }, [logs, selectedType, startDate]);

  // Recent readings (filtered by period)
  const recentLogs = useMemo(() => {
    const periodStart = new Date(startDate);
    return logs
      .filter(l => l.type === selectedType && new Date(l.createdAt) >= periodStart)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [logs, selectedType, startDate]);

  // Logging handlers
  const handleLogOption = useCallback((option: MetricType) => {
    setShowLogMenu(false);
    if (option === 'bp') setShowBPModal(true);
    else if (option === 'glucose') setShowGlucoseModal(true);
    else if (option === 'weight') setShowWeightModal(true);
  }, []);

  const handleBPSubmit = useCallback(async (value: { systolic: number; diastolic: number; pulse?: number }) => {
    setIsSubmitting(true);
    try {
      const response = await api.healthLogs.create({ type: 'bp', value, source: 'manual' });
      Alert.alert('Success', 'Blood pressure logged successfully');
      setShowBPModal(false);
      refetch();
      return { alertLevel: response.alertLevel, alertMessage: response.alertMessage, shouldShowAlert: response.shouldShowAlert };
    } catch {
      Alert.alert('Error', 'Failed to log blood pressure. Please try again.');
      return {};
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  const handleGlucoseSubmit = useCallback(async (value: { reading: number; timing?: 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random' }) => {
    setIsSubmitting(true);
    try {
      const response = await api.healthLogs.create({ type: 'glucose', value, source: 'manual' });
      Alert.alert('Success', 'Blood glucose logged successfully');
      setShowGlucoseModal(false);
      refetch();
      return { alertLevel: response.alertLevel, alertMessage: response.alertMessage, shouldShowAlert: response.shouldShowAlert };
    } catch {
      Alert.alert('Error', 'Failed to log blood glucose. Please try again.');
      return {};
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  const handleWeightSubmit = useCallback(async (value: WeightValue) => {
    setIsSubmitting(true);
    try {
      await api.healthLogs.create({ type: 'weight', value, source: 'manual' });
      Alert.alert('Success', 'Weight logged successfully');
      setShowWeightModal(false);
      refetch();
      return {};
    } catch {
      Alert.alert('Error', 'Failed to log weight. Please try again.');
      return {};
    } finally {
      setIsSubmitting(false);
    }
  }, [refetch]);

  const config = METRIC_CONFIGS[selectedType];
  const insights = insightsData?.insights ?? [];

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Health</Text>
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
        {/* Metric Type Selector */}
        <View style={styles.typeSelector}>
          {(Object.entries(METRIC_CONFIGS) as [MetricType, typeof config][]).map(([type, cfg]) => (
            <Pressable
              key={type}
              style={[
                styles.typeTab,
                selectedType === type && { backgroundColor: `${cfg.color}15`, borderColor: cfg.color },
              ]}
              onPress={() => setSelectedType(type)}
            >
              <Ionicons name={cfg.icon} size={18} color={selectedType === type ? cfg.color : Colors.textMuted} />
              <Text style={[
                styles.typeTabText,
                selectedType === type && { color: cfg.color, fontFamily: 'PlusJakartaSans_600SemiBold' },
              ]}>
                {type === 'bp' ? 'BP' : type === 'glucose' ? 'Glucose' : 'Weight'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {([7, 30, 90] as PeriodDays[]).map(d => (
            <Pressable
              key={d}
              style={[styles.periodTab, period === d && styles.periodTabActive]}
              onPress={() => setPeriod(d)}
            >
              <Text style={[styles.periodTabText, period === d && styles.periodTabTextActive]}>
                {d === 7 ? '7 Days' : d === 30 ? '30 Days' : '90 Days'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={config.color} />
            <Text style={styles.loadingText}>Loading health data...</Text>
          </View>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <View style={styles.emptyContainer}>
            <Ionicons name="alert-circle-outline" size={40} color={Colors.error} />
            <Text style={styles.emptyTitle}>Unable to load health data</Text>
            <Text style={styles.emptySubtitle}>Pull to refresh and try again.</Text>
          </View>
        )}

        {/* Chart Section */}
        {!isLoading && !error && (
          <Card style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <View style={[styles.chartIconBg, { backgroundColor: `${config.color}15` }]}>
                <Ionicons name={config.icon} size={22} color={config.color} />
              </View>
              <View>
                <Text style={styles.chartTitle}>{config.label}</Text>
                {chartData.length > 0 && (
                  <Text style={styles.chartSubtitle}>
                    {chartData.length} reading{chartData.length !== 1 ? 's' : ''} in {period} days
                  </Text>
                )}
              </View>
            </View>

            {chartData.length === 0 ? (
              <View style={styles.noDataContainer}>
                <Ionicons name="analytics-outline" size={36} color={Colors.textMuted} />
                <Text style={styles.noDataText}>
                  No {config.label.toLowerCase()} readings yet
                </Text>
                <Pressable
                  style={[styles.logButton, { backgroundColor: config.color }]}
                  onPress={() => handleLogOption(selectedType)}
                >
                  <Text style={styles.logButtonText}>Log {config.label}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.chartContainer}>
                <TrendChart
                  data={chartData}
                  color={config.color}
                  color2={selectedType === 'bp' ? '#FB923C' : undefined}
                  unit={config.unit}
                />
                {selectedType === 'bp' && (
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: config.color }]} />
                      <Text style={styles.legendText}>Systolic</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#FB923C' }]} />
                      <Text style={styles.legendText}>Diastolic</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </Card>
        )}

        {/* Trend Insights */}
        {!isLoading && insights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Insights</Text>
            {insights.map((insight, i) => (
              <InsightCard key={`${insight.pattern}-${i}`} insight={insight} />
            ))}
            <Text style={styles.tierDisclaimer}>
              Based on the data you've logged. Share with your doctor for clinical interpretation.
            </Text>
          </View>
        )}

        {/* Recent Readings */}
        {!isLoading && !error && recentLogs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Readings</Text>
            {recentLogs.slice(0, 10).map(log => (
              <View key={log.id} style={styles.readingRow}>
                <View style={styles.readingLeft}>
                  <Text style={[styles.readingValue, { color: config.color }]}>
                    {formatLogValue(log.type, log.value)}
                  </Text>
                  <Text style={styles.readingUnit}>{config.unit}</Text>
                </View>
                <View style={styles.readingRight}>
                  <Text style={styles.readingTime}>{formatRelativeTime(log.createdAt)}</Text>
                  <Text style={styles.readingSource}>{getSourceLabel(log.source)}</Text>
                </View>
                {log.alertLevel && log.alertLevel !== 'normal' && (
                  <View style={[
                    styles.alertDot,
                    log.alertLevel === 'warning' && { backgroundColor: '#F59E0B' },
                    log.alertLevel === 'caution' && { backgroundColor: '#F59E0B' },
                    log.alertLevel === 'emergency' && { backgroundColor: '#EF4444' },
                  ]} />
                )}
              </View>
            ))}
          </View>
        )}

        {/* Tier 2 Disclaimer */}
        <View style={styles.disclaimerSection}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.disclaimerText}>
            For informational and tracking purposes only. Not medical advice.
            Your care team can help you understand your numbers.
          </Text>
        </View>
      </ScrollView>

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: config.color }]}
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
    fontSize: 18,
    fontFamily: 'Fraunces_600SemiBold',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  scrollContent: {
    padding: spacing(4),
    paddingBottom: spacing(20),
  },

  // Type Selector
  typeSelector: {
    flexDirection: 'row',
    gap: spacing(2),
    marginBottom: spacing(3),
  },
  typeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2.5),
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  typeTabText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },

  // Period Selector
  periodSelector: {
    flexDirection: 'row',
    gap: spacing(2),
    marginBottom: spacing(4),
  },
  periodTab: {
    flex: 1,
    paddingVertical: spacing(1.5),
    borderRadius: Radius.sm,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  periodTabActive: {
    backgroundColor: Colors.primary,
  },
  periodTabText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  periodTabTextActive: {
    color: '#fff',
    fontFamily: 'PlusJakartaSans_600SemiBold',
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

  // Empty / Error
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing(8),
    gap: spacing(2),
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Fraunces_600SemiBold',
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Chart Card
  chartCard: {
    marginBottom: spacing(4),
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    marginBottom: spacing(3),
  },
  chartIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  chartSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 1,
  },
  chartContainer: {
    marginHorizontal: -spacing(2),
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing(4),
    marginTop: spacing(1),
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textMuted,
  },

  // Single Point
  singlePointContainer: {
    alignItems: 'center',
    paddingVertical: spacing(4),
    gap: spacing(1),
  },
  singlePointValue: {
    fontSize: 36,
    fontFamily: 'Fraunces_700Bold',
    letterSpacing: -1,
  },
  singlePointUnit: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  singlePointDate: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: spacing(1),
  },

  // No Data
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: spacing(4),
    gap: spacing(2),
  },
  noDataText: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  logButton: {
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(2.5),
    borderRadius: Radius.lg,
    marginTop: spacing(1),
  },
  logButtonText: {
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
    fontFamily: 'Fraunces_600SemiBold',
    color: Colors.text,
    marginBottom: spacing(3),
    letterSpacing: -0.2,
  },

  // Insight Card
  insightCard: {
    padding: spacing(3.5),
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: spacing(2),
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginBottom: spacing(1.5),
  },
  insightTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    flex: 1,
  },
  insightMessage: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    paddingLeft: spacing(7),
  },
  insightDisclaimer: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingLeft: spacing(7),
    marginTop: spacing(1.5),
  },

  // Recent Readings
  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(2.5),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  readingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing(1),
  },
  readingValue: {
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    letterSpacing: -0.5,
  },
  readingUnit: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  readingRight: {
    alignItems: 'flex-end',
  },
  readingTime: {
    fontSize: 13,
    color: Colors.text,
  },
  readingSource: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing(2),
    backgroundColor: '#F59E0B',
  },

  // Disclaimer
  disclaimerSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(2),
    paddingTop: spacing(2),
    marginTop: spacing(2),
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
    fontStyle: 'italic',
  },

  tierDisclaimer: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing(1),
    lineHeight: 16,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: spacing(6),
    right: spacing(5),
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
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
