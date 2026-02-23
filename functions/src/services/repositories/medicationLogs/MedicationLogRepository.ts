export type MedicationLogDateField = 'createdAt' | 'loggedAt';

export type MedicationLogRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  medicationId?: string;
  action?: string;
  createdAt?: FirebaseFirestore.Timestamp;
  loggedAt?: FirebaseFirestore.Timestamp;
  scheduledDate?: string;
  scheduledTime?: string;
};

export type MedicationLogListByUserOptions = {
  startDate?: Date;
  endDate?: Date;
  medicationId?: string;
  dateField?: MedicationLogDateField;
  limit?: number;
};

export type MedicationLogListByUsersOptions = MedicationLogListByUserOptions;

export interface MedicationLogRepository {
  listByUser(userId: string, options?: MedicationLogListByUserOptions): Promise<MedicationLogRecord[]>;
  listByUsers(
    userIds: string[],
    options?: MedicationLogListByUsersOptions,
  ): Promise<MedicationLogRecord[]>;
}
