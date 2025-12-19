/**
 * Trend Analyzer Service
 * 
 * Analyzes health log data to detect patterns and provide
 * proactive lifestyle suggestions (NOT medical advice).
 * 
 * Uses simple statistical analysis - no AI API calls.
 */

import * as functions from 'firebase-functions';

// =============================================================================
// Types
// =============================================================================

export interface TrendInsight {
    type: 'weight' | 'bp' | 'glucose';
    pattern: string;
    severity: 'positive' | 'info' | 'attention' | 'concern';
    title: string;
    message: string;
    data: {
        currentValue?: number;
        previousValue?: number;
        changeAmount?: number;
        changePercent?: number;
        daysAnalyzed: number;
        trend?: 'up' | 'down' | 'stable';
    };
}

interface HealthLogRecord {
    type: string;
    value: Record<string, unknown>;
    createdAt: Date;
}

// =============================================================================
// Suggestion Templates (Pre-written, no AI generation)
// =============================================================================

const WEIGHT_SUGGESTIONS = {
    gradual_increase: {
        title: 'Weight Trending Up',
        message: "Your weight has been creeping up gradually. Watch your sodium intake and stay well hydrated today.",
        severity: 'attention' as const,
    },
    sudden_jump: {
        title: 'Noticeable Weight Change',
        message: "There's a noticeable jump since yesterday. Think back to your salt intake - did you have any salty foods?",
        severity: 'concern' as const,
    },
    stable: {
        title: 'Weight Holding Steady',
        message: "Your weight has been rock steady! Great job staying consistent with your routine.",
        severity: 'positive' as const,
    },
    improving: {
        title: 'Weight Trending Down',
        message: "Your weight is trending in the right direction. Keep up the good work!",
        severity: 'positive' as const,
    },
};

const BP_SUGGESTIONS = {
    gradual_increase: {
        title: 'BP Trending Higher',
        message: "Your blood pressure has been creeping up. Focus on stress management, limit caffeine, and watch sodium.",
        severity: 'attention' as const,
    },
    morning_spike: {
        title: 'Morning BP Pattern',
        message: "Your morning readings tend to run higher. Stay hydrated overnight and give yourself time to relax before measuring.",
        severity: 'info' as const,
    },
    weekend_pattern: {
        title: 'Weekend BP Pattern',
        message: "Weekend readings are running higher. Watch sodium intake on relaxing days - it's easy to snack more!",
        severity: 'info' as const,
    },
    improving: {
        title: 'BP Improving',
        message: "Your blood pressure trend looks great! Your efforts are paying off.",
        severity: 'positive' as const,
    },
    stable: {
        title: 'BP Stable',
        message: "Your blood pressure has been consistent. Nice work keeping it steady!",
        severity: 'positive' as const,
    },
};

const GLUCOSE_SUGGESTIONS = {
    post_meal_spikes: {
        title: 'Post-Meal Pattern',
        message: "Your readings after meals are running higher. Consider a short 10-15 minute walk after eating.",
        severity: 'attention' as const,
    },
    weekend_pattern: {
        title: 'Weekend Glucose Pattern',
        message: "Weekend blood sugars tend to run higher. Be mindful of carbs during leisure time.",
        severity: 'info' as const,
    },
    fasting_elevation: {
        title: 'Morning Glucose Trend',
        message: "Your fasting glucose is trending up. Watch evening snacks and carb-heavy dinners.",
        severity: 'attention' as const,
    },
    good_control: {
        title: 'Great Glucose Control',
        message: "Most of your readings are in target range. Your management is working well!",
        severity: 'positive' as const,
    },
    improving: {
        title: 'Glucose Improving',
        message: "Your blood sugar trend is heading in the right direction. Keep it up!",
        severity: 'positive' as const,
    },
};

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Calculate simple linear trend (slope) from a series of values
 */
function calculateSlope(values: { date: Date; value: number }[]): number {
    if (values.length < 2) return 0;

    const n = values.length;
    const firstDate = values[0].date.getTime();

    // Convert dates to days from start
    const points = values.map(v => ({
        x: (v.date.getTime() - firstDate) / (1000 * 60 * 60 * 24), // days
        y: v.value,
    }));

    // Linear regression
    const sumX = points.reduce((sum, p) => sum + p.x, 0);
    const sumY = points.reduce((sum, p) => sum + p.y, 0);
    const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    return isNaN(slope) ? 0 : slope;
}

/**
 * Calculate average of values
 */
function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate variance of values
 */
function variance(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = average(values);
    return values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
}

// =============================================================================
// Weight Analysis
// =============================================================================

export function analyzeWeightTrend(logs: HealthLogRecord[]): TrendInsight | null {
    const weightLogs = logs
        .filter(l => l.type === 'weight')
        .map(l => ({
            date: l.createdAt,
            value: (l.value as { weight: number }).weight,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (weightLogs.length < 3) {
        return null; // Need at least 3 data points
    }

    const recentLogs = weightLogs.slice(-7); // Last 7 readings
    const slope = calculateSlope(recentLogs);
    const values = recentLogs.map(l => l.value);
    const varianceValue = variance(values);

    // Check for sudden jump (compare last 2 readings)
    if (weightLogs.length >= 2) {
        const latest = weightLogs[weightLogs.length - 1].value;
        const previous = weightLogs[weightLogs.length - 2].value;
        const jump = latest - previous;

        if (jump >= 1.5) {
            return {
                type: 'weight',
                pattern: 'sudden_jump',
                ...WEIGHT_SUGGESTIONS.sudden_jump,
                data: {
                    currentValue: latest,
                    previousValue: previous,
                    changeAmount: jump,
                    daysAnalyzed: recentLogs.length,
                    trend: 'up',
                },
            };
        }
    }

    // Check for gradual upward trend (slope > 0.2 lbs/day)
    if (slope > 0.2) {
        const latest = weightLogs[weightLogs.length - 1].value;
        const earliest = recentLogs[0].value;
        return {
            type: 'weight',
            pattern: 'gradual_increase',
            ...WEIGHT_SUGGESTIONS.gradual_increase,
            data: {
                currentValue: latest,
                previousValue: earliest,
                changeAmount: latest - earliest,
                daysAnalyzed: recentLogs.length,
                trend: 'up',
            },
        };
    }

    // Check for improvement (downward trend)
    if (slope < -0.1) {
        const latest = weightLogs[weightLogs.length - 1].value;
        const earliest = recentLogs[0].value;
        return {
            type: 'weight',
            pattern: 'improving',
            ...WEIGHT_SUGGESTIONS.improving,
            data: {
                currentValue: latest,
                previousValue: earliest,
                changeAmount: latest - earliest,
                daysAnalyzed: recentLogs.length,
                trend: 'down',
            },
        };
    }

    // Check for stability (low variance)
    if (varianceValue < 0.5 && recentLogs.length >= 5) {
        return {
            type: 'weight',
            pattern: 'stable',
            ...WEIGHT_SUGGESTIONS.stable,
            data: {
                currentValue: average(values),
                daysAnalyzed: recentLogs.length,
                trend: 'stable',
            },
        };
    }

    return null;
}

// =============================================================================
// Blood Pressure Analysis
// =============================================================================

export function analyzeBPTrend(logs: HealthLogRecord[]): TrendInsight | null {
    const bpLogs = logs
        .filter(l => l.type === 'bp')
        .map(l => ({
            date: l.createdAt,
            systolic: (l.value as { systolic: number }).systolic,
            diastolic: (l.value as { diastolic: number }).diastolic,
            hour: l.createdAt.getHours(),
            dayOfWeek: l.createdAt.getDay(),
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (bpLogs.length < 3) {
        return null;
    }

    const recentLogs = bpLogs.slice(-14); // Last 14 readings
    const systolicValues = recentLogs.map(l => ({ date: l.date, value: l.systolic }));
    const slope = calculateSlope(systolicValues);
    const avgSystolic = average(recentLogs.map(l => l.systolic));

    // Check for morning spike pattern
    const morningReadings = recentLogs.filter(l => l.hour >= 5 && l.hour <= 10);
    const eveningReadings = recentLogs.filter(l => l.hour >= 17 && l.hour <= 22);

    if (morningReadings.length >= 3 && eveningReadings.length >= 3) {
        const morningAvg = average(morningReadings.map(l => l.systolic));
        const eveningAvg = average(eveningReadings.map(l => l.systolic));

        if (morningAvg - eveningAvg >= 10) {
            return {
                type: 'bp',
                pattern: 'morning_spike',
                ...BP_SUGGESTIONS.morning_spike,
                data: {
                    currentValue: morningAvg,
                    previousValue: eveningAvg,
                    changeAmount: morningAvg - eveningAvg,
                    daysAnalyzed: recentLogs.length,
                    trend: 'stable',
                },
            };
        }
    }

    // Check for weekend pattern
    const weekdayReadings = recentLogs.filter(l => l.dayOfWeek >= 1 && l.dayOfWeek <= 5);
    const weekendReadings = recentLogs.filter(l => l.dayOfWeek === 0 || l.dayOfWeek === 6);

    if (weekdayReadings.length >= 3 && weekendReadings.length >= 2) {
        const weekdayAvg = average(weekdayReadings.map(l => l.systolic));
        const weekendAvg = average(weekendReadings.map(l => l.systolic));

        if (weekendAvg - weekdayAvg >= 8) {
            return {
                type: 'bp',
                pattern: 'weekend_pattern',
                ...BP_SUGGESTIONS.weekend_pattern,
                data: {
                    currentValue: weekendAvg,
                    previousValue: weekdayAvg,
                    changeAmount: weekendAvg - weekdayAvg,
                    daysAnalyzed: recentLogs.length,
                    trend: 'stable',
                },
            };
        }
    }

    // Check for gradual increase (>5 mmHg per week trend)
    if (slope > 0.7) { // ~5 mmHg per week
        return {
            type: 'bp',
            pattern: 'gradual_increase',
            ...BP_SUGGESTIONS.gradual_increase,
            data: {
                currentValue: avgSystolic,
                changeAmount: slope * 7,
                daysAnalyzed: recentLogs.length,
                trend: 'up',
            },
        };
    }

    // Check for improvement
    if (slope < -0.5) {
        return {
            type: 'bp',
            pattern: 'improving',
            ...BP_SUGGESTIONS.improving,
            data: {
                currentValue: avgSystolic,
                changeAmount: slope * 7,
                daysAnalyzed: recentLogs.length,
                trend: 'down',
            },
        };
    }

    // Check for stability
    if (Math.abs(slope) < 0.3 && recentLogs.length >= 7) {
        return {
            type: 'bp',
            pattern: 'stable',
            ...BP_SUGGESTIONS.stable,
            data: {
                currentValue: avgSystolic,
                daysAnalyzed: recentLogs.length,
                trend: 'stable',
            },
        };
    }

    return null;
}

// =============================================================================
// Glucose Analysis
// =============================================================================

export function analyzeGlucoseTrend(logs: HealthLogRecord[]): TrendInsight | null {
    const glucoseLogs = logs
        .filter(l => l.type === 'glucose')
        .map(l => ({
            date: l.createdAt,
            reading: (l.value as { reading: number }).reading,
            timing: (l.value as { timing?: string }).timing,
            dayOfWeek: l.createdAt.getDay(),
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (glucoseLogs.length < 3) {
        return null;
    }

    const recentLogs = glucoseLogs.slice(-14);
    const values = recentLogs.map(l => l.reading);
    const avgReading = average(values);

    // Check for post-meal spike pattern
    const fastingReadings = recentLogs.filter(l =>
        l.timing === 'fasting' || l.timing === 'before_breakfast'
    );
    const postMealReadings = recentLogs.filter(l =>
        l.timing?.includes('after') || l.timing === '2_hours_after'
    );

    if (fastingReadings.length >= 2 && postMealReadings.length >= 2) {
        const fastingAvg = average(fastingReadings.map(l => l.reading));
        const postMealAvg = average(postMealReadings.map(l => l.reading));

        if (postMealAvg - fastingAvg >= 50 && postMealAvg > 180) {
            return {
                type: 'glucose',
                pattern: 'post_meal_spikes',
                ...GLUCOSE_SUGGESTIONS.post_meal_spikes,
                data: {
                    currentValue: postMealAvg,
                    previousValue: fastingAvg,
                    changeAmount: postMealAvg - fastingAvg,
                    daysAnalyzed: recentLogs.length,
                    trend: 'stable',
                },
            };
        }
    }

    // Check for weekend pattern
    const weekdayReadings = recentLogs.filter(l => l.dayOfWeek >= 1 && l.dayOfWeek <= 5);
    const weekendReadings = recentLogs.filter(l => l.dayOfWeek === 0 || l.dayOfWeek === 6);

    if (weekdayReadings.length >= 3 && weekendReadings.length >= 2) {
        const weekdayAvg = average(weekdayReadings.map(l => l.reading));
        const weekendAvg = average(weekendReadings.map(l => l.reading));

        if (weekendAvg - weekdayAvg >= 20) {
            return {
                type: 'glucose',
                pattern: 'weekend_pattern',
                ...GLUCOSE_SUGGESTIONS.weekend_pattern,
                data: {
                    currentValue: weekendAvg,
                    previousValue: weekdayAvg,
                    changeAmount: weekendAvg - weekdayAvg,
                    daysAnalyzed: recentLogs.length,
                    trend: 'stable',
                },
            };
        }
    }

    // Check for fasting elevation trend
    if (fastingReadings.length >= 3) {
        const fastingSlope = calculateSlope(
            fastingReadings.map(l => ({ date: l.date, value: l.reading }))
        );

        if (fastingSlope > 2) { // Rising trend
            return {
                type: 'glucose',
                pattern: 'fasting_elevation',
                ...GLUCOSE_SUGGESTIONS.fasting_elevation,
                data: {
                    currentValue: average(fastingReadings.map(l => l.reading)),
                    changeAmount: fastingSlope * 7,
                    daysAnalyzed: fastingReadings.length,
                    trend: 'up',
                },
            };
        }
    }

    // Check for good control (most readings in target)
    const inTarget = values.filter(v => v >= 70 && v <= 180).length;
    const inTargetPercent = (inTarget / values.length) * 100;

    if (inTargetPercent >= 80 && recentLogs.length >= 7) {
        return {
            type: 'glucose',
            pattern: 'good_control',
            ...GLUCOSE_SUGGESTIONS.good_control,
            data: {
                currentValue: avgReading,
                changePercent: inTargetPercent,
                daysAnalyzed: recentLogs.length,
                trend: 'stable',
            },
        };
    }

    return null;
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze all health logs and return any detected trends
 */
export function analyzeTrends(logs: HealthLogRecord[]): TrendInsight[] {
    const insights: TrendInsight[] = [];

    try {
        const weightInsight = analyzeWeightTrend(logs);
        if (weightInsight) insights.push(weightInsight);

        const bpInsight = analyzeBPTrend(logs);
        if (bpInsight) insights.push(bpInsight);

        const glucoseInsight = analyzeGlucoseTrend(logs);
        if (glucoseInsight) insights.push(glucoseInsight);
    } catch (error) {
        functions.logger.error('[TrendAnalyzer] Error analyzing trends:', error);
    }

    // Sort by severity (concerns first)
    const severityOrder = { concern: 0, attention: 1, info: 2, positive: 3 };
    insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return insights;
}

/**
 * Get the most important insight to surface (if any)
 */
export function getPrimaryInsight(logs: HealthLogRecord[]): TrendInsight | null {
    const insights = analyzeTrends(logs);

    // Return the highest priority non-positive insight, or the first positive one
    const actionableInsight = insights.find(i => i.severity !== 'positive');
    if (actionableInsight) return actionableInsight;

    // Return positive insight if no concerns
    return insights.find(i => i.severity === 'positive') || null;
}
