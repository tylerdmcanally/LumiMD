import { Request } from 'express';

/**
 * Type definitions for the LumiMD API
 */

// Extend Express Request to include authenticated user
export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

// API Response types
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    statusCode: number;
    details?: any;
  };
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// User types
export interface UserProfile {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  profilePhoto?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  email: string;
  phone?: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  invitationPin?: string;
}

export interface UpdateUserDTO {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: Date;
  profilePhoto?: string;
}

// Visit types
export interface VisitSummary {
  overview: string;
  keyPoints: string[];
  discussedConditions: string[];
  diagnoses: DiagnosisInfo[];
  medications: MedicationChange[];
  actionItems: ActionItemInfo[];
}

export interface DiagnosisInfo {
  name: string;
  isNew: boolean;
  notes?: string;
}

export interface MedicationChange {
  name: string;
  changeType: 'START' | 'CHANGE' | 'STOP';
  dosage: string;
  instructions: string;
}

export interface ActionItemInfo {
  type: string;
  title: string;
  detail: string;
  dueDate?: Date;
}

export interface CreateVisitDTO {
  providerId: string;
  visitDate: Date;
  visitType: string;
}

export interface UpdateVisitDTO {
  visitDate?: Date;
  visitType?: string;
  transcription?: string;
  summary?: VisitSummary;
  status?: string;
  providerId?: string;
}

// Provider types
export interface CreateProviderDTO {
  name: string;
  specialty: string;
  practice?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export interface UpdateProviderDTO {
  name?: string;
  specialty?: string;
  practice?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

// Medical profile types
export interface CreateConditionDTO {
  name: string;
  diagnosedDate?: Date;
  notes?: string;
}

export interface CreateMedicationDTO {
  name: string;
  dosage: string;
  frequency: string;
  prescribedDate: Date;
  prescribedBy?: string;
  reason?: string;
}

export interface CreateAllergyDTO {
  allergen: string;
  reaction?: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING';
  notes?: string;
}

export interface CreateEmergencyContactDTO {
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  isPrimary?: boolean;
}

// Trusted access types
export interface CreateTrustedAccessDTO {
  trustedUserId: string;
  accessLevel: 'VIEW_ONLY' | 'VIEW_AND_EDIT' | 'FULL_ACCESS';
  relationship: string;
}

export interface UpdateTrustedAccessDTO {
  accessLevel?: 'VIEW_ONLY' | 'VIEW_AND_EDIT' | 'FULL_ACCESS';
}

// Action item types
export interface CreateActionItemDTO {
  visitId: string;
  type: string;
  description: string;
  dueDate?: Date;
}

export interface UpdateActionItemDTO {
  description?: string;
  dueDate?: Date;
  completed?: boolean;
}

// File upload types
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface VisitSubmissionConsent {
  userConsented: boolean;
  additionalPartyConsented?: boolean;
  stateName?: string;
}

export interface VisitSubmissionPayload {
  providerId?: string;
  visitDate?: string;
  visitType?: 'IN_PERSON' | 'TELEHEALTH' | 'ER' | 'URGENT_CARE' | 'PHONE_CALL' | 'OTHER';
  consent: VisitSubmissionConsent;
  location?: {
    latitude: number;
    longitude: number;
  };
}

// AI Service types
export interface TranscriptionResult {
  text: string;
  duration: number;
  language?: string;
}

export interface SummarizationResult {
  summary: VisitSummary;
  entities: ExtractedEntity[];
}

export interface ExtractedEntity {
  type: 'MEDICATION' | 'CONDITION' | 'PROCEDURE' | 'TEST_TREATMENT_PROCEDURE';
  text: string;
  category?: string;
  score?: number;
}

// Background job types
export interface TranscriptionJobData {
  visitId: string;
  audioFileUrl: string;
  userId: string;
}

export interface SummarizationJobData {
  visitId: string;
  transcription: string;
  userId: string;
}

// Audit log types
export interface CreateAuditLogDTO {
  userId?: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}

// Notification types
export interface CreateNotificationDTO {
  userId: string;
  type: string;
  title: string;
  message: string;
  referenceId?: string;
  referenceType?: string;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
