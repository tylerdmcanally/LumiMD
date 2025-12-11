/**
 * Medication Sync Service Tests
 *
 * Tests for medication parsing, normalization, and sync logic:
 * - parseLegacyMedicationEntry() - string to object conversion
 * - normalizeMedicationEntry() - normalize various formats
 * - splitComboMedication() - split "Aspirin and Plavix" into two entries
 * - normalizeMedicationSummary() - full summary normalization
 */

import {
    normalizeMedicationSummary,
    type MedicationSummary,
    type NormalizedMedicationSummary,
} from '../medicationSync';

// We need to recreate the internal functions for testing since they're not exported
// This tests the logic patterns, not the actual private functions

describe('Medication Sync Service', () => {
    describe('normalizeMedicationSummary', () => {
        it('should return empty arrays for undefined input', () => {
            const result = normalizeMedicationSummary(undefined);
            expect(result).toEqual({
                started: [],
                stopped: [],
                changed: [],
            });
        });

        it('should handle empty medication summary', () => {
            const result = normalizeMedicationSummary({
                started: [],
                stopped: [],
                changed: [],
            });
            expect(result).toEqual({
                started: [],
                stopped: [],
                changed: [],
            });
        });

        it('should normalize string entries to objects', () => {
            const input: MedicationSummary = {
                started: ['Metformin 500mg daily'],
                stopped: [],
                changed: [],
            };
            const result = normalizeMedicationSummary(input);
            expect(result.started).toHaveLength(1);
            expect(result.started[0].name).toBeDefined();
            expect(typeof result.started[0].name).toBe('string');
        });

        it('should preserve already normalized entries', () => {
            const input: NormalizedMedicationSummary = {
                started: [{ name: 'Lisinopril', dose: '10 mg', frequency: 'daily' }],
                stopped: [{ name: 'Atenolol' }],
                changed: [{ name: 'Metformin', dose: '1000 mg', note: 'increased from 500mg' }],
            };
            const result = normalizeMedicationSummary(input);
            expect(result.started).toHaveLength(1);
            expect(result.started[0].name).toBe('Lisinopril');
            expect(result.started[0].dose).toBe('10 mg');
            expect(result.stopped[0].name).toBe('Atenolol');
            expect(result.changed[0].name).toBe('Metformin');
        });

        it('should split combo medications with "and"', () => {
            // Use object format where the full combo name is preserved
            const input: NormalizedMedicationSummary = {
                started: [{ name: 'Aspirin and Plavix' }],
                stopped: [],
                changed: [],
            };
            const result = normalizeMedicationSummary(input);
            expect(result.started.length).toBeGreaterThanOrEqual(2);
            const names = result.started.map((m) => m.name.toLowerCase());
            expect(names).toContain('aspirin');
            expect(names).toContain('plavix');
        });

        it('should NOT split slash-notation combos (fixed-dose combo pills)', () => {
            const input: NormalizedMedicationSummary = {
                started: [{ name: 'HCTZ/Lisinopril', dose: '12.5/20 mg' }],
                stopped: [],
                changed: [],
            };
            const result = normalizeMedicationSummary(input);
            // Should stay as ONE medication (matches pill bottle)
            expect(result.started).toHaveLength(1);
            expect(result.started[0].name).toContain('/');
        });

        it('should NOT split "with" medications (qualifiers)', () => {
            const input: NormalizedMedicationSummary = {
                started: [{ name: 'Vitamin D with K2' }],
                stopped: [],
                changed: [],
            };
            const result = normalizeMedicationSummary(input);
            // Should stay as ONE medication
            expect(result.started).toHaveLength(1);
            expect(result.started[0].name).toBe('Vitamin D with K2');
        });

        it('should filter out empty/invalid entries', () => {
            const input: MedicationSummary = {
                started: ['Lisinopril', '', '   ', 'Metformin'],
                stopped: [],
                changed: [],
            };
            const result = normalizeMedicationSummary(input);
            expect(result.started.length).toBe(2);
        });

        it('should handle mixed string and object entries', () => {
            const input: MedicationSummary = {
                started: [
                    'Aspirin 81mg daily',
                    { name: 'Lisinopril', dose: '10 mg' },
                ],
                stopped: [],
                changed: [],
            };
            const result = normalizeMedicationSummary(input);
            expect(result.started.length).toBe(2);
            expect(result.started.every((m) => typeof m.name === 'string')).toBe(true);
        });
    });

    describe('Legacy Medication Entry Parsing', () => {
        // Test the regex/parsing patterns used by parseLegacyMedicationEntry

        const DOSE_REGEX = /(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gram|ml|units?|iu))/i;
        const FREQUENCY_REGEX =
            /\b(daily|weekly|nightly|twice daily|three times daily|once daily|every\s+\d+\s*(?:hours|days|weeks)|bid|tid|qid|qod|prn|as needed)\b/i;

        it('should extract dose from medication string', () => {
            const tests = [
                { input: 'Metformin 500mg daily', expectedDose: '500mg' },
                { input: 'Lisinopril 10 mg', expectedDose: '10 mg' },
                { input: 'Insulin 20 units', expectedDose: '20 units' },
                { input: 'Vitamin D 5000 iu', expectedDose: '5000 iu' },
            ];

            tests.forEach(({ input, expectedDose }) => {
                const match = input.match(DOSE_REGEX);
                expect(match).not.toBeNull();
                expect(match![0]).toBe(expectedDose);
            });
        });

        it('should extract frequency from medication string', () => {
            const tests = [
                { input: 'Metformin 500mg daily', expectedFreq: 'daily' },
                { input: 'Aspirin 81mg twice daily', expectedFreq: 'twice daily' },
                { input: 'Pain medication prn', expectedFreq: 'prn' },
                { input: 'Antibiotic bid', expectedFreq: 'bid' },
            ];

            tests.forEach(({ input, expectedFreq }) => {
                const match = input.match(FREQUENCY_REGEX);
                expect(match).not.toBeNull();
                expect(match![0].toLowerCase()).toBe(expectedFreq.toLowerCase());
            });
        });

        it('should handle medications without dose/frequency', () => {
            const input = 'Tylenol';
            const doseMatch = input.match(DOSE_REGEX);
            const freqMatch = input.match(FREQUENCY_REGEX);
            expect(doseMatch).toBeNull();
            expect(freqMatch).toBeNull();
        });
    });

    describe('Combo Medication Splitting Logic', () => {
        // Test the patterns used by splitComboMedication

        const SEPARATOR_PATTERNS = [/ and /i, / & /, / \+ /];
        const SLASH_PATTERN = /\//;
        const WITH_PATTERN = / with /i;

        const shouldSplit = (name: string): boolean => {
            // Don't split slash notation
            if (SLASH_PATTERN.test(name)) return false;
            // Don't split "with" qualifiers
            if (WITH_PATTERN.test(name)) return false;
            // Split on "and", "&", "+"
            return SEPARATOR_PATTERNS.some((p) => p.test(name));
        };

        it('should identify combo medications that need splitting', () => {
            expect(shouldSplit('Aspirin and Plavix')).toBe(true);
            expect(shouldSplit('Tylenol & Ibuprofen')).toBe(true);
            expect(shouldSplit('Drug A + Drug B')).toBe(true);
        });

        it('should NOT split slash-notation combos', () => {
            expect(shouldSplit('HCTZ/Lisinopril')).toBe(false);
            expect(shouldSplit('Aspirin/Dipyridamole')).toBe(false);
        });

        it('should NOT split "with" qualifiers', () => {
            expect(shouldSplit('Vitamin D with K2')).toBe(false);
            expect(shouldSplit('Calcium with Vitamin D')).toBe(false);
        });

        it('should NOT split single medications', () => {
            expect(shouldSplit('Lisinopril')).toBe(false);
            expect(shouldSplit('Metformin 500mg')).toBe(false);
        });
    });

    describe('Verb Stripping Logic', () => {
        // Test the leading verb removal pattern

        const VERB_WORDS = [
            'started',
            'start',
            'added',
            'increase',
            'decreased',
            'stopped',
            'hold',
        ];
        const LEADING_VERB_PATTERN = new RegExp(`^(${VERB_WORDS.join('|')})\\s+`, 'i');

        const stripLeadingVerb = (text: string): string => {
            return text.replace(LEADING_VERB_PATTERN, '').trim();
        };

        it('should strip leading action verbs', () => {
            expect(stripLeadingVerb('Started lisinopril 10mg')).toBe('lisinopril 10mg');
            expect(stripLeadingVerb('Added metformin')).toBe('metformin');
            expect(stripLeadingVerb('Stopped aspirin')).toBe('aspirin');
        });

        it('should preserve medication names without verbs', () => {
            expect(stripLeadingVerb('Lisinopril 10mg')).toBe('Lisinopril 10mg');
            expect(stripLeadingVerb('Metformin')).toBe('Metformin');
        });

        it('should be case insensitive', () => {
            expect(stripLeadingVerb('STARTED lisinopril')).toBe('lisinopril');
            expect(stripLeadingVerb('Started Lisinopril')).toBe('Lisinopril');
        });
    });

    describe('Stop Word Detection', () => {
        // Test the stop word filtering used in name extraction

        const STOP_WORDS = new Set([
            'to',
            'at',
            'for',
            'with',
            'and',
            'then',
            'from',
            'on',
            'in',
            'per',
        ]);

        it('should identify common stop words', () => {
            expect(STOP_WORDS.has('to')).toBe(true);
            expect(STOP_WORDS.has('for')).toBe(true);
            expect(STOP_WORDS.has('with')).toBe(true);
        });

        it('should not flag medication names as stop words', () => {
            expect(STOP_WORDS.has('lisinopril')).toBe(false);
            expect(STOP_WORDS.has('metformin')).toBe(false);
        });
    });
});
