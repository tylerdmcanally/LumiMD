import { Router } from 'express';
import * as admin from 'firebase-admin';
import { registerMedicationCoreRoutes } from './medications/core';
import { createMedicationRouteHelpers } from './medications/helpers';
import { registerMedicationLifecycleRoutes } from './medications/lifecycle';
import { registerMedicationQueryRoutes } from './medications/query';
import { registerMedicationScheduleRoutes } from './medications/schedule';
import { createDomainServiceContainer } from '../services/domain/serviceContainer';

export const medicationsRouter = Router();

// Getter function to access Firestore after initialization
const getDb = () => admin.firestore();
const MEDICATION_NAME_MAX_LENGTH = 200;
const MEDICATION_DOSE_MAX_LENGTH = 120;
const MEDICATION_FREQUENCY_MAX_LENGTH = 200;
const MEDICATION_NOTES_MAX_LENGTH = 5000;
const MEDICATIONS_PAGE_SIZE_DEFAULT = 50;
const MEDICATIONS_PAGE_SIZE_MAX = 100;

const medicationRouteHelpers = createMedicationRouteHelpers(getDb);
const getMedicationDomainService = () => createDomainServiceContainer({ db: getDb() }).medicationService;

registerMedicationQueryRoutes(medicationsRouter, {
  getMedicationDomainService,
  pageSizeDefault: MEDICATIONS_PAGE_SIZE_DEFAULT,
  pageSizeMax: MEDICATIONS_PAGE_SIZE_MAX,
});

registerMedicationCoreRoutes(medicationsRouter, {
  getMedicationDomainService,
  getDefaultReminderTimes: medicationRouteHelpers.getDefaultReminderTimes,
  getUserTimezone: medicationRouteHelpers.getUserTimezone,
  medicationNameMaxLength: MEDICATION_NAME_MAX_LENGTH,
  medicationDoseMaxLength: MEDICATION_DOSE_MAX_LENGTH,
  medicationFrequencyMaxLength: MEDICATION_FREQUENCY_MAX_LENGTH,
  medicationNotesMaxLength: MEDICATION_NOTES_MAX_LENGTH,
});

registerMedicationLifecycleRoutes(medicationsRouter, {
  getMedicationDomainService,
});

registerMedicationScheduleRoutes(medicationsRouter, {
  getDb,
  getUserTimezone: medicationRouteHelpers.getUserTimezone,
  getDayBoundariesInTimezone: medicationRouteHelpers.getDayBoundariesInTimezone,
  normalizeReminderTimes: medicationRouteHelpers.normalizeReminderTimes,
  buildDoseKey: medicationRouteHelpers.buildDoseKey,
  getLogTimestampMillis: medicationRouteHelpers.getLogTimestampMillis,
  getLogDateStringInTimezone: medicationRouteHelpers.getLogDateStringInTimezone,
  getTodayCompletionLogMap: medicationRouteHelpers.getTodayCompletionLogMap,
  upsertDoseCompletionLog: medicationRouteHelpers.upsertDoseCompletionLog,
});
