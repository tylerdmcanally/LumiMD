import type { CursorPageResult, SortDirection } from '../common/pagination';

export type HealthLogRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  type: string;
  value: unknown;
  createdAt: FirebaseFirestore.Timestamp;
  deletedAt?: FirebaseFirestore.Timestamp | null;
  sourceId?: string;
};

export type HealthLogListByUserOptions = {
  type?: string;
  startDate?: Date;
  endDate?: Date;
  sortDirection?: SortDirection;
  includeDeleted?: boolean;
  limit?: number;
};

export type HealthLogListPageByUserOptions = Omit<HealthLogListByUserOptions, 'limit'> & {
  limit: number;
  cursor?: string | null;
};

export type HealthLogFindBySourceIdOptions = {
  includeDeleted?: boolean;
  limit?: number;
};

export interface HealthLogRepository {
  getById(healthLogId: string): Promise<HealthLogRecord | null>;
  create(payload: FirebaseFirestore.DocumentData): Promise<HealthLogRecord>;
  updateById(
    healthLogId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<HealthLogRecord | null>;
  listByUser(userId: string, options?: HealthLogListByUserOptions): Promise<HealthLogRecord[]>;
  listPageByUser(
    userId: string,
    options: HealthLogListPageByUserOptions,
  ): Promise<CursorPageResult<HealthLogRecord>>;
  findBySourceId(
    userId: string,
    sourceId: string,
    options?: HealthLogFindBySourceIdOptions,
  ): Promise<HealthLogRecord[]>;
  softDeleteById(
    healthLogId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<void>;
  restoreById(healthLogId: string, now: FirebaseFirestore.Timestamp): Promise<void>;
}
