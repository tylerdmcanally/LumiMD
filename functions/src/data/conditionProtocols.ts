/**
 * LumiBot Condition Tracking Protocols
 * 
 * Evidence-based protocols for common chronic conditions.
 * Sources: AHA, ADA, ACC/AHA, GOLD, and other clinical guidelines.
 * 
 * Initial release includes: Hypertension, Diabetes
 * Future additions: Heart Failure, COPD, AFib, Anticoagulation, Asthma, CKD
 */

// =============================================================================
// Types
// =============================================================================

export interface ThresholdRange {
    min?: number;
    max?: number;
}

export interface BloodPressureThresholds {
    systolic: ThresholdRange;
    diastolic: ThresholdRange;
}

export interface GlucoseThresholds {
    reading: ThresholdRange;
}

export interface WeightThresholds {
    dailyGain?: number;  // lbs gained in 1 day
    weeklyGain?: number; // lbs gained in 1 week
}

export type AlertLevel = 'normal' | 'caution' | 'warning' | 'emergency';

export interface TrackingConfig {
    type: 'bp' | 'glucose' | 'weight' | 'symptom_check' | 'peak_flow';
    suggestedFrequency: string;
    unit?: string;
}

export interface NudgeScheduleItem {
    day: number;
    message: string;
    recurring?: boolean;
    interval?: number; // days between recurring nudges
}

export interface ConditionProtocol {
    id: string;
    name: string;
    aliases: string[];
    source: string;

    tracking: TrackingConfig[];

    thresholds: {
        bp?: {
            normal: BloodPressureThresholds;
            caution: BloodPressureThresholds;
            warning: BloodPressureThresholds;
        };
        glucose?: {
            normal: ThresholdRange;
            caution_low: ThresholdRange;
            caution_high: ThresholdRange;
            warning_low: ThresholdRange;
            warning_high: ThresholdRange;
            emergency_low: ThresholdRange;
            emergency_high: ThresholdRange;
        };
        weight?: WeightThresholds;
    };

    emergencySymptoms?: string[];

    nudgeSchedule: NudgeScheduleItem[];

    responseTemplates: {
        normal: string;
        caution?: string;
        caution_low?: string;
        caution_high?: string;
        warning?: string;
        warning_low?: string;
        warning_high?: string;
        emergency?: string;
        emergency_low?: string;
        emergency_high?: string;
    };
}

// =============================================================================
// Hypertension Protocol (AHA Guidelines)
// =============================================================================

export const hypertensionProtocol: ConditionProtocol = {
    id: 'hypertension',
    name: 'High Blood Pressure',
    aliases: [
        'hypertension',
        'high blood pressure',
        'htn',
        'elevated bp',
        'elevated blood pressure',
        'blood pressure',
        'bp',
    ],
    source: 'AHA Guidelines',

    tracking: [{
        type: 'bp',
        suggestedFrequency: '2x weekly',
        unit: 'mmHg',
    }],

    thresholds: {
        bp: {
            normal: {
                systolic: { max: 129 },
                diastolic: { max: 79 },
            },
            caution: {
                systolic: { min: 130, max: 179 },
                diastolic: { min: 80, max: 109 },
            },
            warning: {
                systolic: { min: 180 },
                diastolic: { min: 110 },
            },
        },
    },

    emergencySymptoms: [
        'chest pain',
        'chest pressure',
        'shortness of breath',
        'severe headache',
        'vision changes',
        'blurred vision',
        'difficulty speaking',
        'slurred speech',
        'numbness',
        'weakness',
        'confusion',
    ],

    nudgeSchedule: [
        {
            day: 3,
            message: "Let's check in on your blood pressure. A quick reading helps us see how things are going. 💙",
        },
        {
            day: 7,
            message: "Time for your weekly blood pressure check. Consistency helps spot trends!",
        },
        {
            day: 14,
            recurring: true,
            interval: 7,
            message: "Blood pressure check time. How are things looking?",
        },
    ],

    responseTemplates: {
        normal: "Great reading! Your blood pressure is in a healthy range. ✓",
        caution: "This reading is a bit elevated. Consider resting for a few minutes and checking again. If it stays high, mention it at your next visit.",
        warning: "This reading is concerning. Please rest for 5 minutes and retest. If still elevated, contact your doctor's office today.",
        emergency: "This reading combined with your symptoms needs immediate attention. Please call 911 or go to the ER immediately.",
    },
};

// =============================================================================
// Diabetes Protocol (ADA Guidelines)
// =============================================================================

export const diabetesProtocol: ConditionProtocol = {
    id: 'diabetes',
    name: 'Diabetes',
    aliases: [
        'diabetes',
        'type 2 diabetes',
        'type 1 diabetes',
        'type ii diabetes',
        'type i diabetes',
        'dm',
        't2dm',
        't1dm',
        'blood sugar',
        'glucose',
        'diabetic',
        'a1c',
        'hemoglobin a1c',
        'hyperglycemia',
        'hypoglycemia',
    ],
    source: 'ADA Guidelines',

    tracking: [
        {
            type: 'glucose',
            suggestedFrequency: 'per physician guidance',
            unit: 'mg/dL',
        },
        {
            type: 'weight',
            suggestedFrequency: 'weekly',
            unit: 'lbs',
        },
    ],

    thresholds: {
        glucose: {
            normal: { min: 70, max: 180 },
            caution_low: { min: 54, max: 69 },
            caution_high: { min: 181, max: 250 },
            warning_low: { min: 50, max: 53 },
            warning_high: { min: 251, max: 300 },
            emergency_low: { max: 49 },
            emergency_high: { min: 301 },
        },
    },

    emergencySymptoms: [
        'confusion',
        'seizure',
        'loss of consciousness',
        'unresponsive',
        'fruity breath',
        'nausea',
        'vomiting',
        'severe thirst',
        'frequent urination',
        'abdominal pain',
    ],

    nudgeSchedule: [
        {
            day: 3,
            message: "How's your blood sugar been? Let's log a reading to keep track.",
        },
        {
            day: 7,
            message: "Weekly check-in! A glucose reading helps us see how your management is going. 💙",
        },
        {
            day: 14,
            recurring: true,
            interval: 7,
            message: "Time for a glucose check. How are things this week?",
        },
    ],

    responseTemplates: {
        normal: "Good reading! Your blood sugar is in target range. ✓",
        caution_low: "This is a bit low. If you're feeling shaky or sweaty, try the 15-15 rule: 15g of fast carbs (juice, glucose tabs), wait 15 minutes, retest.",
        caution_high: "This reading is a bit elevated. Stay hydrated and monitor how you're feeling.",
        warning_low: "This is clinically low and needs attention. Please eat or drink something with sugar now. Retest in 15 minutes.",
        warning_high: "This reading is quite high. Check for ketones if you have test strips. Contact your doctor if it doesn't improve with your usual management.",
        emergency_low: "This is dangerously low. Please eat fast-acting sugar immediately. If you feel confused, have someone help you. If symptoms worsen, call 911.",
        emergency_high: "This reading needs medical attention. Watch for symptoms like nausea, vomiting, or confusion. Contact your doctor immediately or go to urgent care.",
    },
};

// =============================================================================
// Heart Failure Protocol (AHA/ACC Guidelines)
// =============================================================================

export const heartFailureProtocol: ConditionProtocol = {
    id: 'heart_failure',
    name: 'Heart Failure',
    aliases: [
        'heart failure',
        'chf',
        'congestive heart failure',
        'hfref',
        'hfpef',
        'ef reduced',
        'ef preserved',
        'cardiomyopathy',
        'weak heart',
        'enlarged heart',
        'lvef',
    ],
    source: 'AHA/ACC Heart Failure Guidelines',

    tracking: [
        {
            type: 'weight',
            suggestedFrequency: 'daily',
            unit: 'lbs',
        },
        {
            type: 'bp',
            suggestedFrequency: 'daily',
            unit: 'mmHg',
        },
        {
            type: 'symptom_check',
            suggestedFrequency: 'daily',
        },
    ],

    thresholds: {
        weight: {
            dailyGain: 2,   // ≥2 lbs in 1 day → caution
            weeklyGain: 5,  // ≥5 lbs in 1 week → warning
        },
        bp: {
            normal: {
                systolic: { max: 129 },
                diastolic: { max: 79 },
            },
            caution: {
                systolic: { min: 130, max: 159 },
                diastolic: { min: 80, max: 99 },
            },
            warning: {
                systolic: { min: 160 },
                diastolic: { min: 100 },
            },
        },
    },

    emergencySymptoms: [
        'severe shortness of breath',
        'can\'t breathe',
        'gasping',
        'chest pain',
        'chest pressure',
        'pink frothy sputum',
        'coughing up blood',
        'fainting',
        'passed out',
        'unresponsive',
        'blue lips',
        'blue fingernails',
        'severe weakness',
    ],

    nudgeSchedule: [
        {
            day: 1,
            message: 'Welcome! Daily weight tracking is the #1 way to catch fluid buildup early. Weigh yourself each morning, same time, after using the bathroom.',
        },
        {
            day: 3,
            message: 'How\'s the daily weighing going? A gain of 2+ lbs in a day or 5+ lbs in a week can signal fluid buildup. Let\'s log today\'s weight.',
        },
        {
            day: 5,
            message: 'Quick check-in: Any swelling in your ankles or feet? More shortness of breath than usual? Let us know how you\'re feeling.',
        },
        {
            day: 7,
            message: 'Weekly symptom check: How are you doing overall? Rate your breathing, energy level, and any swelling you\'ve noticed.',
        },
        {
            day: 14,
            recurring: true,
            interval: 7,
            message: 'Time for your weekly heart failure check-in. How\'s your weight trend? Any changes in breathing or swelling?',
        },
    ],

    responseTemplates: {
        normal: 'Weight is stable. Great job staying on track with your daily monitoring!',
        caution: 'Your weight is up a bit from yesterday. Watch your sodium intake and check again tomorrow. If it continues rising, contact your care team.',
        warning: 'Your weight has increased significantly. This may indicate fluid retention. Please contact your doctor\'s office today.',
        emergency: 'These symptoms need immediate attention. Please call 911 or go to the emergency room now.',
    },
};

// =============================================================================
// Protocol Registry
// =============================================================================

export const conditionProtocols: ConditionProtocol[] = [
    hypertensionProtocol,
    diabetesProtocol,
    heartFailureProtocol,
];

/**
 * Find matching protocols for a list of diagnoses
 */
export function matchDiagnosesToProtocols(diagnoses: string[]): ConditionProtocol[] {
    const matched: ConditionProtocol[] = [];
    const matchedIds = new Set<string>();

    for (const diagnosis of diagnoses) {
        const diagLower = diagnosis.toLowerCase().trim();

        for (const protocol of conditionProtocols) {
            if (matchedIds.has(protocol.id)) continue;

            const isMatch = protocol.aliases.some(alias =>
                diagLower.includes(alias.toLowerCase()) ||
                alias.toLowerCase().includes(diagLower)
            );

            if (isMatch) {
                matched.push(protocol);
                matchedIds.add(protocol.id);
            }
        }
    }

    return matched;
}

/**
 * Get a protocol by ID
 */
export function getProtocolById(id: string): ConditionProtocol | undefined {
    return conditionProtocols.find(p => p.id === id);
}
