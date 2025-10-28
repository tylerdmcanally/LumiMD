import logger from '../utils/logger';
import { openaiService } from './openaiService';

/**
 * Medication Interaction Service
 * Detects drug-drug interactions and therapeutic duplication
 */

export interface MedicationInfo {
  name: string;
  genericName?: string;
  dosage?: string;
  frequency?: string;
}

export interface InteractionWarning {
  severity: 'critical' | 'major' | 'moderate' | 'minor';
  type: 'interaction' | 'duplication' | 'contraindication';
  medication1: string;
  medication2: string;
  description: string;
  recommendation: string;
  drugClass?: string; // For duplication warnings
  disclaimer: string; // Always include medical disclaimer
}

// Medical disclaimer - ALWAYS shown with warnings
const MEDICAL_DISCLAIMER = 'This is informational only and not medical advice. Always consult your healthcare provider before starting, stopping, or changing any medication.';

// Common drug classes for therapeutic duplication detection
const DRUG_CLASSES: Record<string, string[]> = {
  'Beta-Blockers': [
    'metoprolol', 'lopressor', 'toprol',
    'carvedilol', 'coreg',
    'atenolol', 'tenormin',
    'propranolol', 'inderal',
    'bisoprolol', 'zebeta',
    'nebivolol', 'bystolic',
  ],
  'ACE Inhibitors': [
    'lisinopril', 'prinivil', 'zestril',
    'enalapril', 'vasotec',
    'ramipril', 'altace',
    'benazepril', 'lotensin',
    'captopril', 'capoten',
  ],
  'ARBs (Angiotensin Receptor Blockers)': [
    'losartan', 'cozaar',
    'valsartan', 'diovan',
    'olmesartan', 'benicar',
    'telmisartan', 'micardis',
    'irbesartan', 'avapro',
  ],
  'Statins': [
    'atorvastatin', 'lipitor',
    'simvastatin', 'zocor',
    'rosuvastatin', 'crestor',
    'pravastatin', 'pravachol',
    'lovastatin', 'mevacor',
  ],
  'Calcium Channel Blockers': [
    'amlodipine', 'norvasc',
    'diltiazem', 'cardizem',
    'verapamil', 'calan',
    'nifedipine', 'procardia',
  ],
  'Diuretics (Loop)': [
    'furosemide', 'lasix',
    'bumetanide', 'bumex',
    'torsemide', 'demadex',
  ],
  'Diuretics (Thiazide)': [
    'hydrochlorothiazide', 'hctz', 'microzide',
    'chlorthalidone', 'thalitone',
  ],
  'SSRIs (Antidepressants)': [
    'sertraline', 'zoloft',
    'fluoxetine', 'prozac',
    'escitalopram', 'lexapro',
    'citalopram', 'celexa',
    'paroxetine', 'paxil',
  ],
  'SNRIs (Antidepressants)': [
    'venlafaxine', 'effexor',
    'duloxetine', 'cymbalta',
    'desvenlafaxine', 'pristiq',
  ],
  'Benzodiazepines': [
    'alprazolam', 'xanax',
    'lorazepam', 'ativan',
    'clonazepam', 'klonopin',
    'diazepam', 'valium',
  ],
  'Opioids': [
    'oxycodone', 'oxycontin',
    'hydrocodone', 'vicodin', 'norco',
    'morphine',
    'tramadol', 'ultram',
    'codeine',
    'fentanyl',
  ],
  'NSAIDs': [
    'ibuprofen', 'advil', 'motrin',
    'naproxen', 'aleve', 'naprosyn',
    'celecoxib', 'celebrex',
    'diclofenac', 'voltaren',
    'meloxicam', 'mobic',
  ],
  'Anticoagulants': [
    'warfarin', 'coumadin',
    'apixaban', 'eliquis',
    'rivaroxaban', 'xarelto',
    'dabigatran', 'pradaxa',
    'edoxaban', 'savaysa',
  ],
  'Antiplatelets': [
    'clopidogrel', 'plavix',
    'prasugrel', 'effient',
    'ticagrelor', 'brilinta',
    'aspirin',
  ],
  'PPIs (Proton Pump Inhibitors)': [
    'omeprazole', 'prilosec',
    'esomeprazole', 'nexium',
    'lansoprazole', 'prevacid',
    'pantoprazole', 'protonix',
  ],
};

// Known critical interactions
const KNOWN_INTERACTIONS: Array<{
  drug1: string[];
  drug2: string[];
  severity: 'critical' | 'major' | 'moderate';
  description: string;
  recommendation: string;
}> = [
  {
    drug1: ['warfarin', 'coumadin'],
    drug2: ['aspirin', 'ibuprofen', 'advil', 'naproxen', 'aleve'],
    severity: 'major',
    description: 'Medical literature indicates increased risk of bleeding when combining anticoagulants with NSAIDs or aspirin.',
    recommendation: 'Consider discussing with your healthcare provider. Your provider can advise if this combination is appropriate for you.',
  },
  {
    drug1: ['warfarin', 'coumadin'],
    drug2: ['clopidogrel', 'plavix'],
    severity: 'critical',
    description: 'Medical literature indicates severe bleeding risk when combining warfarin with antiplatelet drugs.',
    recommendation: 'This combination typically requires careful monitoring by a healthcare provider. Discuss with your provider.',
  },
  {
    drug1: ['metoprolol', 'atenolol', 'carvedilol', 'propranolol'],
    drug2: ['diltiazem', 'verapamil'],
    severity: 'major',
    description: 'Medical literature indicates combining beta-blockers with certain calcium channel blockers may affect heart rate.',
    recommendation: 'Consider discussing this combination with your healthcare provider for monitoring guidance.',
  },
  {
    drug1: ['lisinopril', 'enalapril', 'ramipril'],
    drug2: ['losartan', 'valsartan', 'olmesartan'],
    severity: 'major',
    description: 'Medical literature generally does not recommend combining ACE inhibitors with ARBs.',
    recommendation: 'Discuss this combination with your healthcare provider. They can advise on the appropriate treatment plan.',
  },
  {
    drug1: ['sertraline', 'fluoxetine', 'escitalopram', 'zoloft', 'prozac', 'lexapro'],
    drug2: ['tramadol', 'ultram'],
    severity: 'major',
    description: 'Medical literature indicates potential risk of serotonin syndrome when combining SSRIs with tramadol.',
    recommendation: 'Consider discussing with your healthcare provider. They can monitor for symptoms if this combination is prescribed.',
  },
  {
    drug1: ['alprazolam', 'lorazepam', 'clonazepam', 'xanax', 'ativan'],
    drug2: ['oxycodone', 'hydrocodone', 'morphine', 'fentanyl'],
    severity: 'critical',
    description: 'Medical literature indicates severe respiratory depression risk when combining benzodiazepines with opioids.',
    recommendation: 'This combination requires close medical supervision. Discuss with your healthcare provider immediately.',
  },
  {
    drug1: ['simvastatin', 'zocor'],
    drug2: ['amlodipine', 'norvasc'],
    severity: 'moderate',
    description: 'Medical literature indicates amlodipine may increase simvastatin levels, potentially raising risk of muscle effects.',
    recommendation: 'Inform your healthcare provider about this combination. They can advise if dose adjustment is needed.',
  },
];

export class MedicationInteractionService {
  /**
   * Check for interactions between new medications and current medications
   */
  async checkInteractions(
    currentMedications: MedicationInfo[],
    newMedications: MedicationInfo[]
  ): Promise<InteractionWarning[]> {
    const warnings: InteractionWarning[] = [];

    logger.info('🔍 Checking medication interactions', {
      currentCount: currentMedications.length,
      newCount: newMedications.length,
    });

    // 1. Check for therapeutic duplication between current and new meds
    const duplicationWarnings = this.checkTherapeuticDuplication(
      currentMedications,
      newMedications
    );
    warnings.push(...duplicationWarnings);

    // 1b. CRITICAL: Also check for duplication WITHIN new medications
    // (e.g., doctor prescribed two beta-blockers in same visit)
    const internalDuplicationWarnings = this.checkInternalDuplication(newMedications);
    warnings.push(...internalDuplicationWarnings);

    // 2. Check for known interactions
    const knownInteractionWarnings = this.checkKnownInteractions(
      currentMedications,
      newMedications
    );
    warnings.push(...knownInteractionWarnings);

    // 3. Use AI for complex interaction analysis
    if (warnings.length === 0 && newMedications.length > 0 && currentMedications.length > 0) {
      const aiWarnings = await this.checkWithAI(currentMedications, newMedications);
      warnings.push(...aiWarnings);
    }

    // Log results
    if (warnings.length > 0) {
      logger.warn('⚠️ Medication interactions detected', {
        count: warnings.length,
        critical: warnings.filter((w) => w.severity === 'critical').length,
        major: warnings.filter((w) => w.severity === 'major').length,
      });
    } else {
      logger.info('✅ No medication interactions detected');
    }

    return warnings;
  }

  /**
   * Check for therapeutic duplication (same drug class)
   */
  private checkTherapeuticDuplication(
    currentMedications: MedicationInfo[],
    newMedications: MedicationInfo[]
  ): InteractionWarning[] {
    const warnings: InteractionWarning[] = [];

    for (const newMed of newMedications) {
      const newMedName = this.normalizeMedicationName(newMed.name);

      for (const currentMed of currentMedications) {
        const currentMedName = this.normalizeMedicationName(currentMed.name);

        // Check if they're in the same drug class
        const drugClass = this.getDrugClass(newMedName, currentMedName);
        
        if (drugClass) {
          warnings.push({
            severity: 'major',
            type: 'duplication',
            medication1: currentMed.name,
            medication2: newMed.name,
            drugClass,
            description: `Medical literature indicates both medications are in the ${drugClass} class. Taking two medications from the same class is generally not recommended.`,
            recommendation: `Consider discussing this with your healthcare provider before starting ${newMed.name}. Your provider can advise whether to adjust ${currentMed.name} or your treatment plan.`,
            disclaimer: MEDICAL_DISCLAIMER,
          });

          logger.warn('⚠️ Therapeutic duplication detected', {
            drugClass,
            current: currentMed.name,
            new: newMed.name,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Check for therapeutic duplication WITHIN new medications
   * (e.g., doctor prescribed two drugs from same class in one visit)
   */
  private checkInternalDuplication(
    newMedications: MedicationInfo[]
  ): InteractionWarning[] {
    const warnings: InteractionWarning[] = [];

    // Compare each new medication with every other new medication
    for (let i = 0; i < newMedications.length; i++) {
      for (let j = i + 1; j < newMedications.length; j++) {
        const med1 = newMedications[i];
        const med2 = newMedications[j];

        const med1Name = this.normalizeMedicationName(med1.name);
        const med2Name = this.normalizeMedicationName(med2.name);

        // Check if they're in the same drug class
        const drugClass = this.getDrugClass(med1Name, med2Name);

        if (drugClass) {
          warnings.push({
            severity: 'critical', // More serious - prescribed together in same visit!
            type: 'duplication',
            medication1: med1.name,
            medication2: med2.name,
            drugClass,
            description: `⚠️ ALERT: Both ${med1.name} and ${med2.name} are ${drugClass}. These medications are from the same therapeutic class and should generally not be taken together.`,
            recommendation: `This appears to have been prescribed in the same visit. Please verify with your healthcare provider immediately before taking both medications. There may be a prescribing error or your provider may need to clarify which medication to take.`,
            disclaimer: MEDICAL_DISCLAIMER,
          });

          logger.warn('⚠️ CRITICAL: Internal therapeutic duplication detected', {
            drugClass,
            med1: med1.name,
            med2: med2.name,
            context: 'Both prescribed in same visit',
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Check for known dangerous interactions
   */
  private checkKnownInteractions(
    currentMedications: MedicationInfo[],
    newMedications: MedicationInfo[]
  ): InteractionWarning[] {
    const warnings: InteractionWarning[] = [];

    for (const interaction of KNOWN_INTERACTIONS) {
      for (const newMed of newMedications) {
        const newMedName = this.normalizeMedicationName(newMed.name);

        for (const currentMed of currentMedications) {
          const currentMedName = this.normalizeMedicationName(currentMed.name);

          // Check if current med matches drug1 and new med matches drug2
          const matchesDrug1 = interaction.drug1.some((d) =>
            currentMedName.includes(d.toLowerCase())
          );
          const matchesDrug2 = interaction.drug2.some((d) =>
            newMedName.includes(d.toLowerCase())
          );

          // Also check reverse (current med matches drug2, new med matches drug1)
          const matchesDrug1Reverse = interaction.drug1.some((d) =>
            newMedName.includes(d.toLowerCase())
          );
          const matchesDrug2Reverse = interaction.drug2.some((d) =>
            currentMedName.includes(d.toLowerCase())
          );

          if ((matchesDrug1 && matchesDrug2) || (matchesDrug1Reverse && matchesDrug2Reverse)) {
            warnings.push({
              severity: interaction.severity,
              type: 'interaction',
              medication1: currentMed.name,
              medication2: newMed.name,
              description: interaction.description,
              recommendation: interaction.recommendation,
              disclaimer: MEDICAL_DISCLAIMER,
            });

            logger.warn('⚠️ Known interaction detected', {
              severity: interaction.severity,
              current: currentMed.name,
              new: newMed.name,
            });
          }
        }
      }
    }

    return warnings;
  }

  /**
   * Use AI to check for complex interactions
   */
  private async checkWithAI(
    currentMedications: MedicationInfo[],
    newMedications: MedicationInfo[]
  ): Promise<InteractionWarning[]> {
    try {
      const currentMedList = currentMedications.map((m) => m.name).join(', ');
      const newMedList = newMedications.map((m) => m.name).join(', ');

      const prompt = `You are a medical AI assistant specialized in medication safety.

Current medications: ${currentMedList}
New medications from visit: ${newMedList}

Analyze for:
1. Drug-drug interactions
2. Therapeutic duplication (same drug class)
3. Contraindications

Respond in JSON format:
{
  "warnings": [
    {
      "severity": "critical" | "major" | "moderate" | "minor",
      "type": "interaction" | "duplication" | "contraindication",
      "medication1": "name",
      "medication2": "name",
      "description": "brief description",
      "recommendation": "what patient should do",
      "drugClass": "optional, if duplication"
    }
  ]
}

Only include warnings if there are actual concerns. If no interactions, return empty warnings array.`;

      const response = await openaiService.callOpenAI(prompt, 'gpt-4o-mini');
      const result = JSON.parse(response);

      // Add disclaimer to all AI-generated warnings
      const aiWarnings = result.warnings || [];
      return aiWarnings.map((warning: any) => ({
        ...warning,
        disclaimer: MEDICAL_DISCLAIMER,
      }));
    } catch (error) {
      logger.error('AI interaction check failed', error);
      return [];
    }
  }

  /**
   * Normalize medication name for comparison
   * SAFETY: Handle undefined/null names gracefully
   */
  private normalizeMedicationName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }
    return name.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }

  /**
   * Get drug class if both medications are in the same class
   */
  private getDrugClass(med1: string, med2: string): string | null {
    for (const [className, medications] of Object.entries(DRUG_CLASSES)) {
      const med1InClass = medications.some((m) => med1.includes(m.toLowerCase()));
      const med2InClass = medications.some((m) => med2.includes(m.toLowerCase()));

      if (med1InClass && med2InClass) {
        return className;
      }
    }

    return null;
  }

  /**
   * Convert medications from health profile format
   * SAFETY: Filter out medications without valid names
   */
  convertHealthProfileMedications(medications: any[]): MedicationInfo[] {
    return medications
      .map((med) => ({
        name: med.name || med.medication || med,
        genericName: med.genericName,
        dosage: med.dosage || med.dose,
        frequency: med.frequency,
      }))
      .filter((med) => med.name && typeof med.name === 'string' && med.name.trim().length > 0);
  }

  /**
   * Convert medications from visit summary format
   * SAFETY: Filter out medications without valid names
   */
  convertVisitSummaryMedications(medications: any[]): MedicationInfo[] {
    return medications
      .map((med) => ({
        name: typeof med === 'string' ? med : med.name || med.medication,
        genericName: typeof med === 'object' ? med.genericName : undefined,
        dosage: typeof med === 'object' ? med.dosage || med.dose : undefined,
        frequency: typeof med === 'object' ? med.frequency : undefined,
      }))
      .filter((med) => med.name && typeof med.name === 'string' && med.name.trim().length > 0);
  }
}

export const medicationInteractionService = new MedicationInteractionService();

