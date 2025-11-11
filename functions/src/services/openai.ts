import axios, { AxiosInstance } from 'axios';
import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';

const BASE_URL = 'https://api.openai.com/v1';

export interface MedicationChangeEntry {
  name: string;
  dose?: string;
  frequency?: string;
  note?: string;
  display?: string;
  original?: string;
  needsConfirmation?: boolean;
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

    const noteValue = note ?? (display && display !== name ? display : undefined);
    if (noteValue) {
      result.note = noteValue;
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

const normalizeDrugName = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

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
  if (!Array.isArray(list) || list.length === 0 || knownNames.length === 0) {
    return list.map((entry) => ({
      ...entry,
      needsConfirmation: entry.needsConfirmation ?? false,
    }));
  }

  const normalizedKnown: KnownMedicationEntry[] = knownNames.map((name) => ({
    original: name,
    normalized: normalizeDrugName(name),
  }));

  return list.map((entry) => {
    const result: MedicationChangeEntry = { ...entry };
    const normalizedEntryName = normalizeDrugName(entry.name);

    if (!normalizedEntryName) {
      result.needsConfirmation = true;
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
        result.needsConfirmation = entry.needsConfirmation ?? false;
        return result;
      }
    }

    result.needsConfirmation = true;
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

    this.model = model || 'gpt-4o-mini';

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

    const knownMedicationText =
      knownMedicationList.length > 0 ? knownMedicationList.join(', ') : 'None provided';

    const response = await this.client.post('/chat/completions', {
      model: this.model,
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
              'Medication object shape:',
              '  {',
              '    "name": string (required, canonical drug name),',
              '    "dose": string (optional, e.g. "100 mg"),',
              '    "frequency": string (optional, e.g. "daily"),',
              '    "note": string (optional, extra context such as taper instructions),',
              '    "display": string (optional, one-line human friendly summary),',
              '    "original": string (optional, exact quote or directive from transcript)',
              '  }',
              '',
              'Medication requirements:',
              '  • Scan the ENTIRE transcript for every medication discussed (started, stopped, changed, continued).',
              '  • Populate started/stopped/changed arrays with rich objects as defined above.',
              '  • ALWAYS include the name field. Include dose/frequency when spoken.',
              '  • Set display to a concise sentence the app can show. If unsure, reuse the original instruction.',
              '  • Set note to any additional explanation (e.g., reason for change).',
              '  • Set original to the exact transcript text or closest paraphrase.',
              '  • If no medications are covered, return empty arrays.',
              '  • If unsure about the exact medication name, set `needsConfirmation: true`, keep your best-guess `name`, and include the verbatim text in `original`.',
              '  • Use the provided known medication list to correct obvious transcription errors whenever possible.',
              '',
              'Imaging/labs:',
              '  • ONLY include diagnostic tests that were ordered, scheduled, or explicitly recommended during this visit.',
              '  • If prior imaging or lab results were reviewed, mention them in the summary instead but do not add them to the imaging array.',
              '  • If no new orders were made, return an empty array.',
              '',
              'Diagnoses:',
              '  • Include any conditions explicitly stated OR clearly implied (e.g., “blood pressure is still high” ⇒ add “Hypertension”; “cholesterol remains elevated” ⇒ add “Hyperlipidemia”).',
              '  • Use standardized medical terms when possible.',
              '',
              'Next steps: concrete follow-up actions or patient instructions.',
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
            `Known patient medications (use exact spelling when applicable): ${knownMedicationText}`,
            '',
            `Transcript:\n${transcript}`,
            '',
            'Respond with JSON only.',
          ].join('\n'),
        },
      ],
    });

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


