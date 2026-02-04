/**
 * Health Snapshot Card
 * 
 * A simple, clickable card matching the GlanceableCard pattern.
 * Shows unified health data from all sources:
 * - Apple HealthKit
 * - Manual entries  
 * - LumiBot prompts
 * 
 * Tapping navigates to the detailed health page.
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, spacing, Card } from './ui';
import { useHealthLogs } from '../lib/api/hooks';
import { haptic } from '../lib/haptics';

interface HealthSnapshotCardProps {
  /** User's medical conditions from their profile */
  medicalConditions?: string[];
  /** Maximum number of vitals to show (default: 3) */
  maxVitals?: number;
  /** Called when user taps "See All" */
  onSeeAll?: () => void;
}

export function HealthSnapshotCard({
  medicalConditions = [],
  maxVitals = 3,
  onSeeAll,
}: HealthSnapshotCardProps) {
  const router = useRouter();
  
  // Fetch unified health logs from all sources
  const { data: logs = [], isLoading } = useHealthLogs({ limit: 20 });

  // Count unique metric types that have data
  const metricStats = useMemo(() => {
    const vitalTypes = ['bp', 'glucose', 'weight', 'heart_rate', 'steps', 'oxygen_saturation'];
    const typesWithData = new Set<string>();
    let latestReading: { type: string; value: any; source: string; createdAt: string } | null = null;
    let todaySteps: { count: number } | null = null;
    
    // Get today's date string for comparison
    const today = new Date().toISOString().slice(0, 10);

    logs.forEach((log) => {
      if (vitalTypes.includes(log.type)) {
        typesWithData.add(log.type);
        
        // For steps, specifically look for TODAY's entry
        if (log.type === 'steps') {
          const stepDate = (log.value as any)?.date || log.createdAt?.slice(0, 10);
          if (stepDate === today) {
            todaySteps = log.value as { count: number };
          }
        }
        
        // Track the most recent non-steps reading for fallback display
        if (!latestReading && log.type !== 'steps') {
          latestReading = { type: log.type, value: log.value, source: log.source, createdAt: log.createdAt };
        }
      }
    });

    return {
      count: typesWithData.size,
      latestReading,
      todaySteps,
      hasData: typesWithData.size > 0,
    };
  }, [logs]);

  const handlePress = useCallback(() => {
    void haptic.selection();
    router.push('/health');
  }, [router]);

  // Hide on non-iOS (HealthKit only available on iOS)
  // But we still show the card since manual entries work everywhere
  // Actually, let's keep it iOS only for now since the health page is iOS focused
  if (Platform.OS !== 'ios') {
    return null;
  }

  // Determine badge text - prioritize today's steps
  let statusBadge: { text: string; color: string } | undefined;
  
  // First priority: Show today's steps if we have them (and count > 0)
  if (metricStats.todaySteps?.count && metricStats.todaySteps.count > 0) {
    statusBadge = { 
      text: `${metricStats.todaySteps.count.toLocaleString()} steps today`, 
      color: Colors.success 
    };
  } 
  // Fallback to other latest readings
  else if (metricStats.latestReading) {
    const { type, value } = metricStats.latestReading;
    
    if (type === 'bp' && value?.systolic) {
      statusBadge = { 
        text: `BP: ${value.systolic}/${value.diastolic}`, 
        color: '#F97316' 
      };
    } else if (type === 'glucose' && value?.reading) {
      statusBadge = { 
        text: `Glucose: ${value.reading} mg/dL`, 
        color: '#8B5CF6' 
      };
    } else if (type === 'weight' && value?.weight) {
      statusBadge = { 
        text: `Weight: ${value.weight} ${value.unit}`, 
        color: '#6366F1' 
      };
    }
  }

  return (
    <Pressable 
      onPress={handlePress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed
      ]}
    >
      <Card>
        <View style={styles.container}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons 
              name="fitness-outline" 
              size={22} 
              color={Colors.primary} 
            />
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Health Metrics</Text>
            
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : statusBadge ? (
              <View style={[styles.badge, { backgroundColor: `${statusBadge.color}1A` }]}>
                <Text style={[styles.badgeText, { color: statusBadge.color }]}>
                  {statusBadge.text}
                </Text>
              </View>
            ) : (
              <Text style={styles.emptyText}>Tap to view your health data</Text>
            )}
          </View>
          
          {/* Chevron */}
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    marginBottom: spacing(3),
  },
  pressed: {
    opacity: 0.85,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(64, 201, 208, 0.12)', // Match other cards - primary color
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    marginBottom: spacing(0.5),
    letterSpacing: 0.1,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  loadingText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing(1),
    borderRadius: 999,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
  },
  badgeText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});
