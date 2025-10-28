import { MedicationInfo, medicationInteractionService } from '../../../src/services/medicationInteractionService';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock OpenAI service
jest.mock('../../../src/services/openaiService', () => ({
  openaiService: {
    callOpenAI: jest.fn().mockResolvedValue(JSON.stringify({ warnings: [] })),
  },
}));

describe('MedicationInteractionService', () => {
  describe('checkTherapeuticDuplication', () => {
    it('should detect duplication when patient on metoprolol and provider adds carvedilol', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Metoprolol', dosage: '50mg', frequency: 'twice daily' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Carvedilol', dosage: '25mg', frequency: 'twice daily' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe('duplication');
      expect(warnings[0].severity).toBe('major');
      expect(warnings[0].drugClass).toBe('Beta-Blockers');
      expect(warnings[0].medication1).toBe('Metoprolol');
      expect(warnings[0].medication2).toBe('Carvedilol');
    });

    it('should detect duplication with beta-blockers (brand names)', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Lopressor', dosage: '50mg' }, // Brand name for metoprolol
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Coreg', dosage: '25mg' }, // Brand name for carvedilol
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe('duplication');
      expect(warnings[0].drugClass).toBe('Beta-Blockers');
    });

    it('should detect duplication with statins', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Atorvastatin' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Simvastatin' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].type).toBe('duplication');
      expect(warnings[0].drugClass).toBe('Statins');
    });

    it('should detect ACE inhibitor + ARB duplication', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Lisinopril', dosage: '10mg' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Losartan', dosage: '50mg' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      expect(warnings.length).toBeGreaterThan(0);
      // Should have both duplication AND known interaction warning
    });

    it('should not detect duplication for different drug classes', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Metoprolol' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Lisinopril' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      // Should not have duplication warnings
      const duplications = warnings.filter((w) => w.type === 'duplication');
      expect(duplications.length).toBe(0);
    });
  });

  describe('checkKnownInteractions', () => {
    it('should detect warfarin + NSAID interaction', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Warfarin', dosage: '5mg' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Ibuprofen', dosage: '400mg' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      const interactionWarnings = warnings.filter((w) => w.type === 'interaction');
      expect(interactionWarnings.length).toBeGreaterThan(0);
      expect(interactionWarnings[0].severity).toBe('major');
      expect(interactionWarnings[0].description).toContain('bleeding');
    });

    it('should detect SSRI + tramadol interaction', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Sertraline', dosage: '50mg' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Tramadol', dosage: '50mg' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      const interactionWarnings = warnings.filter((w) => w.type === 'interaction');
      expect(interactionWarnings.length).toBeGreaterThan(0);
      expect(interactionWarnings[0].severity).toBe('major');
      expect(interactionWarnings[0].description).toContain('serotonin');
    });

    it('should detect benzodiazepine + opioid interaction (critical)', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Alprazolam', dosage: '0.5mg' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Oxycodone', dosage: '10mg' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      const interactionWarnings = warnings.filter((w) => w.type === 'interaction');
      expect(interactionWarnings.length).toBeGreaterThan(0);
      expect(interactionWarnings[0].severity).toBe('critical');
      expect(interactionWarnings[0].description).toContain('respiratory');
    });
  });

  describe('medication format conversion', () => {
    it('should convert health profile medications', () => {
      const medications = [
        { name: 'Metoprolol', dosage: '50mg', frequency: 'twice daily' },
        { name: 'Lisinopril', dosage: '10mg', frequency: 'once daily' },
      ];

      const converted = medicationInteractionService.convertHealthProfileMedications(medications);

      expect(converted.length).toBe(2);
      expect(converted[0].name).toBe('Metoprolol');
      expect(converted[0].dosage).toBe('50mg');
      expect(converted[0].frequency).toBe('twice daily');
    });

    it('should convert visit summary medications (string format)', () => {
      const medications = ['Metoprolol 50mg', 'Lisinopril 10mg'];

      const converted = medicationInteractionService.convertVisitSummaryMedications(medications);

      expect(converted.length).toBe(2);
      expect(converted[0].name).toBe('Metoprolol 50mg');
      expect(converted[1].name).toBe('Lisinopril 10mg');
    });

    it('should convert visit summary medications (object format)', () => {
      const medications = [
        { name: 'Metoprolol', dosage: '50mg', changeType: 'NEW' },
        { name: 'Lisinopril', dosage: '10mg', changeType: 'CONTINUED' },
      ];

      const converted = medicationInteractionService.convertVisitSummaryMedications(medications);

      expect(converted.length).toBe(2);
      expect(converted[0].name).toBe('Metoprolol');
      expect(converted[0].dosage).toBe('50mg');
    });
  });

  describe('edge cases', () => {
    it('should handle empty current medications', async () => {
      const currentMeds: MedicationInfo[] = [];
      const newMeds: MedicationInfo[] = [
        { name: 'Metoprolol' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      expect(warnings.length).toBe(0);
    });

    it('should handle empty new medications', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Metoprolol' },
      ];
      const newMeds: MedicationInfo[] = [];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      expect(warnings.length).toBe(0);
    });

    it('should handle medications with special characters', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Metoprolol-XL' },
      ];
      const newMeds: MedicationInfo[] = [
        { name: 'Carvedilol (Coreg)' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      // Should still detect duplication despite special characters
      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'METOPROLOL' },
      ];
      const newMeds: MedicationInfo[] = [
        { name: 'carvedilol' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle multiple interactions in one check', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Warfarin', dosage: '5mg' },
        { name: 'Metoprolol', dosage: '50mg' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Ibuprofen', dosage: '400mg' },
        { name: 'Carvedilol', dosage: '25mg' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      // Should detect:
      // 1. Warfarin + Ibuprofen (interaction)
      // 2. Metoprolol + Carvedilol (duplication)
      expect(warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('should prioritize critical warnings', async () => {
      const currentMeds: MedicationInfo[] = [
        { name: 'Alprazolam' },
        { name: 'Metoprolol' },
      ];

      const newMeds: MedicationInfo[] = [
        { name: 'Oxycodone' },
        { name: 'Carvedilol' },
      ];

      const warnings = await medicationInteractionService.checkInteractions(currentMeds, newMeds);

      const critical = warnings.filter((w) => w.severity === 'critical');
      const major = warnings.filter((w) => w.severity === 'major');

      expect(critical.length).toBeGreaterThan(0); // Benzo + opioid
      expect(major.length).toBeGreaterThan(0); // Beta-blocker duplication
    });
  });
});

