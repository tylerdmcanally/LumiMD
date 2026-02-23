import type { CursorPageRequest, CursorPageResult, SortDirection } from '../common/pagination';

export type MedicationRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  deletedAt?: FirebaseFirestore.Timestamp | null;
};

export type MedicationSortField = 'name' | 'createdAt';

type MedicationListBaseOptions = {
  sortDirection?: SortDirection;
  sortField?: MedicationSortField;
  includeDeleted?: boolean;
};

export type MedicationListByUserOptions = CursorPageRequest & MedicationListBaseOptions;

export type MedicationListAllByUserOptions = MedicationListBaseOptions;
export type MedicationListActiveOptions = {
  includeDeleted?: boolean;
  limit?: number;
};

export type MedicationDeleteCascadeResult = {
  disabledReminders: number;
  dismissedNudges: number;
};

export type MedicationRestoreCascadeResult = {
  restoredReminders: number;
};

export type MedicationStopCascadeResult = {
  disabledReminders: number;
  dismissedNudges: number;
};

export interface MedicationRepository {
  getById(medicationId: string): Promise<MedicationRecord | null>;
  listActive(options?: MedicationListActiveOptions): Promise<MedicationRecord[]>;
  create(payload: FirebaseFirestore.DocumentData): Promise<MedicationRecord>;
  updateById(
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<MedicationRecord | null>;
  createReminder(payload: FirebaseFirestore.DocumentData): Promise<{ id: string }>;
  updateRemindersByMedication(
    userId: string,
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<number>;
  softDeleteRemindersByMedication(
    userId: string,
    medicationId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<number>;
  dismissNudgesByMedication(
    userId: string,
    medicationId: string,
    reason: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<number>;
  softDeleteMedicationCascade(
    medicationId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<MedicationDeleteCascadeResult>;
  restoreMedicationCascade(
    medicationId: string,
    ownerUserId: string,
    medicationDeletedAtMillis: number | null,
    now: FirebaseFirestore.Timestamp,
  ): Promise<MedicationRestoreCascadeResult>;
  stopMedicationCascade(
    userId: string,
    medicationId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<MedicationStopCascadeResult>;
  listByUser(
    userId: string,
    options: MedicationListByUserOptions,
  ): Promise<CursorPageResult<MedicationRecord>>;
  listAllByUser(userId: string, options?: MedicationListAllByUserOptions): Promise<MedicationRecord[]>;
}
