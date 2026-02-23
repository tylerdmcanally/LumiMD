import * as admin from 'firebase-admin';
import type {
  ApplyLegalAssentParams,
  DeletePushTokensResult,
  ListRestoreAuditEventsParams,
  ListRestoreAuditEventsResult,
  RegisterPushTokenParams,
  RegisterPushTokenResult,
  RestoreAuditEventRecord,
  UserCollectionDocumentRecord,
  UserExportData,
  UpdateRestoreAuditTriageParams,
  UpdateAnalyticsConsentParams,
  UpdateAnalyticsConsentResult,
  UserAuditEventRecord,
  UserPushTokenRecord,
  UserRecord,
  UserRepository,
} from './UserRepository';
import { RESTORE_AUDIT_COLLECTION } from '../../restoreAuditService';

const FIRESTORE_IN_QUERY_CHUNK_SIZE = 10;
const ANALYTICS_AUDIT_COLLECTION = 'privacyAuditLogs';
const PUSH_TOKEN_FALLBACK_SCAN_LIMIT = 1000;
const PUSH_TOKEN_FALLBACK_SCAN_CHUNK = 25;
const FIRESTORE_DELETE_BATCH_SIZE = 450;

type DeletionQueryTarget = {
  collection: string;
  field: string;
  value: string;
};

function mapUserDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): UserRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as UserRecord;
}

function mapPushTokenDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): UserPushTokenRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as UserPushTokenRecord;
}

function mapCollectionDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): UserCollectionDocumentRecord {
  return {
    id: doc.id,
    data: doc.data() ?? {},
  };
}

function buildDeletionTargets(userId: string, userEmailCandidates: string[]): DeletionQueryTarget[] {
  const targets: DeletionQueryTarget[] = [
    { collection: 'visits', field: 'userId', value: userId },
    { collection: 'actions', field: 'userId', value: userId },
    { collection: 'medications', field: 'userId', value: userId },
    { collection: 'medicationReminders', field: 'userId', value: userId },
    { collection: 'medicationLogs', field: 'userId', value: userId },
    { collection: 'healthLogs', field: 'userId', value: userId },
    { collection: 'nudges', field: 'userId', value: userId },
    { collection: 'shares', field: 'ownerId', value: userId },
    { collection: 'shares', field: 'caregiverUserId', value: userId },
    { collection: 'shareInvites', field: 'ownerId', value: userId },
    { collection: 'shareInvites', field: 'caregiverUserId', value: userId },
    { collection: 'caregiverNotes', field: 'patientId', value: userId },
    { collection: 'caregiverNotes', field: 'caregiverId', value: userId },
    { collection: 'careTasks', field: 'patientId', value: userId },
    { collection: 'careTasks', field: 'caregiverId', value: userId },
    { collection: 'caregiverEmailLog', field: 'userId', value: userId },
    { collection: 'medicationSafetyCache', field: 'userId', value: userId },
    { collection: 'medicationSafetyExternalCache', field: 'userId', value: userId },
    { collection: 'auth_handoffs', field: 'userId', value: userId },
  ];

  userEmailCandidates.forEach((email) => {
    targets.push(
      { collection: 'shares', field: 'ownerEmail', value: email },
      { collection: 'shares', field: 'caregiverEmail', value: email },
      { collection: 'shareInvites', field: 'ownerEmail', value: email },
      { collection: 'shareInvites', field: 'caregiverEmail', value: email },
      { collection: 'shareInvites', field: 'inviteeEmail', value: email },
    );
  });

  return targets;
}

export class FirestoreUserRepository implements UserRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private async findStalePushTokenRefsByUserScan(params: {
    currentUserId: string;
    tokensToClean: Set<string>;
    deviceId?: string;
  }): Promise<Map<string, FirebaseFirestore.DocumentReference>> {
    const { currentUserId, tokensToClean, deviceId } = params;
    const staleRefs = new Map<string, FirebaseFirestore.DocumentReference>();

    const usersSnapshot = await this.db
      .collection('users')
      .limit(PUSH_TOKEN_FALLBACK_SCAN_LIMIT)
      .get();

    const candidateUsers = usersSnapshot.docs.filter((doc) => doc.id !== currentUserId);

    for (
      let start = 0;
      start < candidateUsers.length;
      start += PUSH_TOKEN_FALLBACK_SCAN_CHUNK
    ) {
      const chunk = candidateUsers.slice(start, start + PUSH_TOKEN_FALLBACK_SCAN_CHUNK);
      const tokenSnapshots = await Promise.all(
        chunk.map(async (userDoc) => {
          try {
            return await userDoc.ref.collection('pushTokens').get();
          } catch {
            return null;
          }
        }),
      );

      tokenSnapshots.forEach((snapshot) => {
        if (!snapshot) return;
        snapshot.docs.forEach((tokenDoc) => {
          const tokenData = tokenDoc.data();
          const tokenMatch =
            typeof tokenData.token === 'string' && tokensToClean.has(tokenData.token);
          const deviceMatch =
            typeof deviceId === 'string' &&
            deviceId.length > 0 &&
            typeof tokenData.deviceId === 'string' &&
            tokenData.deviceId === deviceId;

          if (tokenMatch || deviceMatch) {
            staleRefs.set(tokenDoc.ref.path, tokenDoc.ref);
          }
        });
      });
    }

    return staleRefs;
  }

  async getById(userId: string): Promise<UserRecord | null> {
    const userDoc = await this.db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return null;
    }

    return {
      id: userDoc.id,
      ...(userDoc.data() || {}),
    } as UserRecord;
  }

  async listByIds(userIds: string[]): Promise<UserRecord[]> {
    if (userIds.length === 0) {
      return [];
    }

    const records: UserRecord[] = [];

    for (let index = 0; index < userIds.length; index += FIRESTORE_IN_QUERY_CHUNK_SIZE) {
      const chunk = userIds.slice(index, index + FIRESTORE_IN_QUERY_CHUNK_SIZE);
      const snapshot = await this.db
        .collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();

      snapshot.docs.forEach((doc) => {
        records.push(mapUserDoc(doc));
      });
    }

    return records;
  }

  async getLatestPushToken(userId: string): Promise<UserPushTokenRecord | null> {
    const snapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('pushTokens')
      .orderBy('lastActive', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return mapPushTokenDoc(snapshot.docs[0]);
  }

  async listPushTokens(userId: string): Promise<UserPushTokenRecord[]> {
    const snapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection('pushTokens')
      .get();

    return snapshot.docs.map((doc) => mapPushTokenDoc(doc));
  }

  async getExportData(
    userId: string,
    options?: { auditLimit?: number },
  ): Promise<UserExportData> {
    const userRef = this.db.collection('users').doc(userId);
    const auditLimit = options?.auditLimit ?? 1000;

    const [
      userDoc,
      visitsSnapshot,
      actionsSnapshot,
      medicationsSnapshot,
      sharesSnapshot,
      consentAuditSnapshot,
    ] = await Promise.all([
      userRef.get(),
      this.db.collection('visits').where('userId', '==', userId).get(),
      this.db.collection('actions').where('userId', '==', userId).get(),
      this.db.collection('medications').where('userId', '==', userId).get(),
      this.db.collection('shares').where('ownerId', '==', userId).get(),
      userRef.collection(ANALYTICS_AUDIT_COLLECTION).orderBy('occurredAt', 'desc').limit(auditLimit).get(),
    ]);

    return {
      user: userDoc.exists ? userDoc.data() ?? {} : {},
      visits: visitsSnapshot.docs.map(mapCollectionDoc),
      actions: actionsSnapshot.docs.map(mapCollectionDoc),
      medications: medicationsSnapshot.docs.map(mapCollectionDoc),
      shares: sharesSnapshot.docs.map(mapCollectionDoc),
      auditEvents: consentAuditSnapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() ?? {},
      })),
    };
  }

  async ensureCaregiverRole(userId: string): Promise<void> {
    const userRef = this.db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const data = userDoc.data() ?? {};
    const existingRoles = Array.isArray(data.roles) ? data.roles : [];
    const roles = Array.from(new Set([...existingRoles, 'caregiver']));

    const update: Record<string, unknown> = {
      roles,
      updatedAt: admin.firestore.Timestamp.now(),
    };

    if (!data.primaryRole) {
      update.primaryRole = 'caregiver';
    }

    await userRef.set(update, { merge: true });
  }

  async ensureExists(
    userId: string,
    timestamps: {
      createdAt: FirebaseFirestore.Timestamp;
      updatedAt: FirebaseFirestore.Timestamp;
    },
  ): Promise<UserRecord> {
    const userRef = this.db.collection('users').doc(userId);
    let userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set(
        {
          createdAt: timestamps.createdAt,
          updatedAt: timestamps.updatedAt,
        },
        { merge: true },
      );
      userDoc = await userRef.get();
    }

    return {
      id: userId,
      ...(userDoc.data() || {}),
    } as UserRecord;
  }

  async upsertById(
    userId: string,
    updates: FirebaseFirestore.DocumentData,
    options?: { createdAtOnInsert?: FirebaseFirestore.Timestamp },
  ): Promise<UserRecord> {
    const userRef = this.db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const payload: FirebaseFirestore.DocumentData = {
      ...updates,
    };

    if (!userDoc.exists && options?.createdAtOnInsert) {
      payload.createdAt = options.createdAtOnInsert;
    }

    await userRef.set(payload, { merge: true });
    const updatedDoc = await userRef.get();

    return {
      id: userId,
      ...(updatedDoc.data() || {}),
    } as UserRecord;
  }

  async getAnalyticsConsent(userId: string): Promise<Record<string, unknown>> {
    const userDoc = await this.db.collection('users').doc(userId).get();
    const userData = userDoc.data() ?? {};
    const privacy = (userData.privacy as Record<string, unknown> | undefined) ?? {};
    return (privacy.analyticsConsent as Record<string, unknown> | undefined) ?? {};
  }

  async applyLegalAssent(
    userId: string,
    profileUpdates: FirebaseFirestore.DocumentData,
    params: ApplyLegalAssentParams,
  ): Promise<void> {
    const userRef = this.db.collection('users').doc(userId);

    await this.db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const userData = userDoc.data() ?? {};
      const privacy = (userData.privacy as Record<string, unknown> | undefined) ?? {};
      const existingAssent =
        (privacy.legalAssent as Record<string, unknown> | undefined) ?? {};

      const previousTermsVersion =
        typeof existingAssent.termsVersion === 'string' ? existingAssent.termsVersion : null;
      const previousPrivacyVersion =
        typeof existingAssent.privacyVersion === 'string' ? existingAssent.privacyVersion : null;
      const previousSource =
        typeof existingAssent.source === 'string' ? existingAssent.source : null;
      const previousPlatform =
        typeof existingAssent.platform === 'string' ? existingAssent.platform : null;

      const nextLegalAssent = {
        accepted: true,
        termsVersion: params.termsVersion,
        privacyVersion: params.privacyVersion,
        source: params.source,
        platform: params.platform ?? null,
        appVersion: params.appVersion ?? null,
        acceptedAt: params.now,
        updatedAt: params.now,
      };

      const hasChanged =
        previousTermsVersion === null ||
        previousTermsVersion !== nextLegalAssent.termsVersion ||
        previousPrivacyVersion !== nextLegalAssent.privacyVersion ||
        previousSource !== nextLegalAssent.source ||
        previousPlatform !== nextLegalAssent.platform;

      const transactionUpdateData: Record<string, unknown> = {
        ...profileUpdates,
        privacy: {
          legalAssent: nextLegalAssent,
        },
      };

      if (!userDoc.exists) {
        transactionUpdateData.createdAt = params.now;
      }

      transaction.set(userRef, transactionUpdateData, { merge: true });

      if (hasChanged) {
        const auditRef = userRef.collection(ANALYTICS_AUDIT_COLLECTION).doc();
        transaction.set(auditRef, {
          eventType: params.eventType,
          accepted: true,
          termsVersion: nextLegalAssent.termsVersion,
          privacyVersion: nextLegalAssent.privacyVersion,
          source: nextLegalAssent.source,
          platform: nextLegalAssent.platform,
          appVersion: nextLegalAssent.appVersion,
          previousTermsVersion,
          previousPrivacyVersion,
          previousSource,
          previousPlatform,
          occurredAt: params.now,
          traceId: params.traceId ?? null,
          userAgent: params.userAgent ?? null,
          origin: params.origin ?? null,
          ipHash: params.ipHash ?? null,
        });
      }
    });
  }

  async updateAnalyticsConsent(
    userId: string,
    params: UpdateAnalyticsConsentParams,
  ): Promise<UpdateAnalyticsConsentResult> {
    const userRef = this.db.collection('users').doc(userId);

    return this.db.runTransaction<UpdateAnalyticsConsentResult>(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      const userData = userDoc.data() ?? {};
      const privacy = (userData.privacy as Record<string, unknown> | undefined) ?? {};
      const existingConsent =
        (privacy.analyticsConsent as Record<string, unknown> | undefined) ?? {};

      const previousGranted =
        typeof existingConsent.granted === 'boolean' ? existingConsent.granted : null;
      const existingSource =
        typeof existingConsent.source === 'string' ? existingConsent.source : null;
      const existingPolicyVersion =
        typeof existingConsent.policyVersion === 'string'
          ? existingConsent.policyVersion
          : null;

      const nextPolicyVersion = params.policyVersion ?? null;
      const hasChanged =
        previousGranted === null ||
        previousGranted !== params.granted ||
        existingSource !== params.source ||
        existingPolicyVersion !== nextPolicyVersion;

      const nextConsent: Record<string, unknown> = {
        granted: params.granted,
        source: params.source,
        policyVersion: nextPolicyVersion,
        updatedAt: params.now,
      };

      transaction.set(
        userRef,
        {
          privacy: {
            analyticsConsent: nextConsent,
          },
          updatedAt: params.now,
        },
        { merge: true },
      );

      if (hasChanged) {
        const auditRef = userRef.collection(ANALYTICS_AUDIT_COLLECTION).doc();
        transaction.set(auditRef, {
          eventType: params.eventType,
          granted: params.granted,
          previousGranted,
          source: params.source,
          policyVersion: nextPolicyVersion,
          platform: params.platform ?? null,
          appVersion: params.appVersion ?? null,
          occurredAt: params.now,
          traceId: params.traceId ?? null,
          userAgent: params.userAgent ?? null,
          origin: params.origin ?? null,
          ipHash: params.ipHash ?? null,
        });
      }

      return {
        hasChanged,
        nextConsent,
      };
    });
  }

  async listAnalyticsConsentAudit(
    userId: string,
    limit: number,
  ): Promise<UserAuditEventRecord[]> {
    const snapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection(ANALYTICS_AUDIT_COLLECTION)
      .orderBy('occurredAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() ?? {},
    }));
  }

  async registerPushToken(params: RegisterPushTokenParams): Promise<RegisterPushTokenResult> {
    const { userId, token, platform, timezone, deviceId, previousToken, now } = params;
    const userRef = this.db.collection('users').doc(userId);
    const tokensRef = userRef.collection('pushTokens');

    let collectionGroupLookupFailed = false;
    const tokensToClean = new Set<string>([token]);
    if (previousToken && previousToken !== token) {
      tokensToClean.add(previousToken);
    }

    const staleTokenRefs = new Map<string, FirebaseFirestore.DocumentReference>();

    try {
      for (const tokenToClean of tokensToClean) {
        const allTokensWithThisValue = await this.db
          .collectionGroup('pushTokens')
          .where('token', '==', tokenToClean)
          .get();

        for (const tokenDoc of allTokensWithThisValue.docs) {
          const pathParts = tokenDoc.ref.path.split('/');
          const tokenOwnerId = pathParts[1];
          if (tokenOwnerId !== userId) {
            staleTokenRefs.set(tokenDoc.ref.path, tokenDoc.ref);
          }
        }
      }
    } catch {
      collectionGroupLookupFailed = true;
    }

    if (deviceId) {
      try {
        const allTokensForDevice = await this.db
          .collectionGroup('pushTokens')
          .where('deviceId', '==', deviceId)
          .get();

        for (const tokenDoc of allTokensForDevice.docs) {
          const pathParts = tokenDoc.ref.path.split('/');
          const tokenOwnerId = pathParts[1];
          if (tokenOwnerId !== userId) {
            staleTokenRefs.set(tokenDoc.ref.path, tokenDoc.ref);
          }
        }
      } catch {
        collectionGroupLookupFailed = true;
      }
    }

    if (collectionGroupLookupFailed) {
      const fallbackRefs = await this.findStalePushTokenRefsByUserScan({
        currentUserId: userId,
        tokensToClean,
        deviceId,
      });
      fallbackRefs.forEach((ref, path) => staleTokenRefs.set(path, ref));
    }

    if (staleTokenRefs.size > 0) {
      const batch = this.db.batch();
      staleTokenRefs.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    const existingTokenQuery = await tokensRef.where('token', '==', token).limit(1).get();
    let existingDoc = existingTokenQuery.empty ? null : existingTokenQuery.docs[0];

    if (!existingDoc && deviceId) {
      const existingByDeviceQuery = await tokensRef.where('deviceId', '==', deviceId).limit(1).get();
      if (!existingByDeviceQuery.empty) {
        existingDoc = existingByDeviceQuery.docs[0];
      }
    }

    if (existingDoc) {
      const updateData: Record<string, unknown> = {
        token,
        platform,
        timezone: timezone || null,
        updatedAt: now,
        lastActive: now,
      };
      if (deviceId) {
        updateData.deviceId = deviceId;
      }
      await existingDoc.ref.update(updateData);
    } else {
      const createData: Record<string, unknown> = {
        token,
        platform,
        timezone: timezone || null,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
      };
      if (deviceId) {
        createData.deviceId = deviceId;
      }
      await tokensRef.add(createData);
    }

    if (timezone) {
      await userRef.set({ timezone, updatedAt: now }, { merge: true });
    }

    return {
      staleRemovedCount: staleTokenRefs.size,
      updatedExisting: !!existingDoc,
      fallbackUsed: collectionGroupLookupFailed,
    };
  }

  async unregisterPushToken(userId: string, token: string): Promise<DeletePushTokensResult> {
    const tokensRef = this.db.collection('users').doc(userId).collection('pushTokens');
    const tokenQuery = await tokensRef.where('token', '==', token).get();
    if (tokenQuery.empty) {
      return { deletedCount: 0 };
    }

    const batch = this.db.batch();
    tokenQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return { deletedCount: tokenQuery.size };
  }

  async deleteAllPushTokens(userId: string): Promise<DeletePushTokensResult> {
    const tokensRef = this.db.collection('users').doc(userId).collection('pushTokens');
    const tokensSnapshot = await tokensRef.get();
    if (tokensSnapshot.empty) {
      return { deletedCount: 0 };
    }

    const batch = this.db.batch();
    tokensSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    return { deletedCount: tokensSnapshot.size };
  }

  async deleteAccountData(userId: string, userEmailCandidates: string[]): Promise<number> {
    const deletionTargets = buildDeletionTargets(userId, userEmailCandidates);
    const snapshots = await Promise.all(
      deletionTargets.map((target) =>
        this.db.collection(target.collection).where(target.field, '==', target.value).get(),
      ),
    );

    const userRef = this.db.collection('users').doc(userId);
    const subcollections = await userRef.listCollections();
    const subcollectionSnapshots = await Promise.all(
      subcollections.map((subcollectionRef) => subcollectionRef.get()),
    );

    const directDocRefs: FirebaseFirestore.DocumentReference[] = [
      this.db.collection('users').doc(userId),
      this.db.collection('patientContexts').doc(userId),
      this.db.collection('patientEvaluations').doc(userId),
    ];

    const uniqueDocRefs = new Map<string, FirebaseFirestore.DocumentReference>();
    snapshots.flatMap((snapshot) => snapshot.docs).forEach((doc) => {
      uniqueDocRefs.set(doc.ref.path, doc.ref);
    });
    subcollectionSnapshots.flatMap((snapshot) => snapshot.docs).forEach((doc) => {
      uniqueDocRefs.set(doc.ref.path, doc.ref);
    });
    directDocRefs.forEach((ref) => uniqueDocRefs.set(ref.path, ref));

    const refs = Array.from(uniqueDocRefs.values());
    if (refs.length === 0) {
      return 0;
    }

    let deletedCount = 0;
    for (let start = 0; start < refs.length; start += FIRESTORE_DELETE_BATCH_SIZE) {
      const batch = this.db.batch();
      const chunk = refs.slice(start, start + FIRESTORE_DELETE_BATCH_SIZE);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
      deletedCount += chunk.length;
    }

    return deletedCount;
  }

  async listRestoreAuditEvents(
    params: ListRestoreAuditEventsParams,
  ): Promise<ListRestoreAuditEventsResult | null> {
    let query = this.db.collection(RESTORE_AUDIT_COLLECTION).orderBy('createdAt', 'desc');

    if (params.cursor) {
      const cursorDoc = await this.db
        .collection(RESTORE_AUDIT_COLLECTION)
        .doc(params.cursor)
        .get();
      if (!cursorDoc.exists) {
        return null;
      }
      query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.limit(params.scanLimit + 1).get();
    const rawPageDocs = snapshot.docs.slice(0, params.scanLimit);
    const hasMore = snapshot.docs.length > params.scanLimit;
    const nextCursor =
      hasMore && rawPageDocs.length > 0 ? rawPageDocs[rawPageDocs.length - 1].id : null;

    const events = rawPageDocs
      .filter((doc) => {
        const data = doc.data() as Record<string, unknown>;
        if (params.resourceType && data.resourceType !== params.resourceType) {
          return false;
        }
        if (params.ownerUserId && data.ownerUserId !== params.ownerUserId) {
          return false;
        }
        if (params.actorUserId && data.actorUserId !== params.actorUserId) {
          return false;
        }
        const eventTriageStatus =
          typeof data.triageStatus === 'string' ? data.triageStatus : 'unreviewed';
        if (params.triageStatus && eventTriageStatus !== params.triageStatus) {
          return false;
        }
        return true;
      })
      .slice(0, params.limit)
      .map<RestoreAuditEventRecord>((doc) => ({
        id: doc.id,
        data: doc.data() ?? {},
      }));

    return {
      events,
      hasMore,
      nextCursor,
      scanned: rawPageDocs.length,
    };
  }

  async updateRestoreAuditTriage(
    eventId: string,
    params: UpdateRestoreAuditTriageParams,
  ): Promise<RestoreAuditEventRecord | null> {
    const eventRef = this.db.collection(RESTORE_AUDIT_COLLECTION).doc(eventId);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      triageUpdatedAt: params.updatedAt,
      triageUpdatedBy: params.updatedBy,
    };

    if (params.triageStatus !== undefined) {
      updateData.triageStatus = params.triageStatus;
    }

    if (params.triageNote !== undefined) {
      updateData.triageNote = params.triageNote;
    }

    if (params.clearTriageNote === true) {
      updateData.triageNote = null;
    }

    await eventRef.update(updateData);
    const updatedDoc = await eventRef.get();

    return {
      id: updatedDoc.id,
      data: updatedDoc.data() ?? {},
    };
  }
}
