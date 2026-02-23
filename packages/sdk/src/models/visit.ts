/**
 * Visit Model
 */

export interface Visit {
  id: string;
  userId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  processedAt?: string | null;
  provider?: string | null;
  location?: string | null;
  specialty?: string | null;
  status?: string;
  processingStatus?: string;
  summary?: string | null;
  transcript?: string | null;
  transcriptText?: string | null;
  notes?: string | null;
  visitDate?: string | null;
  diagnoses?: string[];
  diagnosesDetailed?: DiagnosisDetail[];
  medications?: MedicationChanges;
  nextSteps?: string[];
  followUps?: FollowUpItem[];
  imaging?: string[];
  testsOrdered?: OrderedTestItem[];
  medicationReview?: MedicationReviewSummary;
  extractionVersion?: VisitExtractionVersion;
  promptMeta?: VisitPromptMeta;
  tags?: string[];
  folders?: string[];
  education?: VisitEducation;
  audioUrl?: string | null;
  duration?: number | null;
  [key: string]: unknown;
}

export interface MedicationChanges {
  started?: MedicationEntry[];
  stopped?: MedicationEntry[];
  changed?: MedicationEntry[];
}

export interface MedicationEntry {
  name: string;
  dose?: string;
  frequency?: string;
  note?: string;
  display?: string;
  original?: string;
  needsConfirmation?: boolean;
  status?: 'matched' | 'fuzzy' | 'unverified';
  warning?: MedicationWarning[];
}

export interface MedicationWarning {
  type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
  severity: 'critical' | 'high' | 'moderate' | 'low';
  message: string;
  details: string;
  recommendation: string;
  conflictingMedication?: string;
  allergen?: string;
}

export interface VisitEducation {
  diagnoses?: Array<{
    name: string;
    summary?: string;
    watchFor?: string;
  }>;
  medications?: Array<{
    name: string;
    purpose?: string;
    usage?: string;
    sideEffects?: string;
    whenToCallDoctor?: string;
  }>;
}

export type VisitExtractionVersion = 'v1_legacy' | 'v2_structured';
export type ExtractionConfidence = 'high' | 'medium' | 'low';
export type OrderedTestCategory =
  | 'imaging'
  | 'lab'
  | 'cardiac'
  | 'pulmonary'
  | 'gi'
  | 'procedure'
  | 'other';
export type FollowUpCategory =
  | 'clinic_follow_up'
  | 'return_to_clinic'
  | 'nurse_visit'
  | 'lab_draw'
  | 'imaging_appointment'
  | 'stress_test'
  | 'cardiac_testing'
  | 'specialist_referral'
  | 'medication_review'
  | 'contact_clinic'
  | 'procedure'
  | 'other';

export interface DiagnosisDetail {
  name: string;
  status?: 'new' | 'chronic' | 'resolved' | 'suspected' | 'history';
  confidence?: ExtractionConfidence;
  evidence?: string;
}

export interface OrderedTestItem {
  name: string;
  category: OrderedTestCategory;
  status?: 'ordered' | 'recommended' | 'scheduled';
  timeframe?: string;
  reason?: string;
  evidence?: string;
  confidence?: ExtractionConfidence;
}

export interface FollowUpItem {
  type: FollowUpCategory;
  task: string;
  timeframe?: string;
  dueAt?: string;
  details?: string;
  evidence?: string;
  confidence?: ExtractionConfidence;
}

export interface MedicationReviewSummary {
  reviewed: boolean;
  continued?: MedicationEntry[];
  continuedReviewed?: MedicationEntry[];
  adherenceConcerns?: string[];
  reviewConcerns?: string[];
  sideEffectsDiscussed?: string[];
  followUpNeeded?: boolean;
  notes?: string[];
}

export interface VisitPromptMeta {
  promptVersion: string;
  schemaVersion: string;
  responseFormat: 'json_object';
  model: string;
  latencyMs?: number;
  extractionLatencyMs?: number;
  summaryLatencyMs?: number;
  validationWarnings?: string[];
  fallbackUsed?: boolean;
}
