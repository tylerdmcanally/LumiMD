import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import {
  resolveCaregiverEmailDenormalizationUpdate,
  resolveMedicationReminderDenormalizationUpdate,
  resolveOwnerDenormalizationUpdate,
  syncShareCaregiverDenormalizedFields,
  syncMedicationReminderDenormalizedFields,
  syncShareOwnerDenormalizedFields,
} from '../services/denormalizationSync';

const db = () => admin.firestore();
const DENORMALIZATION_SYNC_ENABLED = process.env.DENORMALIZATION_SYNC_ENABLED !== 'false';

export const syncShareOwnerDenormalizationOnUserWrite = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'users/{userId}',
  },
  async (event) => {
    if (!DENORMALIZATION_SYNC_ENABLED) {
      return;
    }

    const userId = event.params.userId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) {
      return;
    }

    const ownerUpdate = resolveOwnerDenormalizationUpdate(before, after);
    const caregiverUpdate = resolveCaregiverEmailDenormalizationUpdate(before, after);
    if (!ownerUpdate && !caregiverUpdate) {
      return;
    }

    try {
      const now = admin.firestore.Timestamp.now();
      if (ownerUpdate) {
        const ownerResult = await syncShareOwnerDenormalizedFields({
          db: db(),
          userId,
          ownerName: ownerUpdate.ownerName,
          ownerEmail: ownerUpdate.ownerEmail,
          now,
        });

        if (ownerResult.updatedShares > 0 || ownerResult.updatedInvites > 0) {
          logger.info('[denormalizationSync] Synced owner fields from user profile update', {
            userId,
            updatedShares: ownerResult.updatedShares,
            updatedInvites: ownerResult.updatedInvites,
          });
        }
      }

      if (caregiverUpdate) {
        const caregiverResult = await syncShareCaregiverDenormalizedFields({
          db: db(),
          userId,
          caregiverEmail: caregiverUpdate.caregiverEmail,
          now,
        });

        if (caregiverResult.updatedShares > 0 || caregiverResult.updatedInvites > 0) {
          logger.info(
            '[denormalizationSync] Synced caregiver email fields from user profile update',
            {
              userId,
              updatedShares: caregiverResult.updatedShares,
              updatedInvites: caregiverResult.updatedInvites,
            },
          );
        }
      }
    } catch (error) {
      logger.error('[denormalizationSync] Failed syncing owner denormalized fields', {
        userId,
        error,
      });
    }
  },
);

export const syncReminderDenormalizationOnMedicationWrite = onDocumentWritten(
  {
    region: 'us-central1',
    document: 'medications/{medicationId}',
  },
  async (event) => {
    if (!DENORMALIZATION_SYNC_ENABLED) {
      return;
    }

    const medicationId = event.params.medicationId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) {
      return;
    }

    const userId = typeof after.userId === 'string' ? after.userId : null;
    if (!userId) {
      return;
    }

    const reminderUpdate = resolveMedicationReminderDenormalizationUpdate(before, after);
    if (!reminderUpdate) {
      return;
    }

    try {
      const now = admin.firestore.Timestamp.now();
      const result = await syncMedicationReminderDenormalizedFields({
        db: db(),
        userId,
        medicationId,
        medicationName: reminderUpdate.medicationName,
        medicationDose: reminderUpdate.medicationDose,
        now,
      });

      if (result.updatedReminders > 0) {
        logger.info('[denormalizationSync] Synced reminder medication fields from medication update', {
          userId,
          medicationId,
          updatedReminders: result.updatedReminders,
        });
      }
    } catch (error) {
      logger.error('[denormalizationSync] Failed syncing reminder denormalized fields', {
        userId,
        medicationId,
        error,
      });
    }
  },
);
