/**
 * Comprehensive Drug Interaction Database
 * 
 * Generated from top 100 most prescribed medications in the United States.
 * Based on clinical pharmacy guidelines, FDA drug labels, and established
 * drug interaction databases.
 * 
 * Coverage:
 * - Critical interactions (contraindicated)
 * - High severity (major clinical significance)
 * - Moderate interactions (monitor/adjust)
 * - Therapeutic duplications (same class)
 * 
 * Last updated: December 2024
 */

export interface DrugInteraction {
    drug1: string;
    drug2: string;
    severity: 'critical' | 'high' | 'moderate' | 'low';
    mechanism: string;
    clinicalEffect: string;
    recommendation: string;
}

export interface TherapeuticDuplication {
    class: string;
    medications: string[];
    severity: 'high' | 'moderate' | 'low';
    description: string;
}

// ============================================================================
// DRUG INTERACTIONS DATABASE
// ============================================================================

export const DRUG_INTERACTIONS: DrugInteraction[] = [
    // ---------------------------------------------------------------------------
    // CRITICAL INTERACTIONS (Contraindicated or life-threatening)
    // ---------------------------------------------------------------------------

    // Serotonin Syndrome Risk
    {
        drug1: 'tramadol',
        drug2: 'sertraline',
        severity: 'critical',
        mechanism: 'Combined serotonergic activity',
        clinicalEffect: 'Risk of serotonin syndrome (agitation, hyperthermia, tremor, seizures)',
        recommendation: 'Avoid combination. If necessary, use lowest doses and monitor closely.',
    },
    {
        drug1: 'tramadol',
        drug2: 'escitalopram',
        severity: 'critical',
        mechanism: 'Combined serotonergic activity',
        clinicalEffect: 'Risk of serotonin syndrome',
        recommendation: 'Avoid combination. Consider alternative pain management.',
    },
    {
        drug1: 'tramadol',
        drug2: 'fluoxetine',
        severity: 'critical',
        mechanism: 'Combined serotonergic activity',
        clinicalEffect: 'Risk of serotonin syndrome',
        recommendation: 'Avoid combination. Consider alternative analgesic.',
    },
    {
        drug1: 'tramadol',
        drug2: 'duloxetine',
        severity: 'critical',
        mechanism: 'Combined serotonergic activity',
        clinicalEffect: 'Risk of serotonin syndrome',
        recommendation: 'Avoid combination. Consider alternative pain management.',
    },
    {
        drug1: 'tramadol',
        drug2: 'venlafaxine',
        severity: 'critical',
        mechanism: 'Combined serotonergic activity',
        clinicalEffect: 'Risk of serotonin syndrome',
        recommendation: 'Avoid combination. Consider alternative analgesic.',
    },

    // Bleeding Risk - Anticoagulants + NSAIDs
    {
        drug1: 'warfarin',
        drug2: 'meloxicam',
        severity: 'critical',
        mechanism: 'NSAIDs inhibit platelet function and may displace warfarin from protein binding',
        clinicalEffect: 'Significantly increased bleeding risk, especially GI bleeding',
        recommendation: 'Avoid combination. If NSAID required, use short-term and monitor INR closely.',
    },
    {
        drug1: 'warfarin',
        drug2: 'naproxen',
        severity: 'critical',
        mechanism: 'NSAID antiplatelet effect + warfarin interaction',
        clinicalEffect: 'Significantly increased bleeding risk',
        recommendation: 'Avoid combination. Consider acetaminophen for pain.',
    },
    {
        drug1: 'warfarin',
        drug2: 'celecoxib',
        severity: 'high',
        mechanism: 'COX-2 inhibitors still increase bleeding risk with warfarin',
        clinicalEffect: 'Increased bleeding risk, though less than traditional NSAIDs',
        recommendation: 'Use with caution. Monitor INR closely if used together.',
    },
    {
        drug1: 'apixaban',
        drug2: 'meloxicam',
        severity: 'critical',
        mechanism: 'Combined antiplatelet and anticoagulant effects',
        clinicalEffect: 'Significantly increased bleeding risk',
        recommendation: 'Avoid combination. Use acetaminophen for pain if possible.',
    },
    {
        drug1: 'apixaban',
        drug2: 'naproxen',
        severity: 'critical',
        mechanism: 'Combined antiplatelet and anticoagulant effects',
        clinicalEffect: 'Significantly increased bleeding risk, especially GI bleeding',
        recommendation: 'Avoid combination. Consider alternative pain management.',
    },

    // Bleeding Risk - Antiplatelet + Anticoagulant
    {
        drug1: 'clopidogrel',
        drug2: 'warfarin',
        severity: 'high',
        mechanism: 'Additive anticoagulant and antiplatelet effects',
        clinicalEffect: 'Increased bleeding risk',
        recommendation: 'Combination may be necessary in some patients. Monitor closely for bleeding.',
    },
    {
        drug1: 'clopidogrel',
        drug2: 'apixaban',
        severity: 'high',
        mechanism: 'Additive anticoagulant and antiplatelet effects',
        clinicalEffect: 'Increased bleeding risk',
        recommendation: 'Monitor closely for signs of bleeding. May be clinically necessary.',
    },

    // Antiplatelet + SSRI Bleeding
    {
        drug1: 'clopidogrel',
        drug2: 'sertraline',
        severity: 'moderate',
        mechanism: 'SSRIs inhibit platelet serotonin uptake, increasing bleeding risk',
        clinicalEffect: 'Increased bleeding risk, especially GI bleeding',
        recommendation: 'Monitor for signs of bleeding. Consider PPI for GI protection.',
    },
    {
        drug1: 'clopidogrel',
        drug2: 'escitalopram',
        severity: 'moderate',
        mechanism: 'SSRI antiplatelet effect additive with clopidogrel',
        clinicalEffect: 'Increased bleeding risk',
        recommendation: 'Monitor for bleeding. Consider GI protection.',
    },

    // Clopidogrel + PPI (reduced efficacy)
    {
        drug1: 'clopidogrel',
        drug2: 'omeprazole',
        severity: 'moderate',
        mechanism: 'Omeprazole inhibits CYP2C19, reducing clopidogrel activation',
        clinicalEffect: 'Reduced antiplatelet effect, potential for thrombotic events',
        recommendation: 'Use pantoprazole instead (does not significantly inhibit CYP2C19).',
    },

    // ---------------------------------------------------------------------------
    // HIGH SEVERITY INTERACTIONS
    // ---------------------------------------------------------------------------

    // QT Prolongation Risk
    {
        drug1: 'escitalopram',
        drug2: 'azithromycin',
        severity: 'high',
        mechanism: 'Both drugs prolong QT interval',
        clinicalEffect: 'Risk of dangerous cardiac arrhythmias (Torsades de Pointes)',
        recommendation: 'Use alternative antibiotic if possible. Monitor ECG if combination necessary.',
    },
    {
        drug1: 'citalopram',
        drug2: 'azithromycin',
        severity: 'high',
        mechanism: 'Both drugs prolong QT interval',
        clinicalEffect: 'Risk of Torsades de Pointes',
        recommendation: 'Avoid combination. Use alternative antibiotic.',
    },
    {
        drug1: 'quetiapine',
        drug2: 'azithromycin',
        severity: 'high',
        mechanism: 'Additive QT prolongation',
        clinicalEffect: 'Risk of cardiac arrhythmias',
        recommendation: 'Use alternative antibiotic or monitor ECG closely.',
    },
    {
        drug1: 'quetiapine',
        drug2: 'escitalopram',
        severity: 'moderate',
        mechanism: 'Additive QT prolongation',
        clinicalEffect: 'Increased risk of QT prolongation',
        recommendation: 'Monitor ECG. Use with caution.',
    },

    // Hyperkalemia Risk
    {
        drug1: 'lisinopril',
        drug2: 'losartan',
        severity: 'high',
        mechanism: 'Dual RAAS blockade',
        clinicalEffect: 'Increased risk of hyperkalemia, hypotension, and renal dysfunction',
        recommendation: 'Avoid combination. Choose one RAAS blocker.',
    },
    {
        drug1: 'lisinopril',
        drug2: 'spironolactone',
        severity: 'high',
        mechanism: 'ACE inhibitor + potassium-sparing diuretic',
        clinicalEffect: 'Increased risk of hyperkalemia',
        recommendation: 'If used together, monitor potassium closely. Use low doses.',
    },
    {
        drug1: 'losartan',
        drug2: 'spironolactone',
        severity: 'high',
        mechanism: 'ARB + potassium-sparing diuretic',
        clinicalEffect: 'Increased risk of hyperkalemia',
        recommendation: 'Monitor potassium regularly. May need to avoid in renal impairment.',
    },

    // Hypoglycemia Risk
    {
        drug1: 'metformin',
        drug2: 'glipizide',
        severity: 'moderate',
        mechanism: 'Additive blood glucose lowering',
        clinicalEffect: 'Increased risk of hypoglycemia',
        recommendation: 'Common combination but monitor blood glucose carefully.',
    },
    {
        drug1: 'glipizide',
        drug2: 'fluconazole',
        severity: 'high',
        mechanism: 'Fluconazole inhibits CYP2C9, increasing sulfonylurea levels',
        clinicalEffect: 'Increased risk of severe hypoglycemia',
        recommendation: 'Reduce sulfonylurea dose. Monitor blood glucose closely.',
    },

    // CNS Depression
    {
        drug1: 'oxycodone',
        drug2: 'alprazolam',
        severity: 'critical',
        mechanism: 'Additive CNS and respiratory depression',
        clinicalEffect: 'Risk of profound sedation, respiratory depression, coma, death',
        recommendation: 'Avoid combination. If necessary, use lowest doses and monitor respiratory status.',
    },
    {
        drug1: 'oxycodone',
        drug2: 'clonazepam',
        severity: 'critical',
        mechanism: 'Opioid + benzodiazepine CNS depression',
        clinicalEffect: 'Risk of fatal respiratory depression',
        recommendation: 'Avoid combination per FDA Black Box Warning.',
    },
    {
        drug1: 'oxycodone',
        drug2: 'gabapentin',
        severity: 'high',
        mechanism: 'Additive CNS depression',
        clinicalEffect: 'Increased risk of respiratory depression, especially in elderly',
        recommendation: 'Use lowest effective doses. Monitor respiratory status.',
    },
    {
        drug1: 'tramadol',
        drug2: 'gabapentin',
        severity: 'high',
        mechanism: 'Additive CNS depression',
        clinicalEffect: 'Increased sedation and respiratory depression risk',
        recommendation: 'Use with caution. Monitor for excessive sedation.',
    },
    {
        drug1: 'trazodone',
        drug2: 'alprazolam',
        severity: 'moderate',
        mechanism: 'Additive CNS depression',
        clinicalEffect: 'Increased sedation, risk of falls',
        recommendation: 'Use lowest effective doses. Monitor for excessive sedation.',
    },

    // Muscle Relaxant Interactions
    {
        drug1: 'cyclobenzaprine',
        drug2: 'tramadol',
        severity: 'high',
        mechanism: 'Both have serotonergic activity + CNS depression',
        clinicalEffect: 'Risk of serotonin syndrome and excessive sedation',
        recommendation: 'Avoid combination if possible. Monitor closely if used.',
    },
    {
        drug1: 'cyclobenzaprine',
        drug2: 'trazodone',
        severity: 'moderate',
        mechanism: 'Additive CNS depression and serotonergic effects',
        clinicalEffect: 'Increased sedation, potential serotonin syndrome',
        recommendation: 'Use with caution. Consider timing separation.',
    },
    {
        drug1: 'baclofen',
        drug2: 'oxycodone',
        severity: 'high',
        mechanism: 'Additive CNS and respiratory depression',
        clinicalEffect: 'Risk of severe sedation and respiratory depression',
        recommendation: 'Use lowest effective doses. Monitor closely.',
    },
    {
        drug1: 'tizanidine',
        drug2: 'ciprofloxacin',
        severity: 'critical',
        mechanism: 'Ciprofloxacin inhibits CYP1A2, dramatically increasing tizanidine levels',
        clinicalEffect: 'Severe hypotension, bradycardia, sedation',
        recommendation: 'Avoid combination. Contraindicated.',
    },

    // ---------------------------------------------------------------------------
    // MODERATE INTERACTIONS
    // ---------------------------------------------------------------------------

    // Blood Pressure Effects
    {
        drug1: 'lisinopril',
        drug2: 'meloxicam',
        severity: 'moderate',
        mechanism: 'NSAIDs reduce ACE inhibitor efficacy and worsen renal function',
        clinicalEffect: 'Reduced blood pressure control, risk of renal impairment',
        recommendation: 'Monitor blood pressure and renal function. Limit NSAID use.',
    },
    {
        drug1: 'lisinopril',
        drug2: 'naproxen',
        severity: 'moderate',
        mechanism: 'NSAIDs antagonize ACE inhibitor effects',
        clinicalEffect: 'Reduced antihypertensive effect, possible renal dysfunction',
        recommendation: 'Monitor blood pressure. Use lowest NSAID dose for shortest duration.',
    },
    {
        drug1: 'losartan',
        drug2: 'meloxicam',
        severity: 'moderate',
        mechanism: 'NSAIDs reduce ARB efficacy',
        clinicalEffect: 'Reduced blood pressure control, potential renal impairment',
        recommendation: 'Monitor blood pressure and kidney function.',
    },
    {
        drug1: 'amlodipine',
        drug2: 'simvastatin',
        severity: 'moderate',
        mechanism: 'Amlodipine increases simvastatin levels via CYP3A4 inhibition',
        clinicalEffect: 'Increased risk of myopathy/rhabdomyolysis',
        recommendation: 'Limit simvastatin to 20mg daily with amlodipine.',
    },
    {
        drug1: 'metoprolol',
        drug2: 'clonidine',
        severity: 'moderate',
        mechanism: 'Additive bradycardia; rebound hypertension if clonidine stopped',
        clinicalEffect: 'Increased risk of bradycardia; hypertensive crisis if clonidine withdrawn',
        recommendation: 'Monitor heart rate. Taper clonidine slowly if discontinuing.',
    },
    {
        drug1: 'carvedilol',
        drug2: 'clonidine',
        severity: 'moderate',
        mechanism: 'Additive bradycardia risk',
        clinicalEffect: 'Bradycardia, potential rebound hypertension',
        recommendation: 'Monitor heart rate closely.',
    },

    // Diuretic Interactions
    {
        drug1: 'furosemide',
        drug2: 'lisinopril',
        severity: 'moderate',
        mechanism: 'ACE inhibitor + diuretic can cause first-dose hypotension',
        clinicalEffect: 'Risk of severe hypotension with first doses',
        recommendation: 'Start ACE inhibitor at low dose. Monitor blood pressure.',
    },
    {
        drug1: 'furosemide',
        drug2: 'meloxicam',
        severity: 'moderate',
        mechanism: 'NSAIDs reduce diuretic efficacy',
        clinicalEffect: 'Reduced diuretic effect, fluid retention',
        recommendation: 'Monitor fluid status and renal function.',
    },
    {
        drug1: 'hydrochlorothiazide',
        drug2: 'lisinopril',
        severity: 'low',
        mechanism: 'Additive blood pressure lowering',
        clinicalEffect: 'Common therapeutic combination but monitor for hypotension',
        recommendation: 'Monitor blood pressure, especially initially.',
    },

    // Statin Interactions
    {
        drug1: 'atorvastatin',
        drug2: 'clarithromycin',
        severity: 'high',
        mechanism: 'Clarithromycin inhibits CYP3A4, increasing statin levels',
        clinicalEffect: 'Increased risk of myopathy and rhabdomyolysis',
        recommendation: 'Use azithromycin instead or temporarily hold statin.',
    },
    {
        drug1: 'simvastatin',
        drug2: 'clarithromycin',
        severity: 'critical',
        mechanism: 'Strong CYP3A4 inhibition dramatically increases simvastatin',
        clinicalEffect: 'High risk of rhabdomyolysis',
        recommendation: 'Avoid combination. Hold simvastatin during clarithromycin treatment.',
    },
    {
        drug1: 'atorvastatin',
        drug2: 'fluconazole',
        severity: 'high',
        mechanism: 'Fluconazole inhibits CYP3A4',
        clinicalEffect: 'Increased statin levels and myopathy risk',
        recommendation: 'Use lower statin dose. Monitor for muscle pain.',
    },

    // Thyroid Interactions
    {
        drug1: 'levothyroxine',
        drug2: 'omeprazole',
        severity: 'moderate',
        mechanism: 'PPIs reduce levothyroxine absorption by raising gastric pH',
        clinicalEffect: 'Reduced thyroid hormone absorption',
        recommendation: 'Take levothyroxine on empty stomach, 4+ hours apart from PPI.',
    },
    {
        drug1: 'levothyroxine',
        drug2: 'pantoprazole',
        severity: 'moderate',
        mechanism: 'PPIs may reduce levothyroxine absorption',
        clinicalEffect: 'Potential reduced thyroid effect',
        recommendation: 'Separate administration by 4+ hours. Monitor TSH.',
    },
    {
        drug1: 'levothyroxine',
        drug2: 'calcium',
        severity: 'moderate',
        mechanism: 'Calcium binds levothyroxine in GI tract',
        clinicalEffect: 'Reduced levothyroxine absorption',
        recommendation: 'Separate by at least 4 hours.',
    },

    // Antibiotic Interactions
    {
        drug1: 'ciprofloxacin',
        drug2: 'duloxetine',
        severity: 'high',
        mechanism: 'Ciprofloxacin inhibits CYP1A2, increasing duloxetine levels',
        clinicalEffect: 'Increased duloxetine toxicity risk',
        recommendation: 'Avoid combination or use alternative antibiotic.',
    },
    {
        drug1: 'metronidazole',
        drug2: 'warfarin',
        severity: 'high',
        mechanism: 'Metronidazole inhibits warfarin metabolism',
        clinicalEffect: 'Increased INR and bleeding risk',
        recommendation: 'Monitor INR closely. May need warfarin dose reduction.',
    },
    {
        drug1: 'sulfamethoxazole',
        drug2: 'warfarin',
        severity: 'high',
        mechanism: 'Sulfonamides inhibit warfarin metabolism',
        clinicalEffect: 'Significantly increased INR',
        recommendation: 'Monitor INR daily during antibiotic course. Reduce warfarin dose.',
    },
    {
        drug1: 'amoxicillin',
        drug2: 'warfarin',
        severity: 'moderate',
        mechanism: 'Antibiotics may alter gut flora affecting vitamin K',
        clinicalEffect: 'Potentially increased INR',
        recommendation: 'Monitor INR during antibiotic course.',
    },

    // Psychiatric Drug Interactions
    {
        drug1: 'bupropion',
        drug2: 'tramadol',
        severity: 'critical',
        mechanism: 'Both lower seizure threshold + serotonergic effects',
        clinicalEffect: 'Significantly increased seizure risk',
        recommendation: 'Avoid combination. Use alternative analgesic.',
    },
    {
        drug1: 'bupropion',
        drug2: 'aripiprazole',
        severity: 'moderate',
        mechanism: 'Bupropion inhibits CYP2D6, increasing aripiprazole levels',
        clinicalEffect: 'Increased aripiprazole effects',
        recommendation: 'May need to reduce aripiprazole dose.',
    },
    {
        drug1: 'fluoxetine',
        drug2: 'tramadol',
        severity: 'critical',
        mechanism: 'Fluoxetine inhibits CYP2D6 (reduces tramadol efficacy) + serotonin syndrome risk',
        clinicalEffect: 'Reduced pain relief + serotonin syndrome risk',
        recommendation: 'Avoid combination.',
    },
    {
        drug1: 'paroxetine',
        drug2: 'tamoxifen',
        severity: 'critical',
        mechanism: 'Paroxetine inhibits CYP2D6, preventing tamoxifen activation',
        clinicalEffect: 'Reduced tamoxifen efficacy for breast cancer prevention/treatment',
        recommendation: 'Avoid combination. Use different antidepressant.',
    },
    {
        drug1: 'lamotrigine',
        drug2: 'valproic acid',
        severity: 'high',
        mechanism: 'Valproic acid inhibits lamotrigine glucuronidation',
        clinicalEffect: 'Doubled lamotrigine levels, increased toxicity risk (including rash)',
        recommendation: 'Reduce lamotrigine dose by 50% when adding valproic acid.',
    },

    // ADHD Medication Interactions
    {
        drug1: 'amphetamine',
        drug2: 'sertraline',
        severity: 'moderate',
        mechanism: 'Both increase serotonin/norepinephrine',
        clinicalEffect: 'Increased risk of serotonin syndrome symptoms',
        recommendation: 'Monitor for agitation, anxiety, tremor.',
    },
    {
        drug1: 'amphetamine',
        drug2: 'aripiprazole',
        severity: 'moderate',
        mechanism: 'Opposing dopaminergic effects',
        clinicalEffect: 'May reduce efficacy of either medication',
        recommendation: 'Monitor clinical response to both medications.',
    },

    // Prostate/Urologic
    {
        drug1: 'tamsulosin',
        drug2: 'sildenafil',
        severity: 'high',
        mechanism: 'Both cause vasodilation',
        clinicalEffect: 'Risk of severe hypotension, syncope',
        recommendation: 'Use with caution. Separate doses by 4 hours. Start sildenafil at lowest dose.',
    },
    {
        drug1: 'tamsulosin',
        drug2: 'tadalafil',
        severity: 'high',
        mechanism: 'Additive vasodilation',
        clinicalEffect: 'Increased hypotension risk',
        recommendation: 'Start with lowest tadalafil dose. Monitor blood pressure.',
    },

    // Gout
    {
        drug1: 'allopurinol',
        drug2: 'azathioprine',
        severity: 'critical',
        mechanism: 'Allopurinol inhibits xanthine oxidase, blocking azathioprine metabolism',
        clinicalEffect: 'Severe myelosuppression (bone marrow toxicity)',
        recommendation: 'Reduce azathioprine dose by 75% or avoid combination.',
    },
    {
        drug1: 'allopurinol',
        drug2: 'warfarin',
        severity: 'moderate',
        mechanism: 'Allopurinol may inhibit warfarin metabolism',
        clinicalEffect: 'Increased INR',
        recommendation: 'Monitor INR when starting or adjusting allopurinol.',
    },

    // Antacid/PPI Interactions
    {
        drug1: 'omeprazole',
        drug2: 'methotrexate',
        severity: 'high',
        mechanism: 'PPIs may reduce methotrexate renal clearance',
        clinicalEffect: 'Increased methotrexate toxicity',
        recommendation: 'Consider holding PPI during high-dose methotrexate.',
    },

    // Respiratory
    {
        drug1: 'albuterol',
        drug2: 'metoprolol',
        severity: 'moderate',
        mechanism: 'Beta-blockers may reduce albuterol bronchodilation',
        clinicalEffect: 'Reduced bronchodilator effect, potential bronchospasm',
        recommendation: 'Use cardioselective beta-blocker. Monitor respiratory status.',
    },
    {
        drug1: 'albuterol',
        drug2: 'carvedilol',
        severity: 'moderate',
        mechanism: 'Non-selective beta-blocker opposes beta-agonist',
        clinicalEffect: 'Reduced bronchodilator efficacy',
        recommendation: 'Consider cardioselective beta-blocker alternative.',
    },

    // Corticosteroid Interactions
    {
        drug1: 'prednisone',
        drug2: 'meloxicam',
        severity: 'high',
        mechanism: 'Both increase GI ulceration risk',
        clinicalEffect: 'Significantly increased risk of GI bleeding',
        recommendation: 'Use PPI for GI protection if combination necessary.',
    },
    {
        drug1: 'prednisone',
        drug2: 'naproxen',
        severity: 'high',
        mechanism: 'Additive GI toxicity',
        clinicalEffect: 'Increased risk of peptic ulcer and GI bleeding',
        recommendation: 'Add PPI protection. Use lowest doses for shortest duration.',
    },
    {
        drug1: 'prednisone',
        drug2: 'warfarin',
        severity: 'moderate',
        mechanism: 'Corticosteroids may increase or decrease warfarin effect',
        clinicalEffect: 'Unpredictable INR changes',
        recommendation: 'Monitor INR closely during prednisone course.',
    },

    // Metformin Interactions
    {
        drug1: 'metformin',
        drug2: 'contrast dye',
        severity: 'high',
        mechanism: 'Iodinated contrast with metformin increases lactic acidosis risk',
        clinicalEffect: 'Rare but serious lactic acidosis',
        recommendation: 'Hold metformin for 48 hours after contrast. Check renal function.',
    },
    {
        drug1: 'metformin',
        drug2: 'alcohol',
        severity: 'moderate',
        mechanism: 'Both inhibit gluconeogenesis',
        clinicalEffect: 'Increased hypoglycemia and lactic acidosis risk',
        recommendation: 'Limit alcohol consumption.',
    },

    // Potassium-Affecting Combinations
    {
        drug1: 'lisinopril',
        drug2: 'potassium',
        severity: 'high',
        mechanism: 'ACE inhibitors increase potassium retention',
        clinicalEffect: 'Risk of hyperkalemia',
        recommendation: 'Monitor potassium levels. Usually avoid potassium supplements.',
    },
    {
        drug1: 'losartan',
        drug2: 'potassium',
        severity: 'high',
        mechanism: 'ARBs increase potassium retention',
        clinicalEffect: 'Risk of hyperkalemia',
        recommendation: 'Monitor potassium. Avoid supplements unless proven deficient.',
    },

    // Additional Common Interactions
    {
        drug1: 'gabapentin',
        drug2: 'pregabalin',
        severity: 'high',
        mechanism: 'Therapeutic duplication with additive CNS effects',
        clinicalEffect: 'Excessive sedation, no added benefit',
        recommendation: 'Use one or the other, not both.',
    },
    {
        drug1: 'sertraline',
        drug2: 'fluoxetine',
        severity: 'high',
        mechanism: 'Therapeutic duplication - both SSRIs',
        clinicalEffect: 'Increased serotonin toxicity risk without additional benefit',
        recommendation: 'Choose one SSRI. Do not combine.',
    },
    {
        drug1: 'omeprazole',
        drug2: 'pantoprazole',
        severity: 'low',
        mechanism: 'Therapeutic duplication - both PPIs',
        clinicalEffect: 'Duplicate acid suppression with no added benefit',
        recommendation: 'Use only one PPI.',
    },
];

// ============================================================================
// THERAPEUTIC DUPLICATION DATABASE
// ============================================================================

export const THERAPEUTIC_DUPLICATIONS: TherapeuticDuplication[] = [
    {
        class: 'statin',
        medications: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin', 'lovastatin', 'fluvastatin', 'pitavastatin'],
        severity: 'high',
        description: 'Multiple statins prescribed. Use only one statin at a time.',
    },
    {
        class: 'ace-inhibitor',
        medications: ['lisinopril', 'enalapril', 'ramipril', 'benazepril', 'quinapril', 'fosinopril', 'captopril', 'perindopril', 'trandolapril', 'moexipril'],
        severity: 'high',
        description: 'Multiple ACE inhibitors prescribed. Use only one.',
    },
    {
        class: 'arb',
        medications: ['losartan', 'valsartan', 'irbesartan', 'olmesartan', 'candesartan', 'telmisartan', 'azilsartan', 'eprosartan'],
        severity: 'high',
        description: 'Multiple ARBs prescribed. Use only one.',
    },
    {
        class: 'beta-blocker',
        medications: ['metoprolol', 'carvedilol', 'atenolol', 'propranolol', 'bisoprolol', 'nebivolol', 'labetalol', 'nadolol', 'sotalol', 'timolol'],
        severity: 'moderate',
        description: 'Multiple beta-blockers prescribed. This is usually not appropriate.',
    },
    {
        class: 'ssri',
        medications: ['sertraline', 'fluoxetine', 'escitalopram', 'citalopram', 'paroxetine', 'fluvoxamine'],
        severity: 'high',
        description: 'Multiple SSRIs prescribed. Increased serotonin syndrome risk.',
    },
    {
        class: 'snri',
        medications: ['duloxetine', 'venlafaxine', 'desvenlafaxine', 'levomilnacipran', 'milnacipran'],
        severity: 'high',
        description: 'Multiple SNRIs prescribed. Increased serotonin syndrome risk.',
    },
    {
        class: 'ppi',
        medications: ['omeprazole', 'pantoprazole', 'esomeprazole', 'lansoprazole', 'rabeprazole', 'dexlansoprazole'],
        severity: 'low',
        description: 'Multiple PPIs prescribed. No clinical benefit from combining.',
    },
    {
        class: 'benzodiazepine',
        medications: ['alprazolam', 'lorazepam', 'clonazepam', 'diazepam', 'temazepam', 'triazolam', 'oxazepam', 'chlordiazepoxide'],
        severity: 'high',
        description: 'Multiple benzodiazepines prescribed. Increased sedation and dependence risk.',
    },
    {
        class: 'opioid',
        medications: ['oxycodone', 'hydrocodone', 'morphine', 'fentanyl', 'tramadol', 'codeine', 'hydromorphone', 'methadone', 'buprenorphine', 'tapentadol'],
        severity: 'high',
        description: 'Multiple opioids prescribed. Risk of overdose and respiratory depression.',
    },
    {
        class: 'nsaid',
        medications: ['meloxicam', 'naproxen', 'ibuprofen', 'celecoxib', 'diclofenac', 'indomethacin', 'ketorolac', 'piroxicam', 'sulindac', 'ketoprofen'],
        severity: 'high',
        description: 'Multiple NSAIDs prescribed. Increased GI bleeding and cardiovascular risk.',
    },
    {
        class: 'thiazide-diuretic',
        medications: ['hydrochlorothiazide', 'chlorthalidone', 'indapamide', 'metolazone'],
        severity: 'moderate',
        description: 'Multiple thiazide-type diuretics prescribed. Risk of electrolyte imbalance.',
    },
    {
        class: 'loop-diuretic',
        medications: ['furosemide', 'bumetanide', 'torsemide', 'ethacrynic acid'],
        severity: 'moderate',
        description: 'Multiple loop diuretics prescribed. Risk of excessive diuresis.',
    },
    {
        class: 'sulfonylurea',
        medications: ['glipizide', 'glyburide', 'glimepiride'],
        severity: 'high',
        description: 'Multiple sulfonylureas prescribed. Increased hypoglycemia risk.',
    },
    {
        class: 'dpp4-inhibitor',
        medications: ['sitagliptin', 'linagliptin', 'saxagliptin', 'alogliptin'],
        severity: 'moderate',
        description: 'Multiple DPP-4 inhibitors prescribed. No added benefit.',
    },
    {
        class: 'sglt2-inhibitor',
        medications: ['empagliflozin', 'canagliflozin', 'dapagliflozin', 'ertugliflozin'],
        severity: 'moderate',
        description: 'Multiple SGLT2 inhibitors prescribed. No added benefit.',
    },
    {
        class: 'antihistamine',
        medications: ['cetirizine', 'loratadine', 'fexofenadine', 'diphenhydramine', 'hydroxyzine', 'levocetirizine', 'desloratadine'],
        severity: 'low',
        description: 'Multiple antihistamines may increase sedation without added allergy benefit.',
    },
    {
        class: 'muscle-relaxant',
        medications: ['cyclobenzaprine', 'baclofen', 'tizanidine', 'methocarbamol', 'carisoprodol', 'metaxalone', 'orphenadrine'],
        severity: 'moderate',
        description: 'Multiple muscle relaxants increase sedation and CNS depression.',
    },
    {
        class: 'antipsychotic',
        medications: ['quetiapine', 'aripiprazole', 'risperidone', 'olanzapine', 'ziprasidone', 'paliperidone', 'lurasidone', 'asenapine', 'brexpiprazole', 'cariprazine'],
        severity: 'high',
        description: 'Multiple antipsychotics increase risk of side effects without clear benefit.',
    },
];

// ============================================================================
// TOP 100 MEDICATIONS (Canonical Names)
// ============================================================================

export const TOP_100_MEDICATIONS: string[] = [
    'atorvastatin',
    'levothyroxine',
    'lisinopril',
    'metformin',
    'amlodipine',
    'metoprolol',
    'albuterol',
    'omeprazole',
    'losartan',
    'gabapentin',
    'sertraline',
    'hydrochlorothiazide',
    'rosuvastatin',
    'montelukast',
    'escitalopram',
    'simvastatin',
    'amphetamine',
    'bupropion',
    'pantoprazole',
    'furosemide',
    'trazodone',
    'fluticasone',
    'tamsulosin',
    'fluoxetine',
    'carvedilol',
    'meloxicam',
    'clopidogrel',
    'prednisone',
    'citalopram',
    'apixaban',
    'amoxicillin',
    'alprazolam',
    'cyclobenzaprine',
    'doxycycline',
    'duloxetine',
    'quetiapine',
    'tramadol',
    'warfarin',
    'ciprofloxacin',
    'naproxen',
    'folic acid',
    'cetirizine',
    'oxycodone',
    'azithromycin',
    'allopurinol',
    'tadalafil',
    'sildenafil',
    'glipizide',
    'loratadine',
    'baclofen',
    'clonazepam',
    'tizanidine',
    'topiramate',
    'venlafaxine',
    'lamotrigine',
    'nortriptyline',
    'buspirone',
    'clonidine',
    'aripiprazole',
    'celecoxib',
    'cephalexin',
    'divalproex',
    'irbesartan',
    'mupirocin',
    'olmesartan',
    'pioglitazone',
    'sulfamethoxazole',
    'trimethoprim',
    'atenolol',
    'propranolol',
    'pravastatin',
    'diltiazem',
    'verapamil',
    'spironolactone',
    'potassium chloride',
    'vitamin d',
    'aspirin',
    'acetaminophen',
    'ibuprofen',
    'insulin',
    'methotrexate',
    'hydroxychloroquine',
    'colchicine',
    'famotidine',
    'ranitidine',
    'esomeprazole',
    'lansoprazole',
    'ondansetron',
    'promethazine',
    'methylprednisolone',
    'hydrocortisone',
    'triamcinolone',
    'mometasone',
    'budesonide',
    'tiotropium',
    'ipratropium',
    'levalbuterol',
    'formoterol',
    'salmeterol',
    'pregabalin',
];
