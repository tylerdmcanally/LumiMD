/**
 * Canonical Medications Database
 *
 * Contains the reference data for common medications including:
 * - Generic names (keys)
 * - Therapeutic classes (for duplicate therapy detection)
 * - Brand name aliases (for normalization)
 *
 * This data is used by the medication safety service to:
 * 1. Normalize medication names (brand → generic)
 * 2. Detect duplicate therapy (same class medications)
 * 3. Check drug interactions
 */

export type CanonicalMedicationEntry = {
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
        classes: ['nsaid', 'pain-reliever', 'anti-inflammatory', 'cox-2-inhibitor'],
        aliases: ['celebrex'],
    },
    diclofenac: {
        classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
        aliases: ['voltaren', 'cambia', 'zipsor'],
    },
    indomethacin: {
        classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
        aliases: ['indocin'],
    },
    ketorolac: {
        classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
        aliases: ['toradol'],
    },
    piroxicam: {
        classes: ['nsaid', 'pain-reliever', 'anti-inflammatory'],
        aliases: ['feldene'],
    },
    aspirin: {
        classes: ['nsaid', 'pain-reliever', 'anti-inflammatory', 'antiplatelet', 'blood-thinner'],
        aliases: ['asa', 'ecotrin', 'bayer'],
    },
    acetaminophen: {
        classes: ['pain-reliever', 'analgesic', 'antipyretic'],
        aliases: ['tylenol', 'paracetamol'],
    },

    // ACE Inhibitors
    lisinopril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['prinivil', 'zestril'],
    },
    enalapril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['vasotec'],
    },
    ramipril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['altace'],
    },
    benazepril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['lotensin'],
    },
    captopril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['capoten'],
    },
    fosinopril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['monopril'],
    },
    quinapril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['accupril'],
    },
    trandolapril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['mavik'],
    },
    perindopril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['aceon'],
    },
    moexipril: {
        classes: ['ace-inhibitor', 'blood-pressure', 'cardiovascular'],
        aliases: ['univasc'],
    },

    // ARBs (Angiotensin II Receptor Blockers)
    losartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['cozaar'],
    },
    valsartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['diovan'],
    },
    olmesartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['benicar'],
    },
    irbesartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['avapro'],
    },
    telmisartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['micardis'],
    },
    candesartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['atacand'],
    },
    azilsartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['edarbi'],
    },
    eprosartan: {
        classes: ['arb', 'blood-pressure', 'cardiovascular'],
        aliases: ['teveten'],
    },

    // Beta Blockers
    metoprolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['lopressor', 'toprol', 'toprol-xl'],
    },
    atenolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['tenormin'],
    },
    carvedilol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['coreg'],
    },
    propranolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['inderal'],
    },
    bisoprolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['zebeta'],
    },
    nebivolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['bystolic'],
    },
    nadolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['corgard'],
    },
    labetalol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['trandate', 'normodyne'],
    },
    pindolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['visken'],
    },
    acebutolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['sectral'],
    },
    betaxolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['kerlone'],
    },
    timolol: {
        classes: ['beta-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['blocadren'],
    },

    // Calcium Channel Blockers
    amlodipine: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['norvasc'],
    },
    diltiazem: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['cardizem', 'tiazac', 'dilacor'],
    },
    verapamil: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['calan', 'isoptin', 'verelan'],
    },
    nifedipine: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['procardia', 'adalat'],
    },
    felodipine: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['plendil'],
    },
    nicardipine: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['cardene'],
    },
    nisoldipine: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['sular'],
    },
    isradipine: {
        classes: ['calcium-channel-blocker', 'blood-pressure', 'cardiovascular'],
        aliases: ['dynacirc'],
    },

    // Diuretics
    hydrochlorothiazide: {
        classes: ['diuretic', 'thiazide', 'blood-pressure', 'cardiovascular'],
        aliases: ['hctz', 'microzide'],
    },
    furosemide: {
        classes: ['diuretic', 'loop-diuretic', 'cardiovascular'],
        aliases: ['lasix'],
    },
    spironolactone: {
        classes: ['diuretic', 'potassium-sparing', 'cardiovascular'],
        aliases: ['aldactone'],
    },
    chlorthalidone: {
        classes: ['diuretic', 'thiazide', 'blood-pressure', 'cardiovascular'],
        aliases: ['hygroton', 'thalitone'],
    },
    bumetanide: {
        classes: ['diuretic', 'loop-diuretic', 'cardiovascular'],
        aliases: ['bumex'],
    },
    torsemide: {
        classes: ['diuretic', 'loop-diuretic', 'cardiovascular'],
        aliases: ['demadex'],
    },
    metolazone: {
        classes: ['diuretic', 'thiazide-like', 'cardiovascular'],
        aliases: ['zaroxolyn'],
    },
    indapamide: {
        classes: ['diuretic', 'thiazide-like', 'blood-pressure', 'cardiovascular'],
        aliases: ['lozol'],
    },
    triamterene: {
        classes: ['diuretic', 'potassium-sparing', 'cardiovascular'],
        aliases: ['dyrenium'],
    },
    amiloride: {
        classes: ['diuretic', 'potassium-sparing', 'cardiovascular'],
        aliases: ['midamor'],
    },
    eplerenone: {
        classes: ['diuretic', 'potassium-sparing', 'cardiovascular'],
        aliases: ['inspra'],
    },

    // Diabetes medications
    metformin: {
        classes: ['diabetes', 'biguanide', 'antidiabetic'],
        aliases: ['glucophage', 'fortamet', 'glumetza'],
    },
    glipizide: {
        classes: ['diabetes', 'sulfonylurea', 'antidiabetic'],
        aliases: ['glucotrol'],
    },
    glyburide: {
        classes: ['diabetes', 'sulfonylurea', 'antidiabetic'],
        aliases: ['diabeta', 'glynase', 'micronase'],
    },
    glimepiride: {
        classes: ['diabetes', 'sulfonylurea', 'antidiabetic'],
        aliases: ['amaryl'],
    },
    sitagliptin: {
        classes: ['diabetes', 'dpp4-inhibitor', 'antidiabetic'],
        aliases: ['januvia'],
    },
    linagliptin: {
        classes: ['diabetes', 'dpp4-inhibitor', 'antidiabetic'],
        aliases: ['tradjenta'],
    },
    saxagliptin: {
        classes: ['diabetes', 'dpp4-inhibitor', 'antidiabetic'],
        aliases: ['onglyza'],
    },
    alogliptin: {
        classes: ['diabetes', 'dpp4-inhibitor', 'antidiabetic'],
        aliases: ['nesina'],
    },
    empagliflozin: {
        classes: ['diabetes', 'sglt2-inhibitor', 'antidiabetic'],
        aliases: ['jardiance'],
    },
    dapagliflozin: {
        classes: ['diabetes', 'sglt2-inhibitor', 'antidiabetic'],
        aliases: ['farxiga'],
    },
    canagliflozin: {
        classes: ['diabetes', 'sglt2-inhibitor', 'antidiabetic'],
        aliases: ['invokana'],
    },
    pioglitazone: {
        classes: ['diabetes', 'thiazolidinedione', 'antidiabetic'],
        aliases: ['actos'],
    },
    rosiglitazone: {
        classes: ['diabetes', 'thiazolidinedione', 'antidiabetic'],
        aliases: ['avandia'],
    },
    liraglutide: {
        classes: ['diabetes', 'glp1-agonist', 'antidiabetic'],
        aliases: ['victoza', 'saxenda'],
    },
    semaglutide: {
        classes: ['diabetes', 'glp1-agonist', 'antidiabetic', 'weight-loss'],
        aliases: ['ozempic', 'wegovy', 'rybelsus'],
    },
    dulaglutide: {
        classes: ['diabetes', 'glp1-agonist', 'antidiabetic'],
        aliases: ['trulicity'],
    },
    exenatide: {
        classes: ['diabetes', 'glp1-agonist', 'antidiabetic'],
        aliases: ['byetta', 'bydureon'],
    },
    tirzepatide: {
        classes: ['diabetes', 'gip-glp1-agonist', 'antidiabetic', 'weight-loss'],
        aliases: ['mounjaro', 'zepbound'],
    },

    // SSRIs & Antidepressants
    sertraline: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['zoloft'],
    },
    fluoxetine: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['prozac', 'sarafem'],
    },
    escitalopram: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['lexapro'],
    },
    citalopram: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['celexa'],
    },
    paroxetine: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['paxil', 'brisdelle'],
    },
    fluvoxamine: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['luvox'],
    },
    vilazodone: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['viibryd'],
    },
    vortioxetine: {
        classes: ['ssri', 'antidepressant', 'psychiatric'],
        aliases: ['trintellix', 'brintellix'],
    },
    venlafaxine: {
        classes: ['snri', 'antidepressant', 'psychiatric'],
        aliases: ['effexor'],
    },
    duloxetine: {
        classes: ['snri', 'antidepressant', 'psychiatric'],
        aliases: ['cymbalta'],
    },
    desvenlafaxine: {
        classes: ['snri', 'antidepressant', 'psychiatric'],
        aliases: ['pristiq'],
    },
    bupropion: {
        classes: ['antidepressant', 'psychiatric', 'smoking-cessation'],
        aliases: ['wellbutrin', 'zyban'],
    },
    mirtazapine: {
        classes: ['antidepressant', 'psychiatric'],
        aliases: ['remeron'],
    },
    trazodone: {
        classes: ['antidepressant', 'psychiatric', 'sleep-aid'],
        aliases: ['desyrel', 'oleptro'],
    },
    amitriptyline: {
        classes: ['tricyclic', 'antidepressant', 'psychiatric'],
        aliases: ['elavil'],
    },
    nortriptyline: {
        classes: ['tricyclic', 'antidepressant', 'psychiatric'],
        aliases: ['pamelor'],
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

    // ============================================================================
    // GI Medications (Proton Pump Inhibitors, H2 Blockers, etc.)
    // ============================================================================
    omeprazole: {
        classes: ['ppi', 'proton-pump-inhibitor', 'acid-reducer', 'gi'],
        aliases: ['prilosec'],
    },
    pantoprazole: {
        classes: ['ppi', 'proton-pump-inhibitor', 'acid-reducer', 'gi'],
        aliases: ['protonix'],
    },
    esomeprazole: {
        classes: ['ppi', 'proton-pump-inhibitor', 'acid-reducer', 'gi'],
        aliases: ['nexium'],
    },
    lansoprazole: {
        classes: ['ppi', 'proton-pump-inhibitor', 'acid-reducer', 'gi'],
        aliases: ['prevacid'],
    },
    rabeprazole: {
        classes: ['ppi', 'proton-pump-inhibitor', 'acid-reducer', 'gi'],
        aliases: ['aciphex'],
    },
    dexlansoprazole: {
        classes: ['ppi', 'proton-pump-inhibitor', 'acid-reducer', 'gi'],
        aliases: ['dexilant'],
    },
    famotidine: {
        classes: ['h2-blocker', 'acid-reducer', 'gi'],
        aliases: ['pepcid'],
    },
    ranitidine: {
        classes: ['h2-blocker', 'acid-reducer', 'gi'],
        aliases: ['zantac'],
    },
    sucralfate: {
        classes: ['gi-protectant', 'gi'],
        aliases: ['carafate'],
    },
    ondansetron: {
        classes: ['antiemetic', 'gi'],
        aliases: ['zofran'],
    },
    metoclopramide: {
        classes: ['antiemetic', 'prokinetic', 'gi'],
        aliases: ['reglan'],
    },

    // ============================================================================
    // Antibiotics
    // ============================================================================
    amoxicillin: {
        classes: ['antibiotic', 'penicillin', 'beta-lactam'],
        aliases: ['amoxil', 'trimox'],
    },
    'amoxicillin-clavulanate': {
        classes: ['antibiotic', 'penicillin', 'beta-lactam'],
        aliases: ['augmentin', 'amoxicillin clavulanate'],
    },
    azithromycin: {
        classes: ['antibiotic', 'macrolide'],
        aliases: ['zithromax', 'z-pack', 'zpack'],
    },
    ciprofloxacin: {
        classes: ['antibiotic', 'fluoroquinolone'],
        aliases: ['cipro'],
    },
    levofloxacin: {
        classes: ['antibiotic', 'fluoroquinolone'],
        aliases: ['levaquin'],
    },
    doxycycline: {
        classes: ['antibiotic', 'tetracycline'],
        aliases: ['vibramycin', 'doryx'],
    },
    cephalexin: {
        classes: ['antibiotic', 'cephalosporin', 'beta-lactam'],
        aliases: ['keflex'],
    },
    cefdinir: {
        classes: ['antibiotic', 'cephalosporin', 'beta-lactam'],
        aliases: ['omnicef'],
    },
    sulfamethoxazole: {
        classes: ['antibiotic', 'sulfonamide'],
        aliases: ['bactrim', 'septra', 'smz-tmp', 'tmp-smx'],
    },
    nitrofurantoin: {
        classes: ['antibiotic', 'urinary-antiseptic'],
        aliases: ['macrobid', 'macrodantin'],
    },
    metronidazole: {
        classes: ['antibiotic', 'antiprotozoal'],
        aliases: ['flagyl'],
    },
    clindamycin: {
        classes: ['antibiotic', 'lincosamide'],
        aliases: ['cleocin'],
    },
    penicillin: {
        classes: ['antibiotic', 'penicillin', 'beta-lactam'],
        aliases: ['penicillin v', 'penicillin vk', 'pen-vk', 'veetids'],
    },

    // ============================================================================
    // Respiratory & Allergy
    // ============================================================================
    albuterol: {
        classes: ['bronchodilator', 'beta-agonist', 'respiratory'],
        aliases: ['proventil', 'ventolin', 'proair'],
    },
    montelukast: {
        classes: ['leukotriene-inhibitor', 'respiratory', 'allergy'],
        aliases: ['singulair'],
    },
    fluticasone: {
        classes: ['corticosteroid', 'inhaled-steroid', 'respiratory', 'allergy'],
        aliases: ['flonase', 'flovent'],
    },
    budesonide: {
        classes: ['corticosteroid', 'inhaled-steroid', 'respiratory'],
        aliases: ['pulmicort', 'rhinocort'],
    },
    tiotropium: {
        classes: ['anticholinergic', 'bronchodilator', 'respiratory'],
        aliases: ['spiriva'],
    },
    ipratropium: {
        classes: ['anticholinergic', 'bronchodilator', 'respiratory'],
        aliases: ['atrovent'],
    },
    loratadine: {
        classes: ['antihistamine', 'allergy'],
        aliases: ['claritin'],
    },
    cetirizine: {
        classes: ['antihistamine', 'allergy'],
        aliases: ['zyrtec'],
    },
    fexofenadine: {
        classes: ['antihistamine', 'allergy'],
        aliases: ['allegra'],
    },
    diphenhydramine: {
        classes: ['antihistamine', 'allergy', 'sleep-aid'],
        aliases: ['benadryl'],
    },
    prednisone: {
        classes: ['corticosteroid', 'anti-inflammatory', 'immunosuppressant'],
        aliases: ['deltasone', 'rayos'],
    },
    methylprednisolone: {
        classes: ['corticosteroid', 'anti-inflammatory', 'immunosuppressant'],
        aliases: ['medrol', 'solu-medrol'],
    },

    // ============================================================================
    // Thyroid
    // ============================================================================
    levothyroxine: {
        classes: ['thyroid', 'hormone-replacement'],
        aliases: ['synthroid', 'levoxyl', 'tirosint', 'unithroid'],
    },
    liothyronine: {
        classes: ['thyroid', 'hormone-replacement'],
        aliases: ['cytomel'],
    },
    methimazole: {
        classes: ['antithyroid', 'thyroid'],
        aliases: ['tapazole'],
    },

    // ============================================================================
    // Sleep & Anxiety
    // ============================================================================
    zolpidem: {
        classes: ['sedative', 'sleep-aid', 'hypnotic'],
        aliases: ['ambien'],
    },
    eszopiclone: {
        classes: ['sedative', 'sleep-aid', 'hypnotic'],
        aliases: ['lunesta'],
    },
    alprazolam: {
        classes: ['benzodiazepine', 'anxiolytic', 'psychiatric'],
        aliases: ['xanax'],
    },
    lorazepam: {
        classes: ['benzodiazepine', 'anxiolytic', 'psychiatric'],
        aliases: ['ativan'],
    },
    clonazepam: {
        classes: ['benzodiazepine', 'anxiolytic', 'anticonvulsant', 'psychiatric'],
        aliases: ['klonopin'],
    },
    diazepam: {
        classes: ['benzodiazepine', 'anxiolytic', 'muscle-relaxant', 'psychiatric'],
        aliases: ['valium'],
    },
    buspirone: {
        classes: ['anxiolytic', 'psychiatric'],
        aliases: ['buspar'],
    },
    hydroxyzine: {
        classes: ['antihistamine', 'anxiolytic', 'psychiatric'],
        aliases: ['vistaril', 'atarax'],
    },
    gabapentin: {
        classes: ['anticonvulsant', 'neuropathic-pain', 'psychiatric'],
        aliases: ['neurontin', 'gralise'],
    },
    pregabalin: {
        classes: ['anticonvulsant', 'neuropathic-pain', 'psychiatric'],
        aliases: ['lyrica'],
    },
};

/**
 * Precomputed alias-to-canonical lookup map.
 * Maps both generic names and brand aliases to canonical generic names.
 */
export const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
    const map: Record<string, string> = {};
    Object.entries(CANONICAL_MEDICATIONS).forEach(([canonical, data]) => {
        map[canonical] = canonical;
        data.aliases.forEach((alias) => {
            map[alias] = canonical;
        });
    });
    return map;
})();

/**
 * Get all known medication names (generics + aliases)
 */
export const getAllKnownMedicationNames = (): string[] => {
    return Object.keys(ALIAS_TO_CANONICAL);
};

/**
 * Check if a medication name is known in the database
 */
export const isKnownMedication = (name: string): boolean => {
    return name.toLowerCase() in ALIAS_TO_CANONICAL;
};
