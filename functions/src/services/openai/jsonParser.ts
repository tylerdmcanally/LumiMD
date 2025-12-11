/**
 * JSON Parser Utilities
 *
 * Extracts and validates JSON from LLM responses which may contain
 * code fences, extra text, or malformed output.
 */

/**
 * Extract JSON block from LLM response content.
 * Handles:
 * - JSON wrapped in code fences (```json ... ```)
 * - Raw JSON objects
 * - JSON with leading text
 */
export const extractJsonBlock = (content: string): string => {
    const codeFenceMatch = content.match(/```(?:json)?([\s\S]*?)```/i);
    if (codeFenceMatch) {
        return codeFenceMatch[1].trim();
    }

    const jsonMatch = content.match(/\{[\s\S]*\}$/);
    if (jsonMatch) {
        return jsonMatch[0];
    }

    return content.trim();
};

/**
 * Safely parse JSON with error handling
 */
export const safeParseJson = <T>(
    content: string,
    fallback: T
): { data: T; error: string | null } => {
    try {
        const extracted = extractJsonBlock(content);
        const data = JSON.parse(extracted) as T;
        return { data, error: null };
    } catch (error) {
        return {
            data: fallback,
            error: error instanceof Error ? error.message : 'Unknown parsing error',
        };
    }
};

/**
 * Ensure value is an array of strings, filtering out non-strings
 */
export const ensureArrayOfStrings = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
};

/**
 * Sanitize text input, returning undefined for empty/invalid values
 */
export const sanitizeText = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
