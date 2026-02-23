import type { SortDirection } from '../../repositories/common/pagination';
import type {
  VisitListAllByUserOptions,
  VisitListByUserOptions,
  VisitRecord,
  VisitRestoreResult,
  VisitRepository,
  VisitSoftDeleteResult,
} from '../../repositories/visits/VisitRepository';

export type VisitListForUserOptions = {
  limit: number;
  cursor?: string | null;
  sortDirection?: SortDirection;
  includeDeleted?: boolean;
};

export type VisitListAllForUserOptions = Omit<VisitListAllByUserOptions, 'limit'>;

export class VisitDomainService {
  constructor(private readonly visitRepository: VisitRepository) {}

  async listForUser(userId: string, options: VisitListForUserOptions) {
    const listOptions: VisitListByUserOptions = {
      limit: options.limit,
      cursor: options.cursor,
      sortDirection: options.sortDirection,
      includeDeleted: options.includeDeleted,
    };

    return this.visitRepository.listByUser(userId, listOptions);
  }

  async listAllForUser(userId: string, options: VisitListAllForUserOptions = {}) {
    return this.visitRepository.listAllByUser(userId, options);
  }

  async listPostCommitEscalated(limit: number): Promise<VisitRecord[]> {
    return this.visitRepository.listPostCommitEscalated(limit);
  }

  async listPostCommitRecoverable(limit: number): Promise<VisitRecord[]> {
    return this.visitRepository.listPostCommitRecoverable(limit);
  }

  async getById(visitId: string): Promise<VisitRecord | null> {
    return this.visitRepository.getById(visitId);
  }

  async createRecord(payload: FirebaseFirestore.DocumentData): Promise<VisitRecord> {
    return this.visitRepository.create(payload);
  }

  async updateRecord(
    visitId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<VisitRecord | null> {
    return this.visitRepository.updateById(visitId, updates);
  }

  async softDeleteRecord(
    visitId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<VisitSoftDeleteResult> {
    return this.visitRepository.softDeleteById(visitId, userId, now);
  }

  async restoreRecord(
    visitId: string,
    userId: string,
    now: FirebaseFirestore.Timestamp,
  ): Promise<VisitRestoreResult> {
    return this.visitRepository.restoreById(visitId, userId, now);
  }

  async getForUser(
    userId: string,
    visitId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<VisitRecord | null> {
    const visit = await this.visitRepository.getById(visitId);

    if (!visit) {
      return null;
    }

    if (visit.userId !== userId) {
      return null;
    }

    if (options?.includeDeleted !== true && visit.deletedAt) {
      return null;
    }

    return visit;
  }
}
