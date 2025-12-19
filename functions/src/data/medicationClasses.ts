/**
 * Medication Classes
 * 
 * Maps medications to their therapeutic classes and associated conditions.
 * Used to determine which condition tracking (BP, glucose, etc.) should be
 * included in medication nudge sequences.
 */

export type TrackingType = 'bp' | 'glucose' | 'weight' | null;

export interface MedicationClass {
    id: string;
    name: string;
    conditionId: string;           // Links to condition protocol
    trackingType: TrackingType;    // What to log
    patterns: string[];            // Medication name patterns (lowercase)
}

// =============================================================================
// Antihypertensive Medications
// =============================================================================

const antihypertensivePatterns = [
    // ACE Inhibitors
    'lisinopril', 'enalapril', 'benazepril', 'ramipril', 'captopril', 'fosinopril', 'quinapril',
    // ARBs
    'losartan', 'valsartan', 'olmesartan', 'irbesartan', 'candesartan', 'telmisartan', 'azilsartan',
    // Calcium Channel Blockers
    'amlodipine', 'nifedipine', 'diltiazem', 'verapamil', 'felodipine',
    // Beta Blockers
    'metoprolol', 'atenolol', 'carvedilol', 'bisoprolol', 'nebivolol', 'propranolol', 'labetalol',
    // Diuretics
    'hydrochlorothiazide', 'hctz', 'chlorthalidone', 'furosemide', 'lasix', 'bumetanide',
    'spironolactone', 'eplerenone', 'triamterene',
    // Others
    'clonidine', 'hydralazine', 'minoxidil', 'prazosin', 'doxazosin', 'terazosin',
];

export const antihypertensiveClass: MedicationClass = {
    id: 'antihypertensive',
    name: 'Blood Pressure Medications',
    conditionId: 'hypertension',
    trackingType: 'bp',
    patterns: antihypertensivePatterns,
};

// =============================================================================
// Diabetes Medications
// =============================================================================

const antidiabeticPatterns = [
    // Biguanides
    'metformin', 'glucophage',
    // Sulfonylureas
    'glipizide', 'glyburide', 'glimepiride',
    // DPP-4 Inhibitors
    'sitagliptin', 'januvia', 'linagliptin', 'tradjenta', 'saxagliptin', 'alogliptin',
    // GLP-1 Agonists
    'semaglutide', 'ozempic', 'wegovy', 'rybelsus', 'liraglutide', 'victoza', 'saxenda',
    'dulaglutide', 'trulicity', 'tirzepatide', 'mounjaro', 'zepbound', 'exenatide', 'byetta',
    // SGLT2 Inhibitors
    'empagliflozin', 'jardiance', 'dapagliflozin', 'farxiga', 'canagliflozin', 'invokana',
    'ertugliflozin', 'steglatro',
    // Insulins
    'insulin', 'lantus', 'levemir', 'tresiba', 'basaglar', 'toujeo',
    'novolog', 'humalog', 'apidra', 'fiasp', 'admelog',
    'novolin', 'humulin', 'nph',
    // Thiazolidinediones
    'pioglitazone', 'actos', 'rosiglitazone',
    // Meglitinides
    'repaglinide', 'nateglinide',
];

export const antidiabeticClass: MedicationClass = {
    id: 'antidiabetic',
    name: 'Diabetes Medications',
    conditionId: 'diabetes',
    trackingType: 'glucose',
    patterns: antidiabeticPatterns,
};

// =============================================================================
// Registry & Helpers
// =============================================================================

export const medicationClasses: MedicationClass[] = [
    antihypertensiveClass,
    antidiabeticClass,
];

/**
 * Find the medication class for a given medication name
 */
export function findMedicationClass(medicationName: string): MedicationClass | undefined {
    const nameLower = medicationName.toLowerCase().trim();

    for (const medClass of medicationClasses) {
        const isMatch = medClass.patterns.some(pattern =>
            nameLower.includes(pattern) || pattern.includes(nameLower)
        );
        if (isMatch) {
            return medClass;
        }
    }

    return undefined;
}

/**
 * Get condition IDs covered by a list of medications
 */
export function getConditionsCoveredByMedications(medicationNames: string[]): string[] {
    const coveredConditions = new Set<string>();

    for (const medName of medicationNames) {
        const medClass = findMedicationClass(medName);
        if (medClass) {
            coveredConditions.add(medClass.conditionId);
        }
    }

    return Array.from(coveredConditions);
}

/**
 * Get tracking type for a medication
 */
export function getTrackingTypeForMedication(medicationName: string): TrackingType {
    const medClass = findMedicationClass(medicationName);
    return medClass?.trackingType ?? null;
}
