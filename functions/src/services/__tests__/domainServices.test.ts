import { ActionDomainService } from '../domain/actions/ActionDomainService';
import { CaregiverNoteDomainService } from '../domain/caregiverNotes/CaregiverNoteDomainService';
import { CareTaskDomainService } from '../domain/careTasks/CareTaskDomainService';
import { HealthLogDomainService } from '../domain/healthLogs/HealthLogDomainService';
import { MedicationLogDomainService } from '../domain/medicationLogs/MedicationLogDomainService';
import { MedicationDomainService } from '../domain/medications/MedicationDomainService';
import { MedicationReminderDomainService } from '../domain/medicationReminders/MedicationReminderDomainService';
import { NudgeDomainService } from '../domain/nudges/NudgeDomainService';
import { PatientContextDomainService } from '../domain/patientContexts/PatientContextDomainService';
import { ShareDomainService } from '../domain/shares/ShareDomainService';
import { UserDomainService } from '../domain/users/UserDomainService';
import { VisitDomainService } from '../domain/visits/VisitDomainService';
import type { ActionRepository } from '../repositories/actions/ActionRepository';
import type { CaregiverNoteRepository } from '../repositories/caregiverNotes/CaregiverNoteRepository';
import type { CareTaskRepository } from '../repositories/careTasks/CareTaskRepository';
import type { HealthLogRepository } from '../repositories/healthLogs/HealthLogRepository';
import type { MedicationLogRepository } from '../repositories/medicationLogs/MedicationLogRepository';
import type { MedicationRepository } from '../repositories/medications/MedicationRepository';
import type { MedicationReminderRepository } from '../repositories/medicationReminders/MedicationReminderRepository';
import type { NudgeRepository } from '../repositories/nudges/NudgeRepository';
import type { PatientContextRepository } from '../repositories/patientContexts/PatientContextRepository';
import type { ShareRepository } from '../repositories/shares/ShareRepository';
import type { UserRepository } from '../repositories/users/UserRepository';
import type { VisitRepository } from '../repositories/visits/VisitRepository';

describe('Domain services', () => {
  describe('MedicationDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByUser = jest.fn().mockResolvedValue({
        items: [{ id: 'med-1', userId: 'user-1', name: 'Lisinopril' }],
        hasMore: false,
        nextCursor: null,
      });
      const getById = jest.fn();
      const listActive = jest.fn();
      const create = jest.fn();
      const updateById = jest.fn();
      const listAllByUser = jest.fn();
      const createReminder = jest.fn();
      const updateRemindersByMedication = jest.fn();
      const softDeleteRemindersByMedication = jest.fn();
      const dismissNudgesByMedication = jest.fn();
      const softDeleteMedicationCascade = jest.fn();
      const restoreMedicationCascade = jest.fn();
      const stopMedicationCascade = jest.fn();

      const repository: MedicationRepository = {
        create,
        createReminder,
        dismissNudgesByMedication,
        getById,
        listActive,
        listAllByUser,
        listByUser,
        restoreMedicationCascade,
        softDeleteMedicationCascade,
        softDeleteRemindersByMedication,
        stopMedicationCascade,
        updateRemindersByMedication,
        updateById,
      };

      const service = new MedicationDomainService(repository);

      const result = await service.listForUser('user-1', {
        limit: 20,
        cursor: 'cursor-1',
      });

      expect(listByUser).toHaveBeenCalledWith('user-1', {
        limit: 20,
        cursor: 'cursor-1',
        sortDirection: undefined,
        includeDeleted: undefined,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('med-1');
    });

    it('forwards active-medication list calls to repository', async () => {
      const listActive = jest.fn().mockResolvedValue([{ id: 'med-1', userId: 'user-1', active: true }]);
      const repository: MedicationRepository = {
        create: jest.fn(),
        createReminder: jest.fn(),
        dismissNudgesByMedication: jest.fn(),
        getById: jest.fn(),
        listActive,
        listAllByUser: jest.fn(),
        listByUser: jest.fn(),
        restoreMedicationCascade: jest.fn(),
        softDeleteMedicationCascade: jest.fn(),
        softDeleteRemindersByMedication: jest.fn(),
        stopMedicationCascade: jest.fn(),
        updateRemindersByMedication: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new MedicationDomainService(repository);
      const result = await service.listActive({ limit: 100 });

      expect(listActive).toHaveBeenCalledWith({ limit: 100 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('med-1');
    });

    it('returns null for non-owner lookups', async () => {
      const repository: MedicationRepository = {
        create: jest.fn(),
        createReminder: jest.fn(),
        dismissNudgesByMedication: jest.fn(),
        listByUser: jest.fn(),
        listActive: jest.fn(),
        listAllByUser: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'med-1',
          userId: 'user-2',
          name: 'Metformin',
          deletedAt: null,
        }),
        restoreMedicationCascade: jest.fn(),
        softDeleteMedicationCascade: jest.fn(),
        softDeleteRemindersByMedication: jest.fn(),
        stopMedicationCascade: jest.fn(),
        updateRemindersByMedication: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new MedicationDomainService(repository);

      await expect(service.getForUser('user-1', 'med-1')).resolves.toBeNull();
    });

    it('hides soft-deleted records by default', async () => {
      const repository: MedicationRepository = {
        create: jest.fn(),
        createReminder: jest.fn(),
        dismissNudgesByMedication: jest.fn(),
        listByUser: jest.fn(),
        listActive: jest.fn(),
        listAllByUser: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'med-1',
          userId: 'user-1',
          name: 'Metformin',
          deletedAt: { seconds: 1 },
        }),
        restoreMedicationCascade: jest.fn(),
        softDeleteMedicationCascade: jest.fn(),
        softDeleteRemindersByMedication: jest.fn(),
        stopMedicationCascade: jest.fn(),
        updateRemindersByMedication: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new MedicationDomainService(repository);

      await expect(service.getForUser('user-1', 'med-1')).resolves.toBeNull();
      await expect(service.getForUser('user-1', 'med-1', { includeDeleted: true })).resolves.toEqual(
        expect.objectContaining({ id: 'med-1' }),
      );
    });

    it('forwards non-paginated list calls to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn().mockResolvedValue([{ id: 'med-1', userId: 'user-1' }]);
      const getById = jest.fn();
      const create = jest.fn();
      const updateById = jest.fn();
      const createReminder = jest.fn();
      const updateRemindersByMedication = jest.fn();
      const softDeleteRemindersByMedication = jest.fn();
      const dismissNudgesByMedication = jest.fn();
      const softDeleteMedicationCascade = jest.fn();
      const restoreMedicationCascade = jest.fn();
      const stopMedicationCascade = jest.fn();

      const repository: MedicationRepository = {
        create,
        createReminder,
        dismissNudgesByMedication,
        getById,
        listActive: jest.fn(),
        listAllByUser,
        listByUser,
        restoreMedicationCascade,
        softDeleteMedicationCascade,
        softDeleteRemindersByMedication,
        stopMedicationCascade,
        updateRemindersByMedication,
        updateById,
      };

      const service = new MedicationDomainService(repository);

      const result = await service.listAllForUser('user-1', {
        sortDirection: 'asc',
        sortField: 'name',
      });

      expect(listAllByUser).toHaveBeenCalledWith('user-1', {
        sortDirection: 'asc',
        sortField: 'name',
      });
      expect(result).toHaveLength(1);
    });

    it('forwards direct getById calls to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn();
      const getById = jest.fn().mockResolvedValue({ id: 'med-1', userId: 'user-1' });
      const create = jest.fn();
      const updateById = jest.fn();
      const createReminder = jest.fn();
      const updateRemindersByMedication = jest.fn();
      const softDeleteRemindersByMedication = jest.fn();
      const dismissNudgesByMedication = jest.fn();
      const softDeleteMedicationCascade = jest.fn();
      const restoreMedicationCascade = jest.fn();
      const stopMedicationCascade = jest.fn();

      const repository: MedicationRepository = {
        create,
        createReminder,
        dismissNudgesByMedication,
        getById,
        listActive: jest.fn(),
        listAllByUser,
        listByUser,
        restoreMedicationCascade,
        softDeleteMedicationCascade,
        softDeleteRemindersByMedication,
        stopMedicationCascade,
        updateRemindersByMedication,
        updateById,
      };

      const service = new MedicationDomainService(repository);

      const result = await service.getById('med-1');
      expect(getById).toHaveBeenCalledWith('med-1');
      expect(result).toEqual({ id: 'med-1', userId: 'user-1' });
    });

    it('forwards create and update mutations to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn();
      const getById = jest.fn();
      const create = jest.fn().mockResolvedValue({ id: 'med-1', userId: 'user-1' });
      const updateById = jest.fn().mockResolvedValue({ id: 'med-1', userId: 'user-1' });
      const createReminder = jest.fn();
      const updateRemindersByMedication = jest.fn();
      const softDeleteRemindersByMedication = jest.fn();
      const dismissNudgesByMedication = jest.fn();
      const softDeleteMedicationCascade = jest.fn();
      const restoreMedicationCascade = jest.fn();
      const stopMedicationCascade = jest.fn();

      const repository: MedicationRepository = {
        create,
        createReminder,
        dismissNudgesByMedication,
        getById,
        listActive: jest.fn(),
        listAllByUser,
        listByUser,
        restoreMedicationCascade,
        softDeleteMedicationCascade,
        softDeleteRemindersByMedication,
        stopMedicationCascade,
        updateRemindersByMedication,
        updateById,
      };

      const service = new MedicationDomainService(repository);
      const created = await service.createRecord({ userId: 'user-1', name: 'Aspirin' });
      const updated = await service.updateRecord('med-1', { name: 'Aspirin 81mg' });

      expect(create).toHaveBeenCalledWith({ userId: 'user-1', name: 'Aspirin' });
      expect(updateById).toHaveBeenCalledWith('med-1', { name: 'Aspirin 81mg' });
      expect(created).toEqual({ id: 'med-1', userId: 'user-1' });
      expect(updated).toEqual({ id: 'med-1', userId: 'user-1' });
    });

    it('forwards reminder/nudge cascade mutations to repository', async () => {
      const now = { toDate: () => new Date('2026-02-21T12:00:00.000Z') } as FirebaseFirestore.Timestamp;
      const createReminder = jest.fn().mockResolvedValue({ id: 'rem-1' });
      const updateRemindersByMedication = jest.fn().mockResolvedValue(2);
      const softDeleteRemindersByMedication = jest.fn().mockResolvedValue(1);
      const dismissNudgesByMedication = jest.fn().mockResolvedValue(3);
      const softDeleteMedicationCascade = jest.fn().mockResolvedValue({
        disabledReminders: 2,
        dismissedNudges: 1,
      });
      const restoreMedicationCascade = jest.fn().mockResolvedValue({ restoredReminders: 1 });
      const stopMedicationCascade = jest.fn().mockResolvedValue({
        disabledReminders: 1,
        dismissedNudges: 2,
      });

      const repository: MedicationRepository = {
        create: jest.fn(),
        createReminder,
        dismissNudgesByMedication,
        getById: jest.fn(),
        listActive: jest.fn(),
        listAllByUser: jest.fn(),
        listByUser: jest.fn(),
        restoreMedicationCascade,
        softDeleteMedicationCascade,
        softDeleteRemindersByMedication,
        stopMedicationCascade,
        updateById: jest.fn(),
        updateRemindersByMedication,
      };

      const service = new MedicationDomainService(repository);
      const reminder = await service.createReminder({ medicationId: 'med-1' });
      const synced = await service.updateRemindersForMedication('user-1', 'med-1', {
        medicationName: 'Tacrolimus',
      });
      const softDeleted = await service.softDeleteRemindersForMedication(
        'user-1',
        'med-1',
        'user-1',
        now,
      );
      const dismissed = await service.dismissNudgesForMedication(
        'user-1',
        'med-1',
        'medication_stopped',
        now,
      );
      const deleteCascade = await service.softDeleteMedicationCascade('med-1', 'user-1', now);
      const restoreCascade = await service.restoreMedicationCascade('med-1', 'user-1', now.toDate().getTime(), now);
      const stopCascade = await service.stopMedicationCascade('user-1', 'med-1', 'user-1', now);

      expect(createReminder).toHaveBeenCalledWith({ medicationId: 'med-1' });
      expect(updateRemindersByMedication).toHaveBeenCalledWith('user-1', 'med-1', {
        medicationName: 'Tacrolimus',
      });
      expect(softDeleteRemindersByMedication).toHaveBeenCalledWith('user-1', 'med-1', 'user-1', now);
      expect(dismissNudgesByMedication).toHaveBeenCalledWith(
        'user-1',
        'med-1',
        'medication_stopped',
        now,
      );
      expect(softDeleteMedicationCascade).toHaveBeenCalledWith('med-1', 'user-1', now);
      expect(restoreMedicationCascade).toHaveBeenCalledWith(
        'med-1',
        'user-1',
        now.toDate().getTime(),
        now,
      );
      expect(stopMedicationCascade).toHaveBeenCalledWith('user-1', 'med-1', 'user-1', now);
      expect(reminder).toEqual({ id: 'rem-1' });
      expect(synced).toBe(2);
      expect(softDeleted).toBe(1);
      expect(dismissed).toBe(3);
      expect(deleteCascade).toEqual({ disabledReminders: 2, dismissedNudges: 1 });
      expect(restoreCascade).toEqual({ restoredReminders: 1 });
      expect(stopCascade).toEqual({ disabledReminders: 1, dismissedNudges: 2 });
    });
  });

  describe('ActionDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByUser = jest.fn().mockResolvedValue({
        items: [{ id: 'action-1', userId: 'user-1' }],
        hasMore: true,
        nextCursor: 'action-1',
      });
      const getById = jest.fn();
      const create = jest.fn();
      const updateById = jest.fn();
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: ActionRepository = {
        create,
        getById,
        listAllByUser: jest.fn(),
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new ActionDomainService(repository);

      const result = await service.listForUser('user-1', {
        limit: 10,
        sortDirection: 'desc',
      });

      expect(listByUser).toHaveBeenCalledWith('user-1', {
        limit: 10,
        cursor: undefined,
        sortDirection: 'desc',
        includeDeleted: undefined,
      });
      expect(result.hasMore).toBe(true);
    });

    it('returns null when user does not own action', async () => {
      const repository: ActionRepository = {
        create: jest.fn(),
        listByUser: jest.fn(),
        listAllByUser: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'action-1',
          userId: 'user-2',
          deletedAt: null,
        }),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new ActionDomainService(repository);

      await expect(service.getForUser('user-1', 'action-1')).resolves.toBeNull();
    });

    it('supports includeDeleted reads when explicitly requested', async () => {
      const repository: ActionRepository = {
        create: jest.fn(),
        listByUser: jest.fn(),
        listAllByUser: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'action-1',
          userId: 'user-1',
          deletedAt: { seconds: 1 },
        }),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new ActionDomainService(repository);

      await expect(service.getForUser('user-1', 'action-1')).resolves.toBeNull();
      await expect(
        service.getForUser('user-1', 'action-1', { includeDeleted: true }),
      ).resolves.toEqual(expect.objectContaining({ id: 'action-1' }));
    });

    it('forwards non-paginated list calls to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn().mockResolvedValue([{ id: 'action-1', userId: 'user-1' }]);
      const getById = jest.fn();
      const create = jest.fn();
      const updateById = jest.fn();
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: ActionRepository = {
        create,
        getById,
        listAllByUser,
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new ActionDomainService(repository);

      const result = await service.listAllForUser('user-1', {
        sortDirection: 'desc',
      });

      expect(listAllByUser).toHaveBeenCalledWith('user-1', {
        sortDirection: 'desc',
      });
      expect(result).toHaveLength(1);
    });

    it('forwards direct getById calls to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn();
      const getById = jest.fn().mockResolvedValue({ id: 'action-1', userId: 'user-1' });
      const create = jest.fn();
      const updateById = jest.fn();
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: ActionRepository = {
        create,
        getById,
        listAllByUser,
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new ActionDomainService(repository);

      const result = await service.getById('action-1');
      expect(getById).toHaveBeenCalledWith('action-1');
      expect(result).toEqual({ id: 'action-1', userId: 'user-1' });
    });

    it('forwards create and update mutations to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn();
      const getById = jest.fn();
      const create = jest.fn().mockResolvedValue({ id: 'action-1', userId: 'user-1' });
      const updateById = jest.fn().mockResolvedValue({ id: 'action-1', userId: 'user-1' });
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: ActionRepository = {
        create,
        getById,
        listAllByUser,
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new ActionDomainService(repository);
      const created = await service.createRecord({ userId: 'user-1', description: 'Take meds' });
      const updated = await service.updateRecord('action-1', { completed: true });

      expect(create).toHaveBeenCalledWith({ userId: 'user-1', description: 'Take meds' });
      expect(updateById).toHaveBeenCalledWith('action-1', { completed: true });
      expect(created).toEqual({ id: 'action-1', userId: 'user-1' });
      expect(updated).toEqual({ id: 'action-1', userId: 'user-1' });
    });

    it('forwards soft-delete and restore mutations to repository', async () => {
      const now = { toDate: () => new Date('2026-02-21T12:00:00.000Z') } as FirebaseFirestore.Timestamp;
      const softDeleteById = jest.fn().mockResolvedValue(undefined);
      const restoreById = jest.fn().mockResolvedValue(undefined);

      const repository: ActionRepository = {
        create: jest.fn(),
        getById: jest.fn(),
        listAllByUser: jest.fn(),
        listByUser: jest.fn(),
        restoreById,
        softDeleteById,
        updateById: jest.fn(),
      };

      const service = new ActionDomainService(repository);
      await service.softDeleteRecord('action-1', 'user-1', now);
      await service.restoreRecord('action-1', now);

      expect(softDeleteById).toHaveBeenCalledWith('action-1', 'user-1', now);
      expect(restoreById).toHaveBeenCalledWith('action-1', now);
    });
  });

  describe('HealthLogDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByUser = jest.fn().mockResolvedValue([{ id: 'health-log-1', userId: 'user-1' }]);
      const listPageByUser = jest.fn();
      const getById = jest.fn();
      const create = jest.fn();
      const updateById = jest.fn();
      const findBySourceId = jest.fn();
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: HealthLogRepository = {
        create,
        findBySourceId,
        getById,
        listPageByUser,
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new HealthLogDomainService(repository);

      const result = await service.listForUser('user-1', {
        type: 'bp',
        sortDirection: 'desc',
        limit: 25,
      });

      expect(listByUser).toHaveBeenCalledWith('user-1', {
        type: 'bp',
        startDate: undefined,
        endDate: undefined,
        sortDirection: 'desc',
        includeDeleted: undefined,
        limit: 25,
      });
      expect(result).toEqual([{ id: 'health-log-1', userId: 'user-1' }]);
    });

    it('forwards paginated list calls to repository', async () => {
      const listByUser = jest.fn();
      const listPageByUser = jest.fn().mockResolvedValue({
        items: [{ id: 'health-log-1', userId: 'user-1' }],
        hasMore: true,
        nextCursor: 'health-log-1',
      });

      const repository: HealthLogRepository = {
        create: jest.fn(),
        findBySourceId: jest.fn(),
        getById: jest.fn(),
        listPageByUser,
        listByUser,
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new HealthLogDomainService(repository);
      const result = await service.listPageForUser('user-1', {
        type: 'bp',
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        sortDirection: 'desc',
        limit: 10,
        cursor: 'cursor-1',
      });

      expect(listPageByUser).toHaveBeenCalledWith('user-1', {
        type: 'bp',
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        endDate: undefined,
        sortDirection: 'desc',
        includeDeleted: undefined,
        limit: 10,
        cursor: 'cursor-1',
      });
      expect(result.hasMore).toBe(true);
      expect(listByUser).not.toHaveBeenCalled();
    });

    it('returns null when user does not own health log', async () => {
      const repository: HealthLogRepository = {
        create: jest.fn(),
        findBySourceId: jest.fn(),
        listPageByUser: jest.fn(),
        listByUser: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'health-log-1',
          userId: 'user-2',
          deletedAt: null,
        }),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new HealthLogDomainService(repository);

      await expect(service.getForUser('user-1', 'health-log-1')).resolves.toBeNull();
    });

    it('supports includeDeleted reads when explicitly requested', async () => {
      const repository: HealthLogRepository = {
        create: jest.fn(),
        findBySourceId: jest.fn(),
        listPageByUser: jest.fn(),
        listByUser: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'health-log-1',
          userId: 'user-1',
          deletedAt: { seconds: 1 },
        }),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new HealthLogDomainService(repository);

      await expect(service.getForUser('user-1', 'health-log-1')).resolves.toBeNull();
      await expect(
        service.getForUser('user-1', 'health-log-1', { includeDeleted: true }),
      ).resolves.toEqual(expect.objectContaining({ id: 'health-log-1' }));
    });

    it('forwards get/create/update/findBySourceId mutations to repository', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'health-log-1', userId: 'user-1' });
      const updateById = jest
        .fn()
        .mockResolvedValue({ id: 'health-log-1', userId: 'user-1', sourceId: 'source-1' });
      const findBySourceId = jest.fn().mockResolvedValue([{ id: 'health-log-1', userId: 'user-1' }]);
      const getById = jest.fn().mockResolvedValue({ id: 'health-log-1', userId: 'user-1' });

      const repository: HealthLogRepository = {
        create,
        findBySourceId,
        getById,
        listPageByUser: jest.fn(),
        listByUser: jest.fn(),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById,
      };

      const service = new HealthLogDomainService(repository);
      const fetched = await service.getById('health-log-1');
      const created = await service.createRecord({ userId: 'user-1', type: 'bp' });
      const updated = await service.updateRecord('health-log-1', { sourceId: 'source-1' });
      const found = await service.findBySourceId('user-1', 'source-1', { includeDeleted: true });

      expect(getById).toHaveBeenCalledWith('health-log-1');
      expect(create).toHaveBeenCalledWith({ userId: 'user-1', type: 'bp' });
      expect(updateById).toHaveBeenCalledWith('health-log-1', { sourceId: 'source-1' });
      expect(findBySourceId).toHaveBeenCalledWith('user-1', 'source-1', { includeDeleted: true });
      expect(fetched).toEqual({ id: 'health-log-1', userId: 'user-1' });
      expect(created).toEqual({ id: 'health-log-1', userId: 'user-1' });
      expect(updated).toEqual({ id: 'health-log-1', userId: 'user-1', sourceId: 'source-1' });
      expect(found).toEqual([{ id: 'health-log-1', userId: 'user-1' }]);
    });

    it('forwards soft-delete and restore mutations to repository', async () => {
      const now = { toDate: () => new Date('2026-02-21T12:00:00.000Z') } as FirebaseFirestore.Timestamp;
      const softDeleteById = jest.fn().mockResolvedValue(undefined);
      const restoreById = jest.fn().mockResolvedValue(undefined);

      const repository: HealthLogRepository = {
        create: jest.fn(),
        findBySourceId: jest.fn(),
        getById: jest.fn(),
        listPageByUser: jest.fn(),
        listByUser: jest.fn(),
        restoreById,
        softDeleteById,
        updateById: jest.fn(),
      };

      const service = new HealthLogDomainService(repository);
      await service.softDeleteRecord('health-log-1', 'user-1', now);
      await service.restoreRecord('health-log-1', now);

      expect(softDeleteById).toHaveBeenCalledWith('health-log-1', 'user-1', now);
      expect(restoreById).toHaveBeenCalledWith('health-log-1', now);
    });
  });

  describe('MedicationLogDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByUser = jest.fn().mockResolvedValue([{ id: 'log-1', userId: 'user-1' }]);
      const listByUsers = jest.fn().mockResolvedValue([{ id: 'log-2', userId: 'user-2' }]);

      const repository: MedicationLogRepository = {
        listByUsers,
        listByUser,
      };

      const service = new MedicationLogDomainService(repository);
      const result = await service.listForUser('user-1', {
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        dateField: 'createdAt',
        medicationId: 'med-1',
      });

      expect(listByUser).toHaveBeenCalledWith('user-1', {
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        dateField: 'createdAt',
        medicationId: 'med-1',
      });
      expect(result).toEqual([{ id: 'log-1', userId: 'user-1' }]);

      const batchResult = await service.listForUsers(['user-1', 'user-2'], {
        dateField: 'loggedAt',
      });
      expect(listByUsers).toHaveBeenCalledWith(['user-1', 'user-2'], {
        dateField: 'loggedAt',
      });
      expect(batchResult).toEqual([{ id: 'log-2', userId: 'user-2' }]);
    });
  });

  describe('MedicationReminderDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByUser = jest.fn().mockResolvedValue([{ id: 'rem-1', userId: 'user-1' }]);
      const listByUsers = jest.fn().mockResolvedValue([{ id: 'rem-2', userId: 'user-2' }]);

      const repository: MedicationReminderRepository = {
        listByUsers,
        listByUser,
      };

      const service = new MedicationReminderDomainService(repository);
      const result = await service.listForUser('user-1', {
        enabled: true,
      });

      expect(listByUser).toHaveBeenCalledWith('user-1', {
        enabled: true,
      });
      expect(result).toEqual([{ id: 'rem-1', userId: 'user-1' }]);

      const batchResult = await service.listForUsers(['user-1', 'user-2'], {
        enabled: false,
      });
      expect(listByUsers).toHaveBeenCalledWith(['user-1', 'user-2'], {
        enabled: false,
      });
      expect(batchResult).toEqual([{ id: 'rem-2', userId: 'user-2' }]);
    });
  });

  describe('NudgeDomainService', () => {
    it('forwards read/write calls to repository', async () => {
      const getById = jest.fn().mockResolvedValue({
        id: 'nudge-1',
        userId: 'user-1',
        status: 'pending',
      });
      const listActiveByUser = jest.fn().mockResolvedValue([
        {
          id: 'nudge-active-1',
          userId: 'user-1',
          status: 'active',
        },
      ]);
      const listHistoryByUser = jest.fn().mockResolvedValue([
        {
          id: 'nudge-2',
          userId: 'user-1',
          status: 'completed',
        },
      ]);
      const listByUserAndStatuses = jest.fn().mockResolvedValue([
        { id: 'nudge-3', userId: 'user-1', status: 'pending' },
      ]);
      const listByUserAndSequence = jest.fn().mockResolvedValue([
        { id: 'nudge-4', userId: 'user-1', sequenceId: 'seq-1', status: 'snoozed' },
      ]);
      const hasByUserConditionAndStatuses = jest.fn().mockResolvedValue(true);
      const hasByUserMedicationNameAndStatuses = jest.fn().mockResolvedValue(false);
      const hasRecentInsightByPattern = jest.fn().mockResolvedValue(false);
      const listByUserStatusesScheduledBetween = jest.fn().mockResolvedValue([
        {
          id: 'nudge-6',
          userId: 'user-1',
          status: 'pending',
          scheduledFor: { toDate: () => new Date('2026-02-22T13:00:00.000Z') },
        },
      ]);
      const listDuePendingForNotification = jest.fn().mockResolvedValue([
        { id: 'nudge-due-1', userId: 'user-1', status: 'pending' },
      ]);
      const countByUserNotificationSentBetween = jest.fn().mockResolvedValue(2);
      const acquireNotificationSendLock = jest.fn().mockResolvedValue(true);
      const markNotificationProcessed = jest.fn().mockResolvedValue(undefined);
      const backfillPendingNotificationSentField = jest.fn().mockResolvedValue(3);
      const create = jest.fn().mockResolvedValue({ id: 'nudge-5' });
      const completeById = jest.fn().mockResolvedValue(undefined);
      const snoozeById = jest.fn().mockResolvedValue(undefined);
      const dismissByIds = jest.fn().mockResolvedValue({ updatedCount: 2 });

      const repository: NudgeRepository = {
        acquireNotificationSendLock,
        backfillPendingNotificationSentField,
        countByUserNotificationSentBetween,
        create,
        completeById,
        dismissByIds,
        getById,
        hasByUserConditionAndStatuses,
        hasByUserMedicationNameAndStatuses,
        hasRecentInsightByPattern,
        listActiveByUser,
        listDuePendingForNotification,
        listHistoryByUser,
        listByUserAndSequence,
        listByUserAndStatuses,
        listByUserStatusesScheduledBetween,
        markNotificationProcessed,
        snoozeById,
      };

      const service = new NudgeDomainService(repository);
      const nudge = await service.getById('nudge-1');
      const active = await service.listActiveByUser('user-1', {
        now: { toDate: () => new Date('2026-02-22T11:00:00.000Z') } as FirebaseFirestore.Timestamp,
        limit: 10,
      });
      const history = await service.listHistoryByUser('user-1', 20);
      const pending = await service.listByUserAndStatuses('user-1', ['pending']);
      const sequence = await service.listByUserAndSequence('user-1', 'seq-1', ['pending', 'snoozed']);
      const hasCondition = await service.hasByUserConditionAndStatuses('user-1', 'diabetes', [
        'pending',
        'active',
      ]);
      const hasMedication = await service.hasByUserMedicationNameAndStatuses(
        'user-1',
        'Metformin',
        ['pending'],
      );
      const hasRecentInsight = await service.hasRecentInsightByPattern(
        'user-1',
        'bp_trend',
        { toDate: () => new Date('2026-02-19T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
      );
      const scheduled = await service.listByUserStatusesScheduledBetween(
        'user-1',
        ['pending'],
        { toDate: () => new Date('2026-02-22T00:00:00.000Z') } as FirebaseFirestore.Timestamp,
        { toDate: () => new Date('2026-02-23T00:00:00.000Z') } as FirebaseFirestore.Timestamp,
      );
      const dueForNotifications = await service.listDuePendingForNotification(
        { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
        25,
      );
      const sentCount = await service.countByUserNotificationSentBetween(
        'user-1',
        { toDate: () => new Date('2026-02-22T00:00:00.000Z') } as FirebaseFirestore.Timestamp,
        { toDate: () => new Date('2026-02-22T23:59:00.000Z') } as FirebaseFirestore.Timestamp,
      );
      const lockAcquired = await service.acquireNotificationSendLock(
        'nudge-1',
        { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
        300000,
      );
      await service.markNotificationProcessed('nudge-1', {
        now: { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
        sentAt: { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
        clearLock: true,
      });
      const backfilled = await service.backfillPendingNotificationSentField();
      const created = await service.createRecord({ userId: 'user-1', status: 'pending' });
      await service.completeById('nudge-1', {
        now: { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
        responseValue: { response: 'taking_it' },
      });
      await service.snoozeById('nudge-1', {
        now: { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
        snoozedUntil: { toDate: () => new Date('2026-02-24T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
      });
      await service.dismissById('nudge-1', {
        now: { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
      });
      const dismissed = await service.dismissByIds(['nudge-3', 'nudge-4'], {
        now: { toDate: () => new Date('2026-02-22T12:00:00.000Z') } as FirebaseFirestore.Timestamp,
        dismissalReason: 'test',
      });

      expect(getById).toHaveBeenCalledWith('nudge-1');
      expect(listActiveByUser).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          limit: 10,
        }),
      );
      expect(listHistoryByUser).toHaveBeenCalledWith('user-1', 20);
      expect(listByUserAndStatuses).toHaveBeenCalledWith('user-1', ['pending']);
      expect(listByUserAndSequence).toHaveBeenCalledWith('user-1', 'seq-1', ['pending', 'snoozed']);
      expect(hasByUserConditionAndStatuses).toHaveBeenCalledWith('user-1', 'diabetes', [
        'pending',
        'active',
      ]);
      expect(hasByUserMedicationNameAndStatuses).toHaveBeenCalledWith(
        'user-1',
        'Metformin',
        ['pending'],
      );
      expect(hasRecentInsightByPattern).toHaveBeenCalledWith(
        'user-1',
        'bp_trend',
        expect.any(Object),
      );
      expect(listByUserStatusesScheduledBetween).toHaveBeenCalledWith(
        'user-1',
        ['pending'],
        expect.any(Object),
        expect.any(Object),
      );
      expect(listDuePendingForNotification).toHaveBeenCalledWith(expect.any(Object), 25);
      expect(countByUserNotificationSentBetween).toHaveBeenCalledWith(
        'user-1',
        expect.any(Object),
        expect.any(Object),
      );
      expect(acquireNotificationSendLock).toHaveBeenCalledWith(
        'nudge-1',
        expect.any(Object),
        300000,
      );
      expect(markNotificationProcessed).toHaveBeenCalledWith(
        'nudge-1',
        expect.objectContaining({
          clearLock: true,
        }),
      );
      expect(backfillPendingNotificationSentField).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({ userId: 'user-1', status: 'pending' });
      expect(completeById).toHaveBeenCalledWith(
        'nudge-1',
        expect.objectContaining({
          responseValue: { response: 'taking_it' },
        }),
      );
      expect(snoozeById).toHaveBeenCalledWith(
        'nudge-1',
        expect.objectContaining({
          snoozedUntil: expect.any(Object),
        }),
      );
      expect(dismissByIds).toHaveBeenCalledWith(
        ['nudge-1'],
        expect.objectContaining({}),
      );
      expect(dismissByIds).toHaveBeenCalledWith(
        ['nudge-3', 'nudge-4'],
        expect.objectContaining({
          dismissalReason: 'test',
        }),
      );
      expect(nudge).toEqual({
        id: 'nudge-1',
        userId: 'user-1',
        status: 'pending',
      });
      expect(history).toEqual([
        {
          id: 'nudge-2',
          userId: 'user-1',
          status: 'completed',
        },
      ]);
      expect(active).toEqual([
        {
          id: 'nudge-active-1',
          userId: 'user-1',
          status: 'active',
        },
      ]);
      expect(pending).toEqual([{ id: 'nudge-3', userId: 'user-1', status: 'pending' }]);
      expect(sequence).toEqual([
        { id: 'nudge-4', userId: 'user-1', sequenceId: 'seq-1', status: 'snoozed' },
      ]);
      expect(hasCondition).toBe(true);
      expect(hasMedication).toBe(false);
      expect(hasRecentInsight).toBe(false);
      expect(scheduled).toEqual([
        expect.objectContaining({
          id: 'nudge-6',
          userId: 'user-1',
          status: 'pending',
        }),
      ]);
      expect(dueForNotifications).toEqual([{ id: 'nudge-due-1', userId: 'user-1', status: 'pending' }]);
      expect(sentCount).toBe(2);
      expect(lockAcquired).toBe(true);
      expect(backfilled).toBe(3);
      expect(created).toEqual({ id: 'nudge-5' });
      expect(dismissed).toEqual({ updatedCount: 2 });
    });
  });

  describe('CareTaskDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByCaregiverPatient = jest.fn().mockResolvedValue({
        items: [{ id: 'task-1', patientId: 'patient-1', caregiverId: 'caregiver-1' }],
        hasMore: true,
        nextCursor: 'task-1',
      });
      const listAllByCaregiverPatient = jest
        .fn()
        .mockResolvedValue([{ id: 'task-2', patientId: 'patient-1', caregiverId: 'caregiver-1' }]);

      const repository: CareTaskRepository = {
        create: jest.fn(),
        getById: jest.fn(),
        listAllByCaregiverPatient,
        listByCaregiverPatient,
        updateById: jest.fn(),
      };

      const service = new CareTaskDomainService(repository);
      const page = await service.listForCaregiverPatient('caregiver-1', 'patient-1', {
        limit: 20,
        cursor: 'cursor-1',
        status: 'pending',
      });
      const list = await service.listAllForCaregiverPatient('caregiver-1', 'patient-1', {
        status: 'in_progress',
      });

      expect(listByCaregiverPatient).toHaveBeenCalledWith('caregiver-1', 'patient-1', {
        limit: 20,
        cursor: 'cursor-1',
        status: 'pending',
      });
      expect(listAllByCaregiverPatient).toHaveBeenCalledWith('caregiver-1', 'patient-1', {
        status: 'in_progress',
      });
      expect(page.hasMore).toBe(true);
      expect(list).toEqual([{ id: 'task-2', patientId: 'patient-1', caregiverId: 'caregiver-1' }]);
    });

    it('forwards get/create/update mutations to repository', async () => {
      const getById = jest
        .fn()
        .mockResolvedValue({ id: 'task-1', patientId: 'patient-1', caregiverId: 'caregiver-1' });
      const create = jest
        .fn()
        .mockResolvedValue({ id: 'task-2', patientId: 'patient-1', caregiverId: 'caregiver-1' });
      const updateById = jest
        .fn()
        .mockResolvedValue({ id: 'task-1', patientId: 'patient-1', caregiverId: 'caregiver-1' });

      const repository: CareTaskRepository = {
        create,
        getById,
        listAllByCaregiverPatient: jest.fn(),
        listByCaregiverPatient: jest.fn(),
        updateById,
      };

      const service = new CareTaskDomainService(repository);
      const task = await service.getById('task-1');
      const created = await service.createRecord({
        patientId: 'patient-1',
        caregiverId: 'caregiver-1',
      });
      const updated = await service.updateRecord('task-1', { status: 'completed' });

      expect(getById).toHaveBeenCalledWith('task-1');
      expect(create).toHaveBeenCalledWith({
        patientId: 'patient-1',
        caregiverId: 'caregiver-1',
      });
      expect(updateById).toHaveBeenCalledWith('task-1', { status: 'completed' });
      expect(task).toEqual({ id: 'task-1', patientId: 'patient-1', caregiverId: 'caregiver-1' });
      expect(created).toEqual({ id: 'task-2', patientId: 'patient-1', caregiverId: 'caregiver-1' });
      expect(updated).toEqual({ id: 'task-1', patientId: 'patient-1', caregiverId: 'caregiver-1' });
    });
  });

  describe('CaregiverNoteDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByCaregiverPatient = jest.fn().mockResolvedValue({
        items: [{ id: 'note-1', caregiverId: 'caregiver-1', patientId: 'patient-1' }],
        hasMore: false,
        nextCursor: null,
      });
      const listAllByCaregiverPatient = jest
        .fn()
        .mockResolvedValue([{ id: 'note-2', caregiverId: 'caregiver-1', patientId: 'patient-1' }]);

      const repository: CaregiverNoteRepository = {
        deleteById: jest.fn(),
        getById: jest.fn(),
        listAllByCaregiverPatient,
        listByCaregiverPatient,
        upsertById: jest.fn(),
      };

      const service = new CaregiverNoteDomainService(repository);
      const page = await service.listForCaregiverPatient('caregiver-1', 'patient-1', {
        limit: 10,
        cursor: 'cursor-1',
      });
      const list = await service.listAllForCaregiverPatient('caregiver-1', 'patient-1');

      expect(listByCaregiverPatient).toHaveBeenCalledWith('caregiver-1', 'patient-1', {
        limit: 10,
        cursor: 'cursor-1',
      });
      expect(listAllByCaregiverPatient).toHaveBeenCalledWith('caregiver-1', 'patient-1');
      expect(page.items).toEqual([{ id: 'note-1', caregiverId: 'caregiver-1', patientId: 'patient-1' }]);
      expect(list).toEqual([{ id: 'note-2', caregiverId: 'caregiver-1', patientId: 'patient-1' }]);
    });

    it('forwards get/upsert/delete mutations to repository', async () => {
      const getById = jest
        .fn()
        .mockResolvedValue({ id: 'note-1', caregiverId: 'caregiver-1', patientId: 'patient-1' });
      const upsertById = jest
        .fn()
        .mockResolvedValue({ id: 'note-1', caregiverId: 'caregiver-1', patientId: 'patient-1' });
      const deleteById = jest.fn().mockResolvedValue(undefined);

      const repository: CaregiverNoteRepository = {
        deleteById,
        getById,
        listAllByCaregiverPatient: jest.fn(),
        listByCaregiverPatient: jest.fn(),
        upsertById,
      };

      const service = new CaregiverNoteDomainService(repository);
      const note = await service.getById('note-1');
      const upserted = await service.upsertRecord('note-1', { note: 'Follow-up needed' });
      await service.deleteRecord('note-1');

      expect(getById).toHaveBeenCalledWith('note-1');
      expect(upsertById).toHaveBeenCalledWith('note-1', { note: 'Follow-up needed' });
      expect(deleteById).toHaveBeenCalledWith('note-1');
      expect(note).toEqual({ id: 'note-1', caregiverId: 'caregiver-1', patientId: 'patient-1' });
      expect(upserted).toEqual({ id: 'note-1', caregiverId: 'caregiver-1', patientId: 'patient-1' });
    });
  });

  describe('PatientContextDomainService', () => {
    it('forwards context lookups to repository', async () => {
      const getByUserId = jest.fn().mockResolvedValue({
        id: 'user-1',
        userId: 'user-1',
        conditions: [{ id: 'hypertension', name: 'Hypertension', status: 'active' }],
      });

      const repository: PatientContextRepository = {
        getByUserId,
        setByUserId: jest.fn(),
        updateByUserId: jest.fn(),
        updateConditions: jest.fn(),
      };

      const service = new PatientContextDomainService(repository);
      const context = await service.getForUser('user-1');

      expect(getByUserId).toHaveBeenCalledWith('user-1');
      expect(context).toEqual({
        id: 'user-1',
        userId: 'user-1',
        conditions: [{ id: 'hypertension', name: 'Hypertension', status: 'active' }],
      });
    });

    it('returns context_not_found when user context does not exist', async () => {
      const repository: PatientContextRepository = {
        getByUserId: jest.fn().mockResolvedValue(null),
        setByUserId: jest.fn(),
        updateByUserId: jest.fn(),
        updateConditions: jest.fn(),
      };

      const service = new PatientContextDomainService(repository);
      const result = await service.updateConditionStatusForUser('user-1', 'hypertension', 'resolved');

      expect(result).toEqual({ outcome: 'context_not_found' });
    });

    it('returns condition_not_found when condition does not exist', async () => {
      const repository: PatientContextRepository = {
        getByUserId: jest.fn().mockResolvedValue({
          id: 'user-1',
          userId: 'user-1',
          conditions: [{ id: 'diabetes', name: 'Diabetes', status: 'active' }],
        }),
        setByUserId: jest.fn(),
        updateByUserId: jest.fn(),
        updateConditions: jest.fn(),
      };

      const service = new PatientContextDomainService(repository);
      const result = await service.updateConditionStatusForUser('user-1', 'hypertension', 'resolved');

      expect(result).toEqual({ outcome: 'condition_not_found' });
      expect(repository.updateConditions).not.toHaveBeenCalled();
    });

    it('updates a matching condition status via repository', async () => {
      const updateConditions = jest.fn().mockResolvedValue(undefined);
      const repository: PatientContextRepository = {
        getByUserId: jest.fn().mockResolvedValue({
          id: 'user-1',
          userId: 'user-1',
          conditions: [
            { id: 'hypertension', name: 'Hypertension', status: 'active' },
            { id: 'diabetes', name: 'Type 2 Diabetes', status: 'monitoring' },
          ],
        }),
        setByUserId: jest.fn(),
        updateByUserId: jest.fn(),
        updateConditions,
      };

      const service = new PatientContextDomainService(repository);
      const result = await service.updateConditionStatusForUser('user-1', 'hypertension', 'resolved');

      expect(updateConditions).toHaveBeenCalledWith(
        'user-1',
        [
          { id: 'hypertension', name: 'Hypertension', status: 'resolved' },
          { id: 'diabetes', name: 'Type 2 Diabetes', status: 'monitoring' },
        ],
        expect.any(Date),
      );
      expect(result).toEqual({
        outcome: 'updated',
        condition: {
          id: 'hypertension',
          status: 'resolved',
        },
      });
    });

    it('forwards set and update mutations to repository', async () => {
      const setByUserId = jest.fn().mockResolvedValue(undefined);
      const updateByUserId = jest.fn().mockResolvedValue(undefined);
      const repository: PatientContextRepository = {
        getByUserId: jest.fn(),
        setByUserId,
        updateByUserId,
        updateConditions: jest.fn(),
      };

      const service = new PatientContextDomainService(repository);
      await service.setForUser('user-1', { conditions: [] }, { merge: true });
      await service.updateForUser('user-1', { updatedAt: new Date('2026-02-22T12:00:00.000Z') });

      expect(setByUserId).toHaveBeenCalledWith(
        'user-1',
        { conditions: [] },
        { merge: true },
      );
      expect(updateByUserId).toHaveBeenCalledWith(
        'user-1',
        { updatedAt: new Date('2026-02-22T12:00:00.000Z') },
      );
    });
  });

  describe('ShareDomainService', () => {
    const createShareRepository = (
      overrides: Partial<ShareRepository> = {},
    ): ShareRepository => ({
      acceptInviteAndSetShare: jest.fn(),
      createInvite: jest.fn(),
      findFirstByOwnerAndCaregiverEmail: jest.fn(),
      getById: jest.fn(),
      getInviteById: jest.fn(),
      hasPendingInviteByOwnerAndCaregiverEmail: jest.fn(),
      hasPendingInviteByOwnerAndInviteeEmail: jest.fn(),
      listByCaregiverUserId: jest.fn(),
      listByCaregiverEmail: jest.fn(),
      listByOwnerId: jest.fn(),
      listInvitesByOwnerId: jest.fn(),
      listPendingInvitesByCaregiverEmail: jest.fn(),
      listPendingInvitesByLegacyEmail: jest.fn(),
      migrateShareToCaregiver: jest.fn(),
      revokeInviteAndRelatedShare: jest.fn(),
      setShare: jest.fn(),
      updateById: jest.fn(),
      updateInviteById: jest.fn(),
      ...overrides,
    });

    it('forwards share list/get methods to repository', async () => {
      const listByOwnerId = jest.fn().mockResolvedValue([{ id: 'share-1', ownerId: 'owner-1' }]);
      const listByCaregiverUserId = jest
        .fn()
        .mockResolvedValue([{ id: 'share-2', caregiverUserId: 'caregiver-1' }]);
      const listByCaregiverEmail = jest
        .fn()
        .mockResolvedValue([{ id: 'share-2b', caregiverEmail: 'caregiver@example.com' }]);
      const getById = jest.fn().mockResolvedValue({ id: 'share-3', ownerId: 'owner-2' });
      const updateById = jest.fn();
      const getInviteById = jest.fn();
      const revokeInviteAndRelatedShare = jest.fn();
      const updateInviteById = jest.fn();
      const acceptInviteAndSetShare = jest.fn();

      const repository = createShareRepository({
        acceptInviteAndSetShare,
        getById,
        getInviteById,
        listByCaregiverEmail,
        listByCaregiverUserId,
        listByOwnerId,
        listInvitesByOwnerId: jest.fn(),
        listPendingInvitesByCaregiverEmail: jest.fn(),
        listPendingInvitesByLegacyEmail: jest.fn(),
        revokeInviteAndRelatedShare,
        updateInviteById,
        updateById,
      });

      const service = new ShareDomainService(repository);
      const outgoing = await service.listByOwnerId('owner-1');
      const incoming = await service.listByCaregiverUserId('caregiver-1');
      const incomingByEmail = await service.listByCaregiverEmail('caregiver@example.com');
      const share = await service.getById('share-3');

      expect(listByOwnerId).toHaveBeenCalledWith('owner-1');
      expect(listByCaregiverUserId).toHaveBeenCalledWith('caregiver-1');
      expect(listByCaregiverEmail).toHaveBeenCalledWith('caregiver@example.com');
      expect(getById).toHaveBeenCalledWith('share-3');
      expect(outgoing).toEqual([{ id: 'share-1', ownerId: 'owner-1' }]);
      expect(incoming).toEqual([{ id: 'share-2', caregiverUserId: 'caregiver-1' }]);
      expect(incomingByEmail).toEqual([{ id: 'share-2b', caregiverEmail: 'caregiver@example.com' }]);
      expect(share).toEqual({ id: 'share-3', ownerId: 'owner-2' });
    });

    it('deduplicates pending invites across legacy and caregiver email fields', async () => {
      const listPendingInvitesByLegacyEmail = jest.fn().mockResolvedValue([
        { id: 'invite-1', inviteeEmail: 'caregiver@example.com', status: 'pending' },
      ]);
      const listPendingInvitesByCaregiverEmail = jest.fn().mockResolvedValue([
        { id: 'invite-1', caregiverEmail: 'caregiver@example.com', status: 'pending' },
        { id: 'invite-2', caregiverEmail: 'caregiver@example.com', status: 'pending' },
      ]);

      const repository = createShareRepository({
        acceptInviteAndSetShare: jest.fn(),
        getById: jest.fn(),
        getInviteById: jest.fn(),
        listByCaregiverUserId: jest.fn(),
        listByOwnerId: jest.fn(),
        listInvitesByOwnerId: jest.fn(),
        listPendingInvitesByCaregiverEmail,
        listPendingInvitesByLegacyEmail,
        revokeInviteAndRelatedShare: jest.fn(),
        updateInviteById: jest.fn(),
        updateById: jest.fn(),
      });

      const service = new ShareDomainService(repository);
      const invites = await service.listPendingInvitesForCaregiverEmail('caregiver@example.com');

      expect(listPendingInvitesByLegacyEmail).toHaveBeenCalledWith('caregiver@example.com');
      expect(listPendingInvitesByCaregiverEmail).toHaveBeenCalledWith('caregiver@example.com');
      expect(invites).toEqual([
        { id: 'invite-1', caregiverEmail: 'caregiver@example.com', status: 'pending' },
        { id: 'invite-2', caregiverEmail: 'caregiver@example.com', status: 'pending' },
      ]);
    });

    it('forwards owner invite list calls to repository', async () => {
      const listInvitesByOwnerId = jest
        .fn()
        .mockResolvedValue([{ id: 'invite-1', ownerId: 'owner-1', status: 'pending' }]);

      const repository = createShareRepository({
        acceptInviteAndSetShare: jest.fn(),
        getById: jest.fn(),
        getInviteById: jest.fn(),
        listByCaregiverUserId: jest.fn(),
        listByOwnerId: jest.fn(),
        listInvitesByOwnerId,
        listPendingInvitesByCaregiverEmail: jest.fn(),
        listPendingInvitesByLegacyEmail: jest.fn(),
        revokeInviteAndRelatedShare: jest.fn(),
        updateInviteById: jest.fn(),
        updateById: jest.fn(),
      });

      const service = new ShareDomainService(repository);
      const invites = await service.listInvitesByOwnerId('owner-1');

      expect(listInvitesByOwnerId).toHaveBeenCalledWith('owner-1');
      expect(invites).toEqual([{ id: 'invite-1', ownerId: 'owner-1', status: 'pending' }]);
    });

    it('forwards invite read/update and accept+share writes to repository', async () => {
      const getInviteById = jest
        .fn()
        .mockResolvedValue({ id: 'invite-1', ownerId: 'owner-1', status: 'pending' });
      const updateInviteById = jest
        .fn()
        .mockResolvedValue({ id: 'invite-1', ownerId: 'owner-1', status: 'expired' });
      const acceptInviteAndSetShare = jest.fn().mockResolvedValue(undefined);

      const repository = createShareRepository({
        acceptInviteAndSetShare,
        getById: jest.fn(),
        getInviteById,
        listByCaregiverUserId: jest.fn(),
        listByOwnerId: jest.fn(),
        listInvitesByOwnerId: jest.fn(),
        listPendingInvitesByCaregiverEmail: jest.fn(),
        listPendingInvitesByLegacyEmail: jest.fn(),
        revokeInviteAndRelatedShare: jest.fn(),
        updateInviteById,
        updateById: jest.fn(),
      });

      const service = new ShareDomainService(repository);
      const invite = await service.getInviteById('invite-1');
      const updatedInvite = await service.updateInviteRecord('invite-1', { status: 'expired' });
      await service.acceptInviteAndSetShare({
        inviteId: 'invite-1',
        inviteUpdates: { status: 'accepted' },
        shareId: 'owner-1_caregiver-1',
        sharePayload: { status: 'accepted' },
        mergeShare: true,
      });

      expect(getInviteById).toHaveBeenCalledWith('invite-1');
      expect(updateInviteById).toHaveBeenCalledWith('invite-1', { status: 'expired' });
      expect(acceptInviteAndSetShare).toHaveBeenCalledWith(
        'invite-1',
        { status: 'accepted' },
        'owner-1_caregiver-1',
        { status: 'accepted' },
        { merge: true },
      );
      expect(invite).toEqual({ id: 'invite-1', ownerId: 'owner-1', status: 'pending' });
      expect(updatedInvite).toEqual({ id: 'invite-1', ownerId: 'owner-1', status: 'expired' });
    });

    it('transitions owner revoke and caregiver accept status updates', async () => {
      const revokeUpdatedAt = new Date('2026-02-22T12:00:00.000Z');
      const acceptUpdatedAt = new Date('2026-02-22T12:05:00.000Z');
      const acceptAcceptedAt = new Date('2026-02-22T12:05:00.000Z');
      const updateById = jest
        .fn()
        .mockResolvedValueOnce({
          id: 'share-owner-revoke',
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          status: 'revoked',
        })
        .mockResolvedValueOnce({
          id: 'share-caregiver-accept',
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        });

      const repository = createShareRepository({
        acceptInviteAndSetShare: jest.fn(),
        getById: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'share-owner-revoke',
            ownerId: 'owner-1',
            caregiverUserId: 'caregiver-1',
            status: 'accepted',
          })
          .mockResolvedValueOnce({
            id: 'share-caregiver-accept',
            ownerId: 'owner-1',
            caregiverUserId: 'caregiver-1',
            status: 'pending',
          }),
        getInviteById: jest.fn(),
        listByCaregiverUserId: jest.fn(),
        listByOwnerId: jest.fn(),
        listInvitesByOwnerId: jest.fn(),
        listPendingInvitesByCaregiverEmail: jest.fn(),
        listPendingInvitesByLegacyEmail: jest.fn(),
        revokeInviteAndRelatedShare: jest.fn(),
        updateInviteById: jest.fn(),
        updateById,
      });

      const service = new ShareDomainService(repository);
      const ownerResult = await service.transitionStatus(
        'share-owner-revoke',
        'owner-1',
        'revoked',
        {
          updatedAt: revokeUpdatedAt,
        },
      );
      const caregiverResult = await service.transitionStatus(
        'share-caregiver-accept',
        'caregiver-1',
        'accepted',
        {
          updatedAt: acceptUpdatedAt,
          acceptedAt: acceptAcceptedAt,
        },
      );

      expect(ownerResult).toEqual({
        outcome: 'updated',
        share: {
          id: 'share-owner-revoke',
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          status: 'revoked',
        },
      });
      expect(caregiverResult).toEqual({
        outcome: 'updated',
        share: {
          id: 'share-caregiver-accept',
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        },
      });

      expect(updateById).toHaveBeenNthCalledWith(
        1,
        'share-owner-revoke',
        {
          status: 'revoked',
          updatedAt: revokeUpdatedAt,
        },
      );
      expect(updateById).toHaveBeenNthCalledWith(
        2,
        'share-caregiver-accept',
        {
          status: 'accepted',
          acceptedAt: acceptAcceptedAt,
          updatedAt: acceptUpdatedAt,
        },
      );
    });

    it('returns invalid_transition when actor cannot perform requested status change', async () => {
      const repository = createShareRepository({
        acceptInviteAndSetShare: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'share-1',
          ownerId: 'owner-1',
          caregiverUserId: 'caregiver-1',
          status: 'accepted',
        }),
        getInviteById: jest.fn(),
        listByCaregiverUserId: jest.fn(),
        listByOwnerId: jest.fn(),
        listInvitesByOwnerId: jest.fn(),
        listPendingInvitesByCaregiverEmail: jest.fn(),
        listPendingInvitesByLegacyEmail: jest.fn(),
        revokeInviteAndRelatedShare: jest.fn(),
        updateInviteById: jest.fn(),
        updateById: jest.fn(),
      });

      const service = new ShareDomainService(repository);
      const result = await service.transitionStatus('share-1', 'caregiver-1', 'accepted', {
        updatedAt: new Date('2026-02-22T13:00:00.000Z'),
      });

      expect(result).toEqual({ outcome: 'invalid_transition' });
      expect(repository.updateById).not.toHaveBeenCalled();
    });

    it('revokes invite by owner and cascades related share updates', async () => {
      const invite = {
        id: 'invite-1',
        ownerId: 'owner-1',
        caregiverUserId: 'caregiver-1',
        status: 'accepted',
      };
      const getInviteById = jest.fn().mockResolvedValue(invite);
      const revokeInviteAndRelatedShare = jest.fn().mockResolvedValue(undefined);

      const repository = createShareRepository({
        acceptInviteAndSetShare: jest.fn(),
        getById: jest.fn(),
        getInviteById,
        listByCaregiverUserId: jest.fn(),
        listByOwnerId: jest.fn(),
        listInvitesByOwnerId: jest.fn(),
        listPendingInvitesByCaregiverEmail: jest.fn(),
        listPendingInvitesByLegacyEmail: jest.fn(),
        revokeInviteAndRelatedShare,
        updateInviteById: jest.fn(),
        updateById: jest.fn(),
      });

      const service = new ShareDomainService(repository);
      const result = await service.revokeInviteByOwner('invite-1', 'owner-1');

      expect(getInviteById).toHaveBeenCalledWith('invite-1');
      expect(revokeInviteAndRelatedShare).toHaveBeenCalledWith('invite-1', invite);
      expect(result).toEqual({
        outcome: 'revoked',
        invite,
      });
    });

    it('returns not_found/forbidden for revokeInviteByOwner guard paths', async () => {
      const getInviteById = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'invite-2',
          ownerId: 'owner-2',
          status: 'pending',
        });

      const repository = createShareRepository({
        acceptInviteAndSetShare: jest.fn(),
        getById: jest.fn(),
        getInviteById,
        listByCaregiverUserId: jest.fn(),
        listByOwnerId: jest.fn(),
        listInvitesByOwnerId: jest.fn(),
        listPendingInvitesByCaregiverEmail: jest.fn(),
        listPendingInvitesByLegacyEmail: jest.fn(),
        revokeInviteAndRelatedShare: jest.fn(),
        updateInviteById: jest.fn(),
        updateById: jest.fn(),
      });

      const service = new ShareDomainService(repository);
      const missingResult = await service.revokeInviteByOwner('invite-1', 'owner-1');
      const forbiddenResult = await service.revokeInviteByOwner('invite-2', 'owner-1');

      expect(missingResult).toEqual({ outcome: 'not_found' });
      expect(forbiddenResult).toEqual({ outcome: 'forbidden' });
      expect(repository.revokeInviteAndRelatedShare).not.toHaveBeenCalled();
    });
  });

  describe('UserDomainService', () => {
    it('forwards get/list methods to repository', async () => {
      const getById = jest.fn().mockResolvedValue({ id: 'user-1', timezone: 'America/Chicago' });
      const listByIds = jest.fn().mockResolvedValue([{ id: 'user-2', timezone: 'America/New_York' }]);

      const repository: UserRepository = {
        ensureCaregiverRole: jest.fn(),
        ensureExists: jest.fn(),
        getAnalyticsConsent: jest.fn(),
        applyLegalAssent: jest.fn(),
        getById,
        getLatestPushToken: jest.fn(),
        getExportData: jest.fn(),
        listAnalyticsConsentAudit: jest.fn(),
        listByIds,
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

      const service = new UserDomainService(repository);
      const user = await service.getById('user-1');
      const users = await service.listByIds(['user-1', 'user-2']);

      expect(getById).toHaveBeenCalledWith('user-1');
      expect(listByIds).toHaveBeenCalledWith(['user-1', 'user-2']);
      expect(user).toEqual({ id: 'user-1', timezone: 'America/Chicago' });
      expect(users).toEqual([{ id: 'user-2', timezone: 'America/New_York' }]);
    });

    it('forwards latest push-token lookups to repository', async () => {
      const getLatestPushToken = jest
        .fn()
        .mockResolvedValue({ id: 'token-1', lastActive: { toDate: () => new Date('2026-02-22T10:00:00.000Z') } });

      const repository: UserRepository = {
        ensureCaregiverRole: jest.fn(),
        ensureExists: jest.fn(),
        getAnalyticsConsent: jest.fn(),
        applyLegalAssent: jest.fn(),
        getById: jest.fn(),
        getLatestPushToken,
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

      const service = new UserDomainService(repository);
      const token = await service.getLatestPushToken('user-1');

      expect(getLatestPushToken).toHaveBeenCalledWith('user-1');
      expect(token).toEqual({
        id: 'token-1',
        lastActive: { toDate: expect.any(Function) },
      });
    });

    it('forwards push-token list lookups to repository', async () => {
      const listPushTokens = jest.fn().mockResolvedValue([
        { id: 'token-1', token: 'ExponentPushToken[a]', platform: 'ios' },
        { id: 'token-2', token: 'ExponentPushToken[b]', platform: 'android' },
      ]);
      const repository: UserRepository = {
        ensureCaregiverRole: jest.fn(),
        ensureExists: jest.fn(),
        getAnalyticsConsent: jest.fn(),
        applyLegalAssent: jest.fn(),
        getById: jest.fn(),
        listPushTokens,
        getLatestPushToken: jest.fn(),
        getExportData: jest.fn(),
        listAnalyticsConsentAudit: jest.fn(),
        listByIds: jest.fn(),
        listRestoreAuditEvents: jest.fn(),
        updateRestoreAuditTriage: jest.fn(),
        deleteAllPushTokens: jest.fn(),
        deleteAccountData: jest.fn(),
        registerPushToken: jest.fn(),
        unregisterPushToken: jest.fn(),
        updateAnalyticsConsent: jest.fn(),
        upsertById: jest.fn(),
      };

      const service = new UserDomainService(repository);
      const tokens = await service.listPushTokens('user-1');

      expect(listPushTokens).toHaveBeenCalledWith('user-1');
      expect(tokens).toEqual([
        { id: 'token-1', token: 'ExponentPushToken[a]', platform: 'ios' },
        { id: 'token-2', token: 'ExponentPushToken[b]', platform: 'android' },
      ]);
    });

    it('forwards user export data lookups to repository', async () => {
      const getExportData = jest
        .fn()
        .mockResolvedValue({
          user: { firstName: 'Taylor' },
          visits: [{ id: 'visit-1', data: { userId: 'user-1' } }],
          actions: [],
          medications: [],
          shares: [],
          auditEvents: [],
        });

      const repository: UserRepository = {
        ensureCaregiverRole: jest.fn(),
        ensureExists: jest.fn(),
        getAnalyticsConsent: jest.fn(),
        applyLegalAssent: jest.fn(),
        getById: jest.fn(),
        getLatestPushToken: jest.fn(),
        getExportData,
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

      const service = new UserDomainService(repository);
      const result = await service.getExportData('user-1', { auditLimit: 1000 });

      expect(getExportData).toHaveBeenCalledWith('user-1', { auditLimit: 1000 });
      expect(result).toEqual({
        user: { firstName: 'Taylor' },
        visits: [{ id: 'visit-1', data: { userId: 'user-1' } }],
        actions: [],
        medications: [],
        shares: [],
        auditEvents: [],
      });
    });

    it('forwards caregiver role ensure calls to repository', async () => {
      const ensureCaregiverRole = jest.fn().mockResolvedValue(undefined);
      const repository: UserRepository = {
        ensureCaregiverRole,
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

      const service = new UserDomainService(repository);
      await service.ensureCaregiverRole('user-1');

      expect(ensureCaregiverRole).toHaveBeenCalledWith('user-1');
    });

    it('forwards ensure-exists and upsert calls to repository', async () => {
      const ensureExists = jest
        .fn()
        .mockResolvedValue({ id: 'user-1', firstName: 'Taylor' });
      const upsertById = jest
        .fn()
        .mockResolvedValue({ id: 'user-1', firstName: 'Taylor', updatedAt: { toDate: () => new Date() } });
      const createdAt = { toDate: () => new Date('2026-02-22T18:00:00.000Z') } as unknown as FirebaseFirestore.Timestamp;
      const updatedAt = { toDate: () => new Date('2026-02-22T18:05:00.000Z') } as unknown as FirebaseFirestore.Timestamp;

      const repository: UserRepository = {
        ensureCaregiverRole: jest.fn(),
        ensureExists,
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
        upsertById,
      };

      const service = new UserDomainService(repository);
      const ensured = await service.ensureExists('user-1', {
        createdAt,
        updatedAt,
      });
      const upserted = await service.upsertById(
        'user-1',
        { firstName: 'Taylor', updatedAt },
        { createdAtOnInsert: createdAt },
      );

      expect(ensureExists).toHaveBeenCalledWith('user-1', {
        createdAt,
        updatedAt,
      });
      expect(upsertById).toHaveBeenCalledWith(
        'user-1',
        { firstName: 'Taylor', updatedAt },
        { createdAtOnInsert: createdAt },
      );
      expect(ensured).toEqual({ id: 'user-1', firstName: 'Taylor' });
      expect(upserted).toEqual({
        id: 'user-1',
        firstName: 'Taylor',
        updatedAt: { toDate: expect.any(Function) },
      });
    });

    it('forwards analytics consent reads/updates/audit queries to repository', async () => {
      const getAnalyticsConsent = jest
        .fn()
        .mockResolvedValue({ granted: true, source: 'settings_toggle' });
      const updateAnalyticsConsent = jest
        .fn()
        .mockResolvedValue({
          hasChanged: true,
          nextConsent: { granted: true, source: 'settings_toggle' },
        });
      const listAnalyticsConsentAudit = jest
        .fn()
        .mockResolvedValue([
          {
            id: 'audit-1',
            data: { eventType: 'analytics_consent_changed', granted: true },
          },
        ]);
      const now = {
        toDate: () => new Date('2026-02-22T20:00:00.000Z'),
      } as unknown as FirebaseFirestore.Timestamp;

      const repository: UserRepository = {
        ensureCaregiverRole: jest.fn(),
        ensureExists: jest.fn(),
        getAnalyticsConsent,
        applyLegalAssent: jest.fn(),
        getById: jest.fn(),
        getLatestPushToken: jest.fn(),
        getExportData: jest.fn(),
        listAnalyticsConsentAudit,
        listByIds: jest.fn(),
        listPushTokens: jest.fn(),
        listRestoreAuditEvents: jest.fn(),
        updateRestoreAuditTriage: jest.fn(),
        deleteAllPushTokens: jest.fn(),
        deleteAccountData: jest.fn(),
        registerPushToken: jest.fn(),
        unregisterPushToken: jest.fn(),
        updateAnalyticsConsent,
        upsertById: jest.fn(),
      };

      const service = new UserDomainService(repository);
      const consent = await service.getAnalyticsConsent('user-1');
      const updateResult = await service.updateAnalyticsConsent('user-1', {
        granted: true,
        source: 'settings_toggle',
        policyVersion: '2026-02-22',
        now,
        eventType: 'analytics_consent_changed',
      });
      const audit = await service.listAnalyticsConsentAudit('user-1', 25);

      expect(getAnalyticsConsent).toHaveBeenCalledWith('user-1');
      expect(updateAnalyticsConsent).toHaveBeenCalledWith('user-1', {
        granted: true,
        source: 'settings_toggle',
        policyVersion: '2026-02-22',
        now,
        eventType: 'analytics_consent_changed',
      });
      expect(listAnalyticsConsentAudit).toHaveBeenCalledWith('user-1', 25);
      expect(consent).toEqual({ granted: true, source: 'settings_toggle' });
      expect(updateResult).toEqual({
        hasChanged: true,
        nextConsent: { granted: true, source: 'settings_toggle' },
      });
      expect(audit).toEqual([
        {
          id: 'audit-1',
          data: { eventType: 'analytics_consent_changed', granted: true },
        },
      ]);
    });

    it('forwards legal-assent transaction writes to repository', async () => {
      const applyLegalAssent = jest.fn().mockResolvedValue(undefined);
      const now = {
        toDate: () => new Date('2026-02-22T20:12:00.000Z'),
      } as unknown as FirebaseFirestore.Timestamp;

      const repository: UserRepository = {
        ensureCaregiverRole: jest.fn(),
        ensureExists: jest.fn(),
        getAnalyticsConsent: jest.fn(),
        applyLegalAssent,
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

      const service = new UserDomainService(repository);
      await service.applyLegalAssent(
        'user-1',
        { firstName: 'Taylor', updatedAt: now },
        {
          termsVersion: '1.0',
          privacyVersion: '1.0',
          source: 'signup_web',
          platform: 'web',
          appVersion: 'portal-1.0.0',
          now,
          eventType: 'legal_documents_accepted',
        },
      );

      expect(applyLegalAssent).toHaveBeenCalledWith(
        'user-1',
        { firstName: 'Taylor', updatedAt: now },
        {
          termsVersion: '1.0',
          privacyVersion: '1.0',
          source: 'signup_web',
          platform: 'web',
          appVersion: 'portal-1.0.0',
          now,
          eventType: 'legal_documents_accepted',
        },
      );
    });

    it('forwards restore-audit list/update calls to repository', async () => {
      const listRestoreAuditEvents = jest
        .fn()
        .mockResolvedValue({
          events: [{ id: 'audit-1', data: { resourceType: 'visit' } }],
          hasMore: false,
          nextCursor: null,
          scanned: 1,
        });
      const updateRestoreAuditTriage = jest
        .fn()
        .mockResolvedValue({
          id: 'audit-1',
          data: { triageStatus: 'resolved' },
        });
      const now = {
        toDate: () => new Date('2026-02-22T20:15:00.000Z'),
      } as unknown as FirebaseFirestore.Timestamp;

      const repository: UserRepository = {
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
        listRestoreAuditEvents,
        updateRestoreAuditTriage,
        deleteAllPushTokens: jest.fn(),
        deleteAccountData: jest.fn(),
        registerPushToken: jest.fn(),
        unregisterPushToken: jest.fn(),
        updateAnalyticsConsent: jest.fn(),
        upsertById: jest.fn(),
      };

      const service = new UserDomainService(repository);
      const listResult = await service.listRestoreAuditEvents({
        limit: 25,
        scanLimit: 50,
        triageStatus: 'in_review',
      });
      const updateResult = await service.updateRestoreAuditTriage('audit-1', {
        triageStatus: 'resolved',
        triageNote: 'Checked by operator',
        updatedBy: 'operator-1',
        updatedAt: now,
      });

      expect(listRestoreAuditEvents).toHaveBeenCalledWith({
        limit: 25,
        scanLimit: 50,
        triageStatus: 'in_review',
      });
      expect(updateRestoreAuditTriage).toHaveBeenCalledWith('audit-1', {
        triageStatus: 'resolved',
        triageNote: 'Checked by operator',
        updatedBy: 'operator-1',
        updatedAt: now,
      });
      expect(listResult).toEqual({
        events: [{ id: 'audit-1', data: { resourceType: 'visit' } }],
        hasMore: false,
        nextCursor: null,
        scanned: 1,
      });
      expect(updateResult).toEqual({
        id: 'audit-1',
        data: { triageStatus: 'resolved' },
      });
    });

    it('forwards push-token register/unregister/delete calls to repository', async () => {
      const registerPushToken = jest
        .fn()
        .mockResolvedValue({
          staleRemovedCount: 1,
          updatedExisting: false,
          fallbackUsed: true,
        });
      const unregisterPushToken = jest.fn().mockResolvedValue({ deletedCount: 1 });
      const deleteAllPushTokens = jest.fn().mockResolvedValue({ deletedCount: 2 });
      const now = {
        toDate: () => new Date('2026-02-22T20:10:00.000Z'),
      } as unknown as FirebaseFirestore.Timestamp;

      const repository: UserRepository = {
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
        deleteAllPushTokens,
        deleteAccountData: jest.fn(),
        registerPushToken,
        unregisterPushToken,
        updateAnalyticsConsent: jest.fn(),
        upsertById: jest.fn(),
      };

      const service = new UserDomainService(repository);
      const registerResult = await service.registerPushToken({
        userId: 'user-1',
        token: 'ExponentPushToken[test]',
        platform: 'ios',
        timezone: 'America/New_York',
        now,
      });
      const unregisterResult = await service.unregisterPushToken(
        'user-1',
        'ExponentPushToken[test]',
      );
      const deleteAllResult = await service.deleteAllPushTokens('user-1');

      expect(registerPushToken).toHaveBeenCalledWith({
        userId: 'user-1',
        token: 'ExponentPushToken[test]',
        platform: 'ios',
        timezone: 'America/New_York',
        now,
      });
      expect(unregisterPushToken).toHaveBeenCalledWith('user-1', 'ExponentPushToken[test]');
      expect(deleteAllPushTokens).toHaveBeenCalledWith('user-1');
      expect(registerResult).toEqual({
        staleRemovedCount: 1,
        updatedExisting: false,
        fallbackUsed: true,
      });
      expect(unregisterResult).toEqual({ deletedCount: 1 });
      expect(deleteAllResult).toEqual({ deletedCount: 2 });
    });

    it('forwards account-delete data purges to repository', async () => {
      const deleteAccountData = jest.fn().mockResolvedValue(42);

      const repository: UserRepository = {
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
        deleteAccountData,
        registerPushToken: jest.fn(),
        unregisterPushToken: jest.fn(),
        updateAnalyticsConsent: jest.fn(),
        upsertById: jest.fn(),
      };

      const service = new UserDomainService(repository);
      const deleteCount = await service.deleteAccountData('user-1', [
        'user@example.com',
        'user@example.com',
      ]);

      expect(deleteAccountData).toHaveBeenCalledWith('user-1', [
        'user@example.com',
        'user@example.com',
      ]);
      expect(deleteCount).toBe(42);
    });
  });

  describe('VisitDomainService', () => {
    it('forwards list calls to repository', async () => {
      const listByUser = jest.fn().mockResolvedValue({
        items: [{ id: 'visit-1', userId: 'user-1' }],
        hasMore: true,
        nextCursor: 'visit-1',
      });
      const getById = jest.fn();
      const create = jest.fn();
      const updateById = jest.fn();
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: VisitRepository = {
        create,
        getById,
        listAllByUser: jest.fn(),
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable: jest.fn(),
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new VisitDomainService(repository);

      const result = await service.listForUser('user-1', {
        limit: 10,
        sortDirection: 'desc',
      });

      expect(listByUser).toHaveBeenCalledWith('user-1', {
        limit: 10,
        cursor: undefined,
        sortDirection: 'desc',
        includeDeleted: undefined,
      });
      expect(result.hasMore).toBe(true);
    });

    it('returns null when user does not own visit', async () => {
      const repository: VisitRepository = {
        create: jest.fn(),
        listByUser: jest.fn(),
        listAllByUser: jest.fn(),
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'visit-1',
          userId: 'user-2',
          deletedAt: null,
        }),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new VisitDomainService(repository);

      await expect(service.getForUser('user-1', 'visit-1')).resolves.toBeNull();
    });

    it('supports includeDeleted reads when explicitly requested', async () => {
      const repository: VisitRepository = {
        create: jest.fn(),
        listByUser: jest.fn(),
        listAllByUser: jest.fn(),
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable: jest.fn(),
        getById: jest.fn().mockResolvedValue({
          id: 'visit-1',
          userId: 'user-1',
          deletedAt: { seconds: 1 },
        }),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new VisitDomainService(repository);

      await expect(service.getForUser('user-1', 'visit-1')).resolves.toBeNull();
      await expect(service.getForUser('user-1', 'visit-1', { includeDeleted: true })).resolves.toEqual(
        expect.objectContaining({ id: 'visit-1' }),
      );
    });

    it('forwards non-paginated list calls to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn().mockResolvedValue([{ id: 'visit-1', userId: 'user-1' }]);
      const getById = jest.fn();
      const create = jest.fn();
      const updateById = jest.fn();
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: VisitRepository = {
        create,
        getById,
        listAllByUser,
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable: jest.fn(),
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new VisitDomainService(repository);

      const result = await service.listAllForUser('user-1', {
        sortDirection: 'desc',
      });

      expect(listAllByUser).toHaveBeenCalledWith('user-1', {
        sortDirection: 'desc',
      });
      expect(result).toHaveLength(1);
    });

    it('forwards post-commit escalation list calls to repository', async () => {
      const listPostCommitEscalated = jest
        .fn()
        .mockResolvedValue([{ id: 'visit-1', userId: 'user-1', postCommitStatus: 'partial_failure' }]);

      const repository: VisitRepository = {
        create: jest.fn(),
        getById: jest.fn(),
        listAllByUser: jest.fn(),
        listPostCommitEscalated,
        listPostCommitRecoverable: jest.fn(),
        listByUser: jest.fn(),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new VisitDomainService(repository);
      const result = await service.listPostCommitEscalated(25);

      expect(listPostCommitEscalated).toHaveBeenCalledWith(25);
      expect(result).toEqual([
        { id: 'visit-1', userId: 'user-1', postCommitStatus: 'partial_failure' },
      ]);
    });

    it('forwards post-commit recovery list calls to repository', async () => {
      const listPostCommitRecoverable = jest
        .fn()
        .mockResolvedValue([{ id: 'visit-2', userId: 'user-1', postCommitStatus: 'partial_failure' }]);

      const repository: VisitRepository = {
        create: jest.fn(),
        getById: jest.fn(),
        listAllByUser: jest.fn(),
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable,
        listByUser: jest.fn(),
        restoreById: jest.fn(),
        softDeleteById: jest.fn(),
        updateById: jest.fn(),
      };

      const service = new VisitDomainService(repository);
      const result = await service.listPostCommitRecoverable(15);

      expect(listPostCommitRecoverable).toHaveBeenCalledWith(15);
      expect(result).toEqual([
        { id: 'visit-2', userId: 'user-1', postCommitStatus: 'partial_failure' },
      ]);
    });

    it('forwards direct getById calls to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn();
      const getById = jest.fn().mockResolvedValue({ id: 'visit-1', userId: 'user-1' });
      const create = jest.fn();
      const updateById = jest.fn();
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: VisitRepository = {
        create,
        getById,
        listAllByUser,
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable: jest.fn(),
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new VisitDomainService(repository);

      const result = await service.getById('visit-1');
      expect(getById).toHaveBeenCalledWith('visit-1');
      expect(result).toEqual({ id: 'visit-1', userId: 'user-1' });
    });

    it('forwards create and update mutations to repository', async () => {
      const listByUser = jest.fn();
      const listAllByUser = jest.fn();
      const getById = jest.fn();
      const create = jest.fn().mockResolvedValue({ id: 'visit-1', userId: 'user-1' });
      const updateById = jest.fn().mockResolvedValue({ id: 'visit-1', userId: 'user-1' });
      const softDeleteById = jest.fn();
      const restoreById = jest.fn();

      const repository: VisitRepository = {
        create,
        getById,
        listAllByUser,
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable: jest.fn(),
        listByUser,
        restoreById,
        softDeleteById,
        updateById,
      };

      const service = new VisitDomainService(repository);
      const created = await service.createRecord({ userId: 'user-1', status: 'recording' });
      const updated = await service.updateRecord('visit-1', { status: 'processing' });

      expect(create).toHaveBeenCalledWith({ userId: 'user-1', status: 'recording' });
      expect(updateById).toHaveBeenCalledWith('visit-1', { status: 'processing' });
      expect(created).toEqual({ id: 'visit-1', userId: 'user-1' });
      expect(updated).toEqual({ id: 'visit-1', userId: 'user-1' });
    });

    it('forwards soft-delete and restore mutations to repository', async () => {
      const now = { toDate: () => new Date('2026-02-21T12:00:00.000Z') } as FirebaseFirestore.Timestamp;
      const softDeleteById = jest.fn().mockResolvedValue({ softDeletedActions: 2 });
      const restoreById = jest.fn().mockResolvedValue({ restoredActions: 1 });

      const repository: VisitRepository = {
        create: jest.fn(),
        getById: jest.fn(),
        listAllByUser: jest.fn(),
        listPostCommitEscalated: jest.fn(),
        listPostCommitRecoverable: jest.fn(),
        listByUser: jest.fn(),
        restoreById,
        softDeleteById,
        updateById: jest.fn(),
      };

      const service = new VisitDomainService(repository);
      const softDeleteResult = await service.softDeleteRecord('visit-1', 'user-1', now);
      const restoreResult = await service.restoreRecord('visit-1', 'user-1', now);

      expect(softDeleteById).toHaveBeenCalledWith('visit-1', 'user-1', now);
      expect(restoreById).toHaveBeenCalledWith('visit-1', 'user-1', now);
      expect(softDeleteResult).toEqual({ softDeletedActions: 2 });
      expect(restoreResult).toEqual({ restoredActions: 1 });
    });
  });
});
