import type {
  MedicationReminderListByUserOptions,
  MedicationReminderRecord,
  MedicationReminderRepository,
} from '../../repositories/medicationReminders/MedicationReminderRepository';

export type MedicationReminderListForUserOptions = MedicationReminderListByUserOptions;

export class MedicationReminderDomainService {
  constructor(private readonly medicationReminderRepository: MedicationReminderRepository) {}

  async listForUser(
    userId: string,
    options: MedicationReminderListForUserOptions = {},
  ): Promise<MedicationReminderRecord[]> {
    return this.medicationReminderRepository.listByUser(userId, options);
  }

  async listForUsers(
    userIds: string[],
    options: MedicationReminderListForUserOptions = {},
  ): Promise<MedicationReminderRecord[]> {
    return this.medicationReminderRepository.listByUsers(userIds, options);
  }
}
