import type { CursorPageRequest, CursorPageResult } from '../common/pagination';

export type CareTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type CareTaskRecord = FirebaseFirestore.DocumentData & {
  id: string;
  patientId: string;
  caregiverId: string;
  status?: CareTaskStatus;
  deletedAt?: FirebaseFirestore.Timestamp | null;
};

export type CareTaskListBaseOptions = {
  status?: CareTaskStatus;
  includeDeleted?: boolean;
};

export type CareTaskListByCaregiverPatientOptions = CursorPageRequest & CareTaskListBaseOptions;

export type CareTaskListAllByCaregiverPatientOptions = CareTaskListBaseOptions;

export interface CareTaskRepository {
  listByCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CareTaskListByCaregiverPatientOptions,
  ): Promise<CursorPageResult<CareTaskRecord>>;
  listAllByCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options?: CareTaskListAllByCaregiverPatientOptions,
  ): Promise<CareTaskRecord[]>;
  getById(taskId: string): Promise<CareTaskRecord | null>;
  create(payload: FirebaseFirestore.DocumentData): Promise<CareTaskRecord>;
  updateById(
    taskId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<CareTaskRecord | null>;
}
