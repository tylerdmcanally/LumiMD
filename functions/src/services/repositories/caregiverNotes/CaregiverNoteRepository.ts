import type { CursorPageRequest, CursorPageResult } from '../common/pagination';

export type CaregiverNoteRecord = FirebaseFirestore.DocumentData & {
  id: string;
  caregiverId: string;
  patientId: string;
  visitId: string;
};

export type CaregiverNoteListByCaregiverPatientOptions = CursorPageRequest;

export interface CaregiverNoteRepository {
  listByCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CaregiverNoteListByCaregiverPatientOptions,
  ): Promise<CursorPageResult<CaregiverNoteRecord>>;
  listAllByCaregiverPatient(
    caregiverId: string,
    patientId: string,
  ): Promise<CaregiverNoteRecord[]>;
  getById(noteId: string): Promise<CaregiverNoteRecord | null>;
  upsertById(
    noteId: string,
    payload: FirebaseFirestore.DocumentData,
  ): Promise<CaregiverNoteRecord | null>;
  deleteById(noteId: string): Promise<void>;
}
