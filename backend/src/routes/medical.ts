import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import medicalController from '../controllers/medicalController';
import {
  validate,
  createConditionSchema,
  createMedicationSchema,
  createAllergySchema,
  createEmergencyContactSchema,
} from '../middleware/validate';

const router = Router();

/**
 * Medical profile routes
 * All routes require authentication
 */

// ==================== CONDITIONS ====================

router.get(
  '/conditions',
  authenticate,
  medicalController.listConditions
);

router.post(
  '/conditions',
  authenticate,
  validate(createConditionSchema),
  medicalController.createCondition
);

router.put(
  '/conditions/:id',
  authenticate,
  medicalController.updateCondition
);

router.delete(
  '/conditions/:id',
  authenticate,
  medicalController.deleteCondition
);

// ==================== MEDICATIONS ====================

router.get(
  '/medications',
  authenticate,
  medicalController.listMedications
);

router.post(
  '/medications',
  authenticate,
  validate(createMedicationSchema),
  medicalController.createMedication
);

router.put(
  '/medications/:id',
  authenticate,
  medicalController.updateMedication
);

router.delete(
  '/medications/:id',
  authenticate,
  medicalController.deleteMedication
);

// ==================== ALLERGIES ====================

router.get(
  '/allergies',
  authenticate,
  medicalController.listAllergies
);

router.post(
  '/allergies',
  authenticate,
  validate(createAllergySchema),
  medicalController.createAllergy
);

router.put(
  '/allergies/:id',
  authenticate,
  medicalController.updateAllergy
);

router.delete(
  '/allergies/:id',
  authenticate,
  medicalController.deleteAllergy
);

// ==================== EMERGENCY CONTACTS ====================

router.get(
  '/emergency-contacts',
  authenticate,
  medicalController.listEmergencyContacts
);

router.post(
  '/emergency-contacts',
  authenticate,
  validate(createEmergencyContactSchema),
  medicalController.createEmergencyContact
);

router.put(
  '/emergency-contacts/:id',
  authenticate,
  medicalController.updateEmergencyContact
);

router.delete(
  '/emergency-contacts/:id',
  authenticate,
  medicalController.deleteEmergencyContact
);

export default router;
