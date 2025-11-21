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
  medications?: MedicationChanges;
  nextSteps?: string[];
  imaging?: string[];
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

