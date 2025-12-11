/**
 * OpenAI Service Module
 *
 * Re-exports all public APIs for backward compatibility.
 * Import from 'services/openai' to use the complete API.
 */

// JSON parsing utilities
export { extractJsonBlock, safeParseJson, ensureArrayOfStrings, sanitizeText } from './jsonParser';

// Fuzzy matching utilities
export {
    levenshteinDistance,
    normalizeDrugName,
    isComboCandidate,
    extractComboComponents,
    DRUG_NAME_ALIASES,
} from './fuzzyMatcher';

// Medication normalization
export {
    extractNameFromMedicationText,
    normalizeMedicationEntry,
    ensureMedicationsObject,
    type MedicationChangeEntry,
} from './medicationNormalizer';

// Main OpenAI service (kept in original location for now)
// Will be moved here in a future refactor
