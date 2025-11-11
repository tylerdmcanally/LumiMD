import * as admin from 'firebase-admin';
import { MedicationChangeEntry } from './openai';

const db = () => admin.firestore();
const getMedicationsCollection = () => db().collection('medications');

type MedicationEntryInput = MedicationChangeEntry | string;

export interface MedicationSummary {
  started?: MedicationEntryInput[];
  stopped?: MedicationEntryInput[];
  changed?: MedicationEntryInput[];
}

export interface NormalizedMedicationSummary {
  started: MedicationChangeEntry[];
  stopped: MedicationChangeEntry[];
  changed: MedicationChangeEntry[];
}

interface SyncMedicationsOptions {
  userId: string;
  visitId: string;
  medications: MedicationSummary | NormalizedMedicationSummary;
  processedAt: admin.firestore.Timestamp;
}

const VERB_WORDS = [
  'started',
  'start',
  'starting',
  'initiated',
  'initiating',
  'add',
  'added',
  'adding',
  'begin',
  'began',
  'increase',
  'increased',
  'increasing',
  'decrease',
  'decreased',
  'decreasing',
  'change',
  'changed',
  'changing',
  'titrate',
  'titrated',
  'titrating',
  'switch',
  'switched',
  'switching',
  'restart',
  'restarted',
  'restarting',
  'resume',
  'resumed',
  'resuming',
  'hold',
  'held',
  'holding',
  'stop',
  'stopped',
  'stopping',
];

const VERB_SET = new Set(VERB_WORDS);

const LEADING_VERB_PATTERN = new RegExp(`^(${VERB_WORDS.join('|')})\\s+`, 'i');

const STOP_WORDS = new Set([
  'to',
  'at',
  'for',
  'with',
  'and',
  'then',
  'from',
  'on',
  'in',
  'per',
]);

const UNIT_REGEX = /(mg|mcg|g|gram|tablet|tab|tabs|capsule|cap|caps|ml|units|iu|dose|bid|tid|qid|daily|weekly|nightly|prn)/i;

const sanitizeWord = (word: string) => word.replace(/[.,;:]/g, '');

const DOSE_REGEX = /(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gram|ml|units?|iu))/i;
const FREQUENCY_REGEX =
  /\b(daily|weekly|nightly|twice daily|three times daily|once daily|every\s+\d+\s*(?:hours|days|weeks)|bid|tid|qid|qod|prn|as needed)\b/i;

const parseLegacyMedicationEntry = (entry: string): MedicationChangeEntry => {
  const original = entry.trim();

  if (!original) {
    return { name: 'Unknown medication', original };
  }

  const withoutVerb = original.replace(LEADING_VERB_PATTERN, '').trim();
  const working = withoutVerb || original;

  const words = working.split(/\s+/);
  const nameTokens: string[] = [];

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const sanitized = sanitizeWord(word);
    if (!sanitized) continue;

    const lower = sanitized.toLowerCase();

    if (/^\d/.test(lower)) {
      break;
    }

    if (STOP_WORDS.has(lower) || VERB_SET.has(lower) || UNIT_REGEX.test(lower)) {
      break;
    }

    nameTokens.push(sanitized);
  }

  const name =
    nameTokens.length > 0
      ? nameTokens.join(' ').trim()
      : sanitizeWord(words[0] || working) || working;

  const detailsText = working.slice(name.length).trim();
  const details = detailsText.length > 0 ? detailsText : null;

  const doseMatch = original.match(DOSE_REGEX);
  const frequencyMatch = original.match(FREQUENCY_REGEX);

  const result: MedicationChangeEntry = {
    name,
    display: original,
    original,
  };

  if (doseMatch) {
    result.dose = doseMatch[0];
  }
  if (frequencyMatch) {
    result.frequency = frequencyMatch[0];
  }
  if (details) {
    result.note = details;
  }

  return result;
};

const normalizeMedicationEntry = (
  entry: MedicationEntryInput,
): MedicationChangeEntry | null => {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) {
      return null;
    }
    return parseLegacyMedicationEntry(trimmed);
  }

  if (typeof entry === 'object') {
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (!name) {
      return null;
    }

    const result: MedicationChangeEntry = { name };

    const doseValue = typeof entry.dose === 'string' ? entry.dose.trim() : '';
    if (doseValue) {
      result.dose = doseValue;
    }

    const frequencyValue = typeof entry.frequency === 'string' ? entry.frequency.trim() : '';
    if (frequencyValue) {
      result.frequency = frequencyValue;
    }

    const noteValue = typeof entry.note === 'string' ? entry.note.trim() : '';
    if (noteValue) {
      result.note = noteValue;
    }

    const displayValue = typeof entry.display === 'string' ? entry.display.trim() : '';
    if (displayValue) {
      result.display = displayValue;
    }

    const originalValue = typeof entry.original === 'string' ? entry.original.trim() : '';
    if (originalValue) {
      result.original = originalValue;
    }

    return result;
  }

  return null;
};

const normalizeMedicationList = (entries?: MedicationEntryInput[]): MedicationChangeEntry[] => {
  if (!entries || !Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizeMedicationEntry(entry))
    .filter((entry): entry is MedicationChangeEntry => entry !== null);
};

const getMedicationDoc = async (
  userId: string,
  nameLower: string,
): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null> => {
  const medsCollection = getMedicationsCollection();

  const exactSnapshot = await medsCollection
    .where('userId', '==', userId)
    .where('nameLower', '==', nameLower)
    .limit(1)
    .get();

  if (!exactSnapshot.empty) {
    return exactSnapshot.docs[0];
  }

  const userSnapshot = await medsCollection.where('userId', '==', userId).limit(25).get();
  const firstToken = nameLower.split(' ')[0];

  for (const doc of userSnapshot.docs) {
    const docNameLower = (doc.get('nameLower') as string | undefined)?.toLowerCase() ?? '';
    if (!docNameLower) continue;

    if (docNameLower === nameLower) {
      return doc;
    }

    if (docNameLower.startsWith(`${firstToken} `) || docNameLower === firstToken) {
      return doc;
    }
  }

  return null;
};

const upsertMedication = async ({
  userId,
  visitId,
  entry,
  status,
  processedAt,
}: {
  userId: string;
  visitId: string;
  entry: MedicationChangeEntry;
  status: 'started' | 'stopped' | 'changed';
  processedAt: admin.firestore.Timestamp;
}) => {
  const nameLower = entry.name.toLowerCase();
  const medsCollection = getMedicationsCollection();
  const existingDoc = await getMedicationDoc(userId, nameLower);

  const note = entry.note ?? entry.display ?? entry.original ?? null;
  const display = entry.display ?? (note && note !== entry.note ? note : null);
  const originalText = entry.original ?? display ?? note ?? null;

  const baseData = {
    userId,
    name: entry.name,
    nameLower,
    dose: entry.dose ?? null,
    frequency: entry.frequency ?? null,
    notes: note,
    display,
    originalText,
    source: 'visit' as const,
    sourceVisitId: visitId,
    updatedAt: processedAt,
    lastSyncedAt: processedAt,
    needsConfirmation: entry.needsConfirmation ?? false,
  };

  if (existingDoc) {
    const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = { ...baseData };

    if (status === 'started') {
      updates.active = true;
      updates.startedAt = existingDoc.get('startedAt') || processedAt;
      updates.stoppedAt = null;
    }

    if (status === 'stopped') {
      updates.active = false;
      updates.stoppedAt = processedAt;
    }

    if (status === 'changed') {
      updates.active = existingDoc.get('active') ?? true;
      updates.changedAt = processedAt;
    }
    updates.needsConfirmation = entry.needsConfirmation ?? false;

    await existingDoc.ref.update(updates);
    return;
  }

  const docRef = medsCollection.doc();

  const newDoc: FirebaseFirestore.DocumentData = {
    ...baseData,
    active: status !== 'stopped',
    createdAt: processedAt,
    startedAt: status === 'stopped' ? null : processedAt,
    stoppedAt: status === 'stopped' ? processedAt : null,
    changedAt: status === 'changed' ? processedAt : null,
  };

  await docRef.set(newDoc);
};

export const syncMedicationsFromSummary = async ({
  userId,
  visitId,
  medications,
  processedAt,
}: SyncMedicationsOptions): Promise<void> => {
  if (!medications) {
    return;
  }

  const normalized = normalizeMedicationSummary(medications);

  const tasks: Array<Promise<void>> = [];

  normalized.started.forEach((entry) => {
    tasks.push(upsertMedication({ userId, visitId, entry, status: 'started', processedAt }));
  });

  normalized.stopped.forEach((entry) => {
    tasks.push(upsertMedication({ userId, visitId, entry, status: 'stopped', processedAt }));
  });

  normalized.changed.forEach((entry) => {
    tasks.push(upsertMedication({ userId, visitId, entry, status: 'changed', processedAt }));
  });

  await Promise.all(tasks);
};

export const normalizeMedicationSummary = (
  medications?: MedicationSummary | NormalizedMedicationSummary,
): NormalizedMedicationSummary => {
  if (!medications) {
    return { started: [], stopped: [], changed: [] };
  }

  const maybeNormalized = medications as NormalizedMedicationSummary;

  const looksNormalized =
    Array.isArray(maybeNormalized.started) &&
    maybeNormalized.started.every((item) => typeof item === 'object' && item !== null && 'name' in item) &&
    Array.isArray(maybeNormalized.stopped) &&
    maybeNormalized.stopped.every((item) => typeof item === 'object' && item !== null && 'name' in item) &&
    Array.isArray(maybeNormalized.changed) &&
    maybeNormalized.changed.every((item) => typeof item === 'object' && item !== null && 'name' in item);

  if (looksNormalized) {
    const sanitize = (entries: MedicationEntryInput[]) =>
      entries
        .map((entry) => normalizeMedicationEntry(entry))
        .filter((entry): entry is MedicationChangeEntry => entry !== null);

    return {
      started: sanitize(maybeNormalized.started),
      stopped: sanitize(maybeNormalized.stopped),
      changed: sanitize(maybeNormalized.changed),
    };
  }

  return {
    started: normalizeMedicationList((medications as MedicationSummary).started),
    stopped: normalizeMedicationList((medications as MedicationSummary).stopped),
    changed: normalizeMedicationList((medications as MedicationSummary).changed),
  };
};


