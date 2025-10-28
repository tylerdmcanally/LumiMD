/**
 * Medication Database Generator
 *
 * Generates a comprehensive medication database from the top 300 prescribed medications
 * with automatically generated common misspellings and variations
 */

// Top 300 prescribed medications in US (2023) - Source: ClinCalc DrugStats
const TOP_300_MEDICATIONS = [
  'Atorvastatin', 'Metformin', 'Levothyroxine', 'Lisinopril', 'Amlodipine', 'Metoprolol', 'Albuterol', 'Losartan', 'Gabapentin', 'Omeprazole',
  'Sertraline', 'Rosuvastatin', 'Pantoprazole', 'Escitalopram', 'Dextroamphetamine', 'Hydrochlorothiazide', 'Bupropion', 'Fluoxetine', 'Semaglutide', 'Montelukast',
  'Trazodone', 'Simvastatin', 'Amoxicillin', 'Tamsulosin', 'Fluticasone', 'Meloxicam', 'Apixaban', 'Furosemide', 'Insulin Glargine', 'Duloxetine',
  'Ibuprofen', 'Famotidine', 'Empagliflozin', 'Carvedilol', 'Tramadol', 'Alprazolam', 'Prednisone', 'Hydroxyzine', 'Buspirone', 'Clopidogrel',
  'Glipizide', 'Citalopram', 'Potassium Chloride', 'Allopurinol', 'Aspirin', 'Cyclobenzaprine', 'Ergocalciferol', 'Oxycodone', 'Methylphenidate', 'Venlafaxine',
  'Spironolactone', 'Ondansetron', 'Zolpidem', 'Cetirizine', 'Estradiol', 'Pravastatin', 'Lamotrigine', 'Quetiapine', 'Clonazepam', 'Dulaglutide',
  'Azithromycin', 'Latanoprost', 'Cholecalciferol', 'Propranolol', 'Ezetimibe', 'Topiramate', 'Paroxetine', 'Diclofenac', 'Atenolol', 'Lisdexamfetamine',
  'Doxycycline', 'Pregabalin', 'Glimepiride', 'Tizanidine', 'Clonidine', 'Fenofibrate', 'Insulin Lispro', 'Valsartan', 'Cephalexin', 'Baclofen',
  'Rivaroxaban', 'Ferrous Sulfate', 'Amitriptyline', 'Finasteride', 'Dapagliflozin', 'Folic Acid', 'Aripiprazole', 'Olmesartan', 'Valacyclovir', 'Mirtazapine',
  'Lorazepam', 'Levetiracetam', 'Insulin Aspart', 'Naproxen', 'Cyanocobalamin', 'Loratadine', 'Diltiazem', 'Sumatriptan', 'Triamcinolone', 'Hydralazine',
  'Tirzepatide', 'Celecoxib', 'Acetaminophen', 'Alendronate', 'Oxybutynin', 'Warfarin', 'Progesterone', 'Testosterone', 'Nifedipine', 'Methocarbamol',
  'Benzonatate', 'Sitagliptin', 'Chlorthalidone', 'Isosorbide', 'Donepezil', 'Dexmethylphenidate', 'Clobetasol', 'Methotrexate', 'Hydroxychloroquine', 'Lovastatin',
  'Pioglitazone', 'Irbesartan', 'Methylprednisolone', 'Norethindrone', 'Meclizine', 'Ketoconazole', 'Thyroid', 'Azelastine', 'Nitrofurantoin', 'Adalimumab',
  'Memantine', 'Prednisolone', 'Esomeprazole', 'Docusate', 'Clindamycin', 'Acyclovir', 'Sildenafil', 'Insulin Degludec', 'Insulin Detemir', 'Ciprofloxacin',
  'Morphine', 'Levocetirizine', 'Valproate', 'Atomoxetine', 'Budesonide', 'Tiotropium', 'Melatonin', 'Cefdinir', 'Doxepin', 'Olanzapine',
  'Phentermine', 'Ofloxacin', 'Mupirocin', 'Benazepril', 'Timolol', 'Fluconazole', 'Risperidone', 'Verapamil', 'Linaclotide', 'Cyclosporine',
  'Doxazosin', 'Hydrocortisone', 'Diazepam', 'Telmisartan', 'Carbamazepine', 'Lithium', 'Evolocumab', 'Desvenlafaxine', 'Dorzolamide', 'Nebivolol',
  'Dicyclomine', 'Torsemide', 'Anastrozole', 'Enalapril', 'Tretinoin', 'Tadalafil', 'Calcium', 'Pramipexole', 'Mesalamine', 'Metronidazole',
  'Nortriptyline', 'Rimegepant', 'Nitroglycerin', 'Rizatriptan', 'Liraglutide', 'Ramipril', 'Ropinirole', 'Brimonidine', 'Mirabegron', 'Colchicine',
  'Ticagrelor', 'Terazosin', 'Amiodarone', 'Fexofenadine', 'Liothyronine', 'Bisoprolol', 'Flecainide', 'Oxcarbazepine', 'Ascorbic Acid', 'Ketorolac',
  'Promethazine', 'Levofloxacin', 'Labetalol', 'Nystatin', 'Cyproheptadine', 'Erythromycin', 'Dutasteride', 'Moxifloxacin', 'Bimatoprost', 'Primidone',
  'Sucralfate', 'Bumetanide', 'Solifenacin', 'Dexamethasone', 'Epinephrine', 'Penicillin', 'Calcitriol', 'Oseltamivir', 'Terbinafine', 'Linagliptin',
  'Methimazole', 'Metoclopramide', 'Medroxyprogesterone', 'Pancrelipase', 'Clotrimazole', 'Guanfacine', 'Sodium Fluoride', 'Lactulose', 'Fluorouracil', 'Ipratropium',
  'Olopatadine', 'Chlorhexidine', 'Nabumetone', 'Mometasone', 'Hydroquinone', 'Phenazopyridine', 'Loperamide', 'Lidocaine', 'Ciclopirox', 'Cefuroxime',
  'Betamethasone', 'Diphenhydramine', 'Indomethacin', 'Niacin', 'Vitamin E', 'Guaifenesin', 'Pseudoephedrine', 'Bisacodyl', 'Riboflavin', 'Ivermectin',
  'Etodolac', 'Tobramycin', 'Ketotifen',
];

// Common brand names for top medications
const BRAND_NAMES: Record<string, string[]> = {
  'Atorvastatin': ['Lipitor'],
  'Metformin': ['Glucophage', 'Fortamet', 'Glumetza'],
  'Levothyroxine': ['Synthroid', 'Levoxyl', 'Unithroid'],
  'Lisinopril': ['Prinivil', 'Zestril'],
  'Amlodipine': ['Norvasc'],
  'Metoprolol': ['Lopressor', 'Toprol', 'Toprol-XL'],
  'Albuterol': ['Proventil', 'Ventolin', 'ProAir'],
  'Losartan': ['Cozaar'],
  'Gabapentin': ['Neurontin', 'Gralise'],
  'Omeprazole': ['Prilosec'],
  'Sertraline': ['Zoloft'],
  'Rosuvastatin': ['Crestor'],
  'Pantoprazole': ['Protonix'],
  'Escitalopram': ['Lexapro'],
  'Hydrochlorothiazide': ['Microzide', 'HCTZ'],
  'Bupropion': ['Wellbutrin', 'Zyban'],
  'Fluoxetine': ['Prozac', 'Sarafem'],
  'Semaglutide': ['Ozempic', 'Wegovy', 'Rybelsus'],
  'Montelukast': ['Singulair'],
  'Trazodone': ['Desyrel'],
  'Simvastatin': ['Zocor'],
  'Amoxicillin': ['Amoxil', 'Moxatag'],
  'Tamsulosin': ['Flomax'],
  'Fluticasone': ['Flonase', 'Flovent'],
  'Meloxicam': ['Mobic'],
  'Apixaban': ['Eliquis'],
  'Furosemide': ['Lasix'],
  'Duloxetine': ['Cymbalta'],
  'Ibuprofen': ['Advil', 'Motrin'],
  'Famotidine': ['Pepcid'],
  'Empagliflozin': ['Jardiance'],
  'Carvedilol': ['Coreg'],
  'Tramadol': ['Ultram', 'ConZip'],
  'Alprazolam': ['Xanax'],
  'Prednisone': ['Deltasone', 'Rayos'],
  'Hydroxyzine': ['Atarax', 'Vistaril'],
  'Buspirone': ['Buspar'],
  'Clopidogrel': ['Plavix'],
  'Glipizide': ['Glucotrol'],
  'Citalopram': ['Celexa'],
  'Allopurinol': ['Zyloprim'],
  'Aspirin': ['Bayer', 'Ecotrin'],
  'Cyclobenzaprine': ['Flexeril', 'Amrix'],
  'Oxycodone': ['OxyContin', 'Roxicodone'],
  'Methylphenidate': ['Ritalin', 'Concerta'],
  'Venlafaxine': ['Effexor'],
  'Spironolactone': ['Aldactone'],
  'Ondansetron': ['Zofran'],
  'Zolpidem': ['Ambien'],
  'Cetirizine': ['Zyrtec'],
  'Estradiol': ['Estrace', 'Vivelle'],
  'Pravastatin': ['Pravachol'],
  'Lamotrigine': ['Lamictal'],
  'Quetiapine': ['Seroquel'],
  'Clonazepam': ['Klonopin'],
  'Dulaglutide': ['Trulicity'],
  'Azithromycin': ['Zithromax', 'Z-Pak'],
  'Latanoprost': ['Xalatan'],
  'Propranolol': ['Inderal'],
  'Ezetimibe': ['Zetia'],
  'Topiramate': ['Topamax'],
  'Paroxetine': ['Paxil'],
  'Diclofenac': ['Voltaren'],
  'Atenolol': ['Tenormin'],
  'Pregabalin': ['Lyrica'],
  'Glimepiride': ['Amaryl'],
  'Tizanidine': ['Zanaflex'],
  'Clonidine': ['Catapres'],
  'Fenofibrate': ['Tricor', 'Trilipix'],
  'Valsartan': ['Diovan'],
  'Cephalexin': ['Keflex'],
  'Baclofen': ['Lioresal'],
  'Rivaroxaban': ['Xarelto'],
  'Amitriptyline': ['Elavil'],
  'Finasteride': ['Propecia', 'Proscar'],
  'Dapagliflozin': ['Farxiga'],
  'Aripiprazole': ['Abilify'],
  'Olmesartan': ['Benicar'],
  'Valacyclovir': ['Valtrex'],
  'Mirtazapine': ['Remeron'],
  'Lorazepam': ['Ativan'],
  'Levetiracetam': ['Keppra'],
  'Naproxen': ['Aleve', 'Naprosyn'],
  'Loratadine': ['Claritin'],
  'Diltiazem': ['Cardizem', 'Tiazac'],
  'Sumatriptan': ['Imitrex'],
  'Triamcinolone': ['Kenalog', 'Aristocort'],
  'Hydralazine': ['Apresoline'],
  'Tirzepatide': ['Mounjaro', 'Zepbound'],
  'Celecoxib': ['Celebrex'],
  'Acetaminophen': ['Tylenol'],
  'Alendronate': ['Fosamax'],
  'Oxybutynin': ['Ditropan'],
  'Warfarin': ['Coumadin', 'Jantoven'],
  'Nifedipine': ['Procardia', 'Adalat'],
  'Methocarbamol': ['Robaxin'],
  'Benzonatate': ['Tessalon'],
  'Sitagliptin': ['Januvia'],
  'Chlorthalidone': ['Thalitone'],
  'Isosorbide': ['Isordil', 'Imdur'],
  'Donepezil': ['Aricept'],
  'Methotrexate': ['Rheumatrex', 'Trexall'],
  'Hydroxychloroquine': ['Plaquenil'],
  'Lovastatin': ['Mevacor'],
  'Pioglitazone': ['Actos'],
  'Irbesartan': ['Avapro'],
  'Methylprednisolone': ['Medrol'],
  'Meclizine': ['Antivert', 'Bonine'],
  'Ketoconazole': ['Nizoral'],
  'Azelastine': ['Astelin', 'Astepro'],
  'Nitrofurantoin': ['Macrobid', 'Macrodantin'],
  'Adalimumab': ['Humira'],
  'Memantine': ['Namenda'],
  'Prednisolone': ['Prelone'],
  'Esomeprazole': ['Nexium'],
  'Docusate': ['Colace'],
  'Clindamycin': ['Cleocin'],
  'Acyclovir': ['Zovirax'],
  'Sildenafil': ['Viagra', 'Revatio'],
  'Ciprofloxacin': ['Cipro'],
  'Morphine': ['MS Contin', 'Kadian'],
  'Levocetirizine': ['Xyzal'],
  'Atomoxetine': ['Strattera'],
  'Budesonide': ['Pulmicort', 'Entocort'],
  'Tiotropium': ['Spiriva'],
  'Cefdinir': ['Omnicef'],
  'Doxepin': ['Sinequan', 'Silenor'],
  'Olanzapine': ['Zyprexa'],
  'Phentermine': ['Adipex'],
  'Mupirocin': ['Bactroban'],
  'Benazepril': ['Lotensin'],
  'Timolol': ['Timoptic'],
  'Fluconazole': ['Diflucan'],
  'Risperidone': ['Risperdal'],
  'Verapamil': ['Calan', 'Verelan'],
  'Linaclotide': ['Linzess'],
  'Cyclosporine': ['Neoral', 'Sandimmune'],
  'Doxazosin': ['Cardura'],
  'Hydrocortisone': ['Cortef'],
  'Diazepam': ['Valium'],
  'Telmisartan': ['Micardis'],
  'Carbamazepine': ['Tegretol', 'Carbatrol'],
  'Lithium': ['Lithobid'],
  'Evolocumab': ['Repatha'],
  'Desvenlafaxine': ['Pristiq'],
  'Nebivolol': ['Bystolic'],
  'Dicyclomine': ['Bentyl'],
  'Torsemide': ['Demadex'],
  'Anastrozole': ['Arimidex'],
  'Enalapril': ['Vasotec'],
  'Tretinoin': ['Retin-A'],
  'Tadalafil': ['Cialis', 'Adcirca'],
  'Mesalamine': ['Asacol', 'Pentasa'],
  'Metronidazole': ['Flagyl'],
  'Nortriptyline': ['Pamelor'],
  'Nitroglycerin': ['Nitrostat'],
  'Rizatriptan': ['Maxalt'],
  'Liraglutide': ['Victoza', 'Saxenda'],
  'Ramipril': ['Altace'],
  'Ropinirole': ['Requip'],
  'Brimonidine': ['Alphagan'],
  'Mirabegron': ['Myrbetriq'],
  'Colchicine': ['Colcrys'],
  'Ticagrelor': ['Brilinta'],
  'Terazosin': ['Hytrin'],
  'Amiodarone': ['Cordarone', 'Pacerone'],
  'Fexofenadine': ['Allegra'],
  'Liothyronine': ['Cytomel'],
  'Bisoprolol': ['Zebeta'],
  'Flecainide': ['Tambocor'],
  'Oxcarbazepine': ['Trileptal'],
  'Ketorolac': ['Toradol'],
  'Promethazine': ['Phenergan'],
  'Levofloxacin': ['Levaquin'],
  'Labetalol': ['Trandate', 'Normodyne'],
  'Erythromycin': ['E-Mycin', 'Ery-Tab'],
  'Dutasteride': ['Avodart'],
  'Moxifloxacin': ['Avelox'],
  'Bimatoprost': ['Lumigan'],
  'Sucralfate': ['Carafate'],
  'Bumetanide': ['Bumex'],
  'Solifenacin': ['Vesicare'],
  'Dexamethasone': ['Decadron'],
  'Oseltamivir': ['Tamiflu'],
  'Terbinafine': ['Lamisil'],
  'Linagliptin': ['Tradjenta'],
  'Methimazole': ['Tapazole'],
  'Metoclopramide': ['Reglan'],
  'Medroxyprogesterone': ['Provera', 'Depo-Provera'],
  'Clotrimazole': ['Lotrimin'],
  'Guanfacine': ['Intuniv', 'Tenex'],
  'Lactulose': ['Enulose'],
  'Ipratropium': ['Atrovent'],
  'Olopatadine': ['Patanol', 'Pataday'],
  'Nabumetone': ['Relafen'],
  'Mometasone': ['Nasonex', 'Elocon'],
  'Phenazopyridine': ['Pyridium', 'AZO'],
  'Loperamide': ['Imodium'],
  'Lidocaine': ['Xylocaine'],
  'Cefuroxime': ['Ceftin'],
  'Betamethasone': ['Celestone'],
  'Diphenhydramine': ['Benadryl'],
  'Indomethacin': ['Indocin'],
  'Guaifenesin': ['Mucinex'],
  'Pseudoephedrine': ['Sudafed'],
  'Ivermectin': ['Stromectol'],
  'Tobramycin': ['Tobrex'],
};

// Drug class mappings for top medications
const DRUG_CLASSES: Record<string, string> = {
  // Statins
  'Atorvastatin': 'Statin', 'Rosuvastatin': 'Statin', 'Simvastatin': 'Statin', 'Pravastatin': 'Statin', 'Lovastatin': 'Statin',

  // Beta-Blockers
  'Metoprolol': 'Beta-Blocker', 'Carvedilol': 'Beta-Blocker', 'Atenolol': 'Beta-Blocker', 'Propranolol': 'Beta-Blocker',
  'Nebivolol': 'Beta-Blocker', 'Bisoprolol': 'Beta-Blocker', 'Labetalol': 'Beta-Blocker',

  // ACE Inhibitors
  'Lisinopril': 'ACE Inhibitor', 'Enalapril': 'ACE Inhibitor', 'Ramipril': 'ACE Inhibitor', 'Benazepril': 'ACE Inhibitor',

  // ARBs
  'Losartan': 'ARB', 'Valsartan': 'ARB', 'Olmesartan': 'ARB', 'Irbesartan': 'ARB', 'Telmisartan': 'ARB',

  // Calcium Channel Blockers
  'Amlodipine': 'Calcium Channel Blocker', 'Diltiazem': 'Calcium Channel Blocker', 'Nifedipine': 'Calcium Channel Blocker',
  'Verapamil': 'Calcium Channel Blocker',

  // Diuretics
  'Furosemide': 'Loop Diuretic', 'Hydrochlorothiazide': 'Thiazide Diuretic', 'Spironolactone': 'Potassium-Sparing Diuretic',
  'Chlorthalidone': 'Thiazide-Like Diuretic', 'Torsemide': 'Loop Diuretic', 'Bumetanide': 'Loop Diuretic',

  // PPIs
  'Omeprazole': 'Proton Pump Inhibitor', 'Pantoprazole': 'Proton Pump Inhibitor', 'Esomeprazole': 'Proton Pump Inhibitor',

  // SSRIs
  'Sertraline': 'SSRI', 'Escitalopram': 'SSRI', 'Fluoxetine': 'SSRI', 'Citalopram': 'SSRI', 'Paroxetine': 'SSRI',

  // SNRIs
  'Duloxetine': 'SNRI', 'Venlafaxine': 'SNRI', 'Desvenlafaxine': 'SNRI',

  // Anticoagulants
  'Apixaban': 'Anticoagulant', 'Rivaroxaban': 'Anticoagulant', 'Warfarin': 'Anticoagulant',

  // Antidiabetic
  'Metformin': 'Biguanide', 'Glipizide': 'Sulfonylurea', 'Glimepiride': 'Sulfonylurea',
  'Empagliflozin': 'SGLT2 Inhibitor', 'Dapagliflozin': 'SGLT2 Inhibitor',
  'Sitagliptin': 'DPP-4 Inhibitor', 'Linagliptin': 'DPP-4 Inhibitor',
  'Semaglutide': 'GLP-1 Agonist', 'Dulaglutide': 'GLP-1 Agonist', 'Liraglutide': 'GLP-1 Agonist', 'Tirzepatide': 'GLP-1 Agonist',
  'Pioglitazone': 'Thiazolidinedione',

  // Antibiotics
  'Amoxicillin': 'Penicillin Antibiotic', 'Azithromycin': 'Macrolide Antibiotic', 'Ciprofloxacin': 'Fluoroquinolone',
  'Doxycycline': 'Tetracycline', 'Cephalexin': 'Cephalosporin', 'Levofloxacin': 'Fluoroquinolone',
  'Clindamycin': 'Lincosamide Antibiotic', 'Cefdinir': 'Cephalosporin', 'Cefuroxime': 'Cephalosporin',
  'Moxifloxacin': 'Fluoroquinolone', 'Erythromycin': 'Macrolide Antibiotic',

  // Bronchodilators
  'Albuterol': 'Beta-2 Agonist', 'Tiotropium': 'Anticholinergic Bronchodilator', 'Ipratropium': 'Anticholinergic Bronchodilator',

  // Anticonvulsants
  'Gabapentin': 'Anticonvulsant', 'Pregabalin': 'Anticonvulsant', 'Lamotrigine': 'Anticonvulsant',
  'Topiramate': 'Anticonvulsant', 'Levetiracetam': 'Anticonvulsant', 'Carbamazepine': 'Anticonvulsant',
  'Oxcarbazepine': 'Anticonvulsant', 'Valproate': 'Anticonvulsant',

  // Benzodiazepines
  'Alprazolam': 'Benzodiazepine', 'Clonazepam': 'Benzodiazepine', 'Lorazepam': 'Benzodiazepine', 'Diazepam': 'Benzodiazepine',

  // Antipsychotics
  'Quetiapine': 'Atypical Antipsychotic', 'Aripiprazole': 'Atypical Antipsychotic', 'Olanzapine': 'Atypical Antipsychotic',
  'Risperidone': 'Atypical Antipsychotic',

  // NSAIDs
  'Ibuprofen': 'NSAID', 'Naproxen': 'NSAID', 'Meloxicam': 'NSAID', 'Diclofenac': 'NSAID',
  'Celecoxib': 'COX-2 Inhibitor', 'Indomethacin': 'NSAID', 'Ketorolac': 'NSAID', 'Nabumetone': 'NSAID',

  // Opioids
  'Tramadol': 'Opioid Analgesic', 'Oxycodone': 'Opioid Analgesic', 'Morphine': 'Opioid Analgesic',

  // Corticosteroids
  'Prednisone': 'Corticosteroid', 'Methylprednisolone': 'Corticosteroid', 'Prednisolone': 'Corticosteroid',
  'Dexamethasone': 'Corticosteroid', 'Hydrocortisone': 'Corticosteroid', 'Betamethasone': 'Corticosteroid',
  'Fluticasone': 'Corticosteroid', 'Budesonide': 'Corticosteroid', 'Triamcinolone': 'Corticosteroid', 'Mometasone': 'Corticosteroid',

  // Thyroid
  'Levothyroxine': 'Thyroid Hormone', 'Liothyronine': 'Thyroid Hormone', 'Thyroid': 'Thyroid Hormone',

  // Antihistamines
  'Cetirizine': 'Antihistamine', 'Loratadine': 'Antihistamine', 'Fexofenadine': 'Antihistamine',
  'Levocetirizine': 'Antihistamine', 'Diphenhydramine': 'Antihistamine', 'Hydroxyzine': 'Antihistamine',
  'Azelastine': 'Antihistamine', 'Promethazine': 'Antihistamine',

  // Muscle Relaxants
  'Cyclobenzaprine': 'Muscle Relaxant', 'Tizanidine': 'Muscle Relaxant', 'Baclofen': 'Muscle Relaxant',
  'Methocarbamol': 'Muscle Relaxant',

  // Stimulants
  'Dextroamphetamine': 'Stimulant', 'Methylphenidate': 'Stimulant', 'Lisdexamfetamine': 'Stimulant',
  'Dexmethylphenidate': 'Stimulant',

  // Other
  'Aspirin': 'Antiplatelet', 'Clopidogrel': 'Antiplatelet', 'Ticagrelor': 'Antiplatelet',
  'Allopurinol': 'Xanthine Oxidase Inhibitor',
  'Tamsulosin': 'Alpha Blocker', 'Doxazosin': 'Alpha Blocker', 'Terazosin': 'Alpha Blocker',
  'Montelukast': 'Leukotriene Receptor Antagonist',
  'Finasteride': '5-Alpha Reductase Inhibitor', 'Dutasteride': '5-Alpha Reductase Inhibitor',
  'Donepezil': 'Cholinesterase Inhibitor', 'Memantine': 'NMDA Receptor Antagonist',
  'Sildenafil': 'PDE5 Inhibitor', 'Tadalafil': 'PDE5 Inhibitor',
  'Acetaminophen': 'Analgesic',
};

/**
 * Generate common misspellings for a medication name
 */
function generateMisspellings(medName: string): string[] {
  const variations = new Set<string>();
  const lower = medName.toLowerCase();

  // Add original lowercase
  variations.add(lower);

  // Common phonetic substitutions
  const phoneticRules = [
    [/ph/g, 'f'], [/f/g, 'ph'],
    [/c(?=[ei])/g, 's'], [/s(?=[ei])/g, 'c'],
    [/z/g, 's'], [/s$/g, 'z'],
    [/tion$/g, 'shun'], [/sion$/g, 'shun'],
    [/que$/g, 'k'], [/k/g, 'c'],
    [/x/g, 'z'], [/z/g, 'x'],
  ];

  phoneticRules.forEach(([pattern, replacement]) => {
    const variant = lower.replace(pattern, replacement as string);
    if (variant !== lower && variant.length >= 4) {
      variations.add(variant);
    }
  });

  // Double/single letter errors (common in transcription)
  const doubleLetterVariants = lower.replace(/([a-z])\1/g, '$1'); // Remove doubles
  if (doubleLetterVariants !== lower) variations.add(doubleLetterVariants);

  // Add doubles where single exists (only for consonants)
  const addDoubles = lower.replace(/([bcdfghjklmnpqrstvwxz])(?=[aeiou])/g, '$1$1');
  if (addDoubles !== lower && addDoubles.length <= lower.length + 2) {
    variations.add(addDoubles);
  }

  // Transpose adjacent letters (typos)
  for (let i = 0; i < lower.length - 1; i++) {
    const transposed =
      lower.substring(0, i) +
      lower[i + 1] +
      lower[i] +
      lower.substring(i + 2);
    if (transposed !== lower) variations.add(transposed);
  }

  // Common suffix variations
  if (lower.endsWith('olol')) {
    variations.add(lower.replace(/olol$/, 'alol'));
    variations.add(lower.replace(/olol$/, 'ololol'));
    variations.add(lower.replace(/olol$/, 'ol'));
  }
  if (lower.endsWith('pril')) {
    variations.add(lower.replace(/pril$/, 'pril'));
    variations.add(lower.replace(/pril$/, 'prill'));
    variations.add(lower.replace(/pril$/, 'pral'));
  }
  if (lower.endsWith('statin')) {
    variations.add(lower.replace(/statin$/, 'statine'));
    variations.add(lower.replace(/statin$/, 'statan'));
  }
  if (lower.endsWith('dipine')) {
    variations.add(lower.replace(/dipine$/, 'dipene'));
    variations.add(lower.replace(/dipine$/, 'dipin'));
  }
  if (lower.endsWith('sartan')) {
    variations.add(lower.replace(/sartan$/, 'sarton'));
    variations.add(lower.replace(/sartan$/, 'sartin'));
  }

  // Remove variations that are too short or too different
  return Array.from(variations)
    .filter(v => v.length >= 4 && v !== lower)
    .slice(0, 8); // Limit to 8 variations per drug
}

/**
 * Generate the complete medication database
 */
function generateDatabase() {
  const database: Record<string, any> = {};

  TOP_300_MEDICATIONS.forEach((medName) => {
    const key = medName.toLowerCase().replace(/\s+/g, '');

    // Generate misspellings
    const autoVariations = generateMisspellings(medName);

    // Add brand names
    const brandNames = BRAND_NAMES[medName] || [];
    const brandVariations = brandNames.flatMap(b => [
      b.toLowerCase(),
      b.toLowerCase().replace(/-/g, ''),
    ]);

    // Combine all variations
    const allVariations = [
      ...new Set([...autoVariations, ...brandVariations])
    ].filter(v => v !== key);

    database[key] = {
      correct: medName,
      variations: allVariations,
      drugClass: DRUG_CLASSES[medName] || undefined,
      brandNames: brandNames.length > 0 ? brandNames : undefined,
    };
  });

  return database;
}

/**
 * Generate TypeScript code for the medication database
 */
function generateTypeScriptCode() {
  const db = generateDatabase();

  let code = `/**
 * Comprehensive Medication Database
 *
 * Generated from top 300 prescribed medications in the US (2023)
 * Source: ClinCalc DrugStats Database
 *
 * DO NOT EDIT MANUALLY - Generated by scripts/generateMedicationDatabase.ts
 */

export interface MedicationEntry {
  correct: string;
  variations: string[];
  drugClass?: string;
  brandNames?: string[];
}

export const MEDICATION_DATABASE: Record<string, MedicationEntry> = {\n`;

  // Sort by medication name for consistency
  const sortedKeys = Object.keys(db).sort();

  sortedKeys.forEach((key, index) => {
    const entry = db[key];
    code += `  '${key}': {\n`;
    code += `    correct: '${entry.correct}',\n`;
    code += `    variations: [${entry.variations.map((v: string) => `'${v}'`).join(', ')}],\n`;
    if (entry.drugClass) {
      code += `    drugClass: '${entry.drugClass}',\n`;
    }
    if (entry.brandNames) {
      code += `    brandNames: [${entry.brandNames.map((b: string) => `'${b}'`).join(', ')}],\n`;
    }
    code += `  }${index < sortedKeys.length - 1 ? ',' : ''}\n`;
  });

  code += `};\n\n`;

  // Add auto-generated corrections map
  code += `/**
 * Auto-generated corrections map for fast lookup
 * Maps all variations (including brand names) to correct generic name
 */
export const MEDICATION_CORRECTIONS: Record<string, string> = {};\n`;
  code += `Object.entries(MEDICATION_DATABASE).forEach(([key, data]) => {\n`;
  code += `  MEDICATION_CORRECTIONS[key] = data.correct;\n`;
  code += `  data.variations.forEach(variant => {\n`;
  code += `    MEDICATION_CORRECTIONS[variant.toLowerCase()] = data.correct;\n`;
  code += `  });\n`;
  code += `});\n`;

  return code;
}

// Generate and output the database
if (require.main === module) {
  const output = generateTypeScriptCode();
  console.log(output);
  console.log(`\n// Generated ${Object.keys(generateDatabase()).length} medications with variations`);
}

export { generateDatabase, generateTypeScriptCode };
