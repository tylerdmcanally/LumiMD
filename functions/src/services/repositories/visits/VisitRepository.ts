import type { CursorPageRequest, CursorPageResult, SortDirection } from '../common/pagination';

export type VisitRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  deletedAt?: FirebaseFirestore.Timestamp | null;
};

type VisitListBaseOptions = {
  sortDirection?: SortDirection;
  includeDeleted?: boolean;
};

export type VisitListByUserOptions = CursorPageRequest & VisitListBaseOptions;

export type VisitListAllByUserOptions = VisitListBaseOptions;

export type VisitSoftDeleteResult = {
  softDeletedActions: number;
};

export type VisitRestoreResult = {
  restoredActions: number;
};

export interface VisitRepository {
  getById(visitId: string): Promise<VisitRecord | null>;
  create(payload: FirebaseFirestore.DocumentData): Promise<VisitRecord>;
  updateById(
    visitId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<VisitRecord | null>;
  softDeleteById(
    visitId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<VisitSoftDeleteResult>;
  restoreById(
    visitId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<VisitRestoreResult>;
  listPostCommitRecoverable(limit: number): Promise<VisitRecord[]>;
  listPostCommitEscalated(limit: number): Promise<VisitRecord[]>;
  listByUser(userId: string, options: VisitListByUserOptions): Promise<CursorPageResult<VisitRecord>>;
  listAllByUser(userId: string, options?: VisitListAllByUserOptions): Promise<VisitRecord[]>;
}
