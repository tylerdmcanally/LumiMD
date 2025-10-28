import { Response, NextFunction } from 'express';
import medicalService from '../services/medicalService';
import { AuthenticatedRequest, SuccessResponse } from '../types';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../utils/errors';

/**
 * Medical Profile controller
 */
class MedicalController {
  // ==================== CONDITIONS ====================

  /**
   * List conditions
   * GET /api/medical/conditions
   */
  listConditions = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const includeInactive = req.query.includeInactive === 'true';
      const conditions = await medicalService.listConditions(
        req.userId,
        includeInactive
      );

      const response: SuccessResponse = {
        success: true,
        data: conditions,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Create condition
   * POST /api/medical/conditions
   */
  createCondition = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const condition = await medicalService.createCondition(
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: condition,
        message: 'Condition added successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Update condition
   * PUT /api/medical/conditions/:id
   */
  updateCondition = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const condition = await medicalService.updateCondition(
        id,
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: condition,
        message: 'Condition updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete condition
   * DELETE /api/medical/conditions/:id
   */
  deleteCondition = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      await medicalService.deleteCondition(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Condition deleted successfully',
      };

      res.status(200).json(response);
    }
  );

  // ==================== MEDICATIONS ====================

  /**
   * List medications
   * GET /api/medical/medications
   */
  listMedications = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const includeInactive = req.query.includeInactive === 'true';
      const medications = await medicalService.listMedications(
        req.userId,
        includeInactive
      );

      const response: SuccessResponse = {
        success: true,
        data: medications,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Create medication
   * POST /api/medical/medications
   */
  createMedication = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const medication = await medicalService.createMedication(
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: medication,
        message: 'Medication added successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Update medication
   * PUT /api/medical/medications/:id
   */
  updateMedication = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const medication = await medicalService.updateMedication(
        id,
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: medication,
        message: 'Medication updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete medication
   * DELETE /api/medical/medications/:id
   */
  deleteMedication = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      await medicalService.deleteMedication(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Medication deleted successfully',
      };

      res.status(200).json(response);
    }
  );

  // ==================== ALLERGIES ====================

  /**
   * List allergies
   * GET /api/medical/allergies
   */
  listAllergies = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const allergies = await medicalService.listAllergies(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: allergies,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Create allergy
   * POST /api/medical/allergies
   */
  createAllergy = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const allergy = await medicalService.createAllergy(req.userId, req.body);

      const response: SuccessResponse = {
        success: true,
        data: allergy,
        message: 'Allergy added successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Update allergy
   * PUT /api/medical/allergies/:id
   */
  updateAllergy = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const allergy = await medicalService.updateAllergy(
        id,
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: allergy,
        message: 'Allergy updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete allergy
   * DELETE /api/medical/allergies/:id
   */
  deleteAllergy = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      await medicalService.deleteAllergy(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Allergy deleted successfully',
      };

      res.status(200).json(response);
    }
  );

  // ==================== EMERGENCY CONTACTS ====================

  /**
   * List emergency contacts
   * GET /api/medical/emergency-contacts
   */
  listEmergencyContacts = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const contacts = await medicalService.listEmergencyContacts(req.userId);

      const response: SuccessResponse = {
        success: true,
        data: contacts,
      };

      res.status(200).json(response);
    }
  );

  /**
   * Create emergency contact
   * POST /api/medical/emergency-contacts
   */
  createEmergencyContact = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const contact = await medicalService.createEmergencyContact(
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: contact,
        message: 'Emergency contact added successfully',
      };

      res.status(201).json(response);
    }
  );

  /**
   * Update emergency contact
   * PUT /api/medical/emergency-contacts/:id
   */
  updateEmergencyContact = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      const contact = await medicalService.updateEmergencyContact(
        id,
        req.userId,
        req.body
      );

      const response: SuccessResponse = {
        success: true,
        data: contact,
        message: 'Emergency contact updated successfully',
      };

      res.status(200).json(response);
    }
  );

  /**
   * Delete emergency contact
   * DELETE /api/medical/emergency-contacts/:id
   */
  deleteEmergencyContact = asyncHandler(
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.userId) {
        throw new ValidationError('User ID required');
      }

      const { id } = req.params;
      await medicalService.deleteEmergencyContact(id, req.userId);

      const response: SuccessResponse = {
        success: true,
        data: null,
        message: 'Emergency contact deleted successfully',
      };

      res.status(200).json(response);
    }
  );
}

export default new MedicalController();
