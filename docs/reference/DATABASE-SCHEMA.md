# Firestore Database Schema

> Complete reference of all Firestore collections and their document structures.

**Last Updated:** January 2026

---

## Collections Overview

| Collection | Purpose | Access |
|------------|---------|--------|
| `users` | User profiles and preferences | Owner only |
| `visits` | Medical visit records with summaries | Owner + caregivers |
| `medications` | Active and historical medications | Owner + caregivers |
| `medicationReminders` | Scheduled reminder times | Owner only |
| `actions` | Follow-up tasks and action items | Owner + caregivers |
| `nudges` | AI-generated health check-ins | Owner only |
| `healthLogs` | Symptom/vitals tracking entries | Owner only |
| `shares` | Caregiver sharing relationships | Owner + caregiver |

---

## Collection Details

### `users/{userId}`

User profile and preferences. The `userId` matches the Firebase Auth UID.

```typescript
interface User {
  // Identity
  email: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  
  // Medical profile
  dateOfBirth?: string;           // ISO date string
  allergies?: string[];           // List of known allergies
  medicalHistory?: string[];      // Conditions, surgeries, etc.
  
  // Preferences
  timezone?: string;              // IANA timezone, e.g., "America/New_York"
  
  // Recording consent settings
  stateCode?: string;             // US state code, e.g., "CA"
  stateSource?: 'location' | 'manual'; // How state was determined
  stateUpdatedAt?: Timestamp;     // When state was last updated
  skipOnePartyReminder?: boolean; // User opted out of educational prompt
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollection:** `users/{userId}/pushTokens/{tokenId}`
```typescript
interface PushToken {
  token: string;                  // Expo push token
  platform: 'ios' | 'android';
  timezone?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### `visits/{visitId}`

Medical visit records with audio, transcripts, and AI-generated summaries.

```typescript
interface Visit {
  // Ownership
  userId: string;
  
  // Basic info
  title: string;                  // e.g., "Cardiology Follow-up"
  date: Timestamp;                // Visit date
  providerName?: string;
  specialty?: string;
  
  // Processing status
  status: 'pending' | 'transcribing' | 'processing' | 'completed' | 'failed';
  error?: string;                 // Error message if failed
  
  // Audio/Transcript
  audioUrl?: string;              // Firebase Storage URL
  audioPath?: string;             // Storage path
  transcript?: string;            // Full transcription text
  
  // AI Summary
  summary?: VisitSummary;
  
  // Recording consent (audit trail)
  consentAcknowledged?: boolean;  // User confirmed provider consent
  consentAcknowledgedAt?: string; // ISO timestamp
  recordingStateCode?: string;    // US state at time of recording
  twoPartyConsentRequired?: boolean; // Was consent legally required
  consentFlowVersion?: string;    // Version of consent UI shown
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  processedAt?: Timestamp;        // When AI processing completed
}

interface VisitSummary {
  chiefComplaint?: string;
  diagnoses?: string[];
  assessment?: string;
  plan?: string;
  
  medications?: {
    started: MedicationEntry[];
    stopped: MedicationEntry[];
    changed: MedicationEntry[];
  };
  
  actionItems?: ActionItem[];
  
  // Raw summary text (backup)
  rawSummary?: string;
}

interface MedicationEntry {
  name: string;
  dose?: string;
  frequency?: string;
  note?: string;
  display?: string;
  status?: 'matched' | 'fuzzy' | 'unverified';
  warning?: SafetyWarning[];
}
```

---

### `medications/{medicationId}`

User's medication list, synced from visits or manually added.

```typescript
interface Medication {
  // Ownership
  userId: string;
  
  // Identity (multiple for matching)
  name: string;                   // Display name
  nameLower: string;              // Lowercase for case-insensitive search
  canonicalName: string;          // Normalized for deduplication
  
  // Details
  dose?: string;                  // e.g., "10mg"
  frequency?: string;             // e.g., "twice daily"
  notes?: string;
  display?: string;               // Full display string
  originalText?: string;          // Original text from visit
  
  // Status
  active: boolean;
  source: 'visit' | 'manual';
  sourceVisitId?: string;         // If from visit summary
  
  // Safety
  medicationWarning?: SafetyWarning[];
  medicationStatus?: 'matched' | 'fuzzy' | 'unverified';
  needsConfirmation?: boolean;
  
  // Lifecycle timestamps
  startedAt?: Timestamp;
  stoppedAt?: Timestamp;
  changedAt?: Timestamp;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSyncedAt?: Timestamp;
}

interface SafetyWarning {
  type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
  severity: 'critical' | 'high' | 'moderate' | 'low';
  message: string;
  details: string;
  recommendation: string;
  conflictingMedication?: string;
  allergen?: string;
}
```

---

### `medicationReminders/{reminderId}`

Scheduled reminder times for medications.

```typescript
interface MedicationReminder {
  // Ownership
  userId: string;
  
  // Linked medication
  medicationId: string;
  medicationName: string;
  medicationDose?: string;
  
  // Schedule
  times: string[];                // Array of "HH:MM" in 24hr format
  enabled: boolean;
  
  // Tracking
  lastSentAt?: Timestamp;         // Prevents duplicate notifications
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Note:** Reminder times are interpreted in the user's timezone (from `users/{userId}.timezone`).

---

### `actions/{actionId}`

Follow-up tasks extracted from visits or manually created.

```typescript
interface Action {
  // Ownership
  userId: string;
  
  // Source
  visitId?: string;               // If extracted from visit
  
  // Content
  text: string;                   // The action item text
  type: 'follow_up' | 'lab_order' | 'referral' | 'lifestyle' | 'other';
  priority: 'high' | 'medium' | 'low';
  
  // Due date
  dueDate?: Timestamp;
  dueDateString?: string;         // Human-readable, e.g., "in 3 months"
  
  // Status
  completed: boolean;
  completedAt?: Timestamp;
  
  // Calendar integration
  calendarEventId?: string;       // If synced to calendar
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### `nudges/{nudgeId}`

AI-generated health check-ins and prompts.

```typescript
interface Nudge {
  // Ownership
  userId: string;
  
  // Type and context
  type: 'medication_checkin' | 'condition_tracking' | 'follow_up';
  medicationId?: string;
  medicationName?: string;
  conditionId?: string;
  conditionName?: string;
  
  // Content (AI-generated)
  message: string;                // The nudge prompt
  aiGenerated: boolean;
  
  // Status
  status: 'pending' | 'active' | 'responded' | 'snoozed' | 'dismissed' | 'expired';
  
  // Response
  response?: string;              // User's response text
  parsedResponse?: {              // AI-parsed structured data
    sentiment?: 'positive' | 'neutral' | 'negative';
    adherence?: boolean;
    symptoms?: string[];
    concernLevel?: 'low' | 'medium' | 'high';
  };
  
  // Timing
  scheduledFor: Timestamp;        // When to show nudge
  expiresAt: Timestamp;           // When nudge expires
  respondedAt?: Timestamp;
  snoozedUntil?: Timestamp;
  
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

### `healthLogs/{logId}`

Symptom, vitals, and health tracking entries.

```typescript
interface HealthLog {
  // Ownership
  userId: string;
  
  // Type
  type: 'symptom' | 'vitals' | 'mood' | 'custom';
  
  // Data (varies by type)
  data: {
    // For symptoms
    symptom?: string;
    severity?: 1 | 2 | 3 | 4 | 5;
    
    // For vitals
    bloodPressure?: { systolic: number; diastolic: number };
    heartRate?: number;
    weight?: number;
    temperature?: number;
    bloodSugar?: number;
    
    // For mood
    mood?: 1 | 2 | 3 | 4 | 5;
    
    // Custom fields
    [key: string]: any;
  };
  
  // Notes
  notes?: string;
  
  // Source
  source: 'manual' | 'nudge';
  nudgeId?: string;               // If from nudge response
  
  // Metadata
  createdAt: Timestamp;
}
```

---

### `shares/{shareId}`

Caregiver sharing relationships. Document ID format: `{ownerId}_{caregiverUserId}`.

```typescript
interface Share {
  // Parties
  ownerId: string;                // User sharing their data
  caregiverUserId: string;        // User receiving access
  caregiverEmail: string;         // For display and invites
  
  // Status
  status: 'pending' | 'accepted' | 'revoked';
  
  // Permissions
  role: 'viewer';                 // Currently only viewer role
  
  // Metadata
  createdAt: Timestamp;
  acceptedAt?: Timestamp;
  revokedAt?: Timestamp;
}
```

---

## Indexes

Key composite indexes (defined in `firestore.indexes.json`):

| Collection | Fields | Purpose |
|------------|--------|---------|
| `visits` | userId + date DESC | List user's visits by date |
| `medications` | userId + active + nameLower | List active meds |
| `medications` | userId + canonicalName | Deduplication lookup |
| `medicationReminders` | userId + enabled | List active reminders |
| `actions` | userId + completed + dueDate | Pending actions by due date |
| `nudges` | userId + status + scheduledFor | Pending nudges by time |
| `healthLogs` | userId + createdAt DESC | Recent health logs |
| `shares` | caregiverUserId + status | Shares for caregiver |

---

## Security Rules Summary

- **Owner access**: Users can always read/write their own data
- **Caregiver access**: Read-only access to owner's `visits`, `medications`, `actions` if share is `accepted`
- **Field validation**: Whitelisted fields only, size limits enforced
- **No wildcards**: All collections have explicit rules
- **No deletes on users**: Use Cloud Function for cascading delete

See `/firebase-setup/firestore.rules` for complete rules.

---

## TTL (Time-to-Live)

The following collections have automatic TTL cleanup:

| Collection | Field | TTL |
|------------|-------|-----|
| `nudges` | `expiresAt` | Documents deleted after expiration |

---

*This document should be updated when collection schemas change.*
