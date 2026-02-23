import type { CursorPageRequest, CursorPageResult, SortDirection } from '../common/pagination';

export type ActionRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  deletedAt?: FirebaseFirestore.Timestamp | null;
};

type ActionListBaseOptions = {
  sortDirection?: SortDirection;
  includeDeleted?: boolean;
};

export type ActionListByUserOptions = CursorPageRequest & ActionListBaseOptions;

export type ActionListAllByUserOptions = ActionListBaseOptions;

export interface ActionRepository {
  getById(actionId: string): Promise<ActionRecord | null>;
  create(payload: FirebaseFirestore.DocumentData): Promise<ActionRecord>;
  updateById(
    actionId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ActionRecord | null>;
  softDeleteById(
    actionId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<void>;
  restoreById(actionId: string, now: FirebaseFirestore.Timestamp): Promise<void>;
  listByUser(
    userId: string,
    options: ActionListByUserOptions,
  ): Promise<CursorPageResult<ActionRecord>>;
  listAllByUser(userId: string, options?: ActionListAllByUserOptions): Promise<ActionRecord[]>;
}
