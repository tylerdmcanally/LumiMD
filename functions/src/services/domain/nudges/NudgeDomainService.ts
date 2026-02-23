import type { NudgeRecord, NudgeRepository } from '../../repositories/nudges/NudgeRepository';

export class NudgeDomainService {
  constructor(private readonly nudgeRepository: NudgeRepository) {}

  async getById(nudgeId: string): Promise<NudgeRecord | null> {
    return this.nudgeRepository.getById(nudgeId);
  }

  async hasByUserConditionAndStatuses(
    userId: string,
    conditionId: string,
    statuses: string[],
  ): Promise<boolean> {
    return this.nudgeRepository.hasByUserConditionAndStatuses(userId, conditionId, statuses);
  }

  async hasByUserMedicationNameAndStatuses(
    userId: string,
    medicationName: string,
    statuses: string[],
  ): Promise<boolean> {
    return this.nudgeRepository.hasByUserMedicationNameAndStatuses(
      userId,
      medicationName,
      statuses,
    );
  }

  async hasRecentInsightByPattern(
    userId: string,
    pattern: string,
    since: FirebaseFirestore.Timestamp,
  ): Promise<boolean> {
    return this.nudgeRepository.hasRecentInsightByPattern(userId, pattern, since);
  }

  async listByUserStatusesScheduledBetween(
    userId: string,
    statuses: string[],
    start: FirebaseFirestore.Timestamp,
    end: FirebaseFirestore.Timestamp,
  ): Promise<NudgeRecord[]> {
    return this.nudgeRepository.listByUserStatusesScheduledBetween(userId, statuses, start, end);
  }

  async listDuePendingForNotification(
    now: FirebaseFirestore.Timestamp,
    limit: number,
  ): Promise<NudgeRecord[]> {
    return this.nudgeRepository.listDuePendingForNotification(now, limit);
  }

  async countByUserNotificationSentBetween(
    userId: string,
    start: FirebaseFirestore.Timestamp,
    end: FirebaseFirestore.Timestamp,
  ): Promise<number> {
    return this.nudgeRepository.countByUserNotificationSentBetween(userId, start, end);
  }

  async acquireNotificationSendLock(
    nudgeId: string,
    now: FirebaseFirestore.Timestamp,
    lockWindowMs: number,
  ): Promise<boolean> {
    return this.nudgeRepository.acquireNotificationSendLock(nudgeId, now, lockWindowMs);
  }

  async markNotificationProcessed(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      sentAt?: FirebaseFirestore.Timestamp;
      skippedReason?: string;
      clearLock?: boolean;
    },
  ): Promise<void> {
    return this.nudgeRepository.markNotificationProcessed(nudgeId, params);
  }

  async backfillPendingNotificationSentField(): Promise<number> {
    return this.nudgeRepository.backfillPendingNotificationSentField();
  }

  async listActiveByUser(
    userId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      limit: number;
    },
  ): Promise<NudgeRecord[]> {
    return this.nudgeRepository.listActiveByUser(userId, params);
  }

  async listHistoryByUser(userId: string, limit: number): Promise<NudgeRecord[]> {
    return this.nudgeRepository.listHistoryByUser(userId, limit);
  }

  async listByUserAndStatuses(userId: string, statuses: string[]): Promise<NudgeRecord[]> {
    return this.nudgeRepository.listByUserAndStatuses(userId, statuses);
  }

  async listByUserAndSequence(
    userId: string,
    sequenceId: string,
    statuses: string[],
  ): Promise<NudgeRecord[]> {
    return this.nudgeRepository.listByUserAndSequence(userId, sequenceId, statuses);
  }

  async createRecord(payload: FirebaseFirestore.DocumentData): Promise<{ id: string }> {
    return this.nudgeRepository.create(payload);
  }

  async completeById(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      responseValue?: string | Record<string, unknown>;
    },
  ): Promise<void> {
    return this.nudgeRepository.completeById(nudgeId, params);
  }

  async snoozeById(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      snoozedUntil: FirebaseFirestore.Timestamp;
    },
  ): Promise<void> {
    return this.nudgeRepository.snoozeById(nudgeId, params);
  }

  async dismissByIds(
    nudgeIds: string[],
    params: {
      now: FirebaseFirestore.Timestamp;
      dismissalReason?: string;
    },
  ): Promise<{ updatedCount: number }> {
    return this.nudgeRepository.dismissByIds(nudgeIds, params);
  }

  async dismissById(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      dismissalReason?: string;
    },
  ): Promise<{ updatedCount: number }> {
    return this.nudgeRepository.dismissByIds([nudgeId], params);
  }
}
