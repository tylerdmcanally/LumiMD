import type {
  CareTaskListAllByCaregiverPatientOptions,
  CareTaskListByCaregiverPatientOptions,
  CareTaskRecord,
  CareTaskRepository,
} from '../../repositories/careTasks/CareTaskRepository';

export type CareTaskListForCaregiverPatientOptions = CareTaskListByCaregiverPatientOptions;
export type CareTaskListAllForCaregiverPatientOptions = CareTaskListAllByCaregiverPatientOptions;

export class CareTaskDomainService {
  constructor(private readonly careTaskRepository: CareTaskRepository) {}

  async listForCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CareTaskListForCaregiverPatientOptions,
  ) {
    return this.careTaskRepository.listByCaregiverPatient(caregiverId, patientId, options);
  }

  async listAllForCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CareTaskListAllForCaregiverPatientOptions = {},
  ): Promise<CareTaskRecord[]> {
    return this.careTaskRepository.listAllByCaregiverPatient(caregiverId, patientId, options);
  }

  async getById(taskId: string): Promise<CareTaskRecord | null> {
    return this.careTaskRepository.getById(taskId);
  }

  async createRecord(payload: FirebaseFirestore.DocumentData): Promise<CareTaskRecord> {
    return this.careTaskRepository.create(payload);
  }

  async updateRecord(
    taskId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<CareTaskRecord | null> {
    return this.careTaskRepository.updateById(taskId, updates);
  }
}
