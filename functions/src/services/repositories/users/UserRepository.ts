export type UserRecord = FirebaseFirestore.DocumentData & {
  id: string;
};

export type UserPushTokenRecord = FirebaseFirestore.DocumentData & {
  id: string;
  lastActive?: FirebaseFirestore.Timestamp;
};

export type UserAuditEventRecord = {
  id: string;
  data: FirebaseFirestore.DocumentData;
};

export type UserCollectionDocumentRecord = {
  id: string;
  data: FirebaseFirestore.DocumentData;
};

export type UserExportData = {
  user: FirebaseFirestore.DocumentData;
  visits: UserCollectionDocumentRecord[];
  actions: UserCollectionDocumentRecord[];
  medications: UserCollectionDocumentRecord[];
  shares: UserCollectionDocumentRecord[];
  auditEvents: UserAuditEventRecord[];
};

export type RestoreAuditEventRecord = {
  id: string;
  data: FirebaseFirestore.DocumentData;
};

export type ListRestoreAuditEventsParams = {
  limit: number;
  scanLimit: number;
  cursor?: string;
  resourceType?: string;
  ownerUserId?: string;
  actorUserId?: string;
  triageStatus?: string;
};

export type ListRestoreAuditEventsResult = {
  events: RestoreAuditEventRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  scanned: number;
};

export type UpdateRestoreAuditTriageParams = {
  triageStatus?: string;
  triageNote?: string | null;
  clearTriageNote?: boolean;
  updatedBy: string;
  updatedAt: FirebaseFirestore.Timestamp;
};

export type UpdateAnalyticsConsentParams = {
  granted: boolean;
  source: string;
  policyVersion?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  now: FirebaseFirestore.Timestamp;
  traceId?: string | null;
  userAgent?: string | null;
  origin?: string | null;
  ipHash?: string | null;
  eventType: string;
};

export type ApplyLegalAssentParams = {
  termsVersion: string;
  privacyVersion: string;
  source: string;
  platform?: string | null;
  appVersion?: string | null;
  now: FirebaseFirestore.Timestamp;
  traceId?: string | null;
  userAgent?: string | null;
  origin?: string | null;
  ipHash?: string | null;
  eventType: string;
};

export type UpdateAnalyticsConsentResult = {
  hasChanged: boolean;
  nextConsent: Record<string, unknown>;
};

export type RegisterPushTokenParams = {
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  timezone?: string;
  deviceId?: string;
  previousToken?: string;
  now: FirebaseFirestore.Timestamp;
};

export type RegisterPushTokenResult = {
  staleRemovedCount: number;
  updatedExisting: boolean;
  fallbackUsed: boolean;
};

export type DeletePushTokensResult = {
  deletedCount: number;
};

export interface UserRepository {
  getById(userId: string): Promise<UserRecord | null>;
  listByIds(userIds: string[]): Promise<UserRecord[]>;
  listPushTokens(userId: string): Promise<UserPushTokenRecord[]>;
  getLatestPushToken(userId: string): Promise<UserPushTokenRecord | null>;
  getExportData(
    userId: string,
    options?: { auditLimit?: number },
  ): Promise<UserExportData>;
  ensureCaregiverRole(userId: string): Promise<void>;
  ensureExists(
    userId: string,
    timestamps: {
      createdAt: FirebaseFirestore.Timestamp;
      updatedAt: FirebaseFirestore.Timestamp;
    },
  ): Promise<UserRecord>;
  upsertById(
    userId: string,
    updates: FirebaseFirestore.DocumentData,
    options?: { createdAtOnInsert?: FirebaseFirestore.Timestamp },
  ): Promise<UserRecord>;
  getAnalyticsConsent(userId: string): Promise<Record<string, unknown>>;
  updateAnalyticsConsent(
    userId: string,
    params: UpdateAnalyticsConsentParams,
  ): Promise<UpdateAnalyticsConsentResult>;
  applyLegalAssent(
    userId: string,
    profileUpdates: FirebaseFirestore.DocumentData,
    params: ApplyLegalAssentParams,
  ): Promise<void>;
  listAnalyticsConsentAudit(
    userId: string,
    limit: number,
  ): Promise<UserAuditEventRecord[]>;
  registerPushToken(params: RegisterPushTokenParams): Promise<RegisterPushTokenResult>;
  unregisterPushToken(userId: string, token: string): Promise<DeletePushTokensResult>;
  deleteAllPushTokens(userId: string): Promise<DeletePushTokensResult>;
  listRestoreAuditEvents(
    params: ListRestoreAuditEventsParams,
  ): Promise<ListRestoreAuditEventsResult | null>;
  updateRestoreAuditTriage(
    eventId: string,
    params: UpdateRestoreAuditTriageParams,
  ): Promise<RestoreAuditEventRecord | null>;
  deleteAccountData(userId: string, userEmailCandidates: string[]): Promise<number>;
}
