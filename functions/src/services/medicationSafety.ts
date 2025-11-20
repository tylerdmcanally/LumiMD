/**
 * Medication Safety Service
 *
 * Detects and warns about:
 * 1. Duplicate therapy (new med duplicates existing med)
 * 2. Drug interactions (new med interacts with current meds)
 * 3. Allergy alerts (new med is in class patient is allergic to)
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { MedicationChangeEntry } from './openai';

const db = () => admin.firestore();

export interface MedicationSafetyWarning {
  type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
  severity: 'critical' | 'high' | 'moderate' | 'low';
  message: string;
  details: string;
  conflictingMedication?: string; // For duplicates and interactions
  allergen?: string; // For allergy alerts
  recommendation: string;
}

/**
 * Medication Class Database
 * Maps common medications to their therapeutic classes
 */
const MEDICATION_CLASSES: Record<string, string[]> = {
  // Beta Blockers
  'metoprolol': ['beta-blocker', 'antihypertensive', 'cardiovascular'],
  'atenolol': ['beta-blocker', 'antihypertensive', 'cardiovascular'],
  'carvedilol': ['beta-blocker', 'antihypertensive', 'cardiovascular'],
  'propranolol': ['beta-blocker', 'antihypertensive', 'cardiovascular'],
  'bisoprolol': ['beta-blocker', 'antihypertensive', 'cardiovascular'],

  // ACE Inhibitors
  'lisinopril': ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
  'enalapril': ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
  'ramipril': ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
  'benazepril': ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],

  // ARBs (Angiotensin Receptor Blockers)
  'losartan': ['arb', 'antihypertensive', 'cardiovascular'],
  'valsartan': ['arb', 'antihypertensive', 'cardiovascular'],
  'irbesartan': ['arb', 'antihypertensive', 'cardiovascular'],
  'telmisartan': ['arb', 'antihypertensive', 'cardiovascular'],

  // Statins
  'atorvastatin': ['statin', 'cholesterol-lowering', 'cardiovascular'],
  'simvastatin': ['statin', 'cholesterol-lowering', 'cardiovascular'],
  'rosuvastatin': ['statin', 'cholesterol-lowering', 'cardiovascular'],
  'pravastatin': ['statin', 'cholesterol-lowering', 'cardiovascular'],
  'lovastatin': ['statin', 'cholesterol-lowering', 'cardiovascular'],

  // NSAIDs
  'ibuprofen': ['nsaid', 'pain-reliever', 'anti-inflammatory'],
  'naproxen': ['nsaid', 'pain-reliever', 'anti-inflammatory'],
  'meloxicam': ['nsaid', 'pain-reliever', 'anti-inflammatory'],
  'celecoxib': ['nsaid', 'pain-reliever', 'anti-inflammatory'],
  'advil': ['nsaid', 'pain-reliever', 'anti-inflammatory'],
  'motrin': ['nsaid', 'pain-reliever', 'anti-inflammatory'],
  'aleve': ['nsaid', 'pain-reliever', 'anti-inflammatory'],

  // Penicillins
  'amoxicillin': ['penicillin', 'antibiotic', 'beta-lactam'],
  'penicillin': ['penicillin', 'antibiotic', 'beta-lactam'],
  'ampicillin': ['penicillin', 'antibiotic', 'beta-lactam'],
  'augmentin': ['penicillin', 'antibiotic', 'beta-lactam'],

  // Cephalosporins
  'cephalexin': ['cephalosporin', 'antibiotic', 'beta-lactam'],
  'cefuroxime': ['cephalosporin', 'antibiotic', 'beta-lactam'],
  'ceftriaxone': ['cephalosporin', 'antibiotic', 'beta-lactam'],

  // Sulfonamides
  'sulfamethoxazole': ['sulfonamide', 'antibiotic'],
  'trimethoprim': ['sulfonamide', 'antibiotic'],
  'bactrim': ['sulfonamide', 'antibiotic'],

  // Blood Thinners
  'warfarin': ['anticoagulant', 'blood-thinner', 'cardiovascular'],
  'apixaban': ['anticoagulant', 'blood-thinner', 'cardiovascular'],
  'rivaroxaban': ['anticoagulant', 'blood-thinner', 'cardiovascular'],
  'eliquis': ['anticoagulant', 'blood-thinner', 'cardiovascular'],
  'xarelto': ['anticoagulant', 'blood-thinner', 'cardiovascular'],

  // Antiplatelets
  'aspirin': ['antiplatelet', 'blood-thinner', 'cardiovascular'],
  'clopidogrel': ['antiplatelet', 'blood-thinner', 'cardiovascular'],
  'plavix': ['antiplatelet', 'blood-thinner', 'cardiovascular'],
  'asa': ['antiplatelet', 'blood-thinner', 'cardiovascular'],

  // Diabetes Medications
  'metformin': ['antidiabetic', 'biguanide'],
  'glipizide': ['antidiabetic', 'sulfonylurea'],
  'glyburide': ['antidiabetic', 'sulfonylurea'],
  'insulin': ['antidiabetic', 'insulin'],

  // Proton Pump Inhibitors
  'omeprazole': ['ppi', 'acid-reducer'],
  'pantoprazole': ['ppi', 'acid-reducer'],
  'lansoprazole': ['ppi', 'acid-reducer'],
  'esomeprazole': ['ppi', 'acid-reducer'],

  // H2 Blockers
  'ranitidine': ['h2-blocker', 'acid-reducer'],
  'famotidine': ['h2-blocker', 'acid-reducer'],

  // Diuretics
  'furosemide': ['diuretic', 'loop-diuretic', 'antihypertensive'],
  'hydrochlorothiazide': ['diuretic', 'thiazide-diuretic', 'antihypertensive'],
  'hctz': ['diuretic', 'thiazide-diuretic', 'antihypertensive'],
  'spironolactone': ['diuretic', 'potassium-sparing-diuretic'],

  // Thyroid Medications
  'levothyroxine': ['thyroid-hormone'],
  'synthroid': ['thyroid-hormone'],

  // Antidepressants - SSRIs
  'sertraline': ['ssri', 'antidepressant'],
  'fluoxetine': ['ssri', 'antidepressant'],
  'escitalopram': ['ssri', 'antidepressant'],
  'citalopram': ['ssri', 'antidepressant'],
  'zoloft': ['ssri', 'antidepressant'],
  'prozac': ['ssri', 'antidepressant'],
  'lexapro': ['ssri', 'antidepressant'],

  // Benzodiazepines
  'alprazolam': ['benzodiazepine', 'anxiolytic'],
  'lorazepam': ['benzodiazepine', 'anxiolytic'],
  'diazepam': ['benzodiazepine', 'anxiolytic'],
  'xanax': ['benzodiazepine', 'anxiolytic'],
  'ativan': ['benzodiazepine', 'anxiolytic'],
  'valium': ['benzodiazepine', 'anxiolytic'],
};

/**
 * Drug Interaction Database
 * Maps medication classes/names to potential interactions
 */
const DRUG_INTERACTIONS: Array<{
  drug1: string;
  drug2: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  description: string;
}> = [
    // Critical interactions
    {
      drug1: 'warfarin',
      drug2: 'nsaid',
      severity: 'critical',
      description: 'Increased bleeding risk. NSAIDs can potentiate anticoagulant effects.',
    },
    {
      drug1: 'anticoagulant',
      drug2: 'antiplatelet',
      severity: 'critical',
      description: 'Significantly increased bleeding risk when combining blood thinners.',
    },
    {
      drug1: 'ace-inhibitor',
      drug2: 'arb',
      severity: 'high',
      description: 'Dual RAAS blockade can cause kidney problems and high potassium levels.',
    },
    {
      drug1: 'beta-blocker',
      drug2: 'beta-blocker',
      severity: 'high',
      description: 'Duplicate beta-blocker therapy. May cause excessive heart rate slowing.',
    },
    {
      drug1: 'statin',
      drug2: 'statin',
      severity: 'high',
      description: 'Duplicate statin therapy increases risk of muscle problems.',
    },

    // Moderate interactions
    {
      drug1: 'nsaid',
      drug2: 'ace-inhibitor',
      severity: 'moderate',
      description: 'NSAIDs may reduce effectiveness of blood pressure medications and affect kidney function.',
    },
    {
      drug1: 'nsaid',
      drug2: 'arb',
      severity: 'moderate',
      description: 'NSAIDs may reduce effectiveness of blood pressure medications and affect kidney function.',
    },
    {
      drug1: 'nsaid',
      drug2: 'diuretic',
      severity: 'moderate',
      description: 'NSAIDs may reduce effectiveness of diuretics and affect kidney function.',
    },
    {
      drug1: 'ssri',
      drug2: 'nsaid',
      severity: 'moderate',
      description: 'Increased bleeding risk, especially gastrointestinal bleeding.',
    },
    {
      drug1: 'aspirin',
      drug2: 'nsaid',
      severity: 'moderate',
      description: 'Increased risk of stomach ulcers and bleeding.',
    },

    // Low severity interactions
    {
      drug1: 'ppi',
      drug2: 'ppi',
      severity: 'low',
      description: 'Duplicate acid-reducing therapy.',
    },
    {
      drug1: 'ppi',
      drug2: 'h2-blocker',
      severity: 'low',
      description: 'Duplicate acid-reducing therapy with different mechanisms.',
    },
  ];

/**
 * Brand to Generic Name Mapping
 */
const BRAND_TO_GENERIC: Record<string, string> = {
  'advil': 'ibuprofen',
  'motrin': 'ibuprofen',
  'tylenol': 'acetaminophen',
  'aleve': 'naproxen',
  'aspirin': 'aspirin',
  'asa': 'aspirin',
  'eliquis': 'apixaban',
  'xarelto': 'rivaroxaban',
  'plavix': 'clopidogrel',
  'zoloft': 'sertraline',
  'prozac': 'fluoxetine',
  'lexapro': 'escitalopram',
  'synthroid': 'levothyroxine',
  'xanax': 'alprazolam',
  'ativan': 'lorazepam',
  'valium': 'diazepam',
  'augmentin': 'amoxicillin',
  'bactrim': 'sulfamethoxazole',
};

/**
 * Common medication salts/formulations to strip
 */
const SALT_SUFFIXES = [
  'succinate',
  'tartrate',
  'hydrochloride',
  'hcl',
  'sulfate',
  'sodium',
  'potassium',
  'calcium',
  'maleate',
  'fumarate',
  'acetate',
  'phosphate',
  'citrate',
  'er',
  'xl',
  'xr',
  'sr',
  'cr',
  'la',
  'cd',
];

/**
 * Normalize medication name to generic (lowercase)
 * Strips salt names and formulations for better matching
 */
function normalizeMedicationName(name: string): string {
  let lower = name.toLowerCase().trim();

  // Check brand to generic mapping first
  if (BRAND_TO_GENERIC[lower]) {
    return BRAND_TO_GENERIC[lower];
  }

  // Strip salt/formulation suffixes
  // e.g., "metoprolol succinate" -> "metoprolol"
  for (const suffix of SALT_SUFFIXES) {
    const pattern = new RegExp(`\\s+${suffix}$`, 'i');
    if (pattern.test(lower)) {
      lower = lower.replace(pattern, '').trim();
      functions.logger.info('[normalizeMedicationName] Stripped salt suffix', {
        original: name,
        stripped: lower,
        suffix,
      });
      break;
    }
  }

  return lower;
}

/**
 * Get medication classes for a given medication name
 */
function getMedicationClasses(medicationName: string): string[] {
  const normalized = normalizeMedicationName(medicationName);
  return MEDICATION_CLASSES[normalized] || [];
}

/**
 * Check for duplicate therapy
 * Detects when a new medication duplicates an existing active medication
 */
export async function checkDuplicateTherapy(
  userId: string,
  newMedication: MedicationChangeEntry,
  currentMedications: Array<{ id: string; name: string; active: boolean }>
): Promise<MedicationSafetyWarning[]> {
  const warnings: MedicationSafetyWarning[] = [];
  const newMedNormalized = normalizeMedicationName(newMedication.name);
  const newMedClasses = getMedicationClasses(newMedication.name);

  functions.logger.info('[checkDuplicateTherapy] Checking duplicates', {
    newMed: newMedication.name,
    newMedNormalized,
    newMedClasses,
    currentMedCount: currentMedications.length,
  });

  for (const currentMed of currentMedications) {
    if (!currentMed.active) continue;

    const currentMedNormalized = normalizeMedicationName(currentMed.name);
    const currentMedClasses = getMedicationClasses(currentMed.name);

    functions.logger.info('[checkDuplicateTherapy] Comparing with current med', {
      currentMed: currentMed.name,
      currentMedNormalized,
      currentMedClasses,
    });

    // Check for exact duplicate (same medication)
    if (newMedNormalized === currentMedNormalized) {
      warnings.push({
        type: 'duplicate_therapy',
        severity: 'high',
        message: `Duplicate medication detected`,
        details: `You are already taking ${currentMed.name}. This new prescription appears to be the same medication.`,
        conflictingMedication: currentMed.name,
        recommendation: 'Please confirm with your provider that you should be taking both, or if this is a dose adjustment.',
      });
      continue;
    }

    // Check for same therapeutic class (e.g., two beta-blockers)
    if (newMedClasses.length > 0 && currentMedClasses.length > 0) {
      const sharedClasses = newMedClasses.filter(c => currentMedClasses.includes(c));

      functions.logger.info('[checkDuplicateTherapy] Checking shared classes', {
        sharedClasses,
        sharedClassesCount: sharedClasses.length,
      });

      if (sharedClasses.length > 0) {
        // Filter out broad classes like 'cardiovascular' to reduce false positives
        const specificSharedClasses = sharedClasses.filter(
          c => !['cardiovascular', 'antibiotic'].includes(c)
        );

        functions.logger.info('[checkDuplicateTherapy] After filtering broad classes', {
          specificSharedClasses,
          specificSharedClassesCount: specificSharedClasses.length,
        });

        if (specificSharedClasses.length > 0) {
          functions.logger.warn('[checkDuplicateTherapy] DUPLICATE THERAPY FOUND!', {
            newMed: newMedication.name,
            currentMed: currentMed.name,
            sharedClass: specificSharedClasses[0],
          });

          warnings.push({
            type: 'duplicate_therapy',
            severity: 'moderate',
            message: `Duplicate therapy class detected`,
            details: `You are already taking ${currentMed.name} (${currentMedClasses[0]}). This new medication ${newMedication.name} is in the same class (${newMedClasses[0]}).`,
            conflictingMedication: currentMed.name,
            recommendation: 'Confirm with your provider whether you should take both medications or if this is a substitution.',
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Check for drug interactions
 * Detects potential interactions between new medication and current medications
 */
export async function checkDrugInteractions(
  userId: string,
  newMedication: MedicationChangeEntry,
  currentMedications: Array<{ id: string; name: string; active: boolean }>
): Promise<MedicationSafetyWarning[]> {
  const warnings: MedicationSafetyWarning[] = [];
  const newMedNormalized = normalizeMedicationName(newMedication.name);
  const newMedClasses = getMedicationClasses(newMedication.name);

  for (const currentMed of currentMedications) {
    if (!currentMed.active) continue;

    const currentMedNormalized = normalizeMedicationName(currentMed.name);
    const currentMedClasses = getMedicationClasses(currentMed.name);

    // Check against interaction database
    for (const interaction of DRUG_INTERACTIONS) {
      let interactionFound = false;
      let interactionDescription = interaction.description;

      // Check if interaction applies (drug1 = new, drug2 = current OR vice versa)
      const newMatchesDrug1 =
        newMedNormalized === interaction.drug1 ||
        newMedClasses.includes(interaction.drug1);

      const currentMatchesDrug2 =
        currentMedNormalized === interaction.drug2 ||
        currentMedClasses.includes(interaction.drug2);

      const newMatchesDrug2 =
        newMedNormalized === interaction.drug2 ||
        newMedClasses.includes(interaction.drug2);

      const currentMatchesDrug1 =
        currentMedNormalized === interaction.drug1 ||
        currentMedClasses.includes(interaction.drug1);

      if ((newMatchesDrug1 && currentMatchesDrug2) || (newMatchesDrug2 && currentMatchesDrug1)) {
        interactionFound = true;
      }

      if (interactionFound) {
        warnings.push({
          type: 'drug_interaction',
          severity: interaction.severity,
          message: `Potential drug interaction detected`,
          details: `Interaction between ${newMedication.name} and ${currentMed.name}: ${interactionDescription}`,
          conflictingMedication: currentMed.name,
          recommendation:
            interaction.severity === 'critical'
              ? 'URGENT: Contact your provider immediately before taking this medication.'
              : 'Discuss this interaction with your provider to ensure safe use.',
        });
      }
    }
  }

  return warnings;
}

/**
 * Check for allergy conflicts
 * Detects when a new medication is in a class the patient is allergic to
 */
export async function checkAllergyConflicts(
  userId: string,
  newMedication: MedicationChangeEntry,
  patientAllergies: string[]
): Promise<MedicationSafetyWarning[]> {
  const warnings: MedicationSafetyWarning[] = [];

  if (!patientAllergies || patientAllergies.length === 0) {
    return warnings;
  }

  const newMedNormalized = normalizeMedicationName(newMedication.name);
  const newMedClasses = getMedicationClasses(newMedication.name);

  for (const allergy of patientAllergies) {
    const allergyNormalized = allergy.toLowerCase().trim();

    // Direct name match
    if (newMedNormalized.includes(allergyNormalized) || allergyNormalized.includes(newMedNormalized)) {
      warnings.push({
        type: 'allergy_alert',
        severity: 'critical',
        message: `ALLERGY ALERT: Possible allergy conflict`,
        details: `You have a documented allergy to ${allergy}. This new medication ${newMedication.name} may contain or be related to your allergen.`,
        allergen: allergy,
        recommendation: 'DO NOT TAKE. Contact your provider immediately before taking this medication.',
      });
      continue;
    }

    // Check for class-based allergies (e.g., "Penicillin allergy" vs "Amoxicillin")
    if (newMedClasses.length > 0) {
      for (const medClass of newMedClasses) {
        if (allergyNormalized.includes(medClass) || medClass.includes(allergyNormalized)) {
          warnings.push({
            type: 'allergy_alert',
            severity: 'critical',
            message: `ALLERGY ALERT: Class allergy conflict`,
            details: `You have a documented allergy to ${allergy}. This new medication ${newMedication.name} is in the ${medClass} class, which may cause an allergic reaction.`,
            allergen: allergy,
            recommendation: 'DO NOT TAKE. Contact your provider immediately. You may need an alternative medication.',
          });
        }
      }
    }

    // Cross-reactivity warnings (e.g., Penicillin allergy with Cephalosporins)
    if (allergyNormalized.includes('penicillin') || allergyNormalized.includes('beta-lactam')) {
      if (newMedClasses.includes('cephalosporin')) {
        warnings.push({
          type: 'allergy_alert',
          severity: 'high',
          message: `ALLERGY ALERT: Cross-reactivity risk`,
          details: `You have a penicillin allergy. This new medication ${newMedication.name} is a cephalosporin, which may cause a cross-reaction in some patients.`,
          allergen: allergy,
          recommendation: 'Contact your provider before taking. They may need to prescribe an alternative or monitor you closely.',
        });
      }
    }
  }

  return warnings;
}

/**
 * Run hardcoded safety checks (fast, local, covers critical cases)
 */
export async function runHardcodedSafetyChecks(
  userId: string,
  newMedication: MedicationChangeEntry
): Promise<MedicationSafetyWarning[]> {
  try {
    // Fetch current active medications
    const medsSnapshot = await db()
      .collection('medications')
      .where('userId', '==', userId)
      .where('active', '==', true)
      .get();

    const currentMedications = medsSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      active: doc.data().active,
    }));

    functions.logger.info('[medicationSafety] Running hardcoded checks', {
      newMedication: newMedication.name,
      currentMedicationsCount: currentMedications.length,
      currentMedications: currentMedications.map(m => m.name),
      newMedClasses: getMedicationClasses(newMedication.name),
    });

    // Fetch patient allergies
    const userDoc = await db().collection('users').doc(userId).get();
    const patientAllergies = userDoc.exists
      ? (userDoc.data()?.allergies || [])
      : [];

    // Run all hardcoded checks
    const [duplicateWarnings, interactionWarnings, allergyWarnings] = await Promise.all([
      checkDuplicateTherapy(userId, newMedication, currentMedications),
      checkDrugInteractions(userId, newMedication, currentMedications),
      checkAllergyConflicts(userId, newMedication, patientAllergies),
    ]);

    functions.logger.info('[medicationSafety] Checks completed', {
      duplicateWarnings: duplicateWarnings.length,
      interactionWarnings: interactionWarnings.length,
      allergyWarnings: allergyWarnings.length,
    });

    const allWarnings = [
      ...allergyWarnings, // Allergy warnings first (most critical)
      ...interactionWarnings,
      ...duplicateWarnings,
    ];

    return allWarnings;
  } catch (error) {
    functions.logger.error('[medicationSafety] Error running hardcoded checks:', error);
    return [];
  }
}

/**
 * Run all safety checks for a new medication (Hybrid: Hardcoded + AI)
 *
 * Strategy:
 * 1. Run fast hardcoded checks first (covers critical cases, ~10ms)
 * 2. If critical warnings found, return immediately
 * 3. Otherwise, optionally run AI checks for comprehensive coverage (~1-2s)
 * 4. Merge and deduplicate warnings
 */
export async function runMedicationSafetyChecks(
  userId: string,
  newMedication: MedicationChangeEntry,
  options: { useAI?: boolean } = {}
): Promise<MedicationSafetyWarning[]> {
  try {
    // Layer 1: Fast hardcoded checks (critical interactions only)
    const hardcodedWarnings = await runHardcodedSafetyChecks(userId, newMedication);

    // If critical warnings found, return immediately (don't wait for AI)
    const hasCritical = hardcodedWarnings.some(w => w.severity === 'critical');
    if (hasCritical) {
      functions.logger.warn(
        `[medicationSafety] Critical warnings detected by hardcoded checks, skipping AI`,
        {
          userId,
          medication: newMedication.name,
          warnings: hardcodedWarnings.map(w => ({ type: w.type, severity: w.severity })),
        }
      );
      return hardcodedWarnings;
    }

    // Layer 2: AI-based comprehensive check (optional, enabled via options or env var)
    const useAI = options.useAI ?? (process.env.ENABLE_AI_SAFETY_CHECKS === 'true');

    if (!useAI) {
      // AI checks disabled, return hardcoded results
      if (hardcodedWarnings.length > 0) {
        functions.logger.warn(
          `[medicationSafety] Found ${hardcodedWarnings.length} hardcoded warnings`,
          {
            userId,
            medication: newMedication.name,
            warnings: hardcodedWarnings.map(w => ({ type: w.type, severity: w.severity })),
          }
        );
      }
      return hardcodedWarnings;
    }

    // Import AI module dynamically (only if enabled)
    const { runAIBasedSafetyChecks, deduplicateWarnings } = await import('./medicationSafetyAI');

    try {
      // Run AI checks
      const aiWarnings = await runAIBasedSafetyChecks(userId, newMedication);

      // Merge and deduplicate warnings
      const allWarnings = deduplicateWarnings([
        ...hardcodedWarnings,
        ...aiWarnings,
      ]);

      if (allWarnings.length > 0) {
        functions.logger.warn(
          `[medicationSafety] Found ${allWarnings.length} safety warnings (hybrid)`,
          {
            userId,
            medication: newMedication.name,
            hardcodedCount: hardcodedWarnings.length,
            aiCount: aiWarnings.length,
            totalCount: allWarnings.length,
            warnings: allWarnings.map(w => ({ type: w.type, severity: w.severity, message: w.message })),
          }
        );
      }

      return allWarnings;
    } catch (aiError) {
      // AI check failed - fall back to hardcoded results
      functions.logger.error('[medicationSafety] AI checks failed, using hardcoded results:', aiError);
      return hardcodedWarnings;
    }
  } catch (error) {
    functions.logger.error('[medicationSafety] Error running safety checks:', error);
    // Don't throw - return empty array so medication sync can continue
    return [];
  }
}

/**
 * Add safety warnings to medication entry
 */
export function addSafetyWarningsToEntry(
  entry: MedicationChangeEntry,
  warnings: MedicationSafetyWarning[]
): MedicationChangeEntry {
  if (warnings.length === 0) {
    return entry;
  }

  // Sort warnings by severity
  const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  const sortedWarnings = warnings.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  // Mark as needing confirmation if any high or critical warnings
  const hasCriticalWarning = sortedWarnings.some(w => w.severity === 'critical' || w.severity === 'high');

  return {
    ...entry,
    warning: sortedWarnings, // Save the full array of warning objects
    needsConfirmation: hasCriticalWarning || entry.needsConfirmation || false,
    status: hasCriticalWarning ? 'unverified' : (entry.status || 'matched'),
  };
}
