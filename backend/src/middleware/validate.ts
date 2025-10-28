import { NextFunction, Request, Response } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../utils/errors';

/**
 * Validation middleware using Zod schemas
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return next(
          new ValidationError(
            `Validation failed: ${errorMessages.map((e) => e.message).join(', ')}`
          )
        );
      }

      next(error);
    }
  };
};

/**
 * Validation schemas for common requests
 */

// Auth schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format',
  }),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// User profile schemas
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  dateOfBirth: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format',
    })
    .optional(),
  profilePhoto: z.string().url().optional(),
});

// Provider schemas
export const createProviderSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  specialty: z.string().min(1, 'Specialty is required'),
  practice: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

export const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  practice: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

// Visit schemas
export const createVisitSchema = z.object({
  providerId: z.string().uuid('Invalid provider ID'),
  visitDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format',
  }),
  visitType: z.enum([
    'IN_PERSON',
    'TELEHEALTH',
    'ER',
    'URGENT_CARE',
    'PHONE_CALL',
    'OTHER',
  ]),
});

// Medical profile schemas
export const createConditionSchema = z.object({
  name: z.string().min(1, 'Condition name is required'),
  diagnosedDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format',
    })
    .optional(),
  notes: z.string().optional(),
});

export const createMedicationSchema = z.object({
  name: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  prescribedDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format',
  }),
  prescribedBy: z.string().optional(),
  reason: z.string().optional(),
});

export const createAllergySchema = z.object({
  allergen: z.string().min(1, 'Allergen is required'),
  reaction: z.string().optional(),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'LIFE_THREATENING']),
  notes: z.string().optional(),
});

export const createEmergencyContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email('Invalid email address').optional(),
  isPrimary: z.boolean().optional(),
});

// Trusted access schemas
export const createTrustedAccessSchema = z.object({
  trustedUserEmail: z.string().email('Invalid email address'),
  accessLevel: z.enum(['VIEW_ONLY', 'VIEW_AND_EDIT', 'FULL_ACCESS']),
  relationship: z.string().min(1, 'Relationship is required'),
});

export const updateTrustedAccessSchema = z.object({
  accessLevel: z.enum(['VIEW_ONLY', 'VIEW_AND_EDIT', 'FULL_ACCESS']),
});

// Action item schemas
export const createActionItemSchema = z.object({
  visitId: z.string().uuid('Invalid visit ID').optional(),
  type: z.enum([
    'FOLLOW_UP_APPOINTMENT',
    'LAB_WORK',
    'IMAGING',
    'MEDICATION_START',
    'MEDICATION_CHANGE',
    'MEDICATION_STOP',
    'SPECIALIST_REFERRAL',
    'OTHER',
  ]),
  description: z.string().min(1, 'Description is required'),
  dueDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format',
    })
    .optional(),
});

export const updateActionItemSchema = z.object({
  description: z.string().min(1).optional(),
  dueDate: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format',
    })
    .optional(),
  completed: z.boolean().optional(),
});
