import { PrismaClient } from '@prisma/client';
import {
  CreateConditionDTO,
  CreateMedicationDTO,
  CreateAllergyDTO,
  CreateEmergencyContactDTO,
} from '../types';
import { NotFoundError } from '../utils/errors';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Medical Profile service
 * Handles conditions, medications, allergies, and emergency contacts
 */
class MedicalService {
  // ==================== CONDITIONS ====================

  /**
   * List all conditions for user
   */
  async listConditions(userId: string, includeInactive = false) {
    try {
      const where: any = { userId };
      if (!includeInactive) {
        where.active = true;
      }

      const conditions = await prisma.condition.findMany({
        where,
        orderBy: { diagnosedDate: 'desc' },
      });

      return conditions;
    } catch (error) {
      logger.error('Failed to list conditions', { error, userId });
      throw error;
    }
  }

  /**
   * Create new condition
   */
  async createCondition(userId: string, data: CreateConditionDTO) {
    try {
      const condition = await prisma.condition.create({
        data: {
          userId,
          name: data.name,
          diagnosedDate: data.diagnosedDate ? new Date(data.diagnosedDate) : null,
          notes: data.notes,
          active: true,
        },
      });

      logger.info('Condition created', { conditionId: condition.id, userId });

      return condition;
    } catch (error) {
      logger.error('Failed to create condition', { error, userId });
      throw error;
    }
  }

  /**
   * Update condition
   */
  async updateCondition(
    conditionId: string,
    userId: string,
    data: Partial<CreateConditionDTO> & { active?: boolean }
  ) {
    try {
      const condition = await prisma.condition.findFirst({
        where: { id: conditionId, userId },
      });

      if (!condition) {
        throw new NotFoundError('Condition not found');
      }

      const updated = await prisma.condition.update({
        where: { id: conditionId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.diagnosedDate && {
            diagnosedDate: new Date(data.diagnosedDate),
          }),
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.active !== undefined && { active: data.active }),
        },
      });

      logger.info('Condition updated', { conditionId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to update condition', { error, conditionId, userId });
      throw error;
    }
  }

  /**
   * Delete condition
   */
  async deleteCondition(conditionId: string, userId: string) {
    try {
      const condition = await prisma.condition.findFirst({
        where: { id: conditionId, userId },
      });

      if (!condition) {
        throw new NotFoundError('Condition not found');
      }

      await prisma.condition.delete({
        where: { id: conditionId },
      });

      logger.info('Condition deleted', { conditionId, userId });
    } catch (error) {
      logger.error('Failed to delete condition', { error, conditionId, userId });
      throw error;
    }
  }

  // ==================== MEDICATIONS ====================

  /**
   * List all medications for user
   */
  async listMedications(userId: string, includeInactive = false) {
    try {
      const where: any = { userId };
      if (!includeInactive) {
        where.active = true;
      }

      const medications = await prisma.medication.findMany({
        where,
        include: {
          reminders: true,
        },
        orderBy: { prescribedDate: 'desc' },
      });

      return medications;
    } catch (error) {
      logger.error('Failed to list medications', { error, userId });
      throw error;
    }
  }

  /**
   * Create new medication
   */
  async createMedication(userId: string, data: CreateMedicationDTO) {
    try {
      const medication = await prisma.medication.create({
        data: {
          userId,
          name: data.name,
          dosage: data.dosage,
          frequency: data.frequency,
          prescribedDate: new Date(data.prescribedDate),
          prescribedBy: data.prescribedBy,
          reason: data.reason,
          active: true,
        },
      });

      logger.info('Medication created', { medicationId: medication.id, userId });

      return medication;
    } catch (error) {
      logger.error('Failed to create medication', { error, userId });
      throw error;
    }
  }

  /**
   * Update medication
   */
  async updateMedication(
    medicationId: string,
    userId: string,
    data: Partial<CreateMedicationDTO> & { active?: boolean }
  ) {
    try {
      const medication = await prisma.medication.findFirst({
        where: { id: medicationId, userId },
      });

      if (!medication) {
        throw new NotFoundError('Medication not found');
      }

      const updated = await prisma.medication.update({
        where: { id: medicationId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.dosage && { dosage: data.dosage }),
          ...(data.frequency && { frequency: data.frequency }),
          ...(data.prescribedDate && {
            prescribedDate: new Date(data.prescribedDate),
          }),
          ...(data.prescribedBy !== undefined && {
            prescribedBy: data.prescribedBy,
          }),
          ...(data.reason !== undefined && { reason: data.reason }),
          ...(data.active !== undefined && { active: data.active }),
        },
        include: {
          reminders: true,
        },
      });

      logger.info('Medication updated', { medicationId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to update medication', {
        error,
        medicationId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete medication
   */
  async deleteMedication(medicationId: string, userId: string) {
    try {
      const medication = await prisma.medication.findFirst({
        where: { id: medicationId, userId },
      });

      if (!medication) {
        throw new NotFoundError('Medication not found');
      }

      await prisma.medication.delete({
        where: { id: medicationId },
      });

      logger.info('Medication deleted', { medicationId, userId });
    } catch (error) {
      logger.error('Failed to delete medication', {
        error,
        medicationId,
        userId,
      });
      throw error;
    }
  }

  // ==================== ALLERGIES ====================

  /**
   * List all allergies for user
   */
  async listAllergies(userId: string) {
    try {
      const allergies = await prisma.allergy.findMany({
        where: { userId },
        orderBy: { severity: 'desc' },
      });

      return allergies;
    } catch (error) {
      logger.error('Failed to list allergies', { error, userId });
      throw error;
    }
  }

  /**
   * Create new allergy
   */
  async createAllergy(userId: string, data: CreateAllergyDTO) {
    try {
      const allergy = await prisma.allergy.create({
        data: {
          userId,
          allergen: data.allergen,
          reaction: data.reaction,
          severity: data.severity as any,
          notes: data.notes,
        },
      });

      logger.info('Allergy created', { allergyId: allergy.id, userId });

      return allergy;
    } catch (error) {
      logger.error('Failed to create allergy', { error, userId });
      throw error;
    }
  }

  /**
   * Update allergy
   */
  async updateAllergy(
    allergyId: string,
    userId: string,
    data: Partial<CreateAllergyDTO>
  ) {
    try {
      const allergy = await prisma.allergy.findFirst({
        where: { id: allergyId, userId },
      });

      if (!allergy) {
        throw new NotFoundError('Allergy not found');
      }

      const updated = await prisma.allergy.update({
        where: { id: allergyId },
        data: {
          ...(data.allergen && { allergen: data.allergen }),
          ...(data.reaction !== undefined && { reaction: data.reaction }),
          ...(data.severity && { severity: data.severity as any }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });

      logger.info('Allergy updated', { allergyId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to update allergy', { error, allergyId, userId });
      throw error;
    }
  }

  /**
   * Delete allergy
   */
  async deleteAllergy(allergyId: string, userId: string) {
    try {
      const allergy = await prisma.allergy.findFirst({
        where: { id: allergyId, userId },
      });

      if (!allergy) {
        throw new NotFoundError('Allergy not found');
      }

      await prisma.allergy.delete({
        where: { id: allergyId },
      });

      logger.info('Allergy deleted', { allergyId, userId });
    } catch (error) {
      logger.error('Failed to delete allergy', { error, allergyId, userId });
      throw error;
    }
  }

  // ==================== EMERGENCY CONTACTS ====================

  /**
   * List all emergency contacts for user
   */
  async listEmergencyContacts(userId: string) {
    try {
      const contacts = await prisma.emergencyContact.findMany({
        where: { userId },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      });

      return contacts;
    } catch (error) {
      logger.error('Failed to list emergency contacts', { error, userId });
      throw error;
    }
  }

  /**
   * Create new emergency contact
   */
  async createEmergencyContact(
    userId: string,
    data: CreateEmergencyContactDTO
  ) {
    try {
      // If this is set as primary, unset all other primary contacts
      if (data.isPrimary) {
        await prisma.emergencyContact.updateMany({
          where: { userId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const contact = await prisma.emergencyContact.create({
        data: {
          userId,
          name: data.name,
          relationship: data.relationship,
          phone: data.phone,
          email: data.email,
          isPrimary: data.isPrimary || false,
        },
      });

      logger.info('Emergency contact created', { contactId: contact.id, userId });

      return contact;
    } catch (error) {
      logger.error('Failed to create emergency contact', { error, userId });
      throw error;
    }
  }

  /**
   * Update emergency contact
   */
  async updateEmergencyContact(
    contactId: string,
    userId: string,
    data: Partial<CreateEmergencyContactDTO>
  ) {
    try {
      const contact = await prisma.emergencyContact.findFirst({
        where: { id: contactId, userId },
      });

      if (!contact) {
        throw new NotFoundError('Emergency contact not found');
      }

      // If setting as primary, unset all other primary contacts
      if (data.isPrimary) {
        await prisma.emergencyContact.updateMany({
          where: { userId, isPrimary: true, NOT: { id: contactId } },
          data: { isPrimary: false },
        });
      }

      const updated = await prisma.emergencyContact.update({
        where: { id: contactId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.relationship && { relationship: data.relationship }),
          ...(data.phone && { phone: data.phone }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.isPrimary !== undefined && { isPrimary: data.isPrimary }),
        },
      });

      logger.info('Emergency contact updated', { contactId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to update emergency contact', {
        error,
        contactId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Delete emergency contact
   */
  async deleteEmergencyContact(contactId: string, userId: string) {
    try {
      const contact = await prisma.emergencyContact.findFirst({
        where: { id: contactId, userId },
      });

      if (!contact) {
        throw new NotFoundError('Emergency contact not found');
      }

      await prisma.emergencyContact.delete({
        where: { id: contactId },
      });

      logger.info('Emergency contact deleted', { contactId, userId });
    } catch (error) {
      logger.error('Failed to delete emergency contact', {
        error,
        contactId,
        userId,
      });
      throw error;
    }
  }
}

export default new MedicalService();
