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

const db = () => admin.firestore();

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
}

type CanonicalMedicationEntry = {
  classes: string[];
  aliases: string[];
};

/**
 * Canonical medication data covering common brand & generic variants
 * across major therapeutic classes.
 */
export const CANONICAL_MEDICATIONS: Record<string, CanonicalMedicationEntry> = {
  // Statins
  atorvastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['lipitor'],
  },
  rosuvastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['crestor'],
  },
  simvastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['zocor'],
  },
  pravastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['pravachol'],
  },
  lovastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['mevacor', 'altoprev'],
  },
  pitavastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['livalo'],
  },
  fluvastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['lescol'],
  },
  cerivastatin: {
    classes: ['statin', 'cholesterol-lowering', 'cardiovascular'],
    aliases: ['baycol'],
  },

  // NSAIDs & analgesics
  ibuprofen: {
    classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
    aliases: ['advil', 'motrin', 'nurofen'],
  },
  naproxen: {
    classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
    aliases: ['aleve', 'naprosyn', 'anaprox'],
  },
  meloxicam: {
    classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
    aliases: ['mobic'],
  },
  celecoxib: {
    classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
    aliases: ['celebrex'],
  },
  diclofenac: {
    classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
    aliases: ['voltaren', 'cataflam', 'zorvolex'],
  },
  ketorolac: {
    classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
    aliases: ['toradol'],
  },
  acetaminophen: {
    classes: ['analgesic'],
    aliases: ['tylenol', 'paracetamol'],
  },

  // Beta blockers
  metoprolol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['toprol', 'toprol xl', 'lopressor'],
  },
  atenolol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['tenormin'],
  },
  propranolol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['inderal'],
  },
  bisoprolol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['zebeta'],
  },
  carvedilol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['coreg'],
  },
  labetalol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['trandate', 'normodyne'],
  },
  nebivolol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['bystolic'],
  },
  nadolol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['corgard'],
  },
  sotalol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['betapace'],
  },
  acebutolol: {
    classes: ['beta-blocker', 'antihypertensive', 'cardiovascular'],
    aliases: ['sectral'],
  },

  // ACE inhibitors
  lisinopril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['prinivil', 'zestril'],
  },
  enalapril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['vasotec'],
  },
  ramipril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['altace'],
  },
  benazepril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['lotensin'],
  },
  captopril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['capoten'],
  },
  quinapril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['accupril'],
  },
  perindopril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['aceon'],
  },
  fosinopril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['monopril'],
  },
  moexipril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['univasc'],
  },
  trandolapril: {
    classes: ['ace-inhibitor', 'antihypertensive', 'cardiovascular'],
    aliases: ['mavik'],
  },

  // ARBs
  losartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['cozaar'],
  },
  valsartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['diovan'],
  },
  irbesartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['avapro'],
  },
  candesartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['atacand'],
  },
  telmisartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['micardis'],
  },
  olmesartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['benicar'],
  },
  eprosartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['teveten'],
  },
  azilsartan: {
    classes: ['arb', 'antihypertensive', 'cardiovascular'],
    aliases: ['edarbi'],
  },

  // Diuretics
  hydrochlorothiazide: {
    classes: ['diuretic', 'thiazide-diuretic', 'antihypertensive'],
    aliases: ['hctz', 'microzide', 'hydrodiuril'],
  },
  chlorthalidone: {
    classes: ['diuretic', 'thiazide-diuretic', 'antihypertensive'],
    aliases: ['hygroton', 'thalitone'],
  },
  furosemide: {
    classes: ['diuretic', 'loop-diuretic', 'antihypertensive'],
    aliases: ['lasix'],
  },
  torsemide: {
    classes: ['diuretic', 'loop-diuretic', 'antihypertensive'],
    aliases: ['demadex'],
  },
  bumetanide: {
    classes: ['diuretic', 'loop-diuretic', 'antihypertensive'],
    aliases: ['bumex'],
  },
  indapamide: {
    classes: ['diuretic', 'thiazide-like-diuretic', 'antihypertensive'],
    aliases: ['lozol'],
  },
  metolazone: {
    classes: ['diuretic', 'thiazide-like-diuretic', 'antihypertensive'],
    aliases: ['zaroxolyn'],
  },
  spironolactone: {
    classes: ['diuretic', 'potassium-sparing-diuretic', 'antihypertensive'],
    aliases: ['aldactone'],
  },
  eplerenone: {
    classes: ['diuretic', 'potassium-sparing-diuretic', 'antihypertensive'],
    aliases: ['inspra'],
  },
  triamterene: {
    classes: ['diuretic', 'potassium-sparing-diuretic'],
    aliases: ['dyrenium'],
  },
  amiloride: {
    classes: ['diuretic', 'potassium-sparing-diuretic'],
    aliases: ['midamor'],
  },

  // Diabetes agents
  metformin: {
    classes: ['antidiabetic', 'biguanide'],
    aliases: ['glucophage', 'glumetza', 'riomet', 'fortamet'],
  },
  glipizide: {
    classes: ['antidiabetic', 'sulfonylurea'],
    aliases: ['glucotrol'],
  },
  glyburide: {
    classes: ['antidiabetic', 'sulfonylurea'],
    aliases: ['diabeta', 'micronase', 'glynase'],
  },
  glimepiride: {
    classes: ['antidiabetic', 'sulfonylurea'],
    aliases: ['amaryl'],
  },
  pioglitazone: {
    classes: ['antidiabetic', 'thiazolidinedione'],
    aliases: ['actos'],
  },
  rosiglitazone: {
    classes: ['antidiabetic', 'thiazolidinedione'],
    aliases: ['avandia'],
  },
  sitagliptin: {
    classes: ['antidiabetic', 'dpp-4-inhibitor'],
    aliases: ['januvia'],
  },
  saxagliptin: {
    classes: ['antidiabetic', 'dpp-4-inhibitor'],
    aliases: ['onglyza'],
  },
  linagliptin: {
    classes: ['antidiabetic', 'dpp-4-inhibitor'],
    aliases: ['tradjenta'],
  },
  alogliptin: {
    classes: ['antidiabetic', 'dpp-4-inhibitor'],
    aliases: ['nesina'],
  },
  canagliflozin: {
    classes: ['antidiabetic', 'sglt2-inhibitor'],
    aliases: ['invokana'],
  },
  dapagliflozin: {
    classes: ['antidiabetic', 'sglt2-inhibitor'],
    aliases: ['farxiga'],
  },
  empagliflozin: {
    classes: ['antidiabetic', 'sglt2-inhibitor'],
    aliases: ['jardiance'],
  },
  ertugliflozin: {
    classes: ['antidiabetic', 'sglt2-inhibitor'],
    aliases: ['steglatro'],
  },
  semaglutide: {
    classes: ['antidiabetic', 'glp-1-agonist'],
    aliases: ['ozempic', 'rybelsus', 'wegovy'],
  },
  liraglutide: {
    classes: ['antidiabetic', 'glp-1-agonist'],
    aliases: ['victoza', 'saxenda'],
  },
  dulaglutide: {
    classes: ['antidiabetic', 'glp-1-agonist'],
    aliases: ['trulicity'],
  },
  'insulin glargine': {
    classes: ['antidiabetic', 'insulin'],
    aliases: ['lantus', 'basaglar', 'toujeo'],
  },
  'insulin detemir': {
    classes: ['antidiabetic', 'insulin'],
    aliases: ['levemir'],
  },
  'insulin degludec': {
    classes: ['antidiabetic', 'insulin'],
    aliases: ['tresiba'],
  },
  'insulin lispro': {
    classes: ['antidiabetic', 'insulin'],
    aliases: ['humalog', 'admelog'],
  },
  'insulin aspart': {
    classes: ['antidiabetic', 'insulin'],
    aliases: ['novolog', 'fiasp'],
  },

  // Antibiotics & antimicrobials
  amoxicillin: {
    classes: ['penicillin', 'antibiotic', 'beta-lactam'],
    aliases: ['amoxil'],
  },
  ampicillin: {
    classes: ['penicillin', 'antibiotic', 'beta-lactam'],
    aliases: ['principen'],
  },
  penicillin: {
    classes: ['penicillin', 'antibiotic', 'beta-lactam'],
    aliases: ['pen vk', 'penicillin v'],
  },
  'amoxicillin clavulanate': {
    classes: ['penicillin', 'antibiotic', 'beta-lactam'],
    aliases: ['augmentin'],
  },
  cephalexin: {
    classes: ['cephalosporin', 'antibiotic', 'beta-lactam'],
    aliases: ['keflex'],
  },
  cefuroxime: {
    classes: ['cephalosporin', 'antibiotic', 'beta-lactam'],
    aliases: ['ceftin'],
  },
  ceftriaxone: {
    classes: ['cephalosporin', 'antibiotic', 'beta-lactam'],
    aliases: ['rocephin'],
  },
  'sulfamethoxazole trimethoprim': {
    classes: ['sulfonamide', 'antibiotic'],
    aliases: ['bactrim', 'septra', 'co-trimoxazole'],
  },
  trimethoprim: {
    classes: ['sulfonamide', 'antibiotic'],
    aliases: [],
  },

  // Thyroid hormones
  levothyroxine: {
    classes: ['thyroid-hormone'],
    aliases: ['synthroid', 'levoxyl', 'tirosint'],
  },
  liothyronine: {
    classes: ['thyroid-hormone'],
    aliases: ['cytomel'],
  },
  'desiccated thyroid': {
    classes: ['thyroid-hormone'],
    aliases: ['armour thyroid', 'np thyroid'],
  },

  // Proton pump inhibitors
  omeprazole: {
    classes: ['ppi', 'acid-reducer'],
    aliases: ['prilosec'],
  },
  esomeprazole: {
    classes: ['ppi', 'acid-reducer'],
    aliases: ['nexium'],
  },
  lansoprazole: {
    classes: ['ppi', 'acid-reducer'],
    aliases: ['prevacid'],
  },
  dexlansoprazole: {
    classes: ['ppi', 'acid-reducer'],
    aliases: ['dexilant'],
  },
  pantoprazole: {
    classes: ['ppi', 'acid-reducer'],
    aliases: ['protonix'],
  },
  rabeprazole: {
    classes: ['ppi', 'acid-reducer'],
    aliases: ['aciphex'],
  },

  // SSRIs
  sertraline: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['zoloft'],
  },
  fluoxetine: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['prozac', 'sarafem'],
  },
  citalopram: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['celexa'],
  },
  escitalopram: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['lexapro'],
  },
  paroxetine: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['paxil', 'pexeva', 'brisdelle'],
  },
  fluvoxamine: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['luvox'],
  },
  vilazodone: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['viibryd'],
  },
  vortioxetine: {
    classes: ['ssri', 'antidepressant'],
    aliases: ['trintellix', 'brintellix'],
  },

  // Benzodiazepines
  alprazolam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['xanax', 'niravam'],
  },
  lorazepam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['ativan'],
  },
  diazepam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['valium', 'diastat'],
  },
  clonazepam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['klonopin'],
  },
  temazepam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['restoril'],
  },
  chlordiazepoxide: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['librium'],
  },
  oxazepam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['serax'],
  },
  clorazepate: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['tranxene'],
  },
  midazolam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['versed'],
  },
  triazolam: {
    classes: ['benzodiazepine', 'anxiolytic'],
    aliases: ['halcion'],
  },

  // Anticoagulants
  warfarin: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['coumadin', 'jantoven'],
  },
  apixaban: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['eliquis'],
  },
  rivaroxaban: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['xarelto'],
  },
  dabigatran: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['pradaxa'],
  },
  edoxaban: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['savaysa', 'lixiana'],
  },
  betrixaban: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['bevyxxa'],
  },
  heparin: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['unfractionated heparin'],
  },
  enoxaparin: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['lovenox'],
  },
  dalteparin: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['fragmin'],
  },
  fondaparinux: {
    classes: ['anticoagulant', 'blood-thinner', 'cardiovascular'],
    aliases: ['arixtra'],
  },

  // Antiplatelets
  aspirin: {
    classes: ['antiplatelet', 'blood-thinner', 'cardiovascular'],
    aliases: ['asa', 'bayer aspirin'],
  },
  clopidogrel: {
    classes: ['antiplatelet', 'blood-thinner', 'cardiovascular'],
    aliases: ['plavix'],
  },
  ticagrelor: {
    classes: ['antiplatelet', 'blood-thinner', 'cardiovascular'],
    aliases: ['brilinta'],
  },
  prasugrel: {
    classes: ['antiplatelet', 'blood-thinner', 'cardiovascular'],
    aliases: ['effient'],
  },
};

const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  Object.entries(CANONICAL_MEDICATIONS).forEach(([canonical, data]) => {
    map[canonical] = canonical;
    data.aliases.forEach((alias) => {
      map[alias] = canonical;
    });
  });
  return map;
})();

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

/**
 * Normalize medication name to generic (lowercase)
 * Strips salt names and formulations for better matching
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
  newMedication: MedicationChangeEntry,
  excludeMedicationId?: string
): Promise<MedicationSafetyWarning[]> {
  try {
    // Fetch medications once, then aggressively filter to currently active therapy
    const medsSnapshot = await db().collection('medications').where('userId', '==', userId).get();

    const newMedCanonical = normalizeMedicationName(newMedication.name);

    const currentMedications = medsSnapshot.docs
      .filter((doc) => {
        if (excludeMedicationId && doc.id === excludeMedicationId) {
          return false;
        }

        const data = doc.data();
        if (!isMedicationCurrentlyActive(data)) {
          return false;
        }

        const medCanonical = getCanonicalNameFromDocument(data);

        if (medCanonical && medCanonical === newMedCanonical) {
          return false;
        }

        return true;
      })
      .map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        active: true,
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

    // Layer 2: AI-based comprehensive check (optional, enabled via options or env var)
    const useAI = useAIOption ?? (process.env.ENABLE_AI_SAFETY_CHECKS === 'true');

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
      const aiWarnings = await runAIBasedSafetyChecks(
        userId,
        newMedication,
        excludeMedicationId
      );

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
