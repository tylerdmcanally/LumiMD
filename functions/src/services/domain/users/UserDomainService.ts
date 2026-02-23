import type {
  ApplyLegalAssentParams,
  DeletePushTokensResult,
  ListRestoreAuditEventsParams,
  ListRestoreAuditEventsResult,
  RegisterPushTokenParams,
  RegisterPushTokenResult,
  RestoreAuditEventRecord,
  UserExportData,
  UpdateRestoreAuditTriageParams,
  UpdateAnalyticsConsentParams,
  UpdateAnalyticsConsentResult,
  UserAuditEventRecord,
  UserPushTokenRecord,
  UserRecord,
  UserRepository,
} from '../../repositories/users/UserRepository';

export class UserDomainService {
  constructor(private readonly userRepository: UserRepository) {}

  async getById(userId: string): Promise<UserRecord | null> {
    return this.userRepository.getById(userId);
  }

  async listByIds(userIds: string[]): Promise<UserRecord[]> {
    return this.userRepository.listByIds(userIds);
  }

  async listPushTokens(userId: string): Promise<UserPushTokenRecord[]> {
    return this.userRepository.listPushTokens(userId);
  }

  async getLatestPushToken(userId: string): Promise<UserPushTokenRecord | null> {
    return this.userRepository.getLatestPushToken(userId);
  }

  async getExportData(
    userId: string,
    options?: { auditLimit?: number },
  ): Promise<UserExportData> {
    return this.userRepository.getExportData(userId, options);
  }

  async ensureCaregiverRole(userId: string): Promise<void> {
    await this.userRepository.ensureCaregiverRole(userId);
  }

  async ensureExists(
    userId: string,
    timestamps: {
      createdAt: FirebaseFirestore.Timestamp;
      updatedAt: FirebaseFirestore.Timestamp;
    },
  ): Promise<UserRecord> {
    return this.userRepository.ensureExists(userId, timestamps);
  }

  async upsertById(
    userId: string,
    updates: FirebaseFirestore.DocumentData,
    options?: { createdAtOnInsert?: FirebaseFirestore.Timestamp },
  ): Promise<UserRecord> {
    return this.userRepository.upsertById(userId, updates, options);
  }

  async getAnalyticsConsent(userId: string): Promise<Record<string, unknown>> {
    return this.userRepository.getAnalyticsConsent(userId);
  }

  async applyLegalAssent(
    userId: string,
    profileUpdates: FirebaseFirestore.DocumentData,
    params: ApplyLegalAssentParams,
  ): Promise<void> {
    await this.userRepository.applyLegalAssent(userId, profileUpdates, params);
  }

  async updateAnalyticsConsent(
    userId: string,
    params: UpdateAnalyticsConsentParams,
  ): Promise<UpdateAnalyticsConsentResult> {
    return this.userRepository.updateAnalyticsConsent(userId, params);
  }

  async listAnalyticsConsentAudit(
    userId: string,
    limit: number,
  ): Promise<UserAuditEventRecord[]> {
    return this.userRepository.listAnalyticsConsentAudit(userId, limit);
  }

  async registerPushToken(params: RegisterPushTokenParams): Promise<RegisterPushTokenResult> {
    return this.userRepository.registerPushToken(params);
  }

  async unregisterPushToken(
    userId: string,
    token: string,
  ): Promise<DeletePushTokensResult> {
    return this.userRepository.unregisterPushToken(userId, token);
  }

  async deleteAllPushTokens(userId: string): Promise<DeletePushTokensResult> {
    return this.userRepository.deleteAllPushTokens(userId);
  }

  async listRestoreAuditEvents(
    params: ListRestoreAuditEventsParams,
  ): Promise<ListRestoreAuditEventsResult | null> {
    return this.userRepository.listRestoreAuditEvents(params);
  }

  async updateRestoreAuditTriage(
    eventId: string,
    params: UpdateRestoreAuditTriageParams,
  ): Promise<RestoreAuditEventRecord | null> {
    return this.userRepository.updateRestoreAuditTriage(eventId, params);
  }

  async deleteAccountData(userId: string, userEmailCandidates: string[]): Promise<number> {
    return this.userRepository.deleteAccountData(userId, userEmailCandidates);
  }
}
