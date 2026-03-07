/**
 * Education content helpers for visit detail.
 * Builds lookup maps from the VisitEducation data so diagnosis/medication
 * education can be rendered inline.
 */

import type { VisitEducation } from '@lumimd/sdk';

export function normalizeEducationKey(name: string): string {
  return name.trim().toLowerCase();
}

export interface DiagnosisEducation {
  summary?: string;
  watchFor?: string;
}

export interface MedicationEducation {
  purpose?: string;
  usage?: string;
  sideEffects?: string;
  whenToCallDoctor?: string;
}

export function buildDiagnosisEducationMap(
  education?: VisitEducation | null,
): Map<string, DiagnosisEducation> {
  const map = new Map<string, DiagnosisEducation>();
  if (!education?.diagnoses) return map;
  for (const entry of education.diagnoses) {
    if (!entry.name) continue;
    const key = normalizeEducationKey(entry.name);
    map.set(key, { summary: entry.summary, watchFor: entry.watchFor });
  }
  return map;
}

export function buildMedicationEducationMap(
  education?: VisitEducation | null,
): Map<string, MedicationEducation> {
  const map = new Map<string, MedicationEducation>();
  if (!education?.medications) return map;
  for (const entry of education.medications) {
    if (!entry.name) continue;
    const key = normalizeEducationKey(entry.name);
    map.set(key, {
      purpose: entry.purpose,
      usage: entry.usage,
      sideEffects: entry.sideEffects,
      whenToCallDoctor: entry.whenToCallDoctor,
    });
  }
  return map;
}
