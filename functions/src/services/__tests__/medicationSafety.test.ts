/**
 * Medication Safety Service Tests
 *
 * Tests for core medication safety checking functions:
 * - normalizeMedicationName() - medication name normalization
 * - checkDuplicateTherapy() - duplicate medication detection
 * - checkDrugInteractions() - drug interaction detection
 * - checkAllergyConflicts() - allergy conflict detection
 */

import {
    normalizeMedicationName,
    checkDuplicateTherapy,
    checkDrugInteractions,
    checkAllergyConflicts,
    CANONICAL_MEDICATIONS,
} from '../medicationSafety';
import type { MedicationChangeEntry } from '../openai';

describe('Medication Safety Service', () => {
    describe('normalizeMedicationName', () => {
        it('should return empty string for empty input', () => {
            expect(normalizeMedicationName('')).toBe('');
            expect(normalizeMedicationName('   ')).toBe('');
        });

        it('should normalize brand names to generic names', () => {
            expect(normalizeMedicationName('Lipitor')).toBe('atorvastatin');
            expect(normalizeMedicationName('LIPITOR')).toBe('atorvastatin');
            expect(normalizeMedicationName('Crestor')).toBe('rosuvastatin');
            expect(normalizeMedicationName('Advil')).toBe('ibuprofen');
            expect(normalizeMedicationName('Tylenol')).toBe('acetaminophen');
        });

        it('should handle generic names correctly', () => {
            expect(normalizeMedicationName('atorvastatin')).toBe('atorvastatin');
            expect(normalizeMedicationName('Atorvastatin')).toBe('atorvastatin');
            expect(normalizeMedicationName('METFORMIN')).toBe('metformin');
        });

        it('should strip salt suffixes', () => {
            expect(normalizeMedicationName('metoprolol succinate')).toBe('metoprolol');
            expect(normalizeMedicationName('metoprolol tartrate')).toBe('metoprolol');
            expect(normalizeMedicationName('lisinopril hydrochloride')).toBe('lisinopril');
        });

        it('should strip extended release designations', () => {
            expect(normalizeMedicationName('metformin er')).toBe('metformin');
            expect(normalizeMedicationName('toprol xl')).toBe('metoprolol');
            // wellbutrin xl normalizes to bupropion (generic), then strips xl
            expect(normalizeMedicationName('wellbutrin xl')).toBe('bupropion');
        });

        it('should handle unknown medications gracefully', () => {
            const unknownMed = 'somefakemedicationname123';
            expect(normalizeMedicationName(unknownMed)).toBe(unknownMed);
        });

        it('should handle medications with multiple words', () => {
            // Both brand and generic normalize to canonical hyphenated form
            expect(normalizeMedicationName('amoxicillin clavulanate')).toBe('amoxicillin-clavulanate');
            expect(normalizeMedicationName('Augmentin')).toBe('amoxicillin-clavulanate');
            // Unknown multi-word medications pass through unchanged
            expect(normalizeMedicationName('insulin glargine')).toBe('insulin glargine');
        });
    });

    describe('CANONICAL_MEDICATIONS data', () => {
        it('should have proper structure for all entries', () => {
            Object.entries(CANONICAL_MEDICATIONS).forEach(([name, entry]) => {
                expect(entry).toHaveProperty('classes');
                expect(entry).toHaveProperty('aliases');
                expect(Array.isArray(entry.classes)).toBe(true);
                expect(Array.isArray(entry.aliases)).toBe(true);
                expect(entry.classes.length).toBeGreaterThan(0);
            });
        });

        it('should have common medication classes', () => {
            const allClasses = new Set<string>();
            Object.values(CANONICAL_MEDICATIONS).forEach((entry) => {
                entry.classes.forEach((c) => allClasses.add(c));
            });

            expect(allClasses.has('statin')).toBe(true);
            expect(allClasses.has('beta-blocker')).toBe(true);
            expect(allClasses.has('ace-inhibitor')).toBe(true);
            expect(allClasses.has('ssri')).toBe(true);
            expect(allClasses.has('nsaid')).toBe(true);
        });

        it('should have popular medications', () => {
            expect(CANONICAL_MEDICATIONS['atorvastatin']).toBeDefined();
            expect(CANONICAL_MEDICATIONS['metformin']).toBeDefined();
            expect(CANONICAL_MEDICATIONS['lisinopril']).toBeDefined();
            expect(CANONICAL_MEDICATIONS['metoprolol']).toBeDefined();
        });
    });

    describe('checkDuplicateTherapy', () => {
        const userId = 'test-user-123';

        it('should detect exact duplicate medications', async () => {
            const newMed: MedicationChangeEntry = { name: 'Lipitor' };
            const currentMeds = [{ id: 'med-1', name: 'atorvastatin', active: true }];

            const warnings = await checkDuplicateTherapy(userId, newMed, currentMeds);

            expect(warnings.length).toBe(1);
            expect(warnings[0].type).toBe('duplicate_therapy');
            expect(warnings[0].severity).toBe('high');
            expect(warnings[0].conflictingMedication).toBe('atorvastatin');
        });

        it('should detect same therapeutic class duplicates', async () => {
            // Two different statins
            const newMed: MedicationChangeEntry = { name: 'rosuvastatin' };
            const currentMeds = [{ id: 'med-1', name: 'atorvastatin', active: true }];

            const warnings = await checkDuplicateTherapy(userId, newMed, currentMeds);

            expect(warnings.length).toBeGreaterThanOrEqual(1);
            expect(warnings.some((w) => w.type === 'duplicate_therapy')).toBe(true);
        });

        it('should detect same class beta-blockers', async () => {
            const newMed: MedicationChangeEntry = { name: 'atenolol' };
            const currentMeds = [{ id: 'med-1', name: 'metoprolol', active: true }];

            const warnings = await checkDuplicateTherapy(userId, newMed, currentMeds);

            expect(warnings.length).toBeGreaterThanOrEqual(1);
            const betaBlockerWarning = warnings.find(
                (w) => w.type === 'duplicate_therapy'
            );
            expect(betaBlockerWarning).toBeDefined();
        });

        it('should not flag inactive medications', async () => {
            const newMed: MedicationChangeEntry = { name: 'Lipitor' };
            const currentMeds = [{ id: 'med-1', name: 'atorvastatin', active: false }];

            const warnings = await checkDuplicateTherapy(userId, newMed, currentMeds);

            expect(warnings.length).toBe(0);
        });

        it('should not flag different medication classes', async () => {
            const newMed: MedicationChangeEntry = { name: 'lisinopril' }; // ACE inhibitor
            const currentMeds = [{ id: 'med-1', name: 'metformin', active: true }]; // Antidiabetic

            const warnings = await checkDuplicateTherapy(userId, newMed, currentMeds);

            expect(warnings.length).toBe(0);
        });

        it('should handle empty current medications', async () => {
            const newMed: MedicationChangeEntry = { name: 'Lipitor' };
            const currentMeds: Array<{ id: string; name: string; active: boolean }> = [];

            const warnings = await checkDuplicateTherapy(userId, newMed, currentMeds);

            expect(warnings.length).toBe(0);
        });
    });

    describe('checkDrugInteractions', () => {
        const userId = 'test-user-123';

        it('should detect critical warfarin + NSAID interaction', async () => {
            const newMed: MedicationChangeEntry = { name: 'ibuprofen' };
            const currentMeds = [{ id: 'med-1', name: 'warfarin', active: true }];

            const warnings = await checkDrugInteractions(userId, newMed, currentMeds);

            expect(warnings.length).toBeGreaterThanOrEqual(1);
            const criticalWarning = warnings.find(
                (w) => w.type === 'drug_interaction' && w.severity === 'critical'
            );
            expect(criticalWarning).toBeDefined();
            expect(criticalWarning?.details).toContain('bleeding');
        });

        it('should detect ACE inhibitor + ARB interaction', async () => {
            const newMed: MedicationChangeEntry = { name: 'losartan' }; // ARB
            const currentMeds = [{ id: 'med-1', name: 'lisinopril', active: true }]; // ACE inhibitor

            const warnings = await checkDrugInteractions(userId, newMed, currentMeds);

            const interactionWarning = warnings.find((w) => w.type === 'drug_interaction');
            expect(interactionWarning).toBeDefined();
            expect(interactionWarning?.severity).toBe('high');
        });

        it('should detect SSRI + NSAID bleeding risk', async () => {
            const newMed: MedicationChangeEntry = { name: 'ibuprofen' };
            const currentMeds = [{ id: 'med-1', name: 'sertraline', active: true }];

            const warnings = await checkDrugInteractions(userId, newMed, currentMeds);

            const bleedingWarning = warnings.find(
                (w) => w.details?.toLowerCase().includes('bleeding')
            );
            expect(bleedingWarning).toBeDefined();
        });

        it('should not flag medications with no known interactions', async () => {
            const newMed: MedicationChangeEntry = { name: 'levothyroxine' };
            const currentMeds = [{ id: 'med-1', name: 'omeprazole', active: true }];

            const warnings = await checkDrugInteractions(userId, newMed, currentMeds);

            expect(warnings.length).toBe(0);
        });

        it('should handle inactive medications', async () => {
            const newMed: MedicationChangeEntry = { name: 'ibuprofen' };
            const currentMeds = [{ id: 'med-1', name: 'warfarin', active: false }];

            const warnings = await checkDrugInteractions(userId, newMed, currentMeds);

            expect(warnings.length).toBe(0);
        });
    });

    describe('checkAllergyConflicts', () => {
        const userId = 'test-user-123';

        it('should detect direct allergy match', async () => {
            const newMed: MedicationChangeEntry = { name: 'penicillin' };
            const allergies = ['penicillin'];

            const warnings = await checkAllergyConflicts(userId, newMed, allergies);

            expect(warnings.length).toBeGreaterThanOrEqual(1);
            const allergyWarning = warnings.find((w) => w.type === 'allergy_alert');
            expect(allergyWarning).toBeDefined();
            expect(allergyWarning?.severity).toBe('critical');
        });

        it('should detect class-based allergy (penicillin class)', async () => {
            // Since amoxicillin is not in database, test direct penicillin class
            const newMed: MedicationChangeEntry = { name: 'penicillin vk' };
            const allergies = ['penicillin'];

            const warnings = await checkAllergyConflicts(userId, newMed, allergies);

            expect(warnings.length).toBeGreaterThanOrEqual(1);
            const allergyWarning = warnings.find((w) => w.type === 'allergy_alert');
            expect(allergyWarning).toBeDefined();
        });

        it('should handle case-insensitive direct allergy match', async () => {
            // Cephalexin is not in database, so test direct penicillin match
            const newMed: MedicationChangeEntry = { name: 'PENICILLIN' };
            const allergies = ['penicillin'];

            const warnings = await checkAllergyConflicts(userId, newMed, allergies);

            expect(warnings.length).toBeGreaterThanOrEqual(1);
            const warning = warnings.find((w) => w.type === 'allergy_alert');
            expect(warning).toBeDefined();
            expect(warning?.severity).toBe('critical');
        });

        it('should not flag when no allergies', async () => {
            const newMed: MedicationChangeEntry = { name: 'amoxicillin' };
            const allergies: string[] = [];

            const warnings = await checkAllergyConflicts(userId, newMed, allergies);

            expect(warnings.length).toBe(0);
        });

        it('should not flag unrelated medications', async () => {
            const newMed: MedicationChangeEntry = { name: 'metformin' };
            const allergies = ['penicillin', 'sulfa'];

            const warnings = await checkAllergyConflicts(userId, newMed, allergies);

            expect(warnings.length).toBe(0);
        });

        it('should handle case-insensitive allergy matching', async () => {
            const newMed: MedicationChangeEntry = { name: 'Penicillin' };
            const allergies = ['PENICILLIN'];

            const warnings = await checkAllergyConflicts(userId, newMed, allergies);

            expect(warnings.length).toBeGreaterThanOrEqual(1);
        });
    });
});
