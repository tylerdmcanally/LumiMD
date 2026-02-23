export type MedicationReminderProcessingRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  medicationId: string;
  medicationName: string;
  medicationDose?: string;
  times?: string[];
  timingMode?: 'local' | 'anchor';
  anchorTimezone?: string | null;
  criticality?: 'standard' | 'time_sensitive';
  enabled?: boolean;
  deletedAt?: FirebaseFirestore.Timestamp | null;
  lastSentAt?: FirebaseFirestore.Timestamp;
  lastSentLockUntil?: FirebaseFirestore.Timestamp;
  lastSentLockAt?: FirebaseFirestore.Timestamp;
};

export type MedicationReminderProcessingMedicationRecord = {
  id: string;
  exists: boolean;
  active: boolean;
  deletedAt: FirebaseFirestore.Timestamp | null;
};

export type MedicationReminderProcessingUpdate = {
  reminderId: string;
  updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>;
};

export type MedicationReminderTimingBackfillPage = {
  items: MedicationReminderProcessingRecord[];
  processedCount: number;
  hasMore: boolean;
  nextCursor: string | null;
};

export interface MedicationReminderProcessingRepository {
  listEnabledReminders(): Promise<MedicationReminderProcessingRecord[]>;
  listTimingBackfillPage(params: {
    cursorDocId?: string | null;
    limit: number;
  }): Promise<MedicationReminderTimingBackfillPage>;
  listSoftDeletedByCutoff(
    cutoff: FirebaseFirestore.Timestamp,
    limit: number,
  ): Promise<MedicationReminderProcessingRecord[]>;
  getUserTimezoneValue(userId: string): Promise<string | null>;
  getMedicationState(
    medicationId: string,
  ): Promise<MedicationReminderProcessingMedicationRecord>;
  acquireReminderSendLock(
    reminderId: string,
    now: FirebaseFirestore.Timestamp,
    lockUntil: FirebaseFirestore.Timestamp,
  ): Promise<boolean>;
  updateReminderById(
    reminderId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void>;
  applyReminderUpdates(updates: MedicationReminderProcessingUpdate[]): Promise<number>;
  deleteReminderIds(reminderIds: string[]): Promise<number>;
  listMedicationLogsByUserAndLoggedAtRange(
    userId: string,
    range: { start: Date; end: Date },
  ): Promise<FirebaseFirestore.DocumentData[]>;
}
