/**
 * LumiBot Safety Checker Service
 * 
 * Evaluates health log values against protocol thresholds
 * and determines appropriate alert levels.
 */

import * as functions from 'firebase-functions';
import {
    BloodPressureValue,
    GlucoseValue,
    WeightValue,
    HealthLogValue,
    HealthLogType,
    SafetyCheckResult,
} from '../types/lumibot';
import {
    hypertensionProtocol,
    diabetesProtocol,
    heartFailureProtocol,
} from '../data/conditionProtocols';

// =============================================================================
// Blood Pressure Checking
// =============================================================================

export function checkBloodPressure(
    value: BloodPressureValue,
    hasSymptoms: boolean = false,
    symptoms: string[] = []
): SafetyCheckResult {
    const { systolic, diastolic } = value;
    const protocol = hypertensionProtocol;
    const thresholds = protocol.thresholds.bp!;

    // Check for emergency (warning level + symptoms)
    const isWarningLevel =
        systolic >= (thresholds.warning.systolic.min || 180) ||
        diastolic >= (thresholds.warning.diastolic.min || 110);

    if (isWarningLevel && hasSymptoms) {
        const matchedSymptoms = symptoms.filter(s =>
            protocol.emergencySymptoms?.some(es =>
                s.toLowerCase().includes(es.toLowerCase())
            )
        );

        if (matchedSymptoms.length > 0) {
            return {
                alertLevel: 'emergency',
                message: protocol.responseTemplates.emergency ||
                    'This reading combined with your symptoms needs immediate attention. Please call 911 or go to the ER immediately.',
                shouldShowAlert: true,
                emergencySymptoms: matchedSymptoms,
            };
        }
    }

    // Warning level (no symptoms but very high)
    if (isWarningLevel) {
        return {
            alertLevel: 'warning',
            message: protocol.responseTemplates.warning ||
                'This reading is concerning. Please rest for 5 minutes and retest. If still elevated, contact your doctor\'s office today.',
            shouldShowAlert: true,
        };
    }

    // Caution level
    const isCautionLevel =
        (systolic >= (thresholds.caution.systolic.min || 130) && systolic < (thresholds.warning.systolic.min || 180)) ||
        (diastolic >= (thresholds.caution.diastolic.min || 80) && diastolic < (thresholds.warning.diastolic.min || 110));

    if (isCautionLevel) {
        return {
            alertLevel: 'caution',
            message: protocol.responseTemplates.caution ||
                'This reading is a bit elevated. Consider resting for a few minutes and checking again.',
            shouldShowAlert: false,
        };
    }

    // Normal
    return {
        alertLevel: 'normal',
        message: protocol.responseTemplates.normal ||
            'Great reading! Your blood pressure is in a healthy range. ✓',
        shouldShowAlert: false,
    };
}

// =============================================================================
// Glucose Checking
// =============================================================================

export function checkGlucose(
    value: GlucoseValue,
    hasSymptoms: boolean = false,
    symptoms: string[] = []
): SafetyCheckResult {
    const { reading } = value;
    const protocol = diabetesProtocol;
    const thresholds = protocol.thresholds.glucose!;

    // Emergency Low
    if (reading <= (thresholds.emergency_low.max || 49)) {
        const hasEmergencySymptoms = hasSymptoms && symptoms.some(s =>
            ['confusion', 'seizure', 'unconscious', 'unresponsive'].some(es =>
                s.toLowerCase().includes(es)
            )
        );

        return {
            alertLevel: 'emergency',
            message: hasEmergencySymptoms
                ? 'This is a medical emergency. Please call 911 immediately.'
                : protocol.responseTemplates.emergency_low ||
                'This is dangerously low. Please eat fast-acting sugar immediately. If symptoms worsen, call 911.',
            shouldShowAlert: true,
            emergencySymptoms: hasEmergencySymptoms ? symptoms : undefined,
        };
    }

    // Emergency High
    if (reading >= (thresholds.emergency_high.min || 301)) {
        const hasDKASymptoms = hasSymptoms && symptoms.some(s =>
            ['nausea', 'vomiting', 'fruity breath', 'confusion', 'abdominal pain'].some(es =>
                s.toLowerCase().includes(es)
            )
        );

        return {
            alertLevel: hasDKASymptoms ? 'emergency' : 'warning',
            message: hasDKASymptoms
                ? 'These symptoms with high blood sugar could indicate a serious condition. Seek emergency care immediately.'
                : protocol.responseTemplates.emergency_high ||
                'This reading needs medical attention. Contact your doctor immediately or go to urgent care.',
            shouldShowAlert: true,
            emergencySymptoms: hasDKASymptoms ? symptoms : undefined,
        };
    }

    // Warning Low
    if (reading >= (thresholds.warning_low.min || 50) && reading <= (thresholds.warning_low.max || 53)) {
        return {
            alertLevel: 'warning',
            message: protocol.responseTemplates.warning_low ||
                'This is clinically low and needs attention. Please eat or drink something with sugar now.',
            shouldShowAlert: true,
        };
    }

    // Warning High
    if (reading >= (thresholds.warning_high.min || 251) && reading <= (thresholds.warning_high.max || 300)) {
        return {
            alertLevel: 'warning',
            message: protocol.responseTemplates.warning_high ||
                'This reading is quite high. Check for ketones if you have test strips. Contact your doctor if it doesn\'t improve.',
            shouldShowAlert: true,
        };
    }

    // Caution Low
    if (reading >= (thresholds.caution_low.min || 54) && reading <= (thresholds.caution_low.max || 69)) {
        return {
            alertLevel: 'caution',
            message: protocol.responseTemplates.caution_low ||
                'This is a bit low. If you\'re feeling shaky, try the 15-15 rule: 15g of fast carbs, wait 15 minutes, retest.',
            shouldShowAlert: false,
        };
    }

    // Caution High
    if (reading >= (thresholds.caution_high.min || 181) && reading <= (thresholds.caution_high.max || 250)) {
        return {
            alertLevel: 'caution',
            message: protocol.responseTemplates.caution_high ||
                'This reading is a bit elevated. Stay hydrated and monitor how you\'re feeling.',
            shouldShowAlert: false,
        };
    }

    // Normal
    return {
        alertLevel: 'normal',
        message: protocol.responseTemplates.normal ||
            'Good reading! Your blood sugar is in target range. ✓',
        shouldShowAlert: false,
    };
}

// =============================================================================
// Weight Checking
// =============================================================================

/**
 * Check weight value
 * Basic check - weight change detection requires historical data
 * and is handled at the route level with checkWeightChange()
 */
export function checkWeight(value: WeightValue): SafetyCheckResult {
    // Weight alone doesn't have universal thresholds
    // The important metric for HF is change over time
    return {
        alertLevel: undefined,
        message: 'Weight logged. ✓',
        shouldShowAlert: false,
    };
}

/**
 * Check weight change for Heart Failure monitoring
 * Call this with previous weights to detect fluid retention
 */
export function checkWeightChange(
    currentWeight: number,
    previousWeights: { weight: number; date: Date }[]
): SafetyCheckResult {
    const thresholds = heartFailureProtocol.thresholds.weight!;
    const responses = heartFailureProtocol.responseTemplates;

    if (previousWeights.length === 0) {
        return {
            alertLevel: undefined,
            message: 'Weight logged. ✓',
            shouldShowAlert: false,
        };
    }

    // Check daily gain (compare to yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const recentWeights = previousWeights.filter(w => {
        const diff = (yesterday.getTime() - w.date.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff < 1;
    });

    if (recentWeights.length > 0) {
        const yesterdayWeight = recentWeights[0].weight;
        const dailyGain = currentWeight - yesterdayWeight;

        if (dailyGain >= (thresholds.dailyGain || 2)) {
            return {
                alertLevel: 'caution',
                message: responses.caution ||
                    `Your weight is up ${dailyGain.toFixed(1)} lbs from yesterday. Watch your sodium intake and check again tomorrow.`,
                shouldShowAlert: true,
            };
        }
    }

    // Check weekly gain (compare to 7 days ago)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoWeights = previousWeights.filter(w => {
        const diff = (weekAgo.getTime() - w.date.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff < 1;
    });

    if (weekAgoWeights.length > 0) {
        const weekAgoWeight = weekAgoWeights[0].weight;
        const weeklyGain = currentWeight - weekAgoWeight;

        if (weeklyGain >= (thresholds.weeklyGain || 5)) {
            return {
                alertLevel: 'warning',
                message: responses.warning ||
                    `Your weight is up ${weeklyGain.toFixed(1)} lbs this week. This may indicate fluid retention. Please contact your doctor's office today.`,
                shouldShowAlert: true,
            };
        }
    }

    return {
        alertLevel: 'normal',
        message: responses.normal || 'Weight is stable. Great job staying on track!',
        shouldShowAlert: false,
    };
}

// =============================================================================
// General Value Checker
// =============================================================================


export function checkHealthValue(
    type: HealthLogType,
    value: HealthLogValue,
    hasSymptoms: boolean = false,
    symptoms: string[] = []
): SafetyCheckResult {
    switch (type) {
        case 'bp':
            return checkBloodPressure(value as BloodPressureValue, hasSymptoms, symptoms);

        case 'glucose':
            return checkGlucose(value as GlucoseValue, hasSymptoms, symptoms);

        case 'weight':
            // For HF patients, weight gain triggers alerts
            // Otherwise, just log without alert
            return checkWeight(value as WeightValue);

        case 'med_compliance':
        case 'symptom_check':
            // These don't have numerical thresholds
            return {
                alertLevel: 'normal',
                message: 'Response logged. ✓',
                shouldShowAlert: false,
            };

        default:
            functions.logger.warn(`[SafetyChecker] Unknown log type: ${type}`);
            return {
                alertLevel: 'normal',
                message: 'Logged.',
                shouldShowAlert: false,
            };
    }
}

// =============================================================================
// Emergency Symptom Screening
// =============================================================================

const EMERGENCY_SYMPTOMS = [
    // Cardiac
    'chest pain',
    'chest pressure',
    'chest tightness',
    'heart attack',

    // Stroke
    'difficulty speaking',
    'slurred speech',
    'face drooping',
    'arm weakness',
    'sudden confusion',
    'sudden numbness',

    // Respiratory
    'severe shortness of breath',
    'cannot breathe',
    'difficulty breathing',
    'blue lips',
    'blue fingernails',

    // Neurological
    'seizure',
    'loss of consciousness',
    'unresponsive',
    'sudden severe headache',

    // Diabetic emergencies
    'fruity breath',
];

export function screenForEmergencySymptoms(symptoms: string[]): {
    isEmergency: boolean;
    matchedSymptoms: string[];
    message: string;
} {
    const matchedSymptoms: string[] = [];

    for (const symptom of symptoms) {
        const symptomLower = symptom.toLowerCase();
        const isEmergency = EMERGENCY_SYMPTOMS.some(es => symptomLower.includes(es));
        if (isEmergency) {
            matchedSymptoms.push(symptom);
        }
    }

    if (matchedSymptoms.length > 0) {
        return {
            isEmergency: true,
            matchedSymptoms,
            message: 'These symptoms require immediate medical attention. Please call 911 or go to the emergency room immediately.',
        };
    }

    return {
        isEmergency: false,
        matchedSymptoms: [],
        message: '',
    };
}
