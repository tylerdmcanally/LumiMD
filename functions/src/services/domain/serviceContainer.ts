import { ActionDomainService } from './actions/ActionDomainService';
import { CaregiverNoteDomainService } from './caregiverNotes/CaregiverNoteDomainService';
import { CareTaskDomainService } from './careTasks/CareTaskDomainService';
import { HealthLogDomainService } from './healthLogs/HealthLogDomainService';
import { MedicationLogDomainService } from './medicationLogs/MedicationLogDomainService';
import { MedicationDomainService } from './medications/MedicationDomainService';
import { MedicationReminderDomainService } from './medicationReminders/MedicationReminderDomainService';
import { PatientContextDomainService } from './patientContexts/PatientContextDomainService';
import { UserDomainService } from './users/UserDomainService';
import { VisitDomainService } from './visits/VisitDomainService';
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
import type { MedicationRepository } from '../repositories/medications/MedicationRepository';
import { FirestoreMedicationReminderRepository } from '../repositories/medicationReminders/FirestoreMedicationReminderRepository';
import type { MedicationReminderRepository } from '../repositories/medicationReminders/MedicationReminderRepository';
import { FirestorePatientContextRepository } from '../repositories/patientContexts/FirestorePatientContextRepository';
import type { PatientContextRepository } from '../repositories/patientContexts/PatientContextRepository';
import { FirestoreUserRepository } from '../repositories/users/FirestoreUserRepository';
import type { UserRepository } from '../repositories/users/UserRepository';
import { FirestoreVisitRepository } from '../repositories/visits/FirestoreVisitRepository';
import type { VisitRepository } from '../repositories/visits/VisitRepository';

export type DomainServiceContainer = {
  actionRepository: ActionRepository;
  caregiverNoteRepository: CaregiverNoteRepository;
  careTaskRepository: CareTaskRepository;
  healthLogRepository: HealthLogRepository;
  medicationLogRepository: MedicationLogRepository;
  medicationRepository: MedicationRepository;
  medicationReminderRepository: MedicationReminderRepository;
  patientContextRepository: PatientContextRepository;
  userRepository: UserRepository;
  visitRepository: VisitRepository;
  actionService: ActionDomainService;
  caregiverNoteService: CaregiverNoteDomainService;
  careTaskService: CareTaskDomainService;
  healthLogService: HealthLogDomainService;
  medicationLogService: MedicationLogDomainService;
  medicationService: MedicationDomainService;
  medicationReminderService: MedicationReminderDomainService;
  patientContextService: PatientContextDomainService;
  userService: UserDomainService;
  visitService: VisitDomainService;
};

export type CreateDomainServiceContainerOptions = {
  db: FirebaseFirestore.Firestore;
  actionRepository?: ActionRepository;
  caregiverNoteRepository?: CaregiverNoteRepository;
  careTaskRepository?: CareTaskRepository;
  healthLogRepository?: HealthLogRepository;
  medicationLogRepository?: MedicationLogRepository;
  medicationRepository?: MedicationRepository;
  medicationReminderRepository?: MedicationReminderRepository;
  patientContextRepository?: PatientContextRepository;
  userRepository?: UserRepository;
  visitRepository?: VisitRepository;
};

export function createDomainServiceContainer(
  options: CreateDomainServiceContainerOptions,
): DomainServiceContainer {
  const actionRepository = options.actionRepository ?? new FirestoreActionRepository(options.db);
  const caregiverNoteRepository =
    options.caregiverNoteRepository ?? new FirestoreCaregiverNoteRepository(options.db);
  const careTaskRepository =
    options.careTaskRepository ?? new FirestoreCareTaskRepository(options.db);
  const healthLogRepository =
    options.healthLogRepository ?? new FirestoreHealthLogRepository(options.db);
  const medicationLogRepository =
    options.medicationLogRepository ?? new FirestoreMedicationLogRepository(options.db);
  const medicationRepository =
    options.medicationRepository ?? new FirestoreMedicationRepository(options.db);
  const medicationReminderRepository =
    options.medicationReminderRepository ??
    new FirestoreMedicationReminderRepository(options.db);
  const patientContextRepository =
    options.patientContextRepository ?? new FirestorePatientContextRepository(options.db);
  const userRepository = options.userRepository ?? new FirestoreUserRepository(options.db);
  const visitRepository = options.visitRepository ?? new FirestoreVisitRepository(options.db);

  return {
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
    actionService: new ActionDomainService(actionRepository),
    caregiverNoteService: new CaregiverNoteDomainService(caregiverNoteRepository),
    careTaskService: new CareTaskDomainService(careTaskRepository),
    healthLogService: new HealthLogDomainService(healthLogRepository),
    medicationLogService: new MedicationLogDomainService(medicationLogRepository),
    medicationService: new MedicationDomainService(medicationRepository),
    medicationReminderService: new MedicationReminderDomainService(medicationReminderRepository),
    patientContextService: new PatientContextDomainService(patientContextRepository),
    userService: new UserDomainService(userRepository),
    visitService: new VisitDomainService(visitRepository),
  };
}
