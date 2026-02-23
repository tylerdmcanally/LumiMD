import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { MedicationChangeEntry } from './openai';
import {
  runMedicationSafetyChecks,
  addSafetyWarningsToEntry,
  normalizeMedicationName,
} from './medicationSafety';
import { clearMedicationSafetyCacheForUser } from './medicationSafetyAI';
import {
  FirestoreMedicationSyncRepository,
  MedicationSyncRepository,
} from './repositories';

type MedicationSyncDependencies = {
  medicationSyncRepository?: Pick<
    MedicationSyncRepository,
    | 'create'
    | 'updateById'
    | 'listByUser'
    | 'findByUserAndCanonicalName'
    | 'findByUserAndNameLower'
    | 'listPendingNudgesByMedication'
    | 'listRemindersByMedication'
    | 'createReminder'
    | 'deleteByRefs'
  >;
};

function resolveDependencies(
  overrides: MedicationSyncDependencies = {},
): Required<MedicationSyncDependencies> {
  return {
    medicationSyncRepository:
      overrides.medicationSyncRepository ??
      new FirestoreMedicationSyncRepository(admin.firestore()),
  };
}

/**
 * Map medication frequency string to default reminder times.
 * Returns null if frequency doesn't warrant a reminder (PRN, as needed, etc.)
 */
function getDefaultReminderTimes(frequency?: string | null): string[] | null {
  if (!frequency) return ['08:00']; // Default morning if no frequency specified

  const freq = frequency.toLowerCase().trim();

  // PRN / as needed - no automatic reminder
  if (freq.includes('prn') || freq.includes('as needed') || freq.includes('when needed')) {
    return null;
  }

  // ===== MEALTIME PATTERNS =====
  // "with meals" or "with food" (3x daily at mealtimes)
  if (freq.includes('with meals') || freq.includes('with food') ||
    freq.includes('at meals') || freq.includes('at mealtimes')) {
    return ['08:00', '12:00', '18:00'];
  }

  // Breakfast / morning meal
  if (freq.includes('breakfast') || freq.includes('morning meal') ||
    (freq.includes('morning') && !freq.includes('every morning'))) {
    return ['08:00'];
  }

  // Lunch / midday meal
  if (freq.includes('lunch') || freq.includes('midday') || freq.includes('noon')) {
    return ['12:00'];
  }

  // Dinner / evening meal (but not "bedtime" which is later)
  if (freq.includes('dinner') || freq.includes('supper') ||
    freq.includes('evening meal') || freq.includes('with evening')) {
    return ['18:00'];
  }

  // ===== STANDARD TIME-OF-DAY PATTERNS =====
  // Once daily patterns
  if (freq.includes('once daily') || freq.includes('once a day') || freq.includes('qd') ||
    freq.includes('daily') || freq === 'qday') {
    if (freq.includes('evening') || freq.includes('pm') || freq.includes('night') ||
      freq.includes('bedtime') || freq.includes('hs')) {
      return ['20:00'];
    }
    return ['08:00']; // Default morning for once daily
  }

  // Bedtime / at night (after dinner, before sleep)
  if (freq.includes('bedtime') || freq.includes('at night') ||
    freq.includes('before bed') || freq.includes('hs') || freq.includes('nightly')) {
    return ['21:00'];
  }

  // Twice daily patterns
  if (freq.includes('twice') || freq.includes('bid') || freq.includes('2x') ||
    freq.includes('two times') || freq.includes('every 12')) {
    return ['08:00', '20:00'];
  }

  // Three times daily patterns
  if (freq.includes('three times') || freq.includes('tid') || freq.includes('3x') ||
    freq.includes('every 8')) {
    return ['08:00', '14:00', '20:00'];
  }

  // Four times daily
  if (freq.includes('four times') || freq.includes('qid') || freq.includes('4x') ||
    freq.includes('every 6')) {
    return ['08:00', '12:00', '16:00', '20:00'];
  }

  // Weekly - just one reminder  
  if (freq.includes('weekly') || freq.includes('once a week')) {
    return ['08:00'];
  }

  // Default: single morning reminder
  return ['08:00'];
}

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

    if (typeof entry.needsConfirmation === 'boolean') {
      result.needsConfirmation = entry.needsConfirmation;
    }



    const statusValue =
      typeof entry.status === 'string' ? entry.status.trim().toLowerCase() : undefined;
    if (statusValue === 'matched' || statusValue === 'fuzzy' || statusValue === 'unverified') {
      result.status = statusValue;
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

/**
 * Detect and split multiple medications mentioned together
 * KEEPS slash-notation combos together (e.g., "HCTZ/Lisinopril" stays as ONE - matches pill bottle)
 * SPLITS separate medications (e.g., "Aspirin and Plavix" becomes TWO - two different pill bottles)
 *
 * Examples:
 *   "HCTZ/Lisinopril 12.5/20 mg" -> ONE medication (fixed-dose combo pill)
 *   "Aspirin and Plavix" -> TWO medications (separate pills)
 *   "Tylenol & Ibuprofen" -> TWO medications (separate pills)
 */
const splitComboMedication = (entry: MedicationChangeEntry): MedicationChangeEntry[] => {
  // Don't split if it has slash notation - this indicates a fixed-dose combo (one pill)
  if (/\//.test(entry.name)) {
    return [entry];
  }

  // Don't split if it contains "with" - usually indicates descriptive qualifier or single product
  // Examples: "Vitamin D with K2", "Calcium with Vitamin D"
  if (/ with /i.test(entry.name)) {
    return [entry];
  }

  // Only split on "and", "&", "+" - these indicate truly separate medications (different pills)
  const separatorPatterns = [
    / and /i,
    / & /,
    / \+ /,
  ];

  let matchedPattern: RegExp | null = null;
  for (const pattern of separatorPatterns) {
    if (pattern.test(entry.name)) {
      matchedPattern = pattern;
      break;
    }
  }

  // No separator found, return as single medication
  if (!matchedPattern) {
    return [entry];
  }

  // Split into separate medications
  const parts = entry.name.split(matchedPattern).map(part => part.trim()).filter(Boolean);

  // If only got one part, return original
  if (parts.length <= 1) {
    return [entry];
  }

  // Create separate entries for each medication
  return parts.map(medName => ({
    name: medName,
    dose: entry.dose,
    frequency: entry.frequency,
    note: entry.note,
    display: `${medName} (from: ${entry.display || entry.name})`,
    original: entry.original,
    needsConfirmation: entry.needsConfirmation,
    status: entry.status,
    warning: entry.warning,
  }));
};

// Simple LRU cache for medication lookups
interface CacheEntry {
  doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null;
  timestamp: number;
}

const medicationCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}

function getCachedDoc(
  userId: string,
  key: string
): FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null | undefined {
  const cacheKey = getCacheKey(userId, key);
  const entry = medicationCache.get(cacheKey);

  if (!entry) return undefined;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL) {
    medicationCache.delete(cacheKey);
    return undefined;
  }

  return entry.doc;
}

function setCachedDoc(
  userId: string,
  key: string,
  doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null
): void {
  const cacheKey = getCacheKey(userId, key);

  // Simple LRU: if cache is full, remove oldest entry
  if (medicationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = medicationCache.keys().next().value;
    if (firstKey) medicationCache.delete(firstKey);
  }

  medicationCache.set(cacheKey, {
    doc,
    timestamp: Date.now(),
  });
}

const getMedicationDoc = async (
  userId: string,
  canonicalName: string,
  nameLower: string,
  medicationSyncRepository: Pick<
    MedicationSyncRepository,
    'findByUserAndCanonicalName' | 'findByUserAndNameLower'
  >,
): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null> => {
  // Check cache first for canonical name
  const cachedByCanonical = getCachedDoc(userId, `canonical:${canonicalName}`);
  if (cachedByCanonical !== undefined) {
    return cachedByCanonical;
  }

  // Check cache for name lower
  const cachedByNameLower = getCachedDoc(userId, `nameLower:${nameLower}`);
  if (cachedByNameLower !== undefined) {
    return cachedByNameLower;
  }

  const canonicalDoc = await medicationSyncRepository.findByUserAndCanonicalName(
    userId,
    canonicalName,
  );
  if (canonicalDoc) {
    const doc = canonicalDoc;
    setCachedDoc(userId, `canonical:${canonicalName}`, doc);
    setCachedDoc(userId, `nameLower:${nameLower}`, doc);
    return doc;
  }

  const nameLowerDoc = await medicationSyncRepository.findByUserAndNameLower(
    userId,
    nameLower,
  );
  if (nameLowerDoc) {
    const doc = nameLowerDoc;
    setCachedDoc(userId, `canonical:${canonicalName}`, doc);
    setCachedDoc(userId, `nameLower:${nameLower}`, doc);
    return doc;
  }

  // No match found - cache the null result
  setCachedDoc(userId, `canonical:${canonicalName}`, null);
  setCachedDoc(userId, `nameLower:${nameLower}`, null);
  return null;
};

const upsertMedication = async ({
  userId,
  visitId,
  entry,
  status,
  processedAt,
  dependencies,
}: {
  userId: string;
  visitId: string;
  entry: MedicationChangeEntry;
  status: 'started' | 'stopped' | 'changed';
  processedAt: admin.firestore.Timestamp;
  dependencies: Required<MedicationSyncDependencies>;
}) => {
  const nameLower = entry.name.toLowerCase();
  const canonicalName = normalizeMedicationName(entry.name);
  const existingDoc = await getMedicationDoc(
    userId,
    canonicalName,
    nameLower,
    dependencies.medicationSyncRepository,
  );

  const note = entry.note ?? entry.display ?? entry.original ?? null;
  const display = entry.display ?? (note && note !== entry.note ? note : null);
  const originalText = entry.original ?? display ?? note ?? null;

  const baseData = {
    userId,
    name: entry.name,
    nameLower,
    canonicalName,
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
    medicationStatus: entry.status ?? null,
    medicationWarning: entry.warning ?? null,
  };

  if (existingDoc) {
    const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = { ...baseData };

    if (status === 'started') {
      updates.active = true;
      updates.startedAt = existingDoc.get('startedAt') || processedAt;
      updates.stoppedAt = null;
      // Clear changedAt on restart to avoid confusion
      if (!existingDoc.get('active')) {
        updates.changedAt = null;
      }
    }

    if (status === 'stopped') {
      updates.active = false;
      updates.stoppedAt = processedAt;
      // Ensure startedAt exists when stopping
      if (!existingDoc.get('startedAt')) {
        updates.startedAt = processedAt;
      }

      // Clear pending nudges for stopped medication
      if (existingDoc.get('active') !== false) {
        try {
          const pendingNudges = await dependencies.medicationSyncRepository.listPendingNudgesByMedication(
            userId,
            existingDoc.id,
          );

          if (pendingNudges.length > 0) {
            await dependencies.medicationSyncRepository.deleteByRefs(
              pendingNudges.map((doc) => doc.ref),
            );
            functions.logger.info(
              `[medicationSync] Cleared ${pendingNudges.length} pending nudge(s) for stopped ${entry.name}`
            );
          }
        } catch (nudgeError) {
          functions.logger.error('[medicationSync] Failed to clear nudges for stopped med:', nudgeError);
        }

        // Also delete medication reminders for stopped medication
        try {
          const reminders = await dependencies.medicationSyncRepository.listRemindersByMedication(
            userId,
            existingDoc.id,
          );

          if (reminders.length > 0) {
            await dependencies.medicationSyncRepository.deleteByRefs(
              reminders.map((doc) => doc.ref),
            );
            functions.logger.info(
              `[medicationSync] Deleted ${reminders.length} reminder(s) for stopped ${entry.name}`
            );
          }
        } catch (reminderError) {
          functions.logger.error('[medicationSync] Failed to delete reminders for stopped med:', reminderError);
        }
      }
    }

    if (status === 'changed') {
      updates.active = existingDoc.get('active') ?? true;
      updates.changedAt = processedAt;
      // Ensure medication has been started before it can be changed
      if (!existingDoc.get('startedAt')) {
        updates.startedAt = processedAt;
      }
      // If medication was stopped, clear stoppedAt since it's being changed (reactivated)
      if (!updates.active && existingDoc.get('stoppedAt')) {
        updates.active = true;
        updates.stoppedAt = null;
      }
    }

    updates.needsConfirmation = entry.needsConfirmation ?? false;
    updates.medicationStatus = entry.status ?? null;
    updates.medicationWarning = entry.warning ?? null;

    await dependencies.medicationSyncRepository.updateById(existingDoc.id, updates);

    // For started/changed meds that become active, ensure a reminder exists
    if ((status === 'started' || status === 'changed') && updates.active !== false) {
      try {
        // Check if reminder already exists
        const existingReminder = await dependencies.medicationSyncRepository.listRemindersByMedication(
          userId,
          existingDoc.id,
          { limit: 1 },
        );

        if (existingReminder.length === 0) {
          const defaultTimes = getDefaultReminderTimes(entry.frequency);
          if (defaultTimes) {
            await dependencies.medicationSyncRepository.createReminder({
              userId,
              medicationId: existingDoc.id,
              medicationName: entry.name,
              medicationDose: entry.dose || undefined,
              times: defaultTimes,
              enabled: true,
              createdAt: processedAt,
              updatedAt: processedAt,
            });

            functions.logger.info(
              `[medicationSync] Auto-created reminder for reactivated ${entry.name} with times: ${defaultTimes.join(', ')}`
            );
          }
        } else {
          functions.logger.info(
            `[medicationSync] Reminder already exists for ${entry.name}, skipping auto-create`
          );
        }
      } catch (reminderError) {
        functions.logger.error('[medicationSync] Failed to auto-create reminder for updated med:', reminderError);
      }
    }
    return;
  }

  const newDoc: FirebaseFirestore.DocumentData = {
    ...baseData,
    active: status !== 'stopped',
    createdAt: processedAt,
    startedAt: status === 'stopped' ? null : processedAt,
    stoppedAt: status === 'stopped' ? processedAt : null,
    changedAt: status === 'changed' ? processedAt : null,
  };

  const medicationId = await dependencies.medicationSyncRepository.create(newDoc);

  // Auto-create medication reminder for new active medications
  if (status !== 'stopped') {
    const defaultTimes = getDefaultReminderTimes(entry.frequency);
    if (defaultTimes) {
      try {
        await dependencies.medicationSyncRepository.createReminder({
          userId,
          medicationId,
          medicationName: entry.name,
          medicationDose: entry.dose || undefined,
          times: defaultTimes,
          enabled: true,
          createdAt: processedAt,
          updatedAt: processedAt,
        });

        functions.logger.info(
          `[medicationSync] Auto-created reminder for ${entry.name} with times: ${defaultTimes.join(', ')}`
        );
      } catch (reminderError) {
        // Don't fail medication sync if reminder creation fails
        functions.logger.error('[medicationSync] Failed to auto-create reminder:', reminderError);
      }
    } else {
      functions.logger.info(
        `[medicationSync] Skipped auto-reminder for ${entry.name} - PRN/as-needed frequency`
      );
    }
  }
};

export const syncMedicationsFromSummary = async ({
  userId,
  visitId,
  medications,
  processedAt,
}: SyncMedicationsOptions, dependencyOverrides: MedicationSyncDependencies = {}): Promise<void> => {
  const dependencies = resolveDependencies(dependencyOverrides);
  if (!medications) {
    return;
  }

  const normalized = normalizeMedicationSummary(medications);

  // Warm the cache with all user medications
  const existingMeds = await dependencies.medicationSyncRepository.listByUser(userId);
  existingMeds.forEach((doc) => {
    const data = doc.data();
    const canonical = data?.canonicalName;
    const nameLower = data?.nameLower;

    if (canonical) {
      setCachedDoc(userId, `canonical:${canonical}`, doc);
    }
    if (nameLower) {
      setCachedDoc(userId, `nameLower:${nameLower}`, doc);
    }
  });

  const tasks: Array<Promise<void>> = [];

  // Started medications - run fast hardcoded checks only
  for (const entry of normalized.started) {
    const safetyWarnings = await runMedicationSafetyChecks(userId, entry, { useAI: false });
    const entryWithWarnings = addSafetyWarningsToEntry(entry, safetyWarnings);
    tasks.push(
      upsertMedication({
        userId,
        visitId,
        entry: entryWithWarnings,
        status: 'started',
        processedAt,
        dependencies,
      }),
    );
  }

  // Stopped medications - no checks needed
  normalized.stopped.forEach((entry) => {
    tasks.push(
      upsertMedication({
        userId,
        visitId,
        entry,
        status: 'stopped',
        processedAt,
        dependencies,
      }),
    );
  });

  // Changed medications - run fast hardcoded checks only
  for (const entry of normalized.changed) {
    const safetyWarnings = await runMedicationSafetyChecks(userId, entry, { useAI: false });
    const entryWithWarnings = addSafetyWarningsToEntry(entry, safetyWarnings);
    tasks.push(
      upsertMedication({
        userId,
        visitId,
        entry: entryWithWarnings,
        status: 'changed',
        processedAt,
        dependencies,
      }),
    );
  }

  await Promise.all(tasks);
  await clearMedicationSafetyCacheForUser(userId);
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
        .filter((entry): entry is MedicationChangeEntry => entry !== null)
        .flatMap((entry) => splitComboMedication(entry));

    return {
      started: sanitize(maybeNormalized.started),
      stopped: sanitize(maybeNormalized.stopped),
      changed: sanitize(maybeNormalized.changed),
    };
  }

  const normalize = (entries?: MedicationEntryInput[]) =>
    normalizeMedicationList(entries).flatMap((entry) => splitComboMedication(entry));

  return {
    started: normalize((medications as MedicationSummary).started),
    stopped: normalize((medications as MedicationSummary).stopped),
    changed: normalize((medications as MedicationSummary).changed),
  };
};
