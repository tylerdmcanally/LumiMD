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

export type JsonExpectedType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface JsonKeySchema {
    key: string;
    type: JsonExpectedType;
    required?: boolean;
}

export interface JsonValidationWarning {
    key: string;
    code: 'missing_key' | 'invalid_type';
    expectedType: JsonExpectedType;
    actualType: string;
    message: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const getValueType = (value: unknown): string => {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
};

const matchesExpectedType = (value: unknown, expectedType: JsonExpectedType): boolean => {
    switch (expectedType) {
        case 'array':
            return Array.isArray(value);
        case 'object':
            return isPlainObject(value);
        default:
            return typeof value === expectedType;
    }
};

export const validateTopLevelSchema = (
    value: unknown,
    schema: JsonKeySchema[]
): {
    record: Record<string, unknown> | null;
    warnings: JsonValidationWarning[];
    isValidObject: boolean;
} => {
    if (!isPlainObject(value)) {
        return {
            record: null,
            warnings: [
                {
                    key: '$',
                    code: 'invalid_type',
                    expectedType: 'object',
                    actualType: getValueType(value),
                    message: 'Top-level JSON payload must be an object.',
                },
            ],
            isValidObject: false,
        };
    }

    const warnings: JsonValidationWarning[] = [];

    schema.forEach(({ key, type, required = false }) => {
        const fieldValue = value[key];
        if (typeof fieldValue === 'undefined') {
            if (required) {
                warnings.push({
                    key,
                    code: 'missing_key',
                    expectedType: type,
                    actualType: 'undefined',
                    message: `Missing required key "${key}" (expected ${type}).`,
                });
            }
            return;
        }

        if (!matchesExpectedType(fieldValue, type)) {
            warnings.push({
                key,
                code: 'invalid_type',
                expectedType: type,
                actualType: getValueType(fieldValue),
                message: `Invalid type for key "${key}" (expected ${type}, received ${getValueType(fieldValue)}).`,
            });
        }
    });

    return {
        record: value,
        warnings,
        isValidObject: true,
    };
};
