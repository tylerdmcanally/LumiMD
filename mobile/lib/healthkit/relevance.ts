/**
 * Health Data Relevance Engine
 * 
 * Determines which health metrics are most relevant to show a user
 * based on their medical conditions, recency of data, and clinical importance.
 */

import type { HealthDataSummary, HealthKitDataType } from './types';

// Medical condition to relevant metrics mapping
const CONDITION_RELEVANCE: Record<string, HealthKitDataType[]> = {
  // Cardiovascular
  'hypertension': ['BloodPressureSystolic', 'BloodPressureDiastolic', 'HeartRate', 'Weight'],
  'high blood pressure': ['BloodPressureSystolic', 'BloodPressureDiastolic', 'HeartRate', 'Weight'],
  'heart disease': ['HeartRate', 'BloodPressureSystolic', 'OxygenSaturation', 'Weight'],
  'heart failure': ['Weight', 'HeartRate', 'OxygenSaturation', 'BloodPressureSystolic'],
  'atrial fibrillation': ['HeartRate', 'BloodPressureSystolic'],
  'afib': ['HeartRate', 'BloodPressureSystolic'],
  
  // Metabolic
  'diabetes': ['BloodGlucose', 'Weight', 'BloodPressureSystolic'],
  'type 1 diabetes': ['BloodGlucose', 'Weight'],
  'type 2 diabetes': ['BloodGlucose', 'Weight', 'BloodPressureSystolic'],
  'prediabetes': ['BloodGlucose', 'Weight'],
  'obesity': ['Weight', 'StepCount', 'ActiveEnergyBurned'],
  'overweight': ['Weight', 'StepCount'],
  
  // Respiratory
  'asthma': ['OxygenSaturation', 'RespiratoryRate', 'HeartRate'],
  'copd': ['OxygenSaturation', 'RespiratoryRate', 'HeartRate'],
  'sleep apnea': ['OxygenSaturation', 'SleepAnalysis', 'HeartRate'],
  
  // Other
  'thyroid': ['Weight', 'HeartRate', 'BodyTemperature'],
  'hypothyroidism': ['Weight', 'HeartRate', 'BodyTemperature'],
  'hyperthyroidism': ['Weight', 'HeartRate', 'BodyTemperature'],
  'anxiety': ['HeartRate', 'SleepAnalysis'],
  'insomnia': ['SleepAnalysis', 'HeartRate'],
};

// Default metrics for users without specific conditions
const DEFAULT_METRICS: HealthKitDataType[] = [
  'HeartRate',
  'Weight', 
  'StepCount',
];

// Clinical priority (higher = more important to show)
const METRIC_PRIORITY: Record<HealthKitDataType, number> = {
  BloodPressureSystolic: 90,
  BloodPressureDiastolic: 90,
  BloodGlucose: 85,
  HeartRate: 80,
  OxygenSaturation: 75,
  Weight: 70,
  BodyTemperature: 65,
  RespiratoryRate: 60,
  StepCount: 50,
  SleepAnalysis: 45,
  DistanceWalkingRunning: 40,
  ActiveEnergyBurned: 35,
};

export interface RelevantMetric {
  type: HealthKitDataType;
  reason: 'condition' | 'default' | 'recent';
  priority: number;
}

/**
 * Analyzes user's medical conditions and determines which health metrics
 * are most relevant to display.
 */
export function getRelevantMetrics(
  medicalConditions: string[],
  maxMetrics: number = 3
): RelevantMetric[] {
  const metricScores = new Map<HealthKitDataType, { score: number; reason: 'condition' | 'default' }>();

  // Score metrics based on medical conditions
  for (const condition of medicalConditions) {
    const normalizedCondition = condition.toLowerCase().trim();
    
    // Check for exact matches first
    if (CONDITION_RELEVANCE[normalizedCondition]) {
      const relevantMetrics = CONDITION_RELEVANCE[normalizedCondition];
      relevantMetrics.forEach((metric, index) => {
        const positionBonus = (relevantMetrics.length - index) * 10;
        const currentScore = metricScores.get(metric)?.score || 0;
        const newScore = METRIC_PRIORITY[metric] + positionBonus + 50; // +50 for condition match
        
        if (newScore > currentScore) {
          metricScores.set(metric, { score: newScore, reason: 'condition' });
        }
      });
      continue;
    }
    
    // Check for partial matches
    for (const [key, relevantMetrics] of Object.entries(CONDITION_RELEVANCE)) {
      if (normalizedCondition.includes(key) || key.includes(normalizedCondition)) {
        relevantMetrics.forEach((metric, index) => {
          const positionBonus = (relevantMetrics.length - index) * 10;
          const currentScore = metricScores.get(metric)?.score || 0;
          const newScore = METRIC_PRIORITY[metric] + positionBonus + 30; // +30 for partial match
          
          if (newScore > currentScore) {
            metricScores.set(metric, { score: newScore, reason: 'condition' });
          }
        });
      }
    }
  }

  // If no condition-based metrics, use defaults
  if (metricScores.size === 0) {
    DEFAULT_METRICS.forEach((metric, index) => {
      metricScores.set(metric, {
        score: METRIC_PRIORITY[metric] + (DEFAULT_METRICS.length - index) * 5,
        reason: 'default',
      });
    });
  }

  // Sort by score and take top N
  const sortedMetrics = Array.from(metricScores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, maxMetrics)
    .map(([type, { score, reason }]) => ({
      type,
      reason,
      priority: score,
    }));

  return sortedMetrics;
}

/**
 * Filters a HealthDataSummary to only include the most relevant metrics
 * for a given user based on their conditions.
 */
export function filterToRelevantVitals(
  summary: HealthDataSummary,
  medicalConditions: string[],
  maxItems: number = 3
): Partial<HealthDataSummary> {
  const relevantMetrics = getRelevantMetrics(medicalConditions, maxItems);
  const filtered: Partial<HealthDataSummary> = {};

  for (const metric of relevantMetrics) {
    switch (metric.type) {
      case 'Weight':
        if (summary.latestWeight) filtered.latestWeight = summary.latestWeight;
        break;
      case 'HeartRate':
        if (summary.latestHeartRate) filtered.latestHeartRate = summary.latestHeartRate;
        break;
      case 'BloodPressureSystolic':
      case 'BloodPressureDiastolic':
        if (summary.latestBloodPressure) filtered.latestBloodPressure = summary.latestBloodPressure;
        break;
      case 'BloodGlucose':
        if (summary.latestBloodGlucose) filtered.latestBloodGlucose = summary.latestBloodGlucose;
        break;
      case 'OxygenSaturation':
        if (summary.latestOxygenSaturation) filtered.latestOxygenSaturation = summary.latestOxygenSaturation;
        break;
      case 'BodyTemperature':
        if (summary.latestBodyTemperature) filtered.latestBodyTemperature = summary.latestBodyTemperature;
        break;
      case 'StepCount':
        if (summary.todaySteps !== undefined) filtered.todaySteps = summary.todaySteps;
        break;
      case 'SleepAnalysis':
        if (summary.lastNightSleep) filtered.lastNightSleep = summary.lastNightSleep;
        break;
    }
  }

  return filtered;
}

/**
 * Gets a human-readable explanation of why certain metrics are shown
 */
export function getRelevanceExplanation(
  relevantMetrics: RelevantMetric[],
  medicalConditions: string[]
): string {
  const conditionMetrics = relevantMetrics.filter(m => m.reason === 'condition');
  
  if (conditionMetrics.length > 0 && medicalConditions.length > 0) {
    return `Based on your health profile`;
  }
  
  return 'Your key health metrics';
}
