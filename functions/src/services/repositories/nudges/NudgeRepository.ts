export type NudgeRecord = FirebaseFirestore.DocumentData & {
  id: string;
};

export type NudgeDismissResult = {
  updatedCount: number;
};

export interface NudgeRepository {
  getById(nudgeId: string): Promise<NudgeRecord | null>;
  hasByUserConditionAndStatuses(
    userId: string,
    conditionId: string,
    statuses: string[],
  ): Promise<boolean>;
  hasByUserMedicationNameAndStatuses(
    userId: string,
    medicationName: string,
    statuses: string[],
  ): Promise<boolean>;
  hasRecentInsightByPattern(
    userId: string,
    pattern: string,
    since: FirebaseFirestore.Timestamp,
  ): Promise<boolean>;
  listByUserStatusesScheduledBetween(
    userId: string,
    statuses: string[],
    start: FirebaseFirestore.Timestamp,
    end: FirebaseFirestore.Timestamp,
  ): Promise<NudgeRecord[]>;
  listDuePendingForNotification(
    now: FirebaseFirestore.Timestamp,
    limit: number,
  ): Promise<NudgeRecord[]>;
  countByUserNotificationSentBetween(
    userId: string,
    start: FirebaseFirestore.Timestamp,
    end: FirebaseFirestore.Timestamp,
  ): Promise<number>;
  acquireNotificationSendLock(
    nudgeId: string,
    now: FirebaseFirestore.Timestamp,
    lockWindowMs: number,
  ): Promise<boolean>;
  markNotificationProcessed(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      sentAt?: FirebaseFirestore.Timestamp;
      skippedReason?: string;
      clearLock?: boolean;
    },
  ): Promise<void>;
  backfillPendingNotificationSentField(): Promise<number>;
  listActiveByUser(
    userId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      limit: number;
    },
  ): Promise<NudgeRecord[]>;
  listHistoryByUser(userId: string, limit: number): Promise<NudgeRecord[]>;
  listByUserAndStatuses(userId: string, statuses: string[]): Promise<NudgeRecord[]>;
  listByUserAndSequence(
    userId: string,
    sequenceId: string,
    statuses: string[],
  ): Promise<NudgeRecord[]>;
  completeById(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      responseValue?: string | Record<string, unknown>;
    },
  ): Promise<void>;
  snoozeById(
    nudgeId: string,
    params: {
      now: FirebaseFirestore.Timestamp;
      snoozedUntil: FirebaseFirestore.Timestamp;
    },
  ): Promise<void>;
  create(payload: FirebaseFirestore.DocumentData): Promise<{ id: string }>;
  dismissByIds(
    nudgeIds: string[],
    params: {
      now: FirebaseFirestore.Timestamp;
      dismissalReason?: string;
    },
  ): Promise<NudgeDismissResult>;
}
