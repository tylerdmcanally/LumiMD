import type {
  MedicationLogListByUserOptions,
  MedicationLogRecord,
  MedicationLogRepository,
} from '../../repositories/medicationLogs/MedicationLogRepository';

export type MedicationLogListForUserOptions = MedicationLogListByUserOptions;

export class MedicationLogDomainService {
  constructor(private readonly medicationLogRepository: MedicationLogRepository) {}

  async listForUser(
    userId: string,
    options: MedicationLogListForUserOptions = {},
  ): Promise<MedicationLogRecord[]> {
    return this.medicationLogRepository.listByUser(userId, options);
  }

  async listForUsers(
    userIds: string[],
    options: MedicationLogListForUserOptions = {},
  ): Promise<MedicationLogRecord[]> {
    return this.medicationLogRepository.listByUsers(userIds, options);
  }
}
