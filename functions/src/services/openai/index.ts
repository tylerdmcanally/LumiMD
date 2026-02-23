/**
 * OpenAI Service Module
 *
 * Re-exports all public APIs for backward compatibility.
 * Import from 'services/openai' to use the complete API.
 */

// JSON parsing utilities
export {
    extractJsonBlock,
    safeParseJson,
    ensureArrayOfStrings,
    sanitizeText,
    validateTopLevelSchema,
    type JsonKeySchema,
    type JsonValidationWarning,
} from './jsonParser';

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

// Prompt registry for visit extraction/summarization
export {
    VISIT_PROMPT_VERSION,
    EXTRACTION_SCHEMA_VERSION,
    LEGACY_PROMPT_VERSION,
    EXTRACTION_PROMPT_VERSION,
    SUMMARY_PROMPT_VERSION,
    EXTRACTION_STAGE_SYSTEM_PROMPT,
    SUMMARY_STAGE_SYSTEM_PROMPT,
    LEGACY_STAGE_SYSTEM_PROMPT,
    EXTRACTION_STAGE_SCHEMA,
    SUMMARY_STAGE_SCHEMA,
    LEGACY_STAGE_SCHEMA,
    buildExtractionStageMessages,
    buildSummaryStageMessages,
    buildLegacyStageMessages,
    type PromptMessage,
} from './visitPromptRegistry';

// Main OpenAI service (kept in original location for now)
// Will be moved here in a future refactor
