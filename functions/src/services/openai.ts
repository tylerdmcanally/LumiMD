import axios, { AxiosInstance } from 'axios';
import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';
import { CANONICAL_MEDICATIONS } from './medicationSafety';
import { withRetry } from '../utils/retryUtils';

const BASE_URL = 'https://api.openai.com/v1';



export interface MedicationChangeEntry {
  name: string;
  dose?: string;
  frequency?: string;
  note?: string;
  display?: string;
  original?: string;
  needsConfirmation?: boolean;
  status?: 'matched' | 'fuzzy' | 'unverified';
  warning?: Array<{
    type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
    severity: 'critical' | 'high' | 'moderate' | 'low';
    message: string;
    details: string;
    recommendation: string;
    conflictingMedication?: string;
    allergen?: string;
    source?: 'hardcoded' | 'ai' | 'external';
    externalIds?: {
      rxcui?: string;
      rxcuiPair?: string[];
    };
  }>;
}

const MAX_CANONICAL_GLOSSARY_ITEMS = 80;
const CANONICAL_GLOSSARY_TEXT = buildCanonicalGlossaryText(MAX_CANONICAL_GLOSSARY_ITEMS);

function buildCanonicalGlossaryText(limit: number): string {
  const entries = Object.entries(CANONICAL_MEDICATIONS).map(([name, data]) => {
    const classLabel =
      Array.isArray(data.classes) && data.classes.length > 0 ? ` [${data.classes[0]}]` : '';
    const aliasPreview =
      Array.isArray(data.aliases) && data.aliases.length > 0
        ? ` aka ${data.aliases.slice(0, 2).join(', ')}`
        : '';
    return `${name}${classLabel}${aliasPreview}`;
  });

  return entries
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit)
    .map((line, index) => `${index + 1}. ${line}`)
    .join('\n');
}

function formatMedicationReferenceList(list: string[]): string {
  if (!list || list.length === 0) {
    return 'None provided';
  }

  return list.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

export interface VisitSummaryResult {
  summary: string;
  diagnoses: string[];
  medications: {
    started: MedicationChangeEntry[];
    stopped: MedicationChangeEntry[];
    changed: MedicationChangeEntry[];
  };
  imaging: string[];
  nextSteps: string[];
  education: {
    diagnoses: Array<{ name: string; summary?: string; watchFor?: string }>;
    medications: Array<{
      name: string;
      purpose?: string;
      usage?: string;
      sideEffects?: string;
      whenToCallDoctor?: string;
    }>;
  };
}

const defaultSummaryResult = (): VisitSummaryResult => ({
  summary: '',
  diagnoses: [],
  medications: {
    started: [],
    stopped: [],
    changed: [],
  },
  imaging: [],
  nextSteps: [],
  education: {
    diagnoses: [],
    medications: [],
  },
});

const extractJsonBlock = (content: string): string => {
  const codeFenceMatch = content.match(/```(?:json)?([\s\S]*?)```/i);
  if (codeFenceMatch) {
    return codeFenceMatch[1].trim();
  }

  const jsonMatch = content.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return content.trim();
};

const ensureArrayOfStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

const ensureEducationObject = (
  value: unknown,
): VisitSummaryResult['education'] => {
  const empty: VisitSummaryResult['education'] = {
    diagnoses: [],
    medications: [],
  };

  if (!value || typeof value !== 'object') {
    return empty;
  }

  const record = value as Record<string, unknown>;

  const diagnoses: VisitSummaryResult['education']['diagnoses'] = [];
  if (Array.isArray(record.diagnoses)) {
    record.diagnoses.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const diagRecord = entry as Record<string, unknown>;
      const name = sanitizeText(diagRecord.name);
      if (!name) return;
      const summary = sanitizeText(diagRecord.summary);
      const watchFor = sanitizeText(diagRecord.watchFor);
      const result: { name: string; summary?: string; watchFor?: string } = {
        name,
      };
      if (summary) {
        result.summary = summary;
      }
      if (watchFor) {
        result.watchFor = watchFor;
      }
      diagnoses.push(result);
    });
  }

  const medications: VisitSummaryResult['education']['medications'] = [];
  if (Array.isArray(record.medications)) {
    record.medications.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const medRecord = entry as Record<string, unknown>;
      const name = sanitizeText(medRecord.name);
      if (!name) return;
      const purpose = sanitizeText(medRecord.purpose);
      const usage = sanitizeText(medRecord.usage);
      const sideEffects = sanitizeText(medRecord.sideEffects);
      const whenToCallDoctor = sanitizeText(medRecord.whenToCallDoctor);
      const result: {
        name: string;
        purpose?: string;
        usage?: string;
        sideEffects?: string;
        whenToCallDoctor?: string;
      } = { name };
      if (purpose) {
        result.purpose = purpose;
      }
      if (usage) {
        result.usage = usage;
      }
      if (sideEffects) {
        result.sideEffects = sideEffects;
      }
      if (whenToCallDoctor) {
        result.whenToCallDoctor = whenToCallDoctor;
      }
      medications.push(result);
    });
  }

  return {
    diagnoses,
    medications,
  };
};

const sanitizeText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const extractNameFromMedicationText = (text: string): { name: string; note?: string } => {
  const cleaned = text.trim();
  if (!cleaned) {
    return { name: 'Unknown medication', note: undefined };
  }

  const lower = cleaned.toLowerCase();
  const breakTokens = [
    ' mg',
    ' mcg',
    ' g',
    ' ml',
    ' units',
    ' unit',
    ' daily',
    ' nightly',
    ' weekly',
    ' twice',
    ' three',
    ' every',
    ' with',
    ' for',
    ' from',
    ' at ',
    ' per ',
    ' to ',
    ' on ',
    ' in ',
    ',',
    ';',
    ':',
  ];

  let breakIndex = cleaned.length;

  for (const token of breakTokens) {
    const index = lower.indexOf(token);
    if (index !== -1 && index < breakIndex) {
      breakIndex = index;
    }
  }

  const leadingVerbMatch = cleaned.match(
    /^(?:started|start|starting|initiated|initiating|add|added|adding|begin|began|increase|increased|increasing|decrease|decreased|decreasing|change|changed|changing|titrate|titrated|titrating|switch|switched|switching|restart|restarted|restarting|resume|resumed|resuming|hold|held|holding|stop|stopped|stopping)\s+/i,
  );

  let nameSection = cleaned.slice(0, breakIndex).trim();

  if (leadingVerbMatch) {
    nameSection = nameSection.slice(leadingVerbMatch[0].length).trim();
  }

  const name = nameSection || cleaned.split(/\s+/)[0] || 'Unknown medication';
  const note = cleaned === name ? undefined : cleaned;

  return { name, note };
};

const normalizeMedicationEntry = (value: unknown): MedicationChangeEntry | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const { name, note } = extractNameFromMedicationText(trimmed);
    const result: MedicationChangeEntry = {
      name,
      display: trimmed,
      original: trimmed,
    };

    if (note) {
      result.note = note;
    }

    return result;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const explicitName = sanitizeText(record.name);
    const display = sanitizeText(record.display);
    const note = sanitizeText(record.note);
    const original = sanitizeText(record.original) ?? display ?? note;

    let name = explicitName;

    if (!name) {
      const candidate = display ?? note ?? original;
      if (candidate) {
        name = extractNameFromMedicationText(candidate).name;
      }
    }

    if (!name) {
      return null;
    }

    const dose = sanitizeText(record.dose);
    const frequency = sanitizeText(record.frequency);

    const computedDisplay =
      display ?? [name, dose, frequency].filter(Boolean).join(' • ');

    const result: MedicationChangeEntry = {
      name,
    };

    if (dose) {
      result.dose = dose;
    }

    if (frequency) {
      result.frequency = frequency;
    }

    if (computedDisplay) {
      result.display = computedDisplay;
    }

    if (original) {
      result.original = original;
    } else if (result.note && !result.display) {
      result.original = result.note;
    }

    if (typeof record.needsConfirmation === 'boolean') {
      result.needsConfirmation = record.needsConfirmation;
    }

    const statusValueRaw = sanitizeText(record.status);
    const statusValue = statusValueRaw?.toLowerCase();
    if (statusValue === 'matched' || statusValue === 'fuzzy' || statusValue === 'unverified') {
      result.status = statusValue;
    }

    return result;
  }

  return null;
};

const ensureMedicationsObject = (value: unknown) => {
  const empty = {
    started: [] as MedicationChangeEntry[],
    stopped: [] as MedicationChangeEntry[],
    changed: [] as MedicationChangeEntry[],
  };

  if (!value || typeof value !== 'object') {
    return empty;
  }

  const typed = value as Record<string, unknown>;

  const normalizeArray = (entries: unknown): MedicationChangeEntry[] => {
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => normalizeMedicationEntry(entry))
      .filter((entry): entry is MedicationChangeEntry => entry !== null);
  };

  return {
    started: normalizeArray(typed.started),
    stopped: normalizeArray(typed.stopped),
    changed: normalizeArray(typed.changed),
  };
};

const DRUG_NAME_ALIASES: Record<string, string> = {
  hctz: 'hydrochlorothiazide',
  hct: 'hydrochlorothiazide',
  hcthydrochlorothiazide: 'hydrochlorothiazide',
  asa: 'aspirin',
};

const normalizeDrugName = (name: string): string => {
  if (!name) return '';
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliasKey = normalized.replace(/\d+/g, '');
  return DRUG_NAME_ALIASES[aliasKey] ?? DRUG_NAME_ALIASES[normalized] ?? normalized;
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
};

type KnownMedicationEntry = { original: string; normalized: string };

const refineMedicationListWithKnownNames = (
  list: MedicationChangeEntry[],
  knownNames: string[],
): MedicationChangeEntry[] => {
  const UNVERIFIED_WARNING =
    'Unable to confidently identify this medication from the transcript. Confirm the exact name with the prescribing provider before use.';
  const COMBO_SPLIT_PATTERN =
    /\/|,|;|&|\+|-|\band\b|\bwith\b|\bplus\b|\balong with\b|\bcombined with\b/;
  const COMBO_SPLIT_REGEX = new RegExp(COMBO_SPLIT_PATTERN.source, 'gi');

  const isComboCandidate = (text?: string | null): boolean => {
    if (!text || typeof text !== 'string') return false;
    return COMBO_SPLIT_PATTERN.test(text.toLowerCase());
  };

  const extractComboComponents = (text: string): string[] => {
    return text
      .split(COMBO_SPLIT_REGEX)
      .map((part) => part.trim())
      .filter((part) => part.length > 1);
  };

  if (!Array.isArray(list) || list.length === 0 || knownNames.length === 0) {
    return list.map((entry) => ({
      ...entry,
      needsConfirmation: entry.needsConfirmation ?? false,
      status: entry.status ?? (entry.needsConfirmation ? 'unverified' : 'matched'),
      warning: entry.warning,
    }));
  }

  const normalizedKnown: KnownMedicationEntry[] = knownNames.map((name) => ({
    original: name,
    normalized: normalizeDrugName(name),
  }));

  return list.map((entry) => {
    const result: MedicationChangeEntry = { ...entry };
    const normalizedEntryName = normalizeDrugName(entry.name);
    const comboSources = [entry.name, entry.display, entry.original, entry.note].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    const isCombo = comboSources.some((source) => isComboCandidate(source));

    if (!normalizedEntryName) {
      result.needsConfirmation = true;
      result.status = result.status ?? 'unverified';
      if (!result.note) {
        result.note = UNVERIFIED_WARNING;
      }
      return result;
    }

    if (isCombo) {
      const comboMatchesMap = new Map<string, KnownMedicationEntry>();

      for (const source of comboSources) {
        const components = extractComboComponents(source);
        for (const component of components) {
          const normalizedComponent = normalizeDrugName(component.replace(/\d+(?:\.\d+)?/g, ''));
          const strippedComponent = normalizedComponent.replace(/\d+/g, '');
          const candidate = strippedComponent || normalizedComponent;
          if (!candidate) {
            continue;
          }

          const match = normalizedKnown.find(
            (item) =>
              item.normalized === candidate ||
              candidate === item.normalized ||
              candidate.includes(item.normalized) ||
              item.normalized.includes(candidate),
          );

          if (match) {
            comboMatchesMap.set(match.original.toLowerCase(), match);
          }
        }
      }

      const comboMatches = Array.from(comboMatchesMap.values());

      if (comboMatches.length >= 2) {
        const combinedName = comboMatches.map((item) => item.original).join(' + ');
        result.name = combinedName;
        result.needsConfirmation = entry.needsConfirmation ?? false;
        result.status = 'matched';
        if (!result.display) {
          result.display = combinedName;
        }
        if (!result.original) {
          result.original = entry.original ?? entry.display ?? entry.name;
        }
        return result;
      }

      result.needsConfirmation = true;
      result.status = 'unverified';
      if (!result.note) {
        result.note = result.original ?? entry.display ?? entry.name;
      }
      return result;
    }

    const directMatch = normalizedKnown.find(
      (item) =>
        item.normalized === normalizedEntryName ||
        normalizedEntryName.includes(item.normalized) ||
        item.normalized.includes(normalizedEntryName),
    );

    if (directMatch) {
      result.name = directMatch.original;
      result.needsConfirmation = entry.needsConfirmation ?? false;
      result.status = 'matched';
      return result;
    }

    let bestMatchItem: KnownMedicationEntry | null = null;
    let bestMatchScore = Number.POSITIVE_INFINITY;

    for (const item of normalizedKnown) {
      const score = levenshteinDistance(item.normalized, normalizedEntryName);
      if (score < bestMatchScore) {
        bestMatchScore = score;
        bestMatchItem = item;
      }
    }

    if (bestMatchItem) {
      const baseLength = Math.max(bestMatchItem.normalized.length, normalizedEntryName.length);
      const tolerance = Math.ceil(baseLength * 0.35);
      if (bestMatchScore <= tolerance) {
        result.name = bestMatchItem.original;
        result.needsConfirmation = true;
        result.status = 'fuzzy';
        if (!result.note) {
          result.note = 'Medication name auto-corrected from the transcript. Please review.';
        }
        return result;
      }
    }

    result.needsConfirmation = true;
    result.status = 'unverified';
    if (!result.note) {
      result.note = UNVERIFIED_WARNING;
    }
    return result;
  });
};

const refineMedicationsWithKnownNames = (
  medications: VisitSummaryResult['medications'],
  knownNames: string[],
): VisitSummaryResult['medications'] => {
  if (!knownNames || knownNames.length === 0) {
    return {
      started: medications.started.map((m) => ({
        ...m,
        needsConfirmation: m.needsConfirmation ?? false,
      })),
      stopped: medications.stopped.map((m) => ({
        ...m,
        needsConfirmation: m.needsConfirmation ?? false,
      })),
      changed: medications.changed.map((m) => ({
        ...m,
        needsConfirmation: m.needsConfirmation ?? false,
      })),
    };
  }

  return {
    started: refineMedicationListWithKnownNames(medications.started, knownNames),
    stopped: refineMedicationListWithKnownNames(medications.stopped, knownNames),
    changed: refineMedicationListWithKnownNames(medications.changed, knownNames),
  };
};

export class OpenAIService {
  private client: AxiosInstance;
  private model: string;
  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    this.model = model || 'gpt-4.1-mini';

    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  async summarizeTranscript(
    transcript: string,
    options?: { knownMedications?: string[] },
  ): Promise<VisitSummaryResult> {
    if (!transcript || !transcript.trim()) {
      throw new Error('Transcript is required for summarization');
    }

    const knownMedicationList = Array.isArray(options?.knownMedications)
      ? options!.knownMedications.filter(
        (name) => typeof name === 'string' && name.trim().length > 0,
      )
      : [];

    const knownMedicationText = formatMedicationReferenceList(knownMedicationList);

    const response = await withRetry(
      async () =>
        await this.client.post('/chat/completions', {
          model: this.model,
          store: false, // HIPAA COMPLIANCE: Zero data retention - data deleted immediately after response
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                [
                  'You are a meticulous medical assistant. Always respond with STRICT JSON (no markdown code fences).',
                  'Keys required:',
                  '  - summary (string)',
                  '  - diagnoses (array of strings)',
                  '  - medications (object with started/stopped/changed arrays of medication objects)',
                  '  - imaging (array of strings)',
                  '  - nextSteps (array of strings)',
                  '  - education (object with diagnoses and medications arrays; see details below)',
                  '',
                  'Medication extraction checklist (perform internally; do NOT include the checklist in your output):',
                  '  1. Scan the entire transcript and jot down EVERY medication mention with its raw quote (include OTC meds, supplements, vitamins, herbals, eye drops, creams, inhalers—anything the patient takes or is prescribed).',
                  '  2. For each mention decide if the clinician started, stopped, changed, or simply referenced it, citing the supporting phrase.',
                  '  3. Cross-check spelling against the known patient list and the canonical glossary; correct obvious misspellings before emitting JSON.',
                  '  4. Only after completing steps 1-3 should you populate the JSON arrays.',
                  '  5. CRITICAL: When in doubt, INCLUDE the medication with needsConfirmation: true rather than omitting it. Missing a medication is worse than flagging one for review.',
                  '  6. Be aggressive: If something sounds like it could be a medication name (even if misspoken or partially heard), include it with status: "unverified".',
                  '',
                  'Medication object shape:',
                  '  {',
                  '    "name": string (required, canonical drug name),',
                  '    "dose": string (optional, e.g. "100 mg"),',
                  '    "frequency": string (optional, e.g. "daily"),',
                  '    "note": string (optional, extra context such as taper instructions),',
                  '    "display": string (optional, one-line human friendly summary),',
                  '    "original": string (optional, exact quote or directive from transcript)',
                  '    "needsConfirmation": boolean (required; true when any part of the name/dose/context is uncertain)',
                  '    "status": "matched" | "fuzzy" | "unverified" (required; matched for explicit names, fuzzy for corrected spellings, unverified when still unclear)',
                  '  }',
                  '',
                  'Medication requirements:',
                  '  • Scan the ENTIRE transcript for every medication discussed (started, stopped, changed, continued).',
                  '  • Compare each candidate to the known patient list and the glossary before finalizing the canonical name.',
                  '  • Populate started/stopped/changed arrays with rich objects as defined above.',
                  '  • ALWAYS include the name field. Include dose/frequency when spoken.',
                  '  • Set display to a concise sentence the app can show. If unsure, reuse the original instruction.',
                  '  • Set note to any additional explanation (e.g., reason for change).',
                  '  • Set original to the exact transcript text or closest paraphrase.',
                  '  • If no medications are covered, return empty arrays.',
                  '',
                  'CRITICAL: Combination Medications and Multiple Drug Handling:',
                  '  • IMPORTANT: Fixed-dose combination medications should match how they appear on the pill bottle (patient-facing).',
                  '',
                  '  KEEP AS SINGLE MEDICATION (one pill bottle) when:',
                  '    1. Slash notation combinations - these are fixed-dose combo pills (one physical tablet):',
                  '       - Example: "HCTZ/Lisinopril 12.5/20 mg daily" stays as ONE medication:',
                  '         {name: "HCTZ/Lisinopril", dose: "12.5/20 mg", frequency: "daily"}',
                  '       - Example: "Aspirin/Dipyridamole 25/200 mg" stays as ONE medication:',
                  '         {name: "Aspirin/Dipyridamole", dose: "25/200 mg"}',
                  '       - Keep the slash notation intact - this matches the patient\'s pill bottle label',
                  '',
                  '    2. Brand name fixed-dose combinations:',
                  '       - Example: "Zestoretic 12.5/20 mg" stays as ONE: {name: "Zestoretic", dose: "12.5/20 mg"}',
                  '       - Example: "Janumet 50/1000 mg" stays as ONE: {name: "Janumet", dose: "50/1000 mg"}',
                  '       - Common brands: Zestoretic, Janumet, Symbicort, Advair, Vytorin, Aggrenox, Duexis',
                  '',
                  '    3. Single products with descriptive qualifiers:',
                  '       - Example: "Vitamin D with K2" stays as ONE medication',
                  '       - Example: "Calcium with Vitamin D" stays as ONE medication',
                  '       - Example: "Multivitamin with iron" stays as ONE medication',
                  '',
                  '    4. Extended-release or modified formulations:',
                  '       - Example: "Metformin XR" stays as ONE medication',
                  '',
                  '  SPLIT INTO SEPARATE MEDICATIONS (different pill bottles) when:',
                  '    1. Multiple medications listed with "and", "&", "+", commas, or in a series:',
                  '       - Example: "Started Aspirin and Plavix" becomes TWO separate medications',
                  '       - Example: "Continue Metformin, Lisinopril, and Atorvastatin" becomes THREE medications',
                  '       - Example: "Aspirin & Ibuprofen" becomes TWO medications (these are separate pills)',
                  '       - Example: "Stopped Aspirin, started Plavix" becomes one stopped entry and one started entry',
                  '',
                  '  • The key distinction: Slash notation (/) = ONE physical pill. "and"/"&"/comma = MULTIPLE physical pills.',
                  '  • Each medication entry should preserve the full context in its "original" field for reference.',
                  '',
                  'Uncertainty and Confirmation:',
                  '  • IMPORTANT: Err on the side of INCLUSION. It is better to include a medication with needsConfirmation: true than to miss it entirely.',
                  '  • If unsure about the exact medication name, set `needsConfirmation: true`, keep your best-guess `name`, and include the verbatim text in `original`.',
                  '  • Whenever `needsConfirmation` is true, append a short reminder in the `note` field telling the patient to confirm with their prescribing provider, and set `status` to `"fuzzy"` (best guess) or `"unverified"` (unable to process).',
                  '  • If you truly cannot identify the medication, set `status: "unverified"`, keep the transcript excerpt in `original`, include a reminder in `note`, and leave the `name` as your safest description (e.g., "Unknown medication from transcript").',
                  '  • Use the provided known medication list to correct obvious transcription errors whenever possible.',
                  '  • Common transcription errors to watch for: medication names that sound similar (e.g., Celebrex vs. Celexa, Zyrtec vs. Zantac, Metformin vs. Metoprolol), phonetic misspellings, and brand/generic confusion.',
                  '  • Example (uncertain spelling): transcript says "Lisnopril 10 mg daily" but you infer "Lisinopril". Output:',
                  '    {"name":"Lisinopril","dose":"10 mg","frequency":"daily","original":"Continue lisnopril 10 milligrams daily","needsConfirmation":true,"status":"fuzzy","note":"Transcript spelling was unclear—confirm lisinopril 10 mg daily with your provider."}',
                  '',
                  'Imaging/labs (renamed "Ordered Tests" conceptually—includes ALL diagnostic testing, not just imaging):',
                  '  • Include ALL diagnostic tests that were ordered, scheduled, or explicitly recommended during this visit, including:',
                  '    - Imaging: X-ray, CT, MRI, ultrasound, echocardiogram, DEXA scan, mammogram, etc.',
                  '    - Cardiac testing: stress test, treadmill stress test, nuclear stress test, cardiac catheterization, Holter monitor, event monitor, cardiac CT, coronary CTA, etc.',
                  '    - Lab work: blood tests, CBC, metabolic panel, lipid panel, A1C, thyroid function, urinalysis, etc.',
                  '    - Pulmonary testing: pulmonary function tests (PFTs), spirometry, chest X-ray, sleep study, overnight oximetry, etc.',
                  '    - GI testing: colonoscopy, endoscopy, stool tests, H. pylori breath test, etc.',
                  '    - Other procedures: biopsy, EMG, nerve conduction study, EEG, etc.',
                  '  • Listen for phrases like: "we will order", "I want to get", "let\'s schedule", "we\'re going to order", "I\'ll put in for", "we need to do", "we should check", "let\'s do", etc.',
                  '  • If prior imaging or lab results were reviewed, mention them in the summary instead but do not add them to the imaging array.',
                  '  • If no new orders were made, return an empty array.',
                  '',
                  'Diagnoses:',
                  '  • Include any conditions explicitly stated OR clearly implied (e.g., “blood pressure is still high” ⇒ add “Hypertension”; “cholesterol remains elevated” ⇒ add “Hyperlipidemia”).',
                  '  • Use standardized medical terms when possible.',
                  '',
                  'Next steps:',
                  '  • Provide concise, patient-facing tasks.',
                  '  • Format each item as "Short title — follow up in timeframe".',
                  '    - Keep the title to 2-4 words using standardized phrases when possible:',
                  '        • "Clinic follow up"',
                  '        • "Return to clinic"',
                  '        • "Nurse visit"',
                  '        • "Blood pressure check"',
                  '        • "Lab draw"',
                  '        • "Imaging appointment"',
                  '        • "Stress test" (for treadmill, nuclear, or other cardiac stress testing)',
                  '        • "Cardiac testing" (for Holter, event monitor, echo, etc.)',
                  '        • "Sleep study"',
                  '        • "Pulmonary function test"',
                  '        • "Colonoscopy" or "Endoscopy"',
                  '        • "Specialist referral"',
                  '        • "Medication review"',
                  '        • Use "Other task" sparingly when nothing else fits.',
                  '    - The phrase before the em dash identifies the task category; the phrase after the dash must contain the natural-language timing when a specific date or timeframe is provided (e.g., "Return to clinic — follow up in about three months").',
                  '    - If the clinician only orders something (e.g., "We will order a 7-day cardiac monitor", "We are going to order a treadmill stress test", or "Order coronary CT angiogram") and no due date is specified, omit the em dash and timing so the item becomes a single label like "Stress test" or "Cardiac testing". Do NOT invent or infer a timeframe.',
                  '    - Only include temporal phrases ("in 3 months", "within 2 weeks") when the clinician explicitly provided them. If no timing was stated, leave the item without a timeframe.',
                  '  • CRITICAL: ALWAYS create an action item when the clinician orders or mentions ordering ANY diagnostic test, procedure, imaging study, monitoring device, referral, or nurse visit—even if no date was given. This includes:',
                  '    - Any stress test (treadmill, nuclear, pharmacologic, exercise)',
                  '    - Any cardiac monitoring (Holter, event monitor, loop recorder)',
                  '    - Any imaging (CT, MRI, X-ray, ultrasound, echo, DEXA)',
                  '    - Any lab work (blood tests, urine tests)',
                  '    - Any procedures (colonoscopy, endoscopy, biopsy)',
                  '    - Any referrals to specialists',
                  '    - Any follow-up visits',
                  '  • Listen for ordering language like: "we are going to order", "we will order", "I want to schedule", "let\'s get", "I\'ll order", "we need to do", "I\'m ordering", "we should get", etc.',
                  '  • Each task should cover a single actionable next step. Split combined instructions into separate tasks if they require different actions or timelines.',
                  '  • If the visit explicitly defers to patient discretion (e.g., "call us if symptoms worsen"), create a "Contact clinic" task with the conditional phrasing after the em dash.',
                  '',
                  'Education object:',
                  '  {',
                  '    "diagnoses": [',
                  '      {',
                  '        "name": string (diagnosis name, matching the diagnoses list when possible),',
                  '        "summary": string (plain-language explanation for patients),',
                  '        "watchFor": string (optional, symptoms or warnings to monitor)',
                  '      }',
                  '    ],',
                  '    "medications": [',
                  '      {',
                  '        "name": string (medication name, matching the medications list when possible),',
                  '        "purpose": string (why the medication is used),',
                  '        "usage": string (optional, key instructions or timing),',
                  '        "sideEffects": string (optional, common side effects to watch for),',
                  '        "whenToCallDoctor": string (optional, red flags requiring medical attention)',
                  '      }',
                  '    ]',
                  '  }',
                  '  • Keep explanations concise, empathetic, and actionable.',
                  '  • If no information is available, return empty arrays.',
                ].join('\n'),
            },
            {
              role: 'user',
              content: [
                'Known patient medications (use these spellings whenever possible):',
                knownMedicationText,
                '',
                'Common medication glossary (brand ↔ generic hints; use for spell-checking and spelling corrections):',
                CANONICAL_GLOSSARY_TEXT,
                '',
                `Transcript:\n${transcript}`,
                '',
                'Respond with JSON only.',
              ].join('\n'),
            },
          ],
        }),
      {
        shouldRetry: (error: any) => {
          if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            // Retry on rate limits (429) and server errors (5xx)
            return status === 429 || (!!status && status >= 500);
          }
          // Retry on network errors
          if (error instanceof Error) {
            return (
              error.message.includes('ECONNREFUSED') ||
              error.message.includes('ETIMEDOUT') ||
              error.message.includes('ENOTFOUND')
            );
          }
          return false;
        },
      }
    );

    const content =
      response.data?.choices?.[0]?.message?.content?.trim() ?? '';

    if (!content) {
      return defaultSummaryResult();
    }

    const rawJson = extractJsonBlock(content);

    try {
      const parsed = JSON.parse(rawJson);
      const medications = ensureMedicationsObject(parsed.medications);
      const refinedMedications = refineMedicationsWithKnownNames(
        medications,
        knownMedicationList,
      );

      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
        diagnoses: ensureArrayOfStrings(parsed.diagnoses),
        medications: refinedMedications,
        imaging: ensureArrayOfStrings(parsed.imaging),
        nextSteps: ensureArrayOfStrings(parsed.nextSteps),
        education: ensureEducationObject(parsed.education),
      };
    } catch (error) {
      functions.logger.error('[OpenAI] Failed to parse JSON response', error, { content });
      throw new Error('OpenAI returned an invalid JSON response');
    }
  }
}

let openAIServiceInstance: OpenAIService | null = null;

export const getOpenAIService = (): OpenAIService => {
  if (!openAIServiceInstance) {
    openAIServiceInstance = new OpenAIService(
      openAIConfig.apiKey,
      openAIConfig.model,
    );
  }

  return openAIServiceInstance;
};


