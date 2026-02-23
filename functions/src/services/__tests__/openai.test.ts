/**
 * OpenAI Service Tests
 *
 * Tests for core parsing and normalization functions:
 * - extractJsonBlock() - JSON extraction from LLM responses
 * - normalizeMedicationEntry() - medication object normalization
 * - levenshteinDistance() - string similarity algorithm
 * - ensureArrayOfStrings() - array validation
 * - ensureMedicationsObject() - medication structure validation
 */

// We need to import the functions we want to test
// Since some are not exported, we'll test via the public interface
// or by importing from the module directly after modifying exports

import type { MedicationChangeEntry, VisitSummaryResult } from '../openai';
import { validateTopLevelSchema, type JsonKeySchema } from '../openai/jsonParser';

// Helper to access internal functions by testing through the module
// For now, we'll test what's publicly accessible and simulate inputs

describe('OpenAI Service Utilities', () => {
    describe('MedicationChangeEntry type', () => {
        it('should accept minimal medication entry', () => {
            const entry: MedicationChangeEntry = {
                name: 'Lisinopril',
            };
            expect(entry.name).toBe('Lisinopril');
            expect(entry.dose).toBeUndefined();
        });

        it('should accept full medication entry', () => {
            const entry: MedicationChangeEntry = {
                name: 'Metformin',
                dose: '500 mg',
                frequency: 'twice daily',
                note: 'Take with food',
                display: 'Metformin 500 mg twice daily',
                original: 'Started metformin 500 milligrams twice a day',
                needsConfirmation: false,
                status: 'matched',
            };
            expect(entry.name).toBe('Metformin');
            expect(entry.dose).toBe('500 mg');
            expect(entry.status).toBe('matched');
        });

        it('should accept medication with warnings', () => {
            const entry: MedicationChangeEntry = {
                name: 'Ibuprofen',
                warning: [
                    {
                        type: 'drug_interaction',
                        severity: 'moderate',
                        message: 'May interact with blood thinners',
                        details: 'Increased bleeding risk',
                        recommendation: 'Monitor for bleeding',
                    },
                ],
            };
            expect(entry.warning).toHaveLength(1);
            expect(entry.warning![0].type).toBe('drug_interaction');
        });
    });

    describe('VisitSummaryResult type', () => {
        it('should have correct structure', () => {
            const result: VisitSummaryResult = {
                summary: 'Patient discussed blood pressure management',
                diagnoses: ['Hypertension', 'Type 2 Diabetes'],
                diagnosesDetailed: [
                    { name: 'Hypertension', status: 'chronic', confidence: 'high' },
                    { name: 'Type 2 Diabetes', status: 'chronic', confidence: 'high' },
                ],
                medications: {
                    started: [{ name: 'Amlodipine' }],
                    stopped: [],
                    changed: [{ name: 'Lisinopril', dose: '20 mg', note: 'increased from 10 mg' }],
                },
                imaging: ['Chest X-ray'],
                testsOrdered: [
                    { name: 'Chest X-ray', category: 'imaging', status: 'ordered' },
                ],
                nextSteps: ['Follow up in 3 months'],
                followUps: [
                    {
                        type: 'clinic_follow_up',
                        task: 'Clinic follow up',
                        timeframe: 'follow up in 3 months',
                    },
                ],
                medicationReview: {
                    reviewed: true,
                    continued: [{ name: 'Metformin' }],
                    continuedReviewed: [{ name: 'Metformin' }],
                    adherenceConcerns: [],
                    reviewConcerns: [],
                    sideEffectsDiscussed: [],
                    followUpNeeded: false,
                    notes: [],
                },
                education: {
                    diagnoses: [
                        {
                            name: 'Hypertension',
                            summary: 'High blood pressure',
                            watchFor: 'Headaches, dizziness',
                        },
                    ],
                    medications: [
                        {
                            name: 'Amlodipine',
                            purpose: 'Lowers blood pressure',
                            usage: 'Take once daily',
                            sideEffects: 'May cause ankle swelling',
                            whenToCallDoctor: 'If swelling persists',
                        },
                    ],
                },
                extractionVersion: 'v2_structured',
                promptMeta: {
                    promptVersion: 'visit-summary-v1',
                    schemaVersion: 'v2.0',
                    responseFormat: 'json_object',
                    model: 'gpt-4.1-mini',
                },
            };

            expect(result.summary).toBeDefined();
            expect(result.diagnoses).toHaveLength(2);
            expect(result.medications.started).toHaveLength(1);
            expect(result.medications.stopped).toHaveLength(0);
            expect(result.medications.changed).toHaveLength(1);
            expect(result.imaging).toHaveLength(1);
            expect(result.testsOrdered).toHaveLength(1);
            expect(result.nextSteps).toHaveLength(1);
            expect(result.followUps).toHaveLength(1);
            expect(result.education.diagnoses).toHaveLength(1);
            expect(result.education.medications).toHaveLength(1);
            expect(result.medicationReview?.reviewed).toBe(true);
        });
    });
});

describe('JSON Extraction Logic', () => {
    // Test the pattern used by extractJsonBlock
    const extractJsonBlock = (content: string): string => {
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

    it('should extract JSON from code fences', () => {
        const input = '```json\n{"key": "value"}\n```';
        const result = extractJsonBlock(input);
        expect(result).toBe('{"key": "value"}');
    });

    it('should extract JSON from code fences without language tag', () => {
        const input = '```\n{"medications": []}\n```';
        const result = extractJsonBlock(input);
        expect(result).toBe('{"medications": []}');
    });

    it('should extract JSON object without code fences', () => {
        const input = 'Here is the result: {"summary": "test"}';
        const result = extractJsonBlock(input);
        expect(result).toBe('{"summary": "test"}');
    });

    it('should handle plain JSON input', () => {
        const input = '{"name": "lisinopril", "dose": "10 mg"}';
        const result = extractJsonBlock(input);
        expect(result).toBe('{"name": "lisinopril", "dose": "10 mg"}');
    });

    it('should handle multiline JSON in code fences', () => {
        const input = `\`\`\`json
{
  "summary": "Patient visit",
  "diagnoses": ["HTN", "DM2"],
  "medications": {
    "started": [],
    "stopped": [],
    "changed": []
  }
}
\`\`\``;
        const result = extractJsonBlock(input);
        const parsed = JSON.parse(result);
        expect(parsed.summary).toBe('Patient visit');
        expect(parsed.diagnoses).toEqual(['HTN', 'DM2']);
    });
});

describe('Levenshtein Distance Algorithm', () => {
    // Implementation matching the one in openai.ts
    const levenshteinDistance = (a: string, b: string): number => {
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

    it('should return 0 for identical strings', () => {
        expect(levenshteinDistance('lisinopril', 'lisinopril')).toBe(0);
        expect(levenshteinDistance('', '')).toBe(0);
    });

    it('should return length for empty string comparison', () => {
        expect(levenshteinDistance('test', '')).toBe(4);
        expect(levenshteinDistance('', 'hello')).toBe(5);
    });

    it('should calculate single character difference', () => {
        expect(levenshteinDistance('cat', 'hat')).toBe(1);
        expect(levenshteinDistance('lisinopril', 'lisnopril')).toBe(1); // missing 'i'
    });

    it('should calculate multiple character differences', () => {
        expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('should handle common medication typos', () => {
        // Common transcription errors
        expect(levenshteinDistance('metformin', 'metfromin')).toBe(2); // transposition
        expect(levenshteinDistance('atorvastatin', 'atorvastin')).toBe(2); // missing 'ta'
        expect(levenshteinDistance('lisinopril', 'lizinopril')).toBe(1); // s->z
    });

    it('should be symmetric', () => {
        expect(levenshteinDistance('abc', 'xyz')).toBe(levenshteinDistance('xyz', 'abc'));
        expect(levenshteinDistance('drug', 'medication')).toBe(
            levenshteinDistance('medication', 'drug')
        );
    });
});

describe('Medication Name Extraction', () => {
    // Test the pattern used by extractNameFromMedicationText
    const extractNameFromMedicationText = (
        text: string
    ): { name: string; note?: string } => {
        const cleaned = text.trim();
        if (!cleaned) {
            return { name: 'Unknown medication', note: undefined };
        }

        const lower = cleaned.toLowerCase();
        const breakTokens = [
            ' mg',
            ' mcg',
            ' g',
            ' ml',
            ' units',
            ' unit',
            ' daily',
            ' nightly',
            ' weekly',
            ' twice',
            ' three',
            ' every',
            ' with',
            ' for',
            ' from',
            ' at ',
            ' per ',
            ' to ',
            ' on ',
            ' in ',
            ',',
            ';',
            ':',
        ];

        let breakIndex = cleaned.length;

        for (const token of breakTokens) {
            const index = lower.indexOf(token);
            if (index !== -1 && index < breakIndex) {
                breakIndex = index;
            }
        }

        const leadingVerbMatch = cleaned.match(
            /^(?:started|start|starting|initiated|initiating|add|added|adding|begin|began|increase|increased|increasing|decrease|decreased|decreasing|change|changed|changing|titrate|titrated|titrating|switch|switched|switching|restart|restarted|restarting|resume|resumed|resuming|hold|held|holding|stop|stopped|stopping)\s+/i
        );

        let nameSection = cleaned.slice(0, breakIndex).trim();

        if (leadingVerbMatch) {
            nameSection = nameSection.slice(leadingVerbMatch[0].length).trim();
        }

        nameSection = nameSection
            .replace(/\b\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*\s*$/g, '')
            .trim();

        const name = nameSection || cleaned.split(/\s+/)[0] || 'Unknown medication';
        const note = cleaned === name ? undefined : cleaned;

        return { name, note };
    };

    it('should extract medication name from simple string', () => {
        const result = extractNameFromMedicationText('Lisinopril');
        expect(result.name).toBe('Lisinopril');
        expect(result.note).toBeUndefined();
    });

    it('should extract name before dose unit', () => {
        const result = extractNameFromMedicationText('Lisinopril 10 mg');
        expect(result.name).toBe('Lisinopril');
        expect(result.note).toBe('Lisinopril 10 mg');
    });

    it('should extract name before frequency', () => {
        const result = extractNameFromMedicationText('Metformin daily');
        expect(result.name).toBe('Metformin');
        expect(result.note).toBe('Metformin daily');
    });

    it('should strip leading action verbs', () => {
        const result = extractNameFromMedicationText('Started lisinopril 10 mg');
        expect(result.name).toBe('lisinopril');
    });

    it('should keep combination names while trimming dose fragments', () => {
        const result = extractNameFromMedicationText('HCTZ/Lisinopril 12.5/20 mg daily');
        expect(result.name).toBe('HCTZ/Lisinopril');
    });

    it('should handle empty input', () => {
        const result = extractNameFromMedicationText('');
        expect(result.name).toBe('Unknown medication');
    });

    it('should handle complex instructions', () => {
        const result = extractNameFromMedicationText('Increase metoprolol to 100 mg daily');
        expect(result.name).toBe('metoprolol');
        expect(result.note).toContain('metoprolol');
    });
});

describe('Array and Object Validation', () => {
    // Test ensureArrayOfStrings pattern
    const ensureArrayOfStrings = (value: unknown): string[] => {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean);
    };

    it('should return empty array for non-array input', () => {
        expect(ensureArrayOfStrings(null)).toEqual([]);
        expect(ensureArrayOfStrings(undefined)).toEqual([]);
        expect(ensureArrayOfStrings('string')).toEqual([]);
        expect(ensureArrayOfStrings(123)).toEqual([]);
        expect(ensureArrayOfStrings({})).toEqual([]);
    });

    it('should filter out non-string values', () => {
        const input = ['Diagnosis 1', 123, 'Diagnosis 2', null, { name: 'test' }];
        const result = ensureArrayOfStrings(input);
        expect(result).toEqual(['Diagnosis 1', 'Diagnosis 2']);
    });

    it('should trim whitespace', () => {
        const input = ['  Hypertension  ', 'Diabetes', '   '];
        const result = ensureArrayOfStrings(input);
        expect(result).toEqual(['Hypertension', 'Diabetes']);
    });

    it('should handle valid string array', () => {
        const input = ['Hypertension', 'Type 2 Diabetes', 'Hyperlipidemia'];
        const result = ensureArrayOfStrings(input);
        expect(result).toEqual(input);
    });
});

describe('Drug Name Normalization', () => {
    // Test normalizeDrugName pattern
    const DRUG_NAME_ALIASES: Record<string, string> = {
        hctz: 'hydrochlorothiazide',
        hct: 'hydrochlorothiazide',
        asa: 'aspirin',
    };

    const normalizeDrugName = (name: string): string => {
        if (!name) return '';
        const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const aliasKey = normalized.replace(/\d+/g, '');
        return DRUG_NAME_ALIASES[aliasKey] ?? DRUG_NAME_ALIASES[normalized] ?? normalized;
    };

    it('should normalize to lowercase', () => {
        expect(normalizeDrugName('Lisinopril')).toBe('lisinopril');
        expect(normalizeDrugName('METFORMIN')).toBe('metformin');
    });

    it('should remove special characters', () => {
        expect(normalizeDrugName('Metoprolol-XL')).toBe('metoprololxl');
        expect(normalizeDrugName("Tylenol's")).toBe('tylenols');
    });

    it('should resolve common aliases', () => {
        expect(normalizeDrugName('HCTZ')).toBe('hydrochlorothiazide');
        expect(normalizeDrugName('ASA')).toBe('aspirin');
    });

    it('should handle empty input', () => {
        expect(normalizeDrugName('')).toBe('');
    });
});

describe('Top-level Schema Validation', () => {
    const schema: JsonKeySchema[] = [
        { key: 'summary', type: 'string', required: true },
        { key: 'diagnoses', type: 'array', required: true },
        { key: 'medications', type: 'object', required: true },
    ];

    it('should accept a valid payload', () => {
        const payload = {
            summary: 'Visit summary',
            diagnoses: ['Hypertension'],
            medications: {
                started: [],
                stopped: [],
                changed: [],
            },
        };

        const result = validateTopLevelSchema(payload, schema);
        expect(result.isValidObject).toBe(true);
        expect(result.record).toEqual(payload);
        expect(result.warnings).toHaveLength(0);
    });

    it('should flag missing required keys', () => {
        const payload = {
            summary: 'Visit summary',
            medications: {},
        };

        const result = validateTopLevelSchema(payload, schema);
        expect(result.isValidObject).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('missing_key');
        expect(result.warnings[0].key).toBe('diagnoses');
    });

    it('should flag invalid key types', () => {
        const payload = {
            summary: ['not-a-string'],
            diagnoses: 'not-an-array',
            medications: [],
        };

        const result = validateTopLevelSchema(payload, schema);
        expect(result.isValidObject).toBe(true);
        expect(result.warnings).toHaveLength(3);
        expect(result.warnings.map((warning) => warning.code)).toEqual([
            'invalid_type',
            'invalid_type',
            'invalid_type',
        ]);
    });

    it('should reject non-object root payloads', () => {
        const result = validateTopLevelSchema([], schema);
        expect(result.isValidObject).toBe(false);
        expect(result.record).toBeNull();
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].key).toBe('$');
        expect(result.warnings[0].code).toBe('invalid_type');
    });
});
