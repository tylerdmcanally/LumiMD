import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { MedicationChangeEntry } from './openai';
import {
  runMedicationSafetyChecks,
  addSafetyWarningsToEntry,
  normalizeMedicationName,
  cleanWarningsForFirestore,
  computeNeedsConfirmation,
} from './medicationSafety';
import { clearMedicationSafetyCacheForUser } from './medicationSafetyAI';
import {
  FirestoreMedicationSyncRepository,
  MedicationSyncRepository,
} from './repositories';
import {
  resolveReminderTimingPolicy,
  resolveTimezoneOrDefault,
  DEFAULT_REMINDER_TIMEZONE,
} from '../utils/medicationReminderTiming';
import { resolveReminderTimes } from '../utils/frequencyTimes';

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

async function getUserTimezoneForSync(userId: string): Promise<string> {
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    return resolveTimezoneOrDefault(
      userDoc.exists ? userDoc.data()?.timezone : null,
      DEFAULT_REMINDER_TIMEZONE,
    );
  } catch (error) {
    functions.logger.warn(`[medicationSync] Could not fetch timezone for user ${userId}:`, error);
    return DEFAULT_REMINDER_TIMEZONE;
  }
}

// Reminder times resolved via shared utility: utils/frequencyTimes.ts

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
  'and',
  'then',
  'from',
  'on',
  'in',
  'per',
]);

// Dosing-context words that follow "with" in dosing instructions (not combo names)
const DOSING_CONTEXT_WORDS = new Set([
  'food', 'meals', 'water', 'juice', 'milk',
  'breakfast', 'lunch', 'dinner', 'plenty',
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

    // Break on standalone dose numbers (500, 10, 12.5) but keep alphanumeric
    // medication identifiers that start with a digit (5-HTP, 5-ASA, 5-FU)
    if (/^\d/.test(lower)) {
      if (/[a-z]/i.test(sanitized)) {
        // Contains letters — likely a medication identifier like "5-HTP"
        nameTokens.push(sanitized);
        continue;
      }
      break;
    }

    if (VERB_SET.has(lower) || UNIT_REGEX.test(lower)) {
      break;
    }

    // Context-aware "with" handling: break for dosing instructions ("with food")
    // but keep for combo product names ("Vitamin D with K2")
    if (lower === 'with') {
      const nextWord = (words[index + 1] || '').replace(/[.,;:]/g, '').toLowerCase();
      if (DOSING_CONTEXT_WORDS.has(nextWord) || !nextWord) {
        break;
      }
      nameTokens.push(sanitized);
      continue;
    }

    if (STOP_WORDS.has(lower)) {
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

  const results: MedicationChangeEntry[] = [];
  for (const entry of entries) {
    const normalized = normalizeMedicationEntry(entry);
    if (normalized) {
      results.push(normalized);
    } else {
      functions.logger.warn('[medicationSync] Dropped medication entry during normalization', {
        rawEntry: typeof entry === 'object' ? JSON.stringify(entry) : String(entry),
      });
    }
  }
  return results;
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

  // Compute needsConfirmation from safety check results, not GPT output
  const safetyWarnings = Array.isArray(entry.warning) ? entry.warning : [];
  const hasCriticalWarnings = computeNeedsConfirmation(safetyWarnings);
  const cleanedWarnings = safetyWarnings.length > 0 ? cleanWarningsForFirestore(safetyWarnings) : null;

  const baseData = {
    userId,
    name: entry.name,
    nameLower,
    canonicalName,
    dose: entry.dose ?? null,
    frequency: entry.frequency ?? null,
    frequencyCode: entry.frequencyCode ?? null,
    notes: note,
    display,
    originalText,
    source: 'visit' as const,
    sourceVisitId: visitId,
    updatedAt: processedAt,
    lastSyncedAt: processedAt,
    needsConfirmation: hasCriticalWarnings || (entry.needsConfirmation ?? false),
    medicationStatus: hasCriticalWarnings ? 'pending_review' : (entry.status ?? null),
    medicationWarning: cleanedWarnings,
  };

  if (existingDoc) {
    const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
      ...baseData,
      // Clear soft-delete so reactivated/changed meds become visible again
      deletedAt: null,
      deletedBy: null,
    };

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
          const defaultTimes = resolveReminderTimes(entry.frequency, entry.frequencyCode);
          if (defaultTimes) {
            const userTimezone = await getUserTimezoneForSync(userId);
            const timingPolicy = resolveReminderTimingPolicy({
              medicationName: entry.name,
              userTimezone,
            });

            await dependencies.medicationSyncRepository.createReminder({
              userId,
              medicationId: existingDoc.id,
              medicationName: entry.name,
              medicationDose: entry.dose || undefined,
              times: defaultTimes,
              enabled: true,
              timingMode: timingPolicy.timingMode,
              anchorTimezone: timingPolicy.anchorTimezone,
              criticality: timingPolicy.criticality,
              deletedAt: null,
              deletedBy: null,
              createdAt: processedAt,
              updatedAt: processedAt,
            });

            functions.logger.info(
              `[medicationSync] Auto-created reminder for reactivated ${entry.name} with times: ${defaultTimes.join(', ')}`,
              {
                timingMode: timingPolicy.timingMode,
                anchorTimezone: timingPolicy.anchorTimezone,
                criticality: timingPolicy.criticality,
              },
            );
          }
        } else {
          // Re-enable disabled/soft-deleted reminders when medication is reactivated
          const reminderData = existingReminder[0].data();
          if (reminderData.enabled === false || reminderData.deletedAt != null) {
            await existingReminder[0].ref.update({
              enabled: true,
              deletedAt: null,
              medicationName: entry.name,
              medicationDose: entry.dose || null,
              updatedAt: processedAt,
            });
            functions.logger.info(
              `[medicationSync] Re-enabled existing reminder for ${entry.name}`
            );
          } else {
            functions.logger.info(
              `[medicationSync] Reminder already exists and is active for ${entry.name}, skipping`
            );
          }
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
    deletedAt: null,
    deletedBy: null,
  };

  const medicationId = await dependencies.medicationSyncRepository.create(newDoc);

  // Auto-create medication reminder for new active medications
  if (status !== 'stopped') {
    const defaultTimes = resolveReminderTimes(entry.frequency, entry.frequencyCode);
    if (defaultTimes) {
      try {
        const userTimezone = await getUserTimezoneForSync(userId);
        const timingPolicy = resolveReminderTimingPolicy({
          medicationName: entry.name,
          userTimezone,
        });

        await dependencies.medicationSyncRepository.createReminder({
          userId,
          medicationId,
          medicationName: entry.name,
          medicationDose: entry.dose || undefined,
          times: defaultTimes,
          enabled: true,
          timingMode: timingPolicy.timingMode,
          anchorTimezone: timingPolicy.anchorTimezone,
          criticality: timingPolicy.criticality,
          deletedAt: null,
          deletedBy: null,
          createdAt: processedAt,
          updatedAt: processedAt,
        });

        functions.logger.info(
          `[medicationSync] Auto-created reminder for ${entry.name} with times: ${defaultTimes.join(', ')}`,
          {
            timingMode: timingPolicy.timingMode,
            anchorTimezone: timingPolicy.anchorTimezone,
            criticality: timingPolicy.criticality,
          },
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

  // Process all medications sequentially to ensure atomicity.
  // If any upsert fails, we log the error and track it so the caller
  // knows which medications succeeded vs failed — no partial silent state.
  const results: Array<{ name: string; status: string; success: boolean; error?: string }> = [];

  // Started medications — full safety checks (same depth as manual add)
  for (const entry of normalized.started) {
    try {
      const safetyWarnings = await runMedicationSafetyChecks(userId, entry, { useAI: true });
      const entryWithWarnings = addSafetyWarningsToEntry(entry, safetyWarnings);
      await upsertMedication({
        userId,
        visitId,
        entry: entryWithWarnings,
        status: 'started',
        processedAt,
        dependencies,
      });
      results.push({ name: entry.name, status: 'started', success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      functions.logger.error(`[medicationSync] Failed to upsert started medication ${entry.name}:`, error);
      results.push({ name: entry.name, status: 'started', success: false, error: message });
    }
  }

  // Stopped medications — no safety checks needed
  for (const entry of normalized.stopped) {
    try {
      await upsertMedication({
        userId,
        visitId,
        entry,
        status: 'stopped',
        processedAt,
        dependencies,
      });
      results.push({ name: entry.name, status: 'stopped', success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      functions.logger.error(`[medicationSync] Failed to upsert stopped medication ${entry.name}:`, error);
      results.push({ name: entry.name, status: 'stopped', success: false, error: message });
    }
  }

  // Changed medications — full safety checks
  for (const entry of normalized.changed) {
    try {
      const safetyWarnings = await runMedicationSafetyChecks(userId, entry, { useAI: true });
      const entryWithWarnings = addSafetyWarningsToEntry(entry, safetyWarnings);
      await upsertMedication({
        userId,
        visitId,
        entry: entryWithWarnings,
        status: 'changed',
        processedAt,
        dependencies,
      });
      results.push({ name: entry.name, status: 'changed', success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      functions.logger.error(`[medicationSync] Failed to upsert changed medication ${entry.name}:`, error);
      results.push({ name: entry.name, status: 'changed', success: false, error: message });
    }
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    functions.logger.error(
      `[medicationSync] ${failed.length}/${results.length} medications failed to sync for visit ${visitId}`,
      { failed },
    );
  }

  functions.logger.info(
    `[medicationSync] Sync complete for visit ${visitId}: ${results.filter((r) => r.success).length} succeeded, ${failed.length} failed`,
  );

  await clearMedicationSafetyCacheForUser(userId);
};

/**
 * Compute safety-annotated medication changes for user review WITHOUT committing.
 * Runs the same safety checks as syncMedicationsFromSummary but writes results
 * back to the visit document as `pendingMedicationChanges` instead of upserting
 * medication records.
 */
export const computePendingMedicationChanges = async ({
  userId,
  visitId,
  medications,
  processedAt,
}: SyncMedicationsOptions): Promise<void> => {
  if (!medications) {
    return;
  }

  const normalized = normalizeMedicationSummary(medications);
  const hasMedChanges =
    normalized.started.length > 0 ||
    normalized.stopped.length > 0 ||
    normalized.changed.length > 0;

  if (!hasMedChanges) {
    return;
  }

  // Run full safety checks for started medications (same depth as manual add)
  const annotatedStarted: MedicationChangeEntry[] = [];
  for (const entry of normalized.started) {
    const safetyWarnings = await runMedicationSafetyChecks(userId, entry, { useAI: true });
    annotatedStarted.push(addSafetyWarningsToEntry(entry, safetyWarnings));
  }

  // Stopped medications don't need safety checks
  const annotatedStopped = [...normalized.stopped];

  // Run full safety checks for changed medications
  const annotatedChanged: MedicationChangeEntry[] = [];
  for (const entry of normalized.changed) {
    const safetyWarnings = await runMedicationSafetyChecks(userId, entry, { useAI: true });
    annotatedChanged.push(addSafetyWarningsToEntry(entry, safetyWarnings));
  }

  // Write safety-annotated changes to visit document for user review
  const db = admin.firestore();
  await db.collection('visits').doc(visitId).update({
    pendingMedicationChanges: {
      started: annotatedStarted,
      stopped: annotatedStopped,
      changed: annotatedChanged,
    },
  });

  functions.logger.info(
    `[medicationSync] Computed pending medication changes for visit ${visitId}: ` +
    `started=${annotatedStarted.length}, stopped=${annotatedStopped.length}, changed=${annotatedChanged.length}`,
  );
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
