export type MedicationReminderRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  medicationId?: string;
  enabled?: boolean;
  times?: string[];
  deletedAt?: FirebaseFirestore.Timestamp | null;
};

export type MedicationReminderListByUserOptions = {
  enabled?: boolean;
  medicationId?: string;
  includeDeleted?: boolean;
};

export interface MedicationReminderRepository {
  listByUser(
    userId: string,
    options?: MedicationReminderListByUserOptions,
  ): Promise<MedicationReminderRecord[]>;
  listByUsers(
    userIds: string[],
    options?: MedicationReminderListByUserOptions,
  ): Promise<MedicationReminderRecord[]>;
}
