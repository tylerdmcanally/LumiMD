/**
 * Fuzzy Matcher Utilities
 *
 * String similarity and fuzzy matching algorithms for
 * medication name correction from transcriptions.
 */

/**
 * Drug name aliases for common abbreviations
 */
export const DRUG_NAME_ALIASES: Record<string, string> = {
    hctz: 'hydrochlorothiazide',
    hct: 'hydrochlorothiazide',
    hcthydrochlorothiazide: 'hydrochlorothiazide',
    asa: 'aspirin',
};

/**
 * Normalize drug name to lowercase alphanumeric,
 * resolving common aliases.
 */
export const normalizeDrugName = (name: string): string => {
    if (!name) return '';
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliasKey = normalized.replace(/\d+/g, '');
    return DRUG_NAME_ALIASES[aliasKey] ?? DRUG_NAME_ALIASES[normalized] ?? normalized;
};

/**
 * Calculate Levenshtein (edit) distance between two strings.
 * Used for fuzzy matching medication names from transcriptions.
 */
export const levenshteinDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
        new Array(b.length + 1).fill(0)
    );

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[a.length][b.length];
};

/**
 * Check if a string is a potential combination medication
 */
export const isComboCandidate = (text?: string | null): boolean => {
    if (!text || typeof text !== 'string') return false;
    const COMBO_SPLIT_PATTERN =
        /\/|,|;|&|\+|-|\band\b|\bwith\b|\bplus\b|\balong with\b|\bcombined with\b/;
    return COMBO_SPLIT_PATTERN.test(text.toLowerCase());
};

/**
 * Extract components from a combo medication string
 */
export const extractComboComponents = (text: string): string[] => {
    const COMBO_SPLIT_REGEX =
        /\/|,|;|&|\+|-|\band\b|\bwith\b|\bplus\b|\balong with\b|\bcombined with\b/gi;
    return text
        .split(COMBO_SPLIT_REGEX)
        .map((part) => part.trim())
        .filter((part) => part.length > 1);
};
