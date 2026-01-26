/**
 * HealthKit Types for LumiMD
 * Type definitions for Apple HealthKit data integration
 */

// HealthKit data types we're interested in reading
export type HealthKitDataType =
  | 'Weight'
  | 'HeartRate'
  | 'BloodPressureSystolic'
  | 'BloodPressureDiastolic'
  | 'BloodGlucose'
  | 'OxygenSaturation'
  | 'BodyTemperature'
  | 'RespiratoryRate'
  | 'StepCount'
  | 'DistanceWalkingRunning'
  | 'ActiveEnergyBurned'
  | 'SleepAnalysis';

// Permission status
export type HealthKitPermissionStatus = 'unknown' | 'authorized' | 'denied' | 'unavailable';

// Generic health sample
export interface HealthSample {
  id: string;
  value: number;
  unit: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  sourceName?: string;
  sourceId?: string;
}

// Blood pressure is special - it has two values
export interface BloodPressureSample {
  id: string;
  systolic: number;
  diastolic: number;
  unit: string;
  startDate: string;
  endDate: string;
  sourceName?: string;
  sourceId?: string;
}

// Sleep has categories
export type SleepCategory = 'inBed' | 'asleepCore' | 'asleepDeep' | 'asleepREM' | 'awake';

export interface SleepSample {
  id: string;
  category: SleepCategory;
  startDate: string;
  endDate: string;
  durationMinutes: number;
  sourceName?: string;
  sourceId?: string;
}

// Aggregated data for display
export interface HealthDataSummary {
  // Vitals
  latestWeight?: {
    value: number;
    unit: string;
    date: string;
  };
  latestHeartRate?: {
    value: number;
    unit: string;
    date: string;
  };
  latestBloodPressure?: {
    systolic: number;
    diastolic: number;
    unit: string;
    date: string;
  };
  latestBloodGlucose?: {
    value: number;
    unit: string;
    date: string;
  };
  latestOxygenSaturation?: {
    value: number;
    unit: string;
    date: string;
  };
  latestBodyTemperature?: {
    value: number;
    unit: string;
    date: string;
  };

  // Activity (today)
  todaySteps?: number;
  todayDistance?: {
    value: number;
    unit: string;
  };
  todayActiveCalories?: number;

  // Heart rate statistics
  heartRateStats?: {
    min: number;
    max: number;
    average: number;
    resting?: number;
    period: 'today' | 'week' | 'month';
  };

  // Sleep (last night)
  lastNightSleep?: {
    totalMinutes: number;
    inBedMinutes: number;
    asleepMinutes: number;
    deepSleepMinutes?: number;
    remSleepMinutes?: number;
  };
}

// Query options for fetching health data
export interface HealthQueryOptions {
  startDate: Date;
  endDate: Date;
  limit?: number;
  ascending?: boolean;
}

// Units for different data types
export const HEALTH_UNITS = {
  Weight: 'lb', // Can also be 'kg'
  HeartRate: 'bpm',
  BloodPressureSystolic: 'mmHg',
  BloodPressureDiastolic: 'mmHg',
  BloodGlucose: 'mg/dL',
  OxygenSaturation: '%',
  BodyTemperature: '°F', // Can also be '°C'
  RespiratoryRate: 'breaths/min',
  StepCount: 'count',
  DistanceWalkingRunning: 'mi', // Can also be 'km'
  ActiveEnergyBurned: 'kcal',
} as const;

// Human-readable labels
export const HEALTH_LABELS: Record<HealthKitDataType, string> = {
  Weight: 'Weight',
  HeartRate: 'Heart Rate',
  BloodPressureSystolic: 'Blood Pressure (Systolic)',
  BloodPressureDiastolic: 'Blood Pressure (Diastolic)',
  BloodGlucose: 'Blood Glucose',
  OxygenSaturation: 'Blood Oxygen',
  BodyTemperature: 'Body Temperature',
  RespiratoryRate: 'Respiratory Rate',
  StepCount: 'Steps',
  DistanceWalkingRunning: 'Walking + Running Distance',
  ActiveEnergyBurned: 'Active Calories',
  SleepAnalysis: 'Sleep',
};

// Icons for different data types (Ionicons names)
export const HEALTH_ICONS: Record<HealthKitDataType, string> = {
  Weight: 'scale-outline',
  HeartRate: 'heart-outline',
  BloodPressureSystolic: 'pulse-outline',
  BloodPressureDiastolic: 'pulse-outline',
  BloodGlucose: 'water-outline',
  OxygenSaturation: 'fitness-outline',
  BodyTemperature: 'thermometer-outline',
  RespiratoryRate: 'medical-outline',
  StepCount: 'footsteps-outline',
  DistanceWalkingRunning: 'walk-outline',
  ActiveEnergyBurned: 'flame-outline',
  SleepAnalysis: 'moon-outline',
};

// Colors for different data types
export const HEALTH_COLORS: Record<HealthKitDataType, string> = {
  Weight: '#6366F1', // Indigo
  HeartRate: '#EF4444', // Red
  BloodPressureSystolic: '#F97316', // Orange
  BloodPressureDiastolic: '#F97316', // Orange
  BloodGlucose: '#8B5CF6', // Purple
  OxygenSaturation: '#3B82F6', // Blue
  BodyTemperature: '#F59E0B', // Amber
  RespiratoryRate: '#10B981', // Emerald
  StepCount: '#22C55E', // Green
  DistanceWalkingRunning: '#14B8A6', // Teal
  ActiveEnergyBurned: '#F43F5E', // Rose
  SleepAnalysis: '#6366F1', // Indigo
};
