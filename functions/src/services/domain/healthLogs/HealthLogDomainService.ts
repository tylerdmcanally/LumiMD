import type { SortDirection } from '../../repositories/common/pagination';
import type {
  HealthLogFindBySourceIdOptions,
  HealthLogListPageByUserOptions,
  HealthLogListByUserOptions,
  HealthLogRecord,
  HealthLogRepository,
} from '../../repositories/healthLogs/HealthLogRepository';

export type HealthLogListForUserOptions = {
  type?: string;
  startDate?: Date;
  endDate?: Date;
  sortDirection?: SortDirection;
  includeDeleted?: boolean;
  limit?: number;
};

export type HealthLogListPageForUserOptions = Omit<HealthLogListForUserOptions, 'limit'> & {
  limit: number;
  cursor?: string | null;
};

export class HealthLogDomainService {
  constructor(private readonly healthLogRepository: HealthLogRepository) {}

  async getById(healthLogId: string): Promise<HealthLogRecord | null> {
    return this.healthLogRepository.getById(healthLogId);
  }

  async createRecord(payload: FirebaseFirestore.DocumentData): Promise<HealthLogRecord> {
    return this.healthLogRepository.create(payload);
  }

  async updateRecord(
    healthLogId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<HealthLogRecord | null> {
    return this.healthLogRepository.updateById(healthLogId, updates);
  }

  async listForUser(
    userId: string,
    options: HealthLogListForUserOptions = {},
  ): Promise<HealthLogRecord[]> {
    const listOptions: HealthLogListByUserOptions = {
      type: options.type,
      startDate: options.startDate,
      endDate: options.endDate,
      sortDirection: options.sortDirection,
      includeDeleted: options.includeDeleted,
      limit: options.limit,
    };

    return this.healthLogRepository.listByUser(userId, listOptions);
  }

  async listPageForUser(userId: string, options: HealthLogListPageForUserOptions) {
    const listOptions: HealthLogListPageByUserOptions = {
      type: options.type,
      startDate: options.startDate,
      endDate: options.endDate,
      sortDirection: options.sortDirection,
      includeDeleted: options.includeDeleted,
      limit: options.limit,
      cursor: options.cursor,
    };

    return this.healthLogRepository.listPageByUser(userId, listOptions);
  }

  async findBySourceId(
    userId: string,
    sourceId: string,
    options: HealthLogFindBySourceIdOptions = {},
  ): Promise<HealthLogRecord[]> {
    return this.healthLogRepository.findBySourceId(userId, sourceId, options);
  }

  async softDeleteRecord(
    healthLogId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<void> {
    await this.healthLogRepository.softDeleteById(healthLogId, actorUserId, now);
  }

  async restoreRecord(healthLogId: string, now: FirebaseFirestore.Timestamp): Promise<void> {
    await this.healthLogRepository.restoreById(healthLogId, now);
  }

  async getForUser(
    userId: string,
    healthLogId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<HealthLogRecord | null> {
    const healthLog = await this.healthLogRepository.getById(healthLogId);

    if (!healthLog) {
      return null;
    }

    if (healthLog.userId !== userId) {
      return null;
    }

    if (options?.includeDeleted !== true && healthLog.deletedAt) {
      return null;
    }

    return healthLog;
  }
}
