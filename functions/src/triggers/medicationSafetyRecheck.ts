import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  buildSafetyCheckHash,
  fetchActiveMedicationsForUser,
  formatWarningsForFirestore,
  runMedicationSafetyChecks,
} from '../services/medicationSafety';

const db = () => admin.firestore();
const RECHECK_ENABLED = process.env.MED_SAFETY_RECHECK_ENABLED !== 'false';

const normalizeAllergyList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.toLowerCase().trim() : ''))
    .filter(Boolean)
    .sort();
};

const hasRelevantMedicationChange = (
  before?: FirebaseFirestore.DocumentData,
  after?: FirebaseFirestore.DocumentData
): boolean => {
  if (!before || !after) {
    return true;
  }
  const fields: Array<keyof FirebaseFirestore.DocumentData> = [
    'name',
    'dose',
    'frequency',
    'notes',
    'active',
    'deleted',
    'archived',
    'stoppedAt',
  ];
  return fields.some((field) => before[field] !== after[field]);
};

const buildMedicationUpdate = (warnings: ReturnType<typeof formatWarningsForFirestore>) => {
  const hasCritical = warnings.some((warning) => {
    const severity = (warning as { severity?: string }).severity;
    return severity === 'critical' || severity === 'high';
  });
  return {
    medicationWarning: warnings.length > 0 ? warnings : null,
    needsConfirmation: hasCritical,
  };
};

const computeSafetyHash = async (
  userId: string,
  medicationId: string,
  medicationData: FirebaseFirestore.DocumentData
): Promise<string> => {
  const currentMedications = await fetchActiveMedicationsForUser(userId, {
    excludeMedicationId: medicationId,
    excludeCanonicalName: medicationData.canonicalName,
  });

  const userDoc = await db().collection('users').doc(userId).get();
  const allergies = userDoc.exists ? (userDoc.data()?.allergies || []) : [];

  return buildSafetyCheckHash({
    medication: {
      name: medicationData.name,
      dose: medicationData.dose,
      frequency: medicationData.frequency,
      notes: medicationData.notes,
      canonicalName: medicationData.canonicalName,
    },
    currentMedications,
    allergies,
  });
};

const recheckMedicationSafety = async (
  medicationId: string,
  medicationData: FirebaseFirestore.DocumentData
): Promise<void> => {
  const userId = medicationData.userId;
  if (!userId) return;
  if (!medicationData.active || medicationData.deleted || medicationData.archived) return;

  const safetyHash = await computeSafetyHash(userId, medicationId, medicationData);
  if (medicationData.lastSafetyCheckHash === safetyHash) {
    return;
  }

  const warnings = await runMedicationSafetyChecks(
    userId,
    {
      name: medicationData.name,
      dose: medicationData.dose,
      frequency: medicationData.frequency,
      note: medicationData.notes,
    },
    { useAI: true, excludeMedicationId: medicationId }
  );

  const cleanedWarnings = formatWarningsForFirestore(warnings);
  const updates = {
    ...buildMedicationUpdate(cleanedWarnings),
    lastSafetyCheckAt: admin.firestore.Timestamp.now(),
    lastSafetyCheckHash: safetyHash,
  };

  await db().collection('medications').doc(medicationId).update(updates);
};

export const medicationSafetyRecheckOnMedicationWrite = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'medications/{medicationId}',
  },
  async (event) => {
    if (!RECHECK_ENABLED) return;

    const medicationId = event.params.medicationId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!after) return;
    if (!hasRelevantMedicationChange(before, after)) return;

    if (!before && after.lastSafetyCheckHash && after.lastSafetyCheckAt) {
      return;
    }

    try {
      await recheckMedicationSafety(medicationId, after);
    } catch (error) {
      logger.error('[medicationSafetyRecheck] Medication write recheck failed:', error);
    }
  }
);

export const medicationSafetyRecheckOnUserWrite = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'users/{userId}',
  },
  async (event) => {
    if (!RECHECK_ENABLED) return;

    const userId = event.params.userId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const beforeAllergies = normalizeAllergyList(before?.allergies);
    const afterAllergies = normalizeAllergyList(after?.allergies);
    const allergiesChanged =
      beforeAllergies.length !== afterAllergies.length ||
      beforeAllergies.some((value, index) => value !== afterAllergies[index]);

    if (!allergiesChanged) {
      return;
    }

    try {
      const medications = await fetchActiveMedicationsForUser(userId);
      const now = admin.firestore.Timestamp.now();
      let batch = db().batch();
      let batchCount = 0;

      for (const medication of medications) {
        const safetyHash = buildSafetyCheckHash({
          medication: {
            name: medication.name,
            dose: medication.dose,
            frequency: medication.frequency,
            notes: medication.notes,
            canonicalName: medication.canonicalName,
          },
          currentMedications: medications.filter((med) => med.id !== medication.id),
          allergies: afterAllergies,
        });

        const warnings = await runMedicationSafetyChecks(
          userId,
          {
            name: medication.name,
            dose: medication.dose,
            frequency: medication.frequency,
            note: medication.notes,
          },
          { useAI: true, excludeMedicationId: medication.id }
        );

        const cleanedWarnings = formatWarningsForFirestore(warnings);
        const updates = {
          ...buildMedicationUpdate(cleanedWarnings),
          lastSafetyCheckAt: now,
          lastSafetyCheckHash: safetyHash,
        };

        batch.update(db().collection('medications').doc(medication.id), updates);
        batchCount += 1;
        if (batchCount >= 450) {
          await batch.commit();
          batch = db().batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }
    } catch (error) {
      logger.error('[medicationSafetyRecheck] User allergy recheck failed:', error);
    }
  }
);
