import axios, { AxiosInstance } from 'axios';
import * as functions from 'firebase-functions';
import { openAIConfig } from '../config';
import { CANONICAL_MEDICATIONS } from './medicationSafety';
import { withRetry } from '../utils/retryUtils';
import { validateTopLevelSchema } from './openai/jsonParser';
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SCHEMA_VERSION,
  EXTRACTION_STAGE_SCHEMA,
  LEGACY_PROMPT_VERSION,
  LEGACY_STAGE_SCHEMA,
  SUMMARY_PROMPT_VERSION,
  SUMMARY_STAGE_SCHEMA,
  VISIT_PROMPT_VERSION,
  buildExtractionStageMessages,
  buildLegacyStageMessages,
  buildSummaryStageMessages,
  type PromptMessage,
} from './openai/visitPromptRegistry';

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
  }>;
}

export type VisitExtractionVersion = 'v1_legacy' | 'v2_structured';
export type ExtractionConfidence = 'high' | 'medium' | 'low';
export type OrderedTestCategory =
  | 'imaging'
  | 'lab'
  | 'cardiac'
  | 'pulmonary'
  | 'gi'
  | 'procedure'
  | 'other';
export type FollowUpCategory =
  | 'clinic_follow_up'
  | 'return_to_clinic'
  | 'nurse_visit'
  | 'lab_draw'
  | 'imaging_appointment'
  | 'stress_test'
  | 'cardiac_testing'
  | 'specialist_referral'
  | 'medication_review'
  | 'contact_clinic'
  | 'procedure'
  | 'other';

export interface DiagnosisDetail {
  name: string;
  status?: 'new' | 'chronic' | 'resolved' | 'suspected' | 'history';
  confidence?: ExtractionConfidence;
  evidence?: string;
}

export interface OrderedTestItem {
  name: string;
  category: OrderedTestCategory;
  status?: 'ordered' | 'recommended' | 'scheduled';
  timeframe?: string;
  reason?: string;
  evidence?: string;
  confidence?: ExtractionConfidence;
}

export interface FollowUpItem {
  type: FollowUpCategory;
  task: string;
  timeframe?: string;
  dueAt?: string;
  details?: string;
  evidence?: string;
  confidence?: ExtractionConfidence;
}

export interface MedicationReviewSummary {
  reviewed: boolean;
  continued: MedicationChangeEntry[];
  continuedReviewed: MedicationChangeEntry[];
  adherenceConcerns: string[];
  reviewConcerns: string[];
  sideEffectsDiscussed: string[];
  followUpNeeded: boolean;
  notes: string[];
}

export interface VisitPromptMeta {
  promptVersion: string;
  schemaVersion: string;
  responseFormat: 'json_object';
  model: string;
  latencyMs?: number;
  extractionLatencyMs?: number;
  summaryLatencyMs?: number;
  validationWarnings?: string[];
  fallbackUsed?: boolean;
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
  diagnosesDetailed?: DiagnosisDetail[];
  medications: {
    started: MedicationChangeEntry[];
    stopped: MedicationChangeEntry[];
    changed: MedicationChangeEntry[];
  };
  imaging: string[];
  testsOrdered?: OrderedTestItem[];
  nextSteps: string[];
  followUps?: FollowUpItem[];
  medicationReview?: MedicationReviewSummary;
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
  extractionVersion?: VisitExtractionVersion;
  promptMeta?: VisitPromptMeta;
}

interface StructuredVisitExtraction {
  diagnoses: string[];
  diagnosesDetailed: DiagnosisDetail[];
  medications: VisitSummaryResult['medications'];
  imaging: string[];
  testsOrdered: OrderedTestItem[];
  followUps: FollowUpItem[];
  medicationReview: MedicationReviewSummary;
  extractionVersion: VisitExtractionVersion;
  validationWarnings: string[];
  latencyMs: number;
}

interface SummaryStageOutput {
  summary: string;
  nextSteps: string[];
  education: VisitSummaryResult['education'];
  validationWarnings: string[];
  latencyMs: number;
}

const defaultSummaryResult = (model = 'unknown'): VisitSummaryResult => ({
  summary: '',
  diagnoses: [],
  diagnosesDetailed: [],
  medications: {
    started: [],
    stopped: [],
    changed: [],
  },
  imaging: [],
  testsOrdered: [],
  nextSteps: [],
  followUps: [],
  medicationReview: {
    reviewed: false,
    continued: [],
    continuedReviewed: [],
    adherenceConcerns: [],
    reviewConcerns: [],
    sideEffectsDiscussed: [],
    followUpNeeded: false,
    notes: [],
  },
  education: {
    diagnoses: [],
    medications: [],
  },
  extractionVersion: 'v1_legacy',
  promptMeta: {
    promptVersion: VISIT_PROMPT_VERSION,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    responseFormat: 'json_object',
    model,
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

const FOLLOW_UP_TYPE_FALLBACK_LABELS: Record<FollowUpCategory, string> = {
  clinic_follow_up: 'Clinic follow up',
  return_to_clinic: 'Return to clinic',
  nurse_visit: 'Nurse visit',
  lab_draw: 'Lab draw',
  imaging_appointment: 'Imaging appointment',
  stress_test: 'Stress test',
  cardiac_testing: 'Cardiac testing',
  specialist_referral: 'Specialist referral',
  medication_review: 'Medication review',
  contact_clinic: 'Contact clinic',
  procedure: 'Procedure',
  other: 'Other task',
};

const ensureExtractionConfidence = (value: unknown): ExtractionConfidence | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }
  return undefined;
};

const ensureExtractionVersion = (value: unknown): VisitExtractionVersion => {
  if (typeof value !== 'string') return 'v1_legacy';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'v2_structured') {
    return 'v2_structured';
  }
  return 'v1_legacy';
};

const ensureOrderedTestCategory = (value: unknown): OrderedTestCategory => {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'imaging':
    case 'lab':
    case 'cardiac':
    case 'pulmonary':
    case 'gi':
    case 'procedure':
    case 'other':
      return normalized;
    default:
      return 'other';
  }
};

const ensureFollowUpCategory = (value: unknown): FollowUpCategory => {
  if (typeof value !== 'string') return 'other';
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'clinic_follow_up':
    case 'return_to_clinic':
    case 'nurse_visit':
    case 'lab_draw':
    case 'imaging_appointment':
    case 'stress_test':
    case 'cardiac_testing':
    case 'specialist_referral':
    case 'medication_review':
    case 'contact_clinic':
    case 'procedure':
    case 'other':
      return normalized;
    default:
      return 'other';
  }
};

const normalizeIsoDateString = (value: unknown): string | undefined => {
  const raw = sanitizeText(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const ensureDiagnosesDetailed = (value: unknown): DiagnosisDetail[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const details: DiagnosisDetail[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const name = sanitizeText(record.name);
    if (!name) return;

    const statusRaw = sanitizeText(record.status)?.toLowerCase();
    const status =
      statusRaw === 'new' ||
      statusRaw === 'chronic' ||
      statusRaw === 'resolved' ||
      statusRaw === 'suspected' ||
      statusRaw === 'history'
        ? statusRaw
        : undefined;
    const confidence = ensureExtractionConfidence(record.confidence);
    const evidence = sanitizeText(record.evidence);

    const result: DiagnosisDetail = { name };
    if (status) {
      result.status = status;
    }
    if (confidence) {
      result.confidence = confidence;
    }
    if (evidence) {
      result.evidence = evidence;
    }

    details.push(result);
  });

  return details;
};

const ensureTestsOrdered = (value: unknown): OrderedTestItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const tests: OrderedTestItem[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const name = sanitizeText(record.name);
    if (!name) return;

    const statusRaw = sanitizeText(record.status)?.toLowerCase();
    const status =
      statusRaw === 'ordered' || statusRaw === 'recommended' || statusRaw === 'scheduled'
        ? statusRaw
        : undefined;
    const category = ensureOrderedTestCategory(record.category);
    const timeframe = sanitizeText(record.timeframe);
    const reason = sanitizeText(record.reason);
    const evidence = sanitizeText(record.evidence);
    const confidence = ensureExtractionConfidence(record.confidence);

    const result: OrderedTestItem = {
      name,
      category,
    };
    if (status) {
      result.status = status;
    }
    if (timeframe) {
      result.timeframe = timeframe;
    }
    if (reason) {
      result.reason = reason;
    }
    if (evidence) {
      result.evidence = evidence;
    }
    if (confidence) {
      result.confidence = confidence;
    }
    tests.push(result);
  });

  return tests;
};

const ensureFollowUps = (value: unknown): FollowUpItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const followUps: FollowUpItem[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const record = item as Record<string, unknown>;
    const type = ensureFollowUpCategory(record.type);
    const task = sanitizeText(record.task) || FOLLOW_UP_TYPE_FALLBACK_LABELS[type];
    const timeframe = sanitizeText(record.timeframe);
    const dueAt = normalizeIsoDateString(record.dueAt);
    const details = sanitizeText(record.details);
    const evidence = sanitizeText(record.evidence);
    const confidence = ensureExtractionConfidence(record.confidence);

    const result: FollowUpItem = {
      type,
      task,
    };
    if (timeframe) {
      result.timeframe = timeframe;
    }
    if (dueAt) {
      result.dueAt = dueAt;
    }
    if (details) {
      result.details = details;
    }
    if (evidence) {
      result.evidence = evidence;
    }
    if (confidence) {
      result.confidence = confidence;
    }
    followUps.push(result);
  });

  return followUps;
};

const formatFollowUpForLegacyNextStep = (item: FollowUpItem): string => {
  const label = item.task || FOLLOW_UP_TYPE_FALLBACK_LABELS[item.type] || 'Follow up';

  if (item.timeframe) {
    return `${label} — ${item.timeframe}`;
  }

  if (item.dueAt) {
    const dueDateLabel = item.dueAt.slice(0, 10);
    return `${label} — by ${dueDateLabel}`;
  }

  return label;
};

const deriveLegacyDiagnoses = (
  diagnoses: string[],
  diagnosesDetailed: DiagnosisDetail[],
): string[] => {
  if (diagnoses.length > 0) {
    return diagnoses;
  }
  return diagnosesDetailed.map((item) => item.name).filter(Boolean);
};

const deriveLegacyImaging = (imaging: string[], testsOrdered: OrderedTestItem[]): string[] => {
  if (imaging.length > 0) {
    return imaging;
  }
  return testsOrdered.map((item) => item.name).filter(Boolean);
};

const deriveLegacyNextSteps = (nextSteps: string[], followUps: FollowUpItem[]): string[] => {
  if (nextSteps.length > 0) {
    return nextSteps;
  }
  return followUps.map((item) => formatFollowUpForLegacyNextStep(item)).filter(Boolean);
};

interface ShadowFieldDiff {
  splitCount: number;
  legacyCount: number;
  missingInSplit: string[];
  extraInSplit: string[];
}

interface ShadowComparisonReport {
  diagnoses: ShadowFieldDiff;
  medicationsStarted: ShadowFieldDiff;
  medicationsStopped: ShadowFieldDiff;
  medicationsChanged: ShadowFieldDiff;
  followUps: ShadowFieldDiff;
}

const normalizeComparisonValue = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const dedupeNormalizedValues = (values: string[]): string[] => {
  const seen = new Set<string>();
  const deduped: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeComparisonValue(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    deduped.push(normalized);
  });

  return deduped;
};

const compareValueSets = (
  splitValues: string[],
  legacyValues: string[],
  maxItems = 10,
): ShadowFieldDiff => {
  const normalizedSplit = dedupeNormalizedValues(splitValues);
  const normalizedLegacy = dedupeNormalizedValues(legacyValues);
  const splitSet = new Set(normalizedSplit);
  const legacySet = new Set(normalizedLegacy);

  const missingInSplit = normalizedLegacy
    .filter((value) => !splitSet.has(value))
    .slice(0, maxItems);
  const extraInSplit = normalizedSplit
    .filter((value) => !legacySet.has(value))
    .slice(0, maxItems);

  return {
    splitCount: normalizedSplit.length,
    legacyCount: normalizedLegacy.length,
    missingInSplit,
    extraInSplit,
  };
};

const extractMedicationNames = (entries: MedicationChangeEntry[]): string[] =>
  entries
    .map((entry) => sanitizeText(entry.name))
    .filter((value): value is string => Boolean(value));

const extractFollowUpLabels = (result: VisitSummaryResult): string[] => {
  if (Array.isArray(result.followUps) && result.followUps.length > 0) {
    return result.followUps
      .map((item) => sanitizeText(item.task) ?? sanitizeText(item.type))
      .filter((value): value is string => Boolean(value));
  }
  return deriveLegacyNextSteps(result.nextSteps, []);
};

const buildShadowComparisonReport = (
  splitResult: VisitSummaryResult,
  legacyResult: VisitSummaryResult,
): ShadowComparisonReport => {
  return {
    diagnoses: compareValueSets(splitResult.diagnoses, legacyResult.diagnoses),
    medicationsStarted: compareValueSets(
      extractMedicationNames(splitResult.medications.started),
      extractMedicationNames(legacyResult.medications.started),
    ),
    medicationsStopped: compareValueSets(
      extractMedicationNames(splitResult.medications.stopped),
      extractMedicationNames(legacyResult.medications.stopped),
    ),
    medicationsChanged: compareValueSets(
      extractMedicationNames(splitResult.medications.changed),
      extractMedicationNames(legacyResult.medications.changed),
    ),
    followUps: compareValueSets(
      extractFollowUpLabels(splitResult),
      extractFollowUpLabels(legacyResult),
    ),
  };
};

const ensurePromptMeta = (
  value: unknown,
  model: string,
  defaultPromptVersion = VISIT_PROMPT_VERSION,
): VisitPromptMeta => {
  if (!value || typeof value !== 'object') {
    return {
      promptVersion: defaultPromptVersion,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      responseFormat: 'json_object',
      model,
    };
  }

  const record = value as Record<string, unknown>;
  const promptVersion = sanitizeText(record.promptVersion) || defaultPromptVersion;
  const schemaVersion = sanitizeText(record.schemaVersion) || EXTRACTION_SCHEMA_VERSION;
  const modelName = sanitizeText(record.model) || model;
  const latencyMs =
    typeof record.latencyMs === 'number' && Number.isFinite(record.latencyMs)
      ? record.latencyMs
      : undefined;
  const extractionLatencyMs =
    typeof record.extractionLatencyMs === 'number' && Number.isFinite(record.extractionLatencyMs)
      ? record.extractionLatencyMs
      : undefined;
  const summaryLatencyMs =
    typeof record.summaryLatencyMs === 'number' && Number.isFinite(record.summaryLatencyMs)
      ? record.summaryLatencyMs
      : undefined;
  const validationWarnings = Array.isArray(record.validationWarnings)
    ? record.validationWarnings
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
    : undefined;
  const fallbackUsed =
    typeof record.fallbackUsed === 'boolean' ? record.fallbackUsed : undefined;

  const result: VisitPromptMeta = {
    promptVersion,
    schemaVersion,
    responseFormat: 'json_object',
    model: modelName,
  };

  if (typeof latencyMs === 'number') {
    result.latencyMs = latencyMs;
  }
  if (typeof extractionLatencyMs === 'number') {
    result.extractionLatencyMs = extractionLatencyMs;
  }
  if (typeof summaryLatencyMs === 'number') {
    result.summaryLatencyMs = summaryLatencyMs;
  }
  if (validationWarnings && validationWarnings.length > 0) {
    result.validationWarnings = validationWarnings;
  }
  if (typeof fallbackUsed === 'boolean') {
    result.fallbackUsed = fallbackUsed;
  }

  return result;
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

  // Strip trailing numeric dose fragments accidentally captured before unit break tokens.
  nameSection = nameSection
    .replace(/\b\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*\s*$/g, '')
    .trim();

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

const ensureMedicationReviewObject = (value: unknown): MedicationReviewSummary => {
  const empty: MedicationReviewSummary = {
    reviewed: false,
    continued: [],
    continuedReviewed: [],
    adherenceConcerns: [],
    reviewConcerns: [],
    sideEffectsDiscussed: [],
    followUpNeeded: false,
    notes: [],
  };

  if (!value || typeof value !== 'object') {
    return empty;
  }

  const record = value as Record<string, unknown>;
  const normalizeMedicationArray = (entries: unknown): MedicationChangeEntry[] =>
    Array.isArray(entries)
      ? entries
      .map((entry) => normalizeMedicationEntry(entry))
      .filter((entry): entry is MedicationChangeEntry => entry !== null)
      : [];

  const continued = normalizeMedicationArray(record.continued);
  const continuedReviewedRaw = normalizeMedicationArray(record.continuedReviewed);

  const mergeUniqueMedicationList = (
    primary: MedicationChangeEntry[],
    secondary: MedicationChangeEntry[],
  ): MedicationChangeEntry[] => {
    const seen = new Set<string>();
    const merged: MedicationChangeEntry[] = [];

    const append = (entry: MedicationChangeEntry) => {
      const signature = [
        normalizeDrugName(entry.name),
        sanitizeText(entry.dose) || '',
        sanitizeText(entry.frequency) || '',
      ].join('|');
      if (seen.has(signature)) {
        return;
      }
      seen.add(signature);
      merged.push(entry);
    };

    primary.forEach(append);
    secondary.forEach(append);

    return merged;
  };

  const continuedReviewed = mergeUniqueMedicationList(continuedReviewedRaw, continued);
  const mergedContinued = mergeUniqueMedicationList(continued, continuedReviewedRaw);

  const adherenceConcerns = ensureArrayOfStrings(record.adherenceConcerns);
  const reviewConcernsRaw = ensureArrayOfStrings(record.reviewConcerns);
  const reviewConcerns = Array.from(
    new Set([...reviewConcernsRaw, ...adherenceConcerns]),
  );
  const sideEffectsDiscussed = ensureArrayOfStrings(record.sideEffectsDiscussed);
  const notes = ensureArrayOfStrings(record.notes);
  const followUpNeeded =
    typeof record.followUpNeeded === 'boolean' ? record.followUpNeeded : false;

  const hasReviewSignal =
    mergedContinued.length > 0 ||
    continuedReviewed.length > 0 ||
    adherenceConcerns.length > 0 ||
    reviewConcerns.length > 0 ||
    sideEffectsDiscussed.length > 0 ||
    notes.length > 0;

  return {
    reviewed:
      typeof record.reviewed === 'boolean'
        ? record.reviewed
        : hasReviewSignal,
    continued: mergedContinued,
    continuedReviewed,
    adherenceConcerns,
    reviewConcerns,
    sideEffectsDiscussed,
    followUpNeeded,
    notes,
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

const shouldRetryOpenAIRequest = (error: any): boolean => {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    // Retry on rate limits (429) and server errors (5xx)
    return status === 429 || (!!status && status >= 500);
  }
  // Retry on transient network failures
  if (error instanceof Error) {
    return (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ENOTFOUND')
    );
  }
  return false;
};

export class OpenAIService {
  private client: AxiosInstance;
  private model: string;
  private shadowCompareEnabled: boolean;
  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    this.model = model || 'gpt-4.1-mini';
    this.shadowCompareEnabled = openAIConfig.visitShadowCompare;

    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  private async requestJsonCompletion(
    messages: PromptMessage[],
    temperature = 0.2,
  ): Promise<{ content: string; latencyMs: number }> {
    const requestStartedAt = Date.now();
    const response = await withRetry(
      async () =>
        await this.client.post('/chat/completions', {
          model: this.model,
          store: false, // HIPAA COMPLIANCE: Zero data retention - data deleted immediately after response
          temperature,
          response_format: { type: 'json_object' },
          messages,
        }),
      {
        shouldRetry: shouldRetryOpenAIRequest,
      },
    );

    const latencyMs = Date.now() - requestStartedAt;
    const content = response.data?.choices?.[0]?.message?.content?.trim() ?? '';

    return { content, latencyMs };
  }

  private async runExtractionStage(
    transcript: string,
    knownMedicationList: string[],
  ): Promise<StructuredVisitExtraction> {
    const knownMedicationText = formatMedicationReferenceList(knownMedicationList);
    const extractionResponse = await this.requestJsonCompletion(
      buildExtractionStageMessages({
        knownMedicationText,
        canonicalGlossaryText: CANONICAL_GLOSSARY_TEXT,
        transcript,
      }),
    );

    if (!extractionResponse.content) {
      throw new Error('Extraction stage returned empty content');
    }

    const rawJson = extractJsonBlock(extractionResponse.content);

    try {
      const parsed = JSON.parse(rawJson);
      const { record, warnings, isValidObject } = validateTopLevelSchema(
        parsed,
        EXTRACTION_STAGE_SCHEMA,
      );

      if (!isValidObject || !record) {
        throw new Error('Extraction payload is not a valid JSON object');
      }

      const validationWarnings = warnings.map((warning) => warning.message);
      if (validationWarnings.length > 0) {
        functions.logger.warn('[OpenAI] Extraction stage schema warnings', {
          promptVersion: EXTRACTION_PROMPT_VERSION,
          warnings: validationWarnings,
          latencyMs: extractionResponse.latencyMs,
        });
      }

      const medications = ensureMedicationsObject(record.medications);
      const diagnosesDetailed = ensureDiagnosesDetailed(record.diagnosesDetailed);
      const testsOrdered = ensureTestsOrdered(record.testsOrdered);
      const followUps = ensureFollowUps(record.followUps);
      const medicationReview = ensureMedicationReviewObject(record.medicationReview);

      const diagnoses = deriveLegacyDiagnoses(
        ensureArrayOfStrings(record.diagnoses),
        diagnosesDetailed,
      );
      const imaging = deriveLegacyImaging(
        ensureArrayOfStrings(record.imaging),
        testsOrdered,
      );

      const hasStructuredV2Content =
        diagnosesDetailed.length > 0 ||
        testsOrdered.length > 0 ||
        followUps.length > 0 ||
        medicationReview.reviewed ||
        medicationReview.continued.length > 0 ||
        medicationReview.followUpNeeded;
      const extractionVersionRaw = ensureExtractionVersion(record.extractionVersion);
      const extractionVersion: VisitExtractionVersion =
        extractionVersionRaw === 'v1_legacy' && hasStructuredV2Content
          ? 'v2_structured'
          : extractionVersionRaw;

      functions.logger.info('[OpenAI] Extraction field metrics', {
        promptVersion: EXTRACTION_PROMPT_VERSION,
        latencyMs: extractionResponse.latencyMs,
        diagnosisCount: diagnoses.length,
        diagnosisDetailedCount: diagnosesDetailed.length,
        startedMedicationCount: medications.started.length,
        stoppedMedicationCount: medications.stopped.length,
        changedMedicationCount: medications.changed.length,
        testsOrderedCount: testsOrdered.length,
        followUpCount: followUps.length,
        followUpsWithDueAtCount: followUps.filter((item) => !!item.dueAt).length,
        reviewContinuedCount: medicationReview.continued.length,
        reviewConcernCount: medicationReview.reviewConcerns.length,
      });

      return {
        diagnoses,
        diagnosesDetailed,
        medications,
        imaging,
        testsOrdered,
        followUps,
        medicationReview,
        extractionVersion,
        validationWarnings,
        latencyMs: extractionResponse.latencyMs,
      };
    } catch (error) {
      functions.logger.error('[OpenAI] Failed to parse extraction stage JSON response', error, {
        content: extractionResponse.content,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        latencyMs: extractionResponse.latencyMs,
      });
      throw new Error('OpenAI extraction stage returned an invalid JSON response');
    }
  }

  private async runSummaryStage(
    extraction: StructuredVisitExtraction,
  ): Promise<SummaryStageOutput> {
    const extractionInputForSummary = {
      diagnoses: extraction.diagnoses,
      diagnosesDetailed: extraction.diagnosesDetailed,
      medications: extraction.medications,
      imaging: extraction.imaging,
      testsOrdered: extraction.testsOrdered,
      followUps: extraction.followUps,
      medicationReview: extraction.medicationReview,
      extractionVersion: extraction.extractionVersion,
    };

    const summaryResponse = await this.requestJsonCompletion(
      buildSummaryStageMessages(extractionInputForSummary),
    );

    if (!summaryResponse.content) {
      throw new Error('Summary stage returned empty content');
    }

    const rawJson = extractJsonBlock(summaryResponse.content);

    try {
      const parsed = JSON.parse(rawJson);
      const { record, warnings, isValidObject } = validateTopLevelSchema(
        parsed,
        SUMMARY_STAGE_SCHEMA,
      );
      if (!isValidObject || !record) {
        throw new Error('Summary payload is not a valid JSON object');
      }

      const validationWarnings = warnings.map((warning) => warning.message);
      if (validationWarnings.length > 0) {
        functions.logger.warn('[OpenAI] Summary stage schema warnings', {
          promptVersion: SUMMARY_PROMPT_VERSION,
          warnings: validationWarnings,
          latencyMs: summaryResponse.latencyMs,
        });
      }

      return {
        summary: typeof record.summary === 'string' ? record.summary.trim() : '',
        nextSteps: ensureArrayOfStrings(record.nextSteps),
        education: ensureEducationObject(record.education),
        validationWarnings,
        latencyMs: summaryResponse.latencyMs,
      };
    } catch (error) {
      functions.logger.error('[OpenAI] Failed to parse summary stage JSON response', error, {
        content: summaryResponse.content,
        promptVersion: SUMMARY_PROMPT_VERSION,
        latencyMs: summaryResponse.latencyMs,
      });
      throw new Error('OpenAI summary stage returned an invalid JSON response');
    }
  }

  private async runShadowComparison(
    transcript: string,
    knownMedicationList: string[],
    splitResult: VisitSummaryResult,
  ): Promise<void> {
    try {
      const legacyResult = await this.summarizeTranscriptLegacy(
        transcript,
        { knownMedications: knownMedicationList },
        { fallbackUsed: false },
      );
      const comparison = buildShadowComparisonReport(splitResult, legacyResult);
      functions.logger.info('[OpenAI][ShadowCompare] Split vs legacy comparison', {
        promptVersion: VISIT_PROMPT_VERSION,
        comparison,
      });
    } catch (error) {
      functions.logger.warn('[OpenAI][ShadowCompare] Comparison run failed', {
        error: error instanceof Error ? error.message : String(error),
        promptVersion: VISIT_PROMPT_VERSION,
      });
    }
  }

  async summarizeTranscript(
    transcript: string,
    options?: { knownMedications?: string[] },
  ): Promise<VisitSummaryResult> {
    if (!transcript || !transcript.trim()) {
      throw new Error('Transcript is required for summarization');
    }

    const sanitizedTranscript = transcript.trim();
    const knownMedicationList = Array.isArray(options?.knownMedications)
      ? options!.knownMedications.filter(
        (name) => typeof name === 'string' && name.trim().length > 0,
      )
      : [];

    try {
      const extraction = await this.runExtractionStage(
        sanitizedTranscript,
        knownMedicationList,
      );

      let summaryStage: SummaryStageOutput;
      try {
        summaryStage = await this.runSummaryStage(extraction);
      } catch (error) {
        functions.logger.warn(
          '[OpenAI] Summary stage failed. Continuing with extraction-only salvage output.',
          {
            error: error instanceof Error ? error.message : String(error),
            promptVersion: SUMMARY_PROMPT_VERSION,
          },
        );
        summaryStage = {
          summary: '',
          nextSteps: [],
          education: {
            diagnoses: [],
            medications: [],
          },
          validationWarnings: ['Summary stage failed; returned extraction-only payload.'],
          latencyMs: 0,
        };
      }

      const refinedMedications = refineMedicationsWithKnownNames(
        extraction.medications,
        knownMedicationList,
      );
      const validationWarnings = [
        ...extraction.validationWarnings,
        ...summaryStage.validationWarnings,
      ];
      if (validationWarnings.length > 0) {
        functions.logger.warn('[OpenAI] Split pipeline validation warnings', {
          promptVersion: VISIT_PROMPT_VERSION,
          warnings: validationWarnings,
          extractionLatencyMs: extraction.latencyMs,
          summaryLatencyMs: summaryStage.latencyMs,
        });
      }

      const promptMeta: VisitPromptMeta = {
        ...ensurePromptMeta(
          undefined,
          this.model,
          VISIT_PROMPT_VERSION,
        ),
        extractionLatencyMs: extraction.latencyMs,
        summaryLatencyMs: summaryStage.latencyMs,
        latencyMs: extraction.latencyMs + summaryStage.latencyMs,
        fallbackUsed: false,
      };
      if (validationWarnings.length > 0) {
        promptMeta.validationWarnings = validationWarnings;
      }

      const result: VisitSummaryResult = {
        summary: summaryStage.summary,
        diagnoses: extraction.diagnoses,
        diagnosesDetailed: extraction.diagnosesDetailed,
        medications: refinedMedications,
        imaging: extraction.imaging,
        testsOrdered: extraction.testsOrdered,
        nextSteps: deriveLegacyNextSteps(summaryStage.nextSteps, extraction.followUps),
        followUps: extraction.followUps,
        medicationReview: extraction.medicationReview,
        education: summaryStage.education,
        extractionVersion: extraction.extractionVersion,
        promptMeta,
      };

      if (this.shadowCompareEnabled) {
        await this.runShadowComparison(
          sanitizedTranscript,
          knownMedicationList,
          result,
        );
      }

      return result;
    } catch (error) {
      functions.logger.warn(
        '[OpenAI] Split prompt pipeline failed. Falling back to legacy monolithic prompt.',
        {
          error: error instanceof Error ? error.message : String(error),
          promptVersion: VISIT_PROMPT_VERSION,
        },
      );
      return this.summarizeTranscriptLegacy(sanitizedTranscript, {
        knownMedications: knownMedicationList,
      }, {
        fallbackUsed: true,
      });
    }
  }

  private async summarizeTranscriptLegacy(
    transcript: string,
    options?: { knownMedications?: string[] },
    context?: { fallbackUsed?: boolean },
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

    const legacyResponse = await this.requestJsonCompletion(
      buildLegacyStageMessages({
        knownMedicationText,
        canonicalGlossaryText: CANONICAL_GLOSSARY_TEXT,
        transcript,
      }),
    );

    if (!legacyResponse.content) {
      return {
        ...defaultSummaryResult(this.model),
        promptMeta: {
          ...ensurePromptMeta(undefined, this.model, LEGACY_PROMPT_VERSION),
          latencyMs: legacyResponse.latencyMs,
          fallbackUsed: context?.fallbackUsed ?? false,
        },
      };
    }

    const rawJson = extractJsonBlock(legacyResponse.content);

    try {
      const parsed = JSON.parse(rawJson);
      const { record, warnings, isValidObject } = validateTopLevelSchema(
        parsed,
        LEGACY_STAGE_SCHEMA,
      );
      if (!isValidObject || !record) {
        throw new Error('Legacy payload is not a valid JSON object');
      }

      const validationWarnings = warnings.map((warning) => warning.message);
      if (validationWarnings.length > 0) {
        functions.logger.warn('[OpenAI] Legacy schema warnings', {
          promptVersion: LEGACY_PROMPT_VERSION,
          warnings: validationWarnings,
          latencyMs: legacyResponse.latencyMs,
        });
      }

      const medications = ensureMedicationsObject(record.medications);
      const refinedMedications = refineMedicationsWithKnownNames(
        medications,
        knownMedicationList,
      );
      const diagnosesDetailed = ensureDiagnosesDetailed(record.diagnosesDetailed);
      const testsOrdered = ensureTestsOrdered(record.testsOrdered);
      const followUps = ensureFollowUps(record.followUps);
      const medicationReview = ensureMedicationReviewObject(record.medicationReview);

      const diagnoses = deriveLegacyDiagnoses(
        ensureArrayOfStrings(record.diagnoses),
        diagnosesDetailed,
      );
      const imaging = deriveLegacyImaging(
        ensureArrayOfStrings(record.imaging),
        testsOrdered,
      );
      const nextSteps = deriveLegacyNextSteps(
        ensureArrayOfStrings(record.nextSteps),
        followUps,
      );

      const hasStructuredV2Content =
        diagnosesDetailed.length > 0 ||
        testsOrdered.length > 0 ||
        followUps.length > 0 ||
        medicationReview.reviewed ||
        medicationReview.continued.length > 0 ||
        medicationReview.followUpNeeded;
      const extractionVersionRaw = ensureExtractionVersion(record.extractionVersion);
      const extractionVersion: VisitExtractionVersion =
        extractionVersionRaw === 'v1_legacy' && hasStructuredV2Content
          ? 'v2_structured'
          : extractionVersionRaw;

      return {
        summary: typeof record.summary === 'string' ? record.summary.trim() : '',
        diagnoses,
        diagnosesDetailed,
        medications: refinedMedications,
        imaging,
        testsOrdered,
        nextSteps,
        followUps,
        medicationReview,
        education: ensureEducationObject(record.education),
        extractionVersion,
        promptMeta: {
          ...ensurePromptMeta(record.promptMeta, this.model, LEGACY_PROMPT_VERSION),
          latencyMs: legacyResponse.latencyMs,
          fallbackUsed: context?.fallbackUsed ?? false,
          validationWarnings:
            validationWarnings.length > 0 ? validationWarnings : undefined,
        },
      };
    } catch (error) {
      functions.logger.error('[OpenAI] Failed to parse JSON response', error, {
        content: legacyResponse.content,
        latencyMs: legacyResponse.latencyMs,
      });
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
