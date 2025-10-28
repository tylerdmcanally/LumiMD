export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  phoneNumber?: string;
  emergencyContact?: EmergencyContact;
  medicalHistory?: MedicalHistory;
  insurance?: InsuranceInfo;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phoneNumber: string;
}

export interface MedicalHistory {
  allergies: string[];
  medications: Medication[];
  conditions: string[];
  surgeries: Surgery[];
  familyHistory: string[];
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  prescribedBy: string;
  startDate: Date;
  endDate?: Date;
}

export interface Surgery {
  procedure: string;
  date: Date;
  surgeon: string;
  notes?: string;
}

export interface InsuranceInfo {
  provider: string;
  planName: string;
  memberId: string;
  groupNumber?: string;
  copay?: number;
  deductible?: number;
  deductibleMet?: number;
}

export interface TriageRecommendation {
  level: 'emergency' | 'urgent_care' | 'primary_care' | 'telehealth' | 'self_care';
  confidence: number; // 0-1 scale
  reasoning: string[];
  redFlags: string[];
  timeframe: string;
  instructions: string[];
  followUpRecommended: boolean;
}

export interface Provider {
  id: string;
  name: string;
  specialty: string;
  credentials: string[];
  rating: number;
  reviewCount: number;
  location: Location;
  contact: ContactInfo;
  availability: AvailabilitySlot[];
  acceptedInsurance: string[];
  languages: string[];
  isInNetwork: boolean;
  estimatedCost?: number;
}

export interface Location {
  address: string;
  city: string;
  state: string;
  zipCode: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  distance?: number; // in miles
}

export interface ContactInfo {
  phone: string;
  email?: string;
  website?: string;
  fax?: string;
}

export interface AvailabilitySlot {
  date: Date;
  time: string;
  duration: number; // in minutes
  appointmentType: 'in_person' | 'telehealth' | 'phone';
}

export interface Appointment {
  id: string;
  userId: string;
  providerId: string;
  type: 'primary_care' | 'urgent_care' | 'specialist' | 'telehealth';
  date: Date;
  time: string;
  duration: number;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  reason: string;
  preparedQuestions: string[];
  notes?: string;
  recording?: AppointmentRecording;
  summary?: AppointmentSummary;
  followUp?: FollowUpTasks;
}

export interface AppointmentRecording {
  id: string;
  appointmentId: string;
  audioUrl: string;
  duration: number;
  consentGiven: boolean;
  consentTimestamp: Date;
  transcript?: string;
  isEncrypted: boolean;
}

export interface AppointmentSummary {
  id: string;
  appointmentId: string;
  keyPoints: string[];
  diagnosis?: string[];
  prescriptions: Prescription[];
  testOrders: TestOrder[];
  followUpInstructions: string[];
  nextAppointment?: Date;
  generatedAt: Date;
  reviewedByProvider: boolean;
}

export interface Prescription {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  refills: number;
  pharmacy?: string;
}

export interface TestOrder {
  testType: string;
  lab: string;
  instructions: string;
  deadline: Date;
  fasting: boolean;
}

export interface FollowUpTasks {
  medications: {
    pickup: boolean;
    pharmacyLocation?: string;
    readyDate?: Date;
  };
  appointments: {
    scheduled: boolean;
    provider?: string;
    suggestedDate?: Date;
    reason?: string;
  };
  tests: {
    scheduled: boolean;
    testType?: string;
    location?: string;
    date?: Date;
  };
  lifestyle: string[];
  monitoring: string[];
}

export interface AIConversation {
  id: string;
  userId: string;
  messages: AIMessage[];
  context: 'symptom_assessment' | 'question_builder' | 'appointment_prep' | 'follow_up';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    confidence?: number;
    citations?: string[];
    disclaimers?: string[];
  };
}

export interface InsuranceVerification {
  memberId: string;
  isActive: boolean;
  planDetails: {
    planName: string;
    planType: string;
    effectiveDate: Date;
    terminationDate?: Date;
  };
  benefits: {
    primaryCare: BenefitDetails;
    urgentCare: BenefitDetails;
    emergency: BenefitDetails;
    specialist: BenefitDetails;
    prescription: BenefitDetails;
    preventive: BenefitDetails;
  };
  deductible: {
    individual: number;
    family: number;
    met: number;
    remaining: number;
  };
  outOfPocketMax: {
    individual: number;
    family: number;
    met: number;
    remaining: number;
  };
  verifiedAt: Date;
}

export interface BenefitDetails {
  copay?: number;
  coinsurance?: number;
  deductibleApplies: boolean;
  coverageLevel: 'covered' | 'not_covered' | 'requires_auth';
  notes?: string;
}

export interface MedicalDisclaimer {
  id: string;
  version: string;
  title: string;
  content: string;
  effectiveDate: Date;
  sections: DisclaimerSection[];
  requiresConsent: boolean;
}

export interface DisclaimerSection {
  title: string;
  content: string;
  type: 'warning' | 'limitation' | 'liability' | 'privacy' | 'emergency';
}
