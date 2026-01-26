/**
 * HealthKit Card Component
 * Displays health data from Apple HealthKit in a beautiful card format
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from './ui';
import { useHealthKit, useHealthVitals } from '../lib/healthkit';
import type { HealthDataSummary } from '../lib/healthkit';

interface VitalItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit: string;
  color: string;
  subtext?: string;
}

function VitalItem({ icon, label, value, unit, color, subtext }: VitalItemProps) {
  return (
    <View style={styles.vitalItem}>
      <View style={[styles.vitalIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.vitalContent}>
        <Text style={styles.vitalLabel}>{label}</Text>
        <View style={styles.vitalValueRow}>
          <Text style={styles.vitalValue}>{value}</Text>
          <Text style={styles.vitalUnit}>{unit}</Text>
        </View>
        {subtext && <Text style={styles.vitalSubtext}>{subtext}</Text>}
      </View>
    </View>
  );
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatBloodPressure(systolic: number, diastolic: number): string {
  return `${Math.round(systolic)}/${Math.round(diastolic)}`;
}

interface HealthKitCardProps {
  onPress?: () => void;
}

export function HealthKitCard({ onPress }: HealthKitCardProps) {
  const healthKit = useHealthKit();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: vitals, isLoading, refetch } = useHealthVitals({
    enabled: healthKit.permissionStatus === 'authorized',
  });

  const handleConnect = useCallback(async () => {
    if (!healthKit.isAvailable) {
      Alert.alert(
        'HealthKit Not Available',
        'HealthKit is only available on iPhone. Please use the iOS app to sync your health data.',
      );
      return;
    }

    setIsConnecting(true);
    try {
      const success = await healthKit.requestPermissions();
      if (success) {
        refetch();
      }
    } catch (error) {
      console.error('[HealthKit] Connection error:', error);
      Alert.alert('Connection Error', 'Failed to connect to HealthKit. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  }, [healthKit, refetch]);

  // Not available on this platform
  if (Platform.OS !== 'ios') {
    return null;
  }

  // Not connected yet
  if (healthKit.permissionStatus !== 'authorized') {
    return (
      <Card style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: `${Colors.error}15` }]}>
            <Ionicons name="heart" size={24} color={Colors.error} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Apple Health</Text>
            <Text style={styles.subtitle}>Connect to see your vitals</Text>
          </View>
        </View>

        <Pressable
          style={[styles.connectButton, isConnecting && styles.connectButtonDisabled]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="link-outline" size={18} color="#fff" />
              <Text style={styles.connectButtonText}>Connect HealthKit</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.privacyNote}>
          Your health data stays on your device. We never store or share it without your consent.
        </Text>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Card style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading health data...</Text>
        </View>
      </Card>
    );
  }

  // Has data
  const hasAnyData = vitals && (
    vitals.latestWeight ||
    vitals.latestHeartRate ||
    vitals.latestBloodPressure ||
    vitals.latestBloodGlucose ||
    vitals.latestOxygenSaturation ||
    vitals.latestBodyTemperature
  );

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: `${Colors.error}15` }]}>
            <Ionicons name="heart" size={24} color={Colors.error} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Health Vitals</Text>
            <Text style={styles.subtitle}>From Apple Health</Text>
          </View>
          <Pressable onPress={() => refetch()} style={styles.refreshButton}>
            <Ionicons name="refresh-outline" size={20} color={Colors.textMuted} />
          </Pressable>
        </View>

        {!hasAnyData ? (
          <View style={styles.emptyState}>
            <Ionicons name="fitness-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No health data available</Text>
            <Text style={styles.emptySubtext}>
              Record your vitals in Apple Health or with a compatible device
            </Text>
          </View>
        ) : (
          <View style={styles.vitalsGrid}>
            {vitals?.latestWeight && (
              <VitalItem
                icon="scale-outline"
                label="Weight"
                value={vitals.latestWeight.value.toFixed(1)}
                unit={vitals.latestWeight.unit}
                color="#6366F1"
                subtext={formatRelativeTime(vitals.latestWeight.date)}
              />
            )}

            {vitals?.latestHeartRate && (
              <VitalItem
                icon="heart-outline"
                label="Heart Rate"
                value={String(vitals.latestHeartRate.value)}
                unit={vitals.latestHeartRate.unit}
                color="#EF4444"
                subtext={formatRelativeTime(vitals.latestHeartRate.date)}
              />
            )}

            {vitals?.latestBloodPressure && (
              <VitalItem
                icon="pulse-outline"
                label="Blood Pressure"
                value={formatBloodPressure(
                  vitals.latestBloodPressure.systolic,
                  vitals.latestBloodPressure.diastolic
                )}
                unit={vitals.latestBloodPressure.unit}
                color="#F97316"
                subtext={formatRelativeTime(vitals.latestBloodPressure.date)}
              />
            )}

            {vitals?.latestBloodGlucose && (
              <VitalItem
                icon="water-outline"
                label="Blood Glucose"
                value={String(Math.round(vitals.latestBloodGlucose.value))}
                unit={vitals.latestBloodGlucose.unit}
                color="#8B5CF6"
                subtext={formatRelativeTime(vitals.latestBloodGlucose.date)}
              />
            )}

            {vitals?.latestOxygenSaturation && (
              <VitalItem
                icon="fitness-outline"
                label="Blood Oxygen"
                value={String(vitals.latestOxygenSaturation.value)}
                unit={vitals.latestOxygenSaturation.unit}
                color="#3B82F6"
                subtext={formatRelativeTime(vitals.latestOxygenSaturation.date)}
              />
            )}

            {vitals?.latestBodyTemperature && (
              <VitalItem
                icon="thermometer-outline"
                label="Temperature"
                value={vitals.latestBodyTemperature.value.toFixed(1)}
                unit={vitals.latestBodyTemperature.unit}
                color="#F59E0B"
                subtext={formatRelativeTime(vitals.latestBodyTemperature.date)}
              />
            )}
          </View>
        )}

        {onPress && (
          <View style={styles.footer}>
            <Text style={styles.footerText}>Tap to see details</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing(4),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(4),
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  refreshButton: {
    padding: spacing(2),
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
    gap: spacing(2),
    marginBottom: spacing(3),
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  privacyNote: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing(6),
  },
  loadingText: {
    marginTop: spacing(3),
    color: Colors.textMuted,
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing(4),
  },
  emptyText: {
    marginTop: spacing(3),
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  emptySubtext: {
    marginTop: spacing(1),
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  vitalsGrid: {
    gap: spacing(3),
  },
  vitalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(2),
  },
  vitalIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  vitalContent: {
    flex: 1,
  },
  vitalLabel: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  vitalValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing(1),
  },
  vitalValue: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.text,
  },
  vitalUnit: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  vitalSubtext: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing(4),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: Colors.stroke,
    gap: spacing(1),
  },
  footerText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
});
