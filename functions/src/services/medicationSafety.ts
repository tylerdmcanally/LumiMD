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
import type { MedicationChangeEntry } from './openai';
import {
  CANONICAL_MEDICATIONS,
  ALIAS_TO_CANONICAL,
} from '../data/canonicalMedications';
import {
  DRUG_INTERACTIONS as COMPREHENSIVE_DRUG_INTERACTIONS,
} from '../data/drugInteractions';
import { runExternalSafetyChecks } from './externalDrugData';

// Re-export for backward compatibility
export { CANONICAL_MEDICATIONS };

const db = () => admin.firestore();

/**
 * Type guard to check if a value is a Firestore Timestamp.
 * @param value - Any value to check
 * @returns True if the value is a Firestore Timestamp with a toDate() method
 */
const isFirestoreTimestamp = (value: unknown): value is admin.firestore.Timestamp =>
  Boolean(
    value &&
    typeof value === 'object' &&
    'toDate' in (value as Record<string, unknown>) &&
    typeof (value as admin.firestore.Timestamp).toDate === 'function',
  );

const isMedicationCurrentlyActive = (data: FirebaseFirestore.DocumentData): boolean => {
  if (!data) return false;
  if (data.deleted === true || data.archived === true) return false;
  if (data.active !== true) return false;
  if (isFirestoreTimestamp(data.stoppedAt)) return false;
  return true;
};

export interface MedicationSafetyWarning {
  type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
  severity: 'critical' | 'high' | 'moderate' | 'low';
  message: string;
  details: string;
  conflictingMedication?: string; // For duplicates and interactions
  allergen?: string; // For allergy alerts
  recommendation: string;
  source?: 'hardcoded' | 'ai' | 'external';
  externalIds?: {
    rxcui?: string;
    rxcuiPair?: string[];
  };
}

type MedicationContext = {
  id: string;
  name: string;
  active: boolean;
  dose?: string;
  frequency?: string;
  notes?: string;
  canonicalName?: string;
};

const ROUTE_KEYWORDS: Record<string, string[]> = {
  topical: ['topical', 'cream', 'ointment', 'gel', 'lotion', 'foam', 'spray', 'solution', 'paste'],
  ophthalmic: ['ophthalmic', 'eye drop', 'eye drops', 'ocular', 'gtt'],
  otic: ['otic', 'ear drop', 'ear drops'],
  nasal: ['nasal', 'intranasal', 'nasal spray'],
  inhaled: ['inhaled', 'inhaler', 'neb', 'nebulizer', 'respirator', 'mdi', 'dpi'],
  transdermal: ['transdermal', 'patch'],
  sublingual: ['sublingual', 'sl'],
  buccal: ['buccal'],
  rectal: ['rectal', 'suppository'],
  vaginal: ['vaginal'],
};

const NON_SYSTEMIC_ROUTES = new Set(['topical', 'ophthalmic', 'otic']);

const inferMedicationRoute = (input: {
  name?: string;
  dose?: string;
  frequency?: string;
  notes?: string;
}): string | null => {
  const combined = [input.name, input.dose, input.frequency, input.notes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!combined) return null;

  for (const [route, keywords] of Object.entries(ROUTE_KEYWORDS)) {
    if (keywords.some((keyword) => combined.includes(keyword))) {
      return route;
    }
  }

  return null;
};

const isAsNeededFrequency = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized.includes('prn') || normalized.includes('as needed') || normalized.includes('when needed');
};

const adjustSeverityForRoute = (
  severity: MedicationSafetyWarning['severity'],
  route?: string | null
): MedicationSafetyWarning['severity'] => {
  if (!route || !NON_SYSTEMIC_ROUTES.has(route)) {
    return severity;
  }

  if (severity === 'moderate') return 'low';
  if (severity === 'low') return 'low';
  return severity;
};

const buildRouteNote = (route?: string | null): string | null => {
  if (!route || !NON_SYSTEMIC_ROUTES.has(route)) {
    return null;
  }
  return `Route appears ${route}, which typically has lower systemic interaction risk. Confirm with your provider if unsure.`;
};

export const formatWarningsForFirestore = (
  warnings: MedicationSafetyWarning[]
): Array<Record<string, unknown>> => {
  return warnings.map((warning) => {
    const cleaned: Record<string, unknown> = {
      type: warning.type,
      severity: warning.severity,
      message: warning.message,
      details: warning.details,
      recommendation: warning.recommendation,
    };
    if (warning.source !== undefined) {
      cleaned.source = warning.source;
    }
    if (warning.conflictingMedication !== undefined) {
      cleaned.conflictingMedication = warning.conflictingMedication;
    }
    if (warning.allergen !== undefined) {
      cleaned.allergen = warning.allergen;
    }
    if (warning.externalIds !== undefined) {
      cleaned.externalIds = warning.externalIds;
    }
    return cleaned;
  });
};

export const buildSafetyCheckHash = (params: {
  medication: {
    name: string;
    dose?: string | null;
    frequency?: string | null;
    notes?: string | null;
    canonicalName?: string | null;
  };
  currentMedications: Array<{
    name: string;
    dose?: string | null;
    frequency?: string | null;
    notes?: string | null;
    canonicalName?: string | null;
  }>;
  allergies: string[];
}): string => {
  const crypto = require('crypto');
  const med = params.medication;
  const medSignature = [
    med.canonicalName || normalizeMedicationName(med.name),
    med.name || '',
    med.dose || '',
    med.frequency || '',
    med.notes || '',
  ]
    .map((value) => value.toString().toLowerCase().trim())
    .join('|');

  const currentSignatures = params.currentMedications
    .map((current) => [
      current.canonicalName || normalizeMedicationName(current.name),
      current.name || '',
      current.dose || '',
      current.frequency || '',
      current.notes || '',
    ]
      .map((value) => value.toString().toLowerCase().trim())
      .join('|'))
    .sort();

  const allergySignature = (params.allergies || [])
    .map((allergy) => allergy.toLowerCase().trim())
    .sort()
    .join('|');

  const data = [medSignature, ...currentSignatures, allergySignature].join('||');
  return crypto.createHash('md5').update(data).digest('hex');
};

export const fetchActiveMedicationsForUser = async (
  userId: string,
  options: { excludeMedicationId?: string; excludeCanonicalName?: string } = {}
): Promise<MedicationContext[]> => {
  const medsSnapshot = await db().collection('medications').where('userId', '==', userId).get();
  return medsSnapshot.docs
    .filter((doc) => {
      if (options.excludeMedicationId && doc.id === options.excludeMedicationId) {
        return false;
      }
      const data = doc.data();
      if (!isMedicationCurrentlyActive(data)) {
        return false;
      }
      if (options.excludeCanonicalName) {
        const medCanonical = getCanonicalNameFromDocument(data);
        if (medCanonical && medCanonical === options.excludeCanonicalName) {
          return false;
        }
      }
      return true;
    })
    .map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      active: true,
      dose: doc.data().dose,
      frequency: doc.data().frequency,
      notes: doc.data().notes,
      canonicalName: doc.data().canonicalName,
    }));
};

const getCanonicalNameFromDocument = (data: FirebaseFirestore.DocumentData): string => {
  if (!data) {
    return '';
  }

  if (typeof data.canonicalName === 'string' && data.canonicalName) {
    return data.canonicalName;
  }

  const medName = typeof data.name === 'string' ? data.name : '';
  return medName ? normalizeMedicationName(medName) : '';
};

/**
 * Drug Interaction Database
 * Comprehensive database of 100+ clinically-verified drug interactions
 * Imported from data/drugInteractions.ts
 */
const DRUG_INTERACTIONS = COMPREHENSIVE_DRUG_INTERACTIONS;



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

const stripSaltSuffixes = (value: string): string => {
  let current = value;
  let previous = '';

  while (current !== previous) {
    previous = current;
    for (const suffix of SALT_SUFFIXES) {
      const pattern = new RegExp(`\\s+${suffix}$`, 'i');
      if (pattern.test(current)) {
        current = current.replace(pattern, '').trim();
        break;
      }
    }
  }

  return current;
};

const ALLERGY_CLASS_ALIASES: Record<string, string[]> = {
  'ace-inhibitor': ['ace inhibitor', 'ace-i', 'acei'],
  'arb': ['arb', 'angiotensin receptor blocker', 'angiotensin ii receptor blocker', 'angiotensin receptor blockers'],
  'beta-blocker': ['beta blocker', 'beta-blocker', 'beta blockers', 'bb'],
  'calcium-channel-blocker': ['calcium channel blocker', 'calcium-channel blocker', 'ccb', 'ccbs'],
  'nsaid': ['nsaid', 'nsaids', 'nonsteroidal anti-inflammatory', 'non-steroidal anti-inflammatory', 'nonsteroidal'],
  'penicillin': ['penicillin', 'penicillins', 'beta-lactam', 'beta lactam'],
  'cephalosporin': ['cephalosporin', 'cephalosporins', 'ceph'],
  'sulfonamide': ['sulfa', 'sulfonamide', 'sulfonamides'],
  'macrolide': ['macrolide', 'macrolides'],
  'fluoroquinolone': ['fluoroquinolone', 'fluoroquinolones', 'quinolone', 'quinolones'],
  'tetracycline': ['tetracycline', 'tetracyclines'],
  'statin': ['statin', 'statins'],
  'ssri': ['ssri', 'ssris', 'selective serotonin reuptake inhibitor'],
  'snri': ['snri', 'snris', 'serotonin norepinephrine reuptake inhibitor'],
  'benzodiazepine': ['benzodiazepine', 'benzodiazepines', 'benzo', 'benzos'],
  'anticoagulant': ['anticoagulant', 'anticoagulants', 'blood thinner', 'blood thinners', 'blood-thinner'],
  'antiplatelet': ['antiplatelet', 'antiplatelets'],
  'opioid': ['opioid', 'opioids', 'opiate', 'opiates'],
};

const ALLERGY_DESCRIPTOR_PATTERN = /\b(allergy|allergic|reaction|intolerance|sensitivity|sensitive|rash|hives)\b/g;

const normalizeAllergyText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(ALLERGY_DESCRIPTOR_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const resolveAllergyTargets = (allergyText: string): { canonicalMedication?: string; classTokens: string[] } => {
  const normalized = normalizeAllergyText(allergyText);
  const canonicalMedication =
    (ALIAS_TO_CANONICAL[normalized] && ALIAS_TO_CANONICAL[normalized]) ||
    (CANONICAL_MEDICATIONS[normalized] ? normalized : undefined);

  const classTokens: string[] = [];
  if (normalized) {
    for (const [classToken, aliases] of Object.entries(ALLERGY_CLASS_ALIASES)) {
      const matchesAlias = aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized));
      if (matchesAlias || normalized.includes(classToken)) {
        classTokens.push(classToken);
      }
    }
  }

  return { canonicalMedication, classTokens };
};

/**
 * Normalize medication name to canonical generic form.
 * 
 * This function performs the following transformations:
 * 1. Converts to lowercase
 * 2. Looks up brand names in the ALIAS_TO_CANONICAL map
 * 3. Strips salt suffixes (e.g., "succinate", "hydrochloride")
 * 4. Strips extended-release designations (e.g., "XL", "ER")
 * 
 * @param name - The medication name to normalize (brand or generic)
 * @returns The canonical generic medication name in lowercase
 * 
 * @example
 * // Brand to generic
 * normalizeMedicationName('Lipitor')     // => 'atorvastatin'
 * normalizeMedicationName('Advil')       // => 'ibuprofen'
 * 
 * @example
 * // Strip salt suffixes
 * normalizeMedicationName('metoprolol succinate')  // => 'metoprolol'
 * normalizeMedicationName('lisinopril hcl')        // => 'lisinopril'
 * 
 * @example
 * // Unknown medications returned as-is (lowercase)
 * normalizeMedicationName('SomeNewDrug') // => 'somenewdrug'
 */
export function normalizeMedicationName(name: string): string {
  let lower = name.toLowerCase().trim();
  if (!lower) {
    return lower;
  }

  if (ALIAS_TO_CANONICAL[lower]) {
    return ALIAS_TO_CANONICAL[lower];
  }

  lower = stripSaltSuffixes(lower);

  if (ALIAS_TO_CANONICAL[lower]) {
    return ALIAS_TO_CANONICAL[lower];
  }

  return lower;
}

/**
 * Get medication classes for a given medication name
 */
function getMedicationClasses(medicationName: string): string[] {
  const normalized = normalizeMedicationName(medicationName);
  return CANONICAL_MEDICATIONS[normalized]?.classes || [];
}

/**
 * Check for duplicate therapy between a new medication and current medications.
 * 
 * Detects two types of duplicates:
 * 1. **Exact duplicates**: Same medication (e.g., Lipitor when already on atorvastatin)
 * 2. **Therapeutic class duplicates**: Same drug class (e.g., two statins, two beta-blockers)
 * 
 * Note: Broad classes like 'cardiovascular' are filtered out to reduce false positives.
 * 
 * @param userId - The patient's user ID (for logging)
 * @param newMedication - The new medication being added
 * @param currentMedications - Array of patient's current active medications
 * @returns Array of duplicate therapy warnings (may be empty if no duplicates found)
 * 
 * @example
 * // Exact duplicate
 * await checkDuplicateTherapy('user123', { name: 'Lipitor' }, [
 *   { id: 'med1', name: 'atorvastatin', active: true }
 * ])
 * // Returns: [{ type: 'duplicate_therapy', severity: 'high', ... }]
 * 
 * @example
 * // Class duplicate (two beta-blockers)
 * await checkDuplicateTherapy('user123', { name: 'atenolol' }, [
 *   { id: 'med1', name: 'metoprolol', active: true }
 * ])
 * // Returns: [{ type: 'duplicate_therapy', severity: 'moderate', ... }]
 */
export async function checkDuplicateTherapy(
  userId: string,
  newMedication: MedicationChangeEntry,
  currentMedications: MedicationContext[]
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
        source: 'hardcoded',
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
        // Filter out broad classes to reduce false positives
        // These are categories that contain multiple distinct drug classes
        const BROAD_CLASSES_TO_IGNORE = [
          'cardiovascular',       // Contains beta-blockers, CCBs, ACE-I, ARBs, diuretics, etc.
          'blood-pressure',       // Same - too broad, would flag BB + CCB as duplicate
          'antibiotic',           // Contains many unrelated antibiotic classes
          'antidepressant',       // Contains SSRIs, SNRIs, tricyclics, etc.
          'psychiatric',          // Very broad
          'blood-thinner',        // Contains anticoagulants AND antiplatelets
          'pain-reliever',        // Contains NSAIDs and non-NSAIDs
          'anti-inflammatory',    // Too broad
          'antidiabetic',         // Contains metformin, sulfonylureas, GLP1, SGLT2, etc.
          'diabetes',             // Same as above
          'respiratory',          // Contains many distinct classes
          'allergy',              // Contains antihistamines and other classes
          'gi',                   // Contains PPIs, H2 blockers, antiemetics
          'hormone-replacement',  // Too broad
        ];

        const specificSharedClasses = sharedClasses.filter(
          c => !BROAD_CLASSES_TO_IGNORE.includes(c)
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
            details: `You are already taking ${currentMed.name} (${specificSharedClasses[0]}). This new medication ${newMedication.name} is in the same class (${specificSharedClasses[0]}).`,
            conflictingMedication: currentMed.name,
            recommendation: 'Confirm with your provider whether you should take both medications or if this is a substitution.',
            source: 'hardcoded',
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
  currentMedications: MedicationContext[]
): Promise<MedicationSafetyWarning[]> {
  const warnings: MedicationSafetyWarning[] = [];
  const newMedNormalized = normalizeMedicationName(newMedication.name);
  const newMedClasses = getMedicationClasses(newMedication.name);
  const warningKeys = new Set<string>();
  const newMedRoute = inferMedicationRoute({
    name: newMedication.name,
    dose: newMedication.dose,
    frequency: newMedication.frequency,
    notes: newMedication.note,
  });

  for (const currentMed of currentMedications) {
    if (!currentMed.active) continue;

    const currentMedNormalized = normalizeMedicationName(currentMed.name);
    const currentMedClasses = getMedicationClasses(currentMed.name);
    const currentMedRoute = inferMedicationRoute({
      name: currentMed.name,
      dose: currentMed.dose,
      frequency: currentMed.frequency,
      notes: currentMed.notes,
    });

    // Check against interaction database
    for (const interaction of DRUG_INTERACTIONS) {
      let interactionFound = false;
      // Use clinicalEffect as the primary description
      const interactionDescription = interaction.clinicalEffect;

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
        const warningKey = `${interaction.drug1}|${interaction.drug2}|${currentMedNormalized}|${newMedNormalized}`.toLowerCase();
        if (warningKeys.has(warningKey)) {
          continue;
        }
        warningKeys.add(warningKey);

        const routeNote =
          buildRouteNote(newMedRoute) ||
          buildRouteNote(currentMedRoute);

        const frequencyNote =
          isAsNeededFrequency(newMedication.frequency) || isAsNeededFrequency(currentMed.frequency)
            ? 'Interaction risk can be lower with occasional or as-needed use.'
            : null;

        const interactionDetails = [
          interaction.mechanism ? `Mechanism: ${interaction.mechanism}` : null,
          routeNote,
          frequencyNote,
        ]
          .filter(Boolean)
          .join(' ');

        const adjustedSeverity = adjustSeverityForRoute(interaction.severity, newMedRoute || currentMedRoute);

        const recommendation = interaction.recommendation
          ? interaction.recommendation
          : interaction.contraindicated
            ? 'DO NOT USE these medications together. Contact your provider immediately for an alternative.'
          : interaction.severity === 'critical'
            ? 'URGENT: Contact your provider immediately before taking this medication.'
            : 'Discuss this interaction with your provider to ensure safe use.';

        warnings.push({
          type: 'drug_interaction',
          severity: adjustedSeverity,
          message: interaction.contraindicated
            ? 'Contraindicated medication combination detected'
            : 'Potential drug interaction detected',
          details: `Interaction between ${newMedication.name} and ${currentMed.name}: ${interactionDescription}${interactionDetails ? ` ${interactionDetails}` : ''}`,
          conflictingMedication: currentMed.name,
          recommendation,
          source: 'hardcoded',
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
    const allergyNormalized = normalizeAllergyText(allergy);
    const { canonicalMedication, classTokens } = resolveAllergyTargets(allergy);
    const hasClassMatch = classTokens.some((token) => newMedClasses.includes(token));
    const hasPenicillinLikeAllergy = classTokens.includes('penicillin') || allergyNormalized.includes('beta-lactam');

    // Direct medication match
    const directMedicationMatch = canonicalMedication
      ? canonicalMedication === newMedNormalized
      : (allergyNormalized.length >= 5 &&
        (newMedNormalized.includes(allergyNormalized) || allergyNormalized.includes(newMedNormalized)));

    if (directMedicationMatch) {
      warnings.push({
        type: 'allergy_alert',
        severity: 'critical',
        message: `ALLERGY ALERT: Possible allergy conflict`,
        details: `You have a documented allergy to ${allergy}. This new medication ${newMedication.name} may contain or be related to your allergen.`,
        allergen: allergy,
        recommendation: 'DO NOT TAKE. Contact your provider immediately before taking this medication.',
        source: 'hardcoded',
      });
      continue;
    }

    // Check for class-based allergies (e.g., "Penicillin allergy" vs "Amoxicillin")
    if (newMedClasses.length > 0 && (hasClassMatch || allergyNormalized)) {
      for (const medClass of newMedClasses) {
        const fallbackMatch =
          allergyNormalized.length >= 4 &&
          (allergyNormalized.includes(medClass) || medClass.includes(allergyNormalized));
        if ((hasClassMatch && classTokens.includes(medClass)) || fallbackMatch) {
          warnings.push({
            type: 'allergy_alert',
            severity: 'critical',
            message: `ALLERGY ALERT: Class allergy conflict`,
            details: `You have a documented allergy to ${allergy}. This new medication ${newMedication.name} is in the ${medClass} class, which may cause an allergic reaction.`,
            allergen: allergy,
            recommendation: 'DO NOT TAKE. Contact your provider immediately. You may need an alternative medication.',
            source: 'hardcoded',
          });
        }
      }
    }

    // Cross-reactivity warnings (e.g., Penicillin allergy with Cephalosporins)
    if (hasPenicillinLikeAllergy) {
      if (newMedClasses.includes('cephalosporin')) {
        warnings.push({
          type: 'allergy_alert',
          severity: 'high',
          message: `ALLERGY ALERT: Cross-reactivity risk`,
          details: `You have a penicillin allergy. This new medication ${newMedication.name} is a cephalosporin, which may cause a cross-reaction in some patients.`,
          allergen: allergy,
          recommendation: 'Contact your provider before taking. They may need to prescribe an alternative or monitor you closely.',
          source: 'hardcoded',
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
  newMedication: MedicationChangeEntry,
  excludeMedicationId?: string
): Promise<MedicationSafetyWarning[]> {
  try {
    const newMedCanonical = normalizeMedicationName(newMedication.name);
    const currentMedications = await fetchActiveMedicationsForUser(userId, {
      excludeMedicationId,
      excludeCanonicalName: newMedCanonical,
    });

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
  options: { useAI?: boolean; excludeMedicationId?: string } = {}
): Promise<MedicationSafetyWarning[]> {
  try {
    const { useAI: useAIOption, excludeMedicationId } = options;

    // Layer 1: Fast hardcoded checks (critical interactions only)
    const hardcodedWarnings = await runHardcodedSafetyChecks(
      userId,
      newMedication,
      excludeMedicationId
    );

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

    // Layer 2: External data checks (optional)
    let externalWarnings: MedicationSafetyWarning[] = [];
    try {
      const currentMedications = await fetchActiveMedicationsForUser(userId, {
        excludeMedicationId,
        excludeCanonicalName: normalizeMedicationName(newMedication.name),
      });
      externalWarnings = await runExternalSafetyChecks(userId, newMedication, currentMedications);
    } catch (externalError) {
      functions.logger.error('[medicationSafety] External checks failed:', externalError);
    }

    // Layer 3: AI-based comprehensive check (optional, enabled via options or env var)
    const useAI = useAIOption ?? (process.env.ENABLE_AI_SAFETY_CHECKS === 'true');

    if (!useAI) {
      // AI checks disabled, return hardcoded + external results
      const mergedWarnings = [...hardcodedWarnings, ...externalWarnings];
      if (mergedWarnings.length > 0) {
        functions.logger.warn(
          `[medicationSafety] Found ${mergedWarnings.length} hardcoded/external warnings`,
          {
            userId,
            medication: newMedication.name,
            warnings: mergedWarnings.map(w => ({ type: w.type, severity: w.severity })),
          }
        );
      }
      return mergedWarnings;
    }

    // Import AI module dynamically (only if enabled)
    const { runAIBasedSafetyChecks, deduplicateWarnings } = await import('./medicationSafetyAI');

    try {
      // Run AI checks
      const aiWarnings = await runAIBasedSafetyChecks(
        userId,
        newMedication,
        excludeMedicationId
      );

      // Merge and deduplicate warnings
      const allWarnings = deduplicateWarnings([
        ...hardcodedWarnings,
        ...externalWarnings,
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
            externalCount: externalWarnings.length,
            totalCount: allWarnings.length,
            warnings: allWarnings.map(w => ({ type: w.type, severity: w.severity, message: w.message })),
          }
        );
      }

      return allWarnings;
    } catch (aiError) {
      // AI check failed - fall back to hardcoded results
      functions.logger.error('[medicationSafety] AI checks failed, using hardcoded/external results:', aiError);
      return [...hardcodedWarnings, ...externalWarnings];
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
