import logger from '../utils/logger';
import { MEDICATION_DATABASE, MEDICATION_CORRECTIONS } from '../data/medicationDatabase.generated';

/**
 * Medical Validation Service
 * Provides validation for medical terms extracted by AI
 * Helps ensure consistency and catch potential OCR/transcription errors
 *
 * CRITICAL: Uses comprehensive database of 250+ medications with variations
 * Generated from top 300 prescribed medications in US (2023)
 * Source: ClinCalc DrugStats Database
 *
 * Examples of corrections:
 * - "carbadolol" → "Carvedilol"
 * - "metropolol" → "Metoprolol"
 * - "lysinopril" → "Lisinopril"
 */

// Common condition name corrections
const CONDITION_CORRECTIONS: Record<string, string> = {
  'high blood pressure': 'Hypertension',
  'diabetes': 'Diabetes Mellitus',
  'high cholesterol': 'Hyperlipidemia',
  'heart attack': 'Myocardial Infarction',
  'afib': 'Atrial Fibrillation',
  'a-fib': 'Atrial Fibrillation',
  'copd': 'Chronic Obstructive Pulmonary Disease',
  'gerd': 'Gastroesophageal Reflux Disease',
  'uti': 'Urinary Tract Infection',
};

/**
 * Validates and normalizes medication names
 * Returns medications with validation metadata
 */
export function validateMedications(medications: any[]): any[] {
  if (!medications || !Array.isArray(medications)) {
    return [];
  }

  return medications.map((med) => {
    const normalized = normalizeMedicationName(med.name || med.medication || '');
    const validationWarning = getValidationWarning(med.name, normalized);

    return {
      ...med,
      name: normalized || med.name,
      originalName: med.name !== normalized ? med.name : undefined,
      suggestedName: normalized !== med.name ? normalized : undefined,
      validationWarning,
      _validated: true,
    };
  });
}

/**
 * Validates and normalizes diagnosis names
 * Returns diagnoses with validation metadata
 */
export function validateDiagnoses(diagnoses: any[]): any[] {
  if (!diagnoses || !Array.isArray(diagnoses)) {
    return [];
  }

  return diagnoses.map((diagnosis) => {
    const normalized = normalizeConditionName(diagnosis.name || diagnosis.condition || '');
    const validationWarning = getValidationWarning(diagnosis.name, normalized);

    return {
      ...diagnosis,
      name: normalized || diagnosis.name,
      originalName: diagnosis.name !== normalized ? diagnosis.name : undefined,
      suggestedName: normalized !== diagnosis.name ? normalized : undefined,
      validationWarning,
      _validated: true,
    };
  });
}

/**
 * Validates and normalizes condition names
 * Returns conditions with validation metadata
 */
export function validateConditions(conditions: any[]): any[] {
  if (!conditions || !Array.isArray(conditions)) {
    return [];
  }

  return conditions.map((condition) => {
    const conditionName = typeof condition === 'string' ? condition : (condition.name || condition.condition || '');
    const normalized = normalizeConditionName(conditionName);
    const validationWarning = getValidationWarning(conditionName, normalized);

    if (typeof condition === 'string') {
      return normalized || condition;
    }

    return {
      ...condition,
      name: normalized || conditionName,
      originalName: conditionName !== normalized ? conditionName : undefined,
      suggestedName: normalized !== conditionName ? normalized : undefined,
      validationWarning,
      _validated: true,
    };
  });
}

/**
 * Normalizes medication names using common corrections
 */
function normalizeMedicationName(name: string): string {
  if (!name || typeof name !== 'string') {
    return name;
  }

  const lowercase = name.toLowerCase().trim();

  // Check for exact match in corrections
  if (MEDICATION_CORRECTIONS[lowercase]) {
    return MEDICATION_CORRECTIONS[lowercase];
  }

  // Capitalize first letter of each word for consistency
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalizes condition names using common corrections
 */
function normalizeConditionName(name: string): string {
  if (!name || typeof name !== 'string') {
    return name;
  }

  const lowercase = name.toLowerCase().trim();

  // Check for exact match in corrections
  if (CONDITION_CORRECTIONS[lowercase]) {
    return CONDITION_CORRECTIONS[lowercase];
  }

  // Capitalize first letter of each word for consistency
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generates a validation warning if the name was corrected
 */
function getValidationWarning(original: string, normalized: string): string | undefined {
  if (!original || !normalized) {
    return undefined;
  }

  if (original.toLowerCase() !== normalized.toLowerCase()) {
    return `Name normalized from "${original}" to "${normalized}"`;
  }

  return undefined;
}

/**
 * Checks if a medication name is likely valid
 * This is a basic check - more sophisticated validation could be added
 */
export function isMedicationNameValid(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Basic validation: at least 2 characters, contains letters
  const trimmed = name.trim();
  return trimmed.length >= 2 && /[a-zA-Z]/.test(trimmed);
}

/**
 * Checks if a condition name is likely valid
 */
export function isConditionNameValid(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Basic validation: at least 2 characters, contains letters
  const trimmed = name.trim();
  return trimmed.length >= 2 && /[a-zA-Z]/.test(trimmed);
}

/**
 * Extracts medication names from various formats
 * Handles both string arrays and object arrays
 */
export function extractMedicationNames(medications: any[]): string[] {
  if (!medications || !Array.isArray(medications)) {
    return [];
  }

  return medications
    .map((med) => {
      if (typeof med === 'string') {
        return med;
      }
      return med.name || med.medication || '';
    })
    .filter((name) => isMedicationNameValid(name));
}

/**
 * Extracts condition names from various formats
 */
export function extractConditionNames(conditions: any[]): string[] {
  if (!conditions || !Array.isArray(conditions)) {
    return [];
  }

  return conditions
    .map((condition) => {
      if (typeof condition === 'string') {
        return condition;
      }
      return condition.name || condition.condition || '';
    })
    .filter((name) => isConditionNameValid(name));
}

/**
 * Logs validation statistics for monitoring
 */
export function logValidationStats(
  medications: any[],
  diagnoses: any[],
  conditions: any[]
): void {
  const medWarnings = medications.filter((m) => m.validationWarning).length;
  const diagWarnings = diagnoses.filter((d) => d.validationWarning).length;
  const condWarnings = conditions.filter((c) => c.validationWarning).length;

  if (medWarnings + diagWarnings + condWarnings > 0) {
    logger.info('Medical validation completed', {
      medications: {
        total: medications.length,
        warnings: medWarnings,
      },
      diagnoses: {
        total: diagnoses.length,
        warnings: diagWarnings,
      },
      conditions: {
        total: conditions.length,
        warnings: condWarnings,
      },
    });
  }
}
