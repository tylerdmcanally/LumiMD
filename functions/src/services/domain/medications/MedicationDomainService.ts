import type { SortDirection } from '../../repositories/common/pagination';
import type {
  MedicationListActiveOptions,
  MedicationListAllByUserOptions,
  MedicationListByUserOptions,
  MedicationRestoreCascadeResult,
  MedicationRecord,
  MedicationRepository,
  MedicationStopCascadeResult,
  MedicationSortField,
  MedicationDeleteCascadeResult,
} from '../../repositories/medications/MedicationRepository';

export type MedicationListForUserOptions = {
  limit: number;
  cursor?: string | null;
  sortDirection?: SortDirection;
  sortField?: MedicationSortField;
  includeDeleted?: boolean;
};

export type MedicationListAllForUserOptions = Omit<MedicationListAllByUserOptions, 'limit'>;
export type MedicationListActiveForServiceOptions = MedicationListActiveOptions;

export class MedicationDomainService {
  constructor(private readonly medicationRepository: MedicationRepository) {}

  async listForUser(userId: string, options: MedicationListForUserOptions) {
    const listOptions: MedicationListByUserOptions = {
      limit: options.limit,
      cursor: options.cursor,
      sortDirection: options.sortDirection,
      sortField: options.sortField,
      includeDeleted: options.includeDeleted,
    };

    return this.medicationRepository.listByUser(userId, listOptions);
  }

  async listAllForUser(userId: string, options: MedicationListAllForUserOptions = {}) {
    return this.medicationRepository.listAllByUser(userId, options);
  }

  async listActive(options: MedicationListActiveForServiceOptions = {}) {
    return this.medicationRepository.listActive(options);
  }

  async getForUser(
    userId: string,
    medicationId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<MedicationRecord | null> {
    const medication = await this.medicationRepository.getById(medicationId);

    if (!medication) {
      return null;
    }

    if (medication.userId !== userId) {
      return null;
    }

    if (options?.includeDeleted !== true && medication.deletedAt) {
      return null;
    }

    return medication;
  }

  async getById(medicationId: string): Promise<MedicationRecord | null> {
    return this.medicationRepository.getById(medicationId);
  }

  async createRecord(payload: FirebaseFirestore.DocumentData): Promise<MedicationRecord> {
    return this.medicationRepository.create(payload);
  }

  async updateRecord(
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<MedicationRecord | null> {
    return this.medicationRepository.updateById(medicationId, updates);
  }

  async createReminder(payload: FirebaseFirestore.DocumentData): Promise<{ id: string }> {
    return this.medicationRepository.createReminder(payload);
  }

  async updateRemindersForMedication(
    userId: string,
    medicationId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<number> {
    return this.medicationRepository.updateRemindersByMedication(userId, medicationId, updates);
  }

  async softDeleteRemindersForMedication(
    userId: string,
    medicationId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<number> {
    return this.medicationRepository.softDeleteRemindersByMedication(
      userId,
      medicationId,
      actorUserId,
      now,
    );
  }

  async dismissNudgesForMedication(
    userId: string,
    medicationId: string,
    reason: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<number> {
    return this.medicationRepository.dismissNudgesByMedication(userId, medicationId, reason, now);
  }

  async softDeleteMedicationCascade(
    medicationId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<MedicationDeleteCascadeResult> {
    return this.medicationRepository.softDeleteMedicationCascade(medicationId, userId, now);
  }

  async restoreMedicationCascade(
    medicationId: string,
    ownerUserId: string,
    medicationDeletedAtMillis: number | null,
    now: FirebaseFirestore.Timestamp,
  ): Promise<MedicationRestoreCascadeResult> {
    return this.medicationRepository.restoreMedicationCascade(
      medicationId,
      ownerUserId,
      medicationDeletedAtMillis,
      now,
    );
  }

  async stopMedicationCascade(
    userId: string,
    medicationId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<MedicationStopCascadeResult> {
    return this.medicationRepository.stopMedicationCascade(userId, medicationId, actorUserId, now);
  }
}
