/**
 * Care Flow Templates
 *
 * Condition-specific flow configurations that define clinical logic:
 * when to check in, what to ask about, and how to adapt cadence.
 *
 * Templates define the "what/when" — AI (intelligentNudgeGenerator) handles
 * the patient-facing copy.
 *
 * Starting with HTN (hypertension). Future conditions (DM, COPD, etc.)
 * add new templates here — no code changes needed.
 */

import {
    CareFlowCondition,
    CareFlowTemplate,
} from '../types/careFlows';

// =============================================================================
// HTN (Hypertension) Flow Template
// =============================================================================

export const HTN_FLOW_TEMPLATE: CareFlowTemplate = {
    condition: 'htn',
    metric: 'bp',

    phases: {
        understand: {
            duration: { days: 2 },
            touchpoints: [
                { day: 0, type: 'educate', topic: 'what_htn_means' },
                { day: 0, type: 'educate', topic: 'new_med_intro', condition: 'has_new_med' },
            ],
        },
        establish: {
            duration: { days: 14 },
            touchpoints: [
                { day: 3, type: 'combined', subtypes: ['log_prompt', 'side_effect_check'], condition: 'has_new_med' },
                { day: 3, type: 'log_prompt' },
                { day: 7, type: 'combined', subtypes: ['log_prompt', 'side_effect_followup'] },
            ],
            defaultInterval: 4,
        },
        maintain: {
            defaultInterval: 7,
            monthlySummary: true,
        },
        coast: {
            defaultInterval: 14,
            monthlySummary: true,
        },
    },

    cadenceRules: {
        decayAfterNormal: 3,
        decayMultiplier: 1.5,
        maxInterval: 14,
        minInterval: 2,
        escalateAfterNoResponse: 14,
        escalateBPSystolic: 180,
        escalateBPDiastolic: 120,
    },
};

// =============================================================================
// Template Registry
// =============================================================================

const CARE_FLOW_TEMPLATES: Record<CareFlowCondition, CareFlowTemplate | null> = {
    htn: HTN_FLOW_TEMPLATE,
    dm: null,       // Future: Diabetes
    copd: null,     // Future: COPD
    asthma: null,   // Future: Asthma
    heart_failure: null, // Future: Heart Failure
};

/**
 * Get the care flow template for a condition.
 * Returns null if the condition doesn't have a template yet.
 */
export function getCareFlowTemplate(condition: CareFlowCondition): CareFlowTemplate | null {
    return CARE_FLOW_TEMPLATES[condition] ?? null;
}

/**
 * Check if a condition has a care flow template available.
 */
export function hasCareFlowTemplate(condition: CareFlowCondition): boolean {
    return CARE_FLOW_TEMPLATES[condition] != null;
}

// =============================================================================
// Condition Detection Helpers
// =============================================================================

/**
 * Map of diagnosis name patterns to care flow conditions.
 * Used by flow creation to detect which condition a diagnosis maps to.
 */
const DIAGNOSIS_TO_CONDITION: { patterns: string[]; condition: CareFlowCondition }[] = [
    {
        patterns: [
            'hypertension', 'high blood pressure', 'htn',
            'elevated bp', 'elevated blood pressure',
        ],
        condition: 'htn',
    },
    {
        patterns: [
            'diabetes', 'type 2 diabetes', 'type 1 diabetes', 'dm',
            't2dm', 't1dm', 'hyperglycemia',
        ],
        condition: 'dm',
    },
    {
        patterns: [
            'copd', 'chronic obstructive pulmonary disease',
            'emphysema', 'chronic bronchitis',
        ],
        condition: 'copd',
    },
    {
        patterns: ['asthma'],
        condition: 'asthma',
    },
    {
        patterns: [
            'heart failure', 'chf', 'congestive heart failure',
            'cardiomyopathy', 'hfref', 'hfpef',
        ],
        condition: 'heart_failure',
    },
];

/**
 * Map of medication class patterns to care flow conditions.
 * Used to detect condition signals from new medications.
 */
const MEDICATION_TO_CONDITION: { patterns: string[]; condition: CareFlowCondition }[] = [
    {
        patterns: [
            'lisinopril', 'enalapril', 'ramipril', 'benazepril', 'captopril',    // ACE inhibitors
            'losartan', 'valsartan', 'irbesartan', 'olmesartan', 'candesartan',   // ARBs
            'amlodipine', 'nifedipine', 'diltiazem', 'verapamil',                 // CCBs
            'metoprolol', 'atenolol', 'carvedilol', 'bisoprolol', 'propranolol',  // Beta blockers
            'hydrochlorothiazide', 'chlorthalidone', 'indapamide',                 // Diuretics
            'spironolactone', 'eplerenone',                                         // Aldosterone antagonists
        ],
        condition: 'htn',
    },
    {
        patterns: [
            'metformin', 'glipizide', 'glyburide', 'glimepiride',  // Oral antidiabetics
            'insulin', 'lantus', 'humalog', 'novolog',              // Insulins
            'empagliflozin', 'dapagliflozin', 'canagliflozin',      // SGLT2 inhibitors
            'sitagliptin', 'saxagliptin', 'linagliptin',            // DPP-4 inhibitors
            'semaglutide', 'liraglutide', 'dulaglutide',            // GLP-1 agonists
        ],
        condition: 'dm',
    },
];

/**
 * Detect the care flow condition from a diagnosis name.
 */
export function detectConditionFromDiagnosis(diagnosisName: string): CareFlowCondition | null {
    const lower = diagnosisName.toLowerCase().trim();
    if (!lower) return null;
    for (const entry of DIAGNOSIS_TO_CONDITION) {
        if (entry.patterns.some(p => lower.includes(p) || p.includes(lower))) {
            return entry.condition;
        }
    }
    return null;
}

/**
 * Detect the care flow condition from a medication name.
 */
export function detectConditionFromMedication(medicationName: string): CareFlowCondition | null {
    const lower = medicationName.toLowerCase().trim();
    for (const entry of MEDICATION_TO_CONDITION) {
        if (entry.patterns.some(p => lower.includes(p))) {
            return entry.condition;
        }
    }
    return null;
}
