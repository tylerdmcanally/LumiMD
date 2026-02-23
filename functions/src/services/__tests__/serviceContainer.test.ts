import { ActionDomainService } from '../domain/actions/ActionDomainService';
import { CaregiverNoteDomainService } from '../domain/caregiverNotes/CaregiverNoteDomainService';
import { CareTaskDomainService } from '../domain/careTasks/CareTaskDomainService';
import { createDomainServiceContainer } from '../domain/serviceContainer';
import { HealthLogDomainService } from '../domain/healthLogs/HealthLogDomainService';
import { MedicationLogDomainService } from '../domain/medicationLogs/MedicationLogDomainService';
import { MedicationDomainService } from '../domain/medications/MedicationDomainService';
import { MedicationReminderDomainService } from '../domain/medicationReminders/MedicationReminderDomainService';
import { PatientContextDomainService } from '../domain/patientContexts/PatientContextDomainService';
import { UserDomainService } from '../domain/users/UserDomainService';
import { VisitDomainService } from '../domain/visits/VisitDomainService';
import { FirestoreActionRepository } from '../repositories/actions/FirestoreActionRepository';
import type { ActionRepository } from '../repositories/actions/ActionRepository';
import { FirestoreCaregiverNoteRepository } from '../repositories/caregiverNotes/FirestoreCaregiverNoteRepository';
import type { CaregiverNoteRepository } from '../repositories/caregiverNotes/CaregiverNoteRepository';
import { FirestoreCareTaskRepository } from '../repositories/careTasks/FirestoreCareTaskRepository';
import type { CareTaskRepository } from '../repositories/careTasks/CareTaskRepository';
import { FirestoreHealthLogRepository } from '../repositories/healthLogs/FirestoreHealthLogRepository';
import type { HealthLogRepository } from '../repositories/healthLogs/HealthLogRepository';
import { FirestoreMedicationLogRepository } from '../repositories/medicationLogs/FirestoreMedicationLogRepository';
import type { MedicationLogRepository } from '../repositories/medicationLogs/MedicationLogRepository';
import { FirestoreMedicationRepository } from '../repositories/medications/FirestoreMedicationRepository';
import { FirestoreMedicationReminderRepository } from '../repositories/medicationReminders/FirestoreMedicationReminderRepository';
import { FirestorePatientContextRepository } from '../repositories/patientContexts/FirestorePatientContextRepository';
import { FirestoreUserRepository } from '../repositories/users/FirestoreUserRepository';
import { FirestoreVisitRepository } from '../repositories/visits/FirestoreVisitRepository';
import type { MedicationRepository } from '../repositories/medications/MedicationRepository';
import type { MedicationReminderRepository } from '../repositories/medicationReminders/MedicationReminderRepository';
import type { PatientContextRepository } from '../repositories/patientContexts/PatientContextRepository';
import type { UserRepository } from '../repositories/users/UserRepository';
import type { VisitRepository } from '../repositories/visits/VisitRepository';

describe('createDomainServiceContainer', () => {
  const db = {} as unknown as FirebaseFirestore.Firestore;

  it('wires Firestore repositories by default', () => {
    const container = createDomainServiceContainer({ db });

    expect(container.actionRepository).toBeInstanceOf(FirestoreActionRepository);
    expect(container.caregiverNoteRepository).toBeInstanceOf(FirestoreCaregiverNoteRepository);
    expect(container.careTaskRepository).toBeInstanceOf(FirestoreCareTaskRepository);
    expect(container.healthLogRepository).toBeInstanceOf(FirestoreHealthLogRepository);
    expect(container.medicationLogRepository).toBeInstanceOf(FirestoreMedicationLogRepository);
    expect(container.medicationRepository).toBeInstanceOf(FirestoreMedicationRepository);
    expect(container.medicationReminderRepository).toBeInstanceOf(FirestoreMedicationReminderRepository);
    expect(container.patientContextRepository).toBeInstanceOf(FirestorePatientContextRepository);
    expect(container.userRepository).toBeInstanceOf(FirestoreUserRepository);
    expect(container.visitRepository).toBeInstanceOf(FirestoreVisitRepository);
    expect(container.actionService).toBeInstanceOf(ActionDomainService);
    expect(container.caregiverNoteService).toBeInstanceOf(CaregiverNoteDomainService);
    expect(container.careTaskService).toBeInstanceOf(CareTaskDomainService);
    expect(container.healthLogService).toBeInstanceOf(HealthLogDomainService);
    expect(container.medicationLogService).toBeInstanceOf(MedicationLogDomainService);
    expect(container.medicationService).toBeInstanceOf(MedicationDomainService);
    expect(container.medicationReminderService).toBeInstanceOf(MedicationReminderDomainService);
    expect(container.patientContextService).toBeInstanceOf(PatientContextDomainService);
    expect(container.userService).toBeInstanceOf(UserDomainService);
    expect(container.visitService).toBeInstanceOf(VisitDomainService);
  });

  it('uses provided repository overrides when supplied', () => {
    const actionRepository: ActionRepository = {
      create: jest.fn(),
      getById: jest.fn(),
      listAllByUser: jest.fn(),
      listByUser: jest.fn(),
      restoreById: jest.fn(),
      softDeleteById: jest.fn(),
      updateById: jest.fn(),
    };

    const caregiverNoteRepository: CaregiverNoteRepository = {
      deleteById: jest.fn(),
      getById: jest.fn(),
      listAllByCaregiverPatient: jest.fn(),
      listByCaregiverPatient: jest.fn(),
      upsertById: jest.fn(),
    };

    const careTaskRepository: CareTaskRepository = {
      create: jest.fn(),
      getById: jest.fn(),
      listAllByCaregiverPatient: jest.fn(),
      listByCaregiverPatient: jest.fn(),
      updateById: jest.fn(),
    };

    const healthLogRepository: HealthLogRepository = {
      create: jest.fn(),
      findBySourceId: jest.fn(),
      getById: jest.fn(),
      listPageByUser: jest.fn(),
      listByUser: jest.fn(),
      restoreById: jest.fn(),
      softDeleteById: jest.fn(),
      updateById: jest.fn(),
    };

    const medicationRepository: MedicationRepository = {
      create: jest.fn(),
      createReminder: jest.fn(),
      dismissNudgesByMedication: jest.fn(),
      getById: jest.fn(),
      listActive: jest.fn(),
      listAllByUser: jest.fn(),
      listByUser: jest.fn(),
      restoreMedicationCascade: jest.fn(),
      softDeleteMedicationCascade: jest.fn(),
      softDeleteRemindersByMedication: jest.fn(),
      stopMedicationCascade: jest.fn(),
      updateById: jest.fn(),
      updateRemindersByMedication: jest.fn(),
    };

    const medicationLogRepository: MedicationLogRepository = {
      listByUsers: jest.fn(),
      listByUser: jest.fn(),
    };

    const medicationReminderRepository: MedicationReminderRepository = {
      listByUsers: jest.fn(),
      listByUser: jest.fn(),
    };

    const patientContextRepository: PatientContextRepository = {
      getByUserId: jest.fn(),
      setByUserId: jest.fn(),
      updateByUserId: jest.fn(),
      updateConditions: jest.fn(),
    };

    const userRepository: UserRepository = {
      ensureCaregiverRole: jest.fn(),
      ensureExists: jest.fn(),
      getAnalyticsConsent: jest.fn(),
      applyLegalAssent: jest.fn(),
      getById: jest.fn(),
      getLatestPushToken: jest.fn(),
      getExportData: jest.fn(),
      listAnalyticsConsentAudit: jest.fn(),
      listByIds: jest.fn(),
      listPushTokens: jest.fn(),
      listRestoreAuditEvents: jest.fn(),
      updateRestoreAuditTriage: jest.fn(),
      deleteAllPushTokens: jest.fn(),
      deleteAccountData: jest.fn(),
      registerPushToken: jest.fn(),
      unregisterPushToken: jest.fn(),
      updateAnalyticsConsent: jest.fn(),
      upsertById: jest.fn(),
    };

    const visitRepository: VisitRepository = {
      create: jest.fn(),
      getById: jest.fn(),
      listAllByUser: jest.fn(),
      listPostCommitEscalated: jest.fn(),
      listPostCommitRecoverable: jest.fn(),
      listByUser: jest.fn(),
      restoreById: jest.fn(),
      softDeleteById: jest.fn(),
      updateById: jest.fn(),
    };

    const container = createDomainServiceContainer({
      db,
      actionRepository,
      caregiverNoteRepository,
      careTaskRepository,
      healthLogRepository,
      medicationLogRepository,
      medicationRepository,
      medicationReminderRepository,
      patientContextRepository,
      userRepository,
      visitRepository,
    });

    expect(container.actionRepository).toBe(actionRepository);
    expect(container.caregiverNoteRepository).toBe(caregiverNoteRepository);
    expect(container.careTaskRepository).toBe(careTaskRepository);
    expect(container.healthLogRepository).toBe(healthLogRepository);
    expect(container.medicationLogRepository).toBe(medicationLogRepository);
    expect(container.medicationRepository).toBe(medicationRepository);
    expect(container.medicationReminderRepository).toBe(medicationReminderRepository);
    expect(container.patientContextRepository).toBe(patientContextRepository);
    expect(container.userRepository).toBe(userRepository);
    expect(container.visitRepository).toBe(visitRepository);
  });
});
