import type { SortDirection } from '../../repositories/common/pagination';
import type {
  ActionListAllByUserOptions,
  ActionListByUserOptions,
  ActionRecord,
  ActionRepository,
} from '../../repositories/actions/ActionRepository';

export type ActionListForUserOptions = {
  limit: number;
  cursor?: string | null;
  sortDirection?: SortDirection;
  includeDeleted?: boolean;
};

export type ActionListAllForUserOptions = Omit<ActionListAllByUserOptions, 'limit'>;

export class ActionDomainService {
  constructor(private readonly actionRepository: ActionRepository) {}

  async listForUser(userId: string, options: ActionListForUserOptions) {
    const listOptions: ActionListByUserOptions = {
      limit: options.limit,
      cursor: options.cursor,
      sortDirection: options.sortDirection,
      includeDeleted: options.includeDeleted,
    };

    return this.actionRepository.listByUser(userId, listOptions);
  }

  async listAllForUser(userId: string, options: ActionListAllForUserOptions = {}) {
    return this.actionRepository.listAllByUser(userId, options);
  }

  async getById(actionId: string): Promise<ActionRecord | null> {
    return this.actionRepository.getById(actionId);
  }

  async createRecord(payload: FirebaseFirestore.DocumentData): Promise<ActionRecord> {
    return this.actionRepository.create(payload);
  }

  async updateRecord(
    actionId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ActionRecord | null> {
    return this.actionRepository.updateById(actionId, updates);
  }

  async softDeleteRecord(
    actionId: string,
    actorUserId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<void> {
    await this.actionRepository.softDeleteById(actionId, actorUserId, now);
  }

  async restoreRecord(actionId: string, now: FirebaseFirestore.Timestamp): Promise<void> {
    await this.actionRepository.restoreById(actionId, now);
  }

  async getForUser(
    userId: string,
    actionId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<ActionRecord | null> {
    const action = await this.actionRepository.getById(actionId);

    if (!action) {
      return null;
    }

    if (action.userId !== userId) {
      return null;
    }

    if (options?.includeDeleted !== true && action.deletedAt) {
      return null;
    }

    return action;
  }
}
