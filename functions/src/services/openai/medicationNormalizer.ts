/**
 * Medication Normalizer
 *
 * Handles normalization and extraction of medication entries
 * from various input formats (strings, objects, LLM output).
 */

import { sanitizeText } from './jsonParser';

/**
 * Entry for a medication change (started, stopped, or changed)
 */
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

/**
 * Extract medication name from a text string containing dose, frequency, etc.
 */
export const extractNameFromMedicationText = (
    text: string
): { name: string; note?: string } => {
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
        /^(?:started|start|starting|initiated|initiating|add|added|adding|begin|began|increase|increased|increasing|decrease|decreased|decreasing|change|changed|changing|titrate|titrated|titrating|switch|switched|switching|restart|restarted|restarting|resume|resumed|resuming|hold|held|holding|stop|stopped|stopping)\s+/i
    );

    let nameSection = cleaned.slice(0, breakIndex).trim();

    if (leadingVerbMatch) {
        nameSection = nameSection.slice(leadingVerbMatch[0].length).trim();
    }

    const name = nameSection || cleaned.split(/\s+/)[0] || 'Unknown medication';
    const note = cleaned === name ? undefined : cleaned;

    return { name, note };
};

/**
 * Normalize a medication entry from various input formats
 */
export const normalizeMedicationEntry = (
    value: unknown
): MedicationChangeEntry | null => {
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
        if (
            statusValue === 'matched' ||
            statusValue === 'fuzzy' ||
            statusValue === 'unverified'
        ) {
            result.status = statusValue;
        }

        return result;
    }

    return null;
};

/**
 * Ensure medications object has proper structure with arrays
 */
export const ensureMedicationsObject = (value: unknown) => {
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
