import type {
  CaregiverNoteListByCaregiverPatientOptions,
  CaregiverNoteRecord,
  CaregiverNoteRepository,
} from '../../repositories/caregiverNotes/CaregiverNoteRepository';

export type CaregiverNoteListForCaregiverPatientOptions = CaregiverNoteListByCaregiverPatientOptions;

export class CaregiverNoteDomainService {
  constructor(private readonly caregiverNoteRepository: CaregiverNoteRepository) {}

  async listForCaregiverPatient(
    caregiverId: string,
    patientId: string,
    options: CaregiverNoteListForCaregiverPatientOptions,
  ) {
    return this.caregiverNoteRepository.listByCaregiverPatient(caregiverId, patientId, options);
  }

  async listAllForCaregiverPatient(
    caregiverId: string,
    patientId: string,
  ): Promise<CaregiverNoteRecord[]> {
    return this.caregiverNoteRepository.listAllByCaregiverPatient(caregiverId, patientId);
  }

  async getById(noteId: string): Promise<CaregiverNoteRecord | null> {
    return this.caregiverNoteRepository.getById(noteId);
  }

  async upsertRecord(
    noteId: string,
    payload: FirebaseFirestore.DocumentData,
  ): Promise<CaregiverNoteRecord | null> {
    return this.caregiverNoteRepository.upsertById(noteId, payload);
  }

  async deleteRecord(noteId: string): Promise<void> {
    await this.caregiverNoteRepository.deleteById(noteId);
  }
}
