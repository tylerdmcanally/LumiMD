import {
  DenormalizationSyncRepository,
  DenormalizationSyncUpdate,
  FirestoreDenormalizationSyncRepository,
} from './repositories';

type RecordData = FirebaseFirestore.DocumentData;

const DEFAULT_BATCH_LIMIT = 450;
const DEFAULT_BACKFILL_PAGE_SIZE = 250;
const MAX_BACKFILL_PAGE_SIZE = 500;
export const DENORMALIZATION_BACKFILL_STATE_DOC_ID = 'denormalizationFieldBackfill';

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const buildNameFromParts = (firstName: unknown, lastName: unknown): string | null => {
  const first = normalizeText(firstName);
  const last = normalizeText(lastName);
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return combined.length > 0 ? combined : null;
};

const buildNameFromEmail = (email: string | null): string | null => {
  if (!email) {
    return null;
  }

  const [prefix] = email.split('@');
  const fallback = prefix?.trim();
  return fallback && fallback.length > 0 ? fallback : null;
};

export function buildOwnerDisplayName(userData?: RecordData | null): string | null {
  if (!userData) {
    return null;
  }

  const displayName = normalizeText(userData.displayName);
  if (displayName) {
    return displayName;
  }

  const fromParts = buildNameFromParts(userData.firstName, userData.lastName);
  if (fromParts) {
    return fromParts;
  }

  return buildNameFromEmail(normalizeEmail(userData.email));
}

export function resolveOwnerDenormalizationUpdate(
  beforeData?: RecordData | null,
  afterData?: RecordData | null,
): { ownerName: string | null; ownerEmail: string | null } | null {
  if (!afterData) {
    return null;
  }

  const beforeName = buildOwnerDisplayName(beforeData);
  const afterName = buildOwnerDisplayName(afterData);

  const beforeEmail = normalizeEmail(beforeData?.email);
  const afterEmail = normalizeEmail(afterData.email);

  if (beforeName === afterName && beforeEmail === afterEmail) {
    return null;
  }

  return {
    ownerName: afterName,
    ownerEmail: afterEmail,
  };
}

export function resolveCaregiverEmailDenormalizationUpdate(
  beforeData?: RecordData | null,
  afterData?: RecordData | null,
): { caregiverEmail: string | null } | null {
  if (!afterData) {
    return null;
  }

  const beforeEmail = normalizeEmail(beforeData?.email);
  const afterEmail = normalizeEmail(afterData.email);

  if (beforeEmail === afterEmail) {
    return null;
  }

  return { caregiverEmail: afterEmail };
}

export function resolveMedicationReminderDenormalizationUpdate(
  beforeData?: RecordData | null,
  afterData?: RecordData | null,
): { medicationName: string; medicationDose: string | null } | null {
  if (!afterData) {
    return null;
  }

  const beforeName = normalizeText(beforeData?.name);
  const afterName = normalizeText(afterData.name);

  const beforeDose = normalizeText(beforeData?.dose);
  const afterDose = normalizeText(afterData.dose);

  if (beforeName === afterName && beforeDose === afterDose) {
    return null;
  }

  const medicationName = afterName ?? beforeName;
  if (!medicationName) {
    return null;
  }

  return {
    medicationName,
    medicationDose: afterDose,
  };
}

type ShareOwnerSyncParams = {
  db: FirebaseFirestore.Firestore;
  userId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  now: FirebaseFirestore.Timestamp;
  batchLimit?: number;
  denormalizationSyncRepository?: Pick<
    DenormalizationSyncRepository,
    'listSharesByOwnerId' | 'listShareInvitesByOwnerId' | 'applyUpdates'
  >;
};

export async function syncShareOwnerDenormalizedFields(
  params: ShareOwnerSyncParams,
): Promise<{ updatedShares: number; updatedInvites: number }> {
  const { db, userId, ownerName, ownerEmail, now, batchLimit = DEFAULT_BATCH_LIMIT } = params;
  const denormalizationSyncRepository =
    params.denormalizationSyncRepository ?? new FirestoreDenormalizationSyncRepository(db);

  const [shareDocs, inviteDocs] = await Promise.all([
    denormalizationSyncRepository.listSharesByOwnerId(userId),
    denormalizationSyncRepository.listShareInvitesByOwnerId(userId),
  ]);

  if (shareDocs.length === 0 && inviteDocs.length === 0) {
    return {
      updatedShares: 0,
      updatedInvites: 0,
    };
  }

  let updatedShares = 0;
  let updatedInvites = 0;
  const pendingUpdates: DenormalizationSyncUpdate[] = [];

  const queueUpdate = (
    docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[],
    collection: 'shares' | 'shareInvites',
  ) => {
    for (const doc of docs) {
      const data = doc.data();
      const currentName = normalizeText(data.ownerName);
      const currentEmail = normalizeEmail(data.ownerEmail);
      if (currentName === ownerName && currentEmail === ownerEmail) {
        continue;
      }

      pendingUpdates.push({
        ref: doc.ref,
        updates: {
          ownerName,
          ownerEmail,
          updatedAt: now,
        },
      });

      if (collection === 'shares') {
        updatedShares += 1;
      } else {
        updatedInvites += 1;
      }
    }
  };

  queueUpdate(shareDocs, 'shares');
  queueUpdate(inviteDocs, 'shareInvites');

  await denormalizationSyncRepository.applyUpdates(pendingUpdates, { batchLimit });

  return {
    updatedShares,
    updatedInvites,
  };
}

type ShareCaregiverSyncParams = {
  db: FirebaseFirestore.Firestore;
  userId: string;
  caregiverEmail: string | null;
  now: FirebaseFirestore.Timestamp;
  batchLimit?: number;
  denormalizationSyncRepository?: Pick<
    DenormalizationSyncRepository,
    'listSharesByCaregiverUserId' | 'listShareInvitesByCaregiverUserId' | 'applyUpdates'
  >;
};

export async function syncShareCaregiverDenormalizedFields(
  params: ShareCaregiverSyncParams,
): Promise<{ updatedShares: number; updatedInvites: number }> {
  const { db, userId, caregiverEmail, now, batchLimit = DEFAULT_BATCH_LIMIT } = params;
  const denormalizationSyncRepository =
    params.denormalizationSyncRepository ?? new FirestoreDenormalizationSyncRepository(db);

  const [shareDocs, inviteDocs] = await Promise.all([
    denormalizationSyncRepository.listSharesByCaregiverUserId(userId),
    denormalizationSyncRepository.listShareInvitesByCaregiverUserId(userId),
  ]);

  if (shareDocs.length === 0 && inviteDocs.length === 0) {
    return {
      updatedShares: 0,
      updatedInvites: 0,
    };
  }

  let updatedShares = 0;
  let updatedInvites = 0;
  const pendingUpdates: DenormalizationSyncUpdate[] = [];

  const queueUpdate = (
    docs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[],
    collection: 'shares' | 'shareInvites',
  ) => {
    for (const doc of docs) {
      const data = doc.data();
      const currentCaregiverEmail = normalizeEmail(data.caregiverEmail);
      if (currentCaregiverEmail === caregiverEmail) {
        continue;
      }

      pendingUpdates.push({
        ref: doc.ref,
        updates: {
          caregiverEmail,
          updatedAt: now,
        },
      });

      if (collection === 'shares') {
        updatedShares += 1;
      } else {
        updatedInvites += 1;
      }
    }
  };

  queueUpdate(shareDocs, 'shares');
  queueUpdate(inviteDocs, 'shareInvites');

  await denormalizationSyncRepository.applyUpdates(pendingUpdates, { batchLimit });

  return {
    updatedShares,
    updatedInvites,
  };
}

type ReminderSyncParams = {
  db: FirebaseFirestore.Firestore;
  userId: string;
  medicationId: string;
  medicationName: string;
  medicationDose: string | null;
  now: FirebaseFirestore.Timestamp;
  batchLimit?: number;
  denormalizationSyncRepository?: Pick<
    DenormalizationSyncRepository,
    'listMedicationRemindersByUserAndMedication' | 'applyUpdates'
  >;
};

export async function syncMedicationReminderDenormalizedFields(
  params: ReminderSyncParams,
): Promise<{ updatedReminders: number }> {
  const {
    db,
    userId,
    medicationId,
    medicationName,
    medicationDose,
    now,
    batchLimit = DEFAULT_BATCH_LIMIT,
  } = params;
  const denormalizationSyncRepository =
    params.denormalizationSyncRepository ?? new FirestoreDenormalizationSyncRepository(db);
  const reminderDocs = await denormalizationSyncRepository.listMedicationRemindersByUserAndMedication(
    userId,
    medicationId,
  );

  if (reminderDocs.length === 0) {
    return { updatedReminders: 0 };
  }

  let updatedReminders = 0;
  const pendingUpdates: DenormalizationSyncUpdate[] = [];

  for (const doc of reminderDocs) {
    const data = doc.data();
    const currentName = normalizeText(data.medicationName);
    const currentDose = normalizeText(data.medicationDose);
    if (currentName === medicationName && currentDose === medicationDose) {
      continue;
    }

    pendingUpdates.push({
      ref: doc.ref,
      updates: {
        medicationName,
        medicationDose,
        updatedAt: now,
      },
    });
    updatedReminders += 1;
  }

  await denormalizationSyncRepository.applyUpdates(pendingUpdates, { batchLimit });

  return { updatedReminders };
}

type BackfillPageState = {
  sharesCursorDocId: string | null;
  shareInvitesCursorDocId: string | null;
  medicationRemindersCursorDocId: string | null;
};

type BackfillPageResult = {
  processed: number;
  updated: number;
  nextCursor: string | null;
  hasMore: boolean;
};

export type DenormalizationBackfillResult = {
  processedShares: number;
  updatedShares: number;
  processedShareInvites: number;
  updatedShareInvites: number;
  processedMedicationReminders: number;
  updatedMedicationReminders: number;
  hasMore: boolean;
  cursors: BackfillPageState;
  dryRun: boolean;
  pageSize: number;
};

type RunDenormalizationBackfillParams = {
  db: FirebaseFirestore.Firestore;
  stateCollection: FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData>;
  now: FirebaseFirestore.Timestamp;
  pageSize?: number;
  dryRun?: boolean;
  denormalizationSyncRepository?: Pick<
    DenormalizationSyncRepository,
    'listCollectionPage' | 'getLookupDocsByIds' | 'applyUpdates'
  >;
};

async function runOwnerFieldBackfillPage(params: {
  denormalizationSyncRepository: Pick<
    DenormalizationSyncRepository,
    'listCollectionPage' | 'getLookupDocsByIds' | 'applyUpdates'
  >;
  collectionName: 'shares' | 'shareInvites';
  cursorDocId: string | null;
  pageSize: number;
  now: FirebaseFirestore.Timestamp;
  dryRun: boolean;
}): Promise<BackfillPageResult> {
  const { denormalizationSyncRepository, collectionName, cursorDocId, pageSize, now, dryRun } =
    params;

  const docs = await denormalizationSyncRepository.listCollectionPage(collectionName, {
    cursorDocId,
    limit: pageSize + 1,
  });
  if (docs.length === 0) {
    return {
      processed: 0,
      updated: 0,
      nextCursor: null,
      hasMore: false,
    };
  }

  const pageDocs = docs.slice(0, pageSize);

  const userLookupIds = Array.from(
    new Set(
      pageDocs
        .flatMap((doc) => [
          normalizeText(doc.data().ownerId),
          normalizeText(doc.data().caregiverUserId),
        ])
        .filter((userId): userId is string => Boolean(userId)),
    ),
  );

  const usersById = await denormalizationSyncRepository.getLookupDocsByIds('users', userLookupIds);
  const pendingUpdates: DenormalizationSyncUpdate[] = [];
  let updated = 0;

  for (const doc of pageDocs) {
    const data = doc.data();
    const ownerId = normalizeText(data.ownerId);
    const caregiverUserId = normalizeText(data.caregiverUserId);
    const owner = ownerId ? usersById.get(ownerId) : null;
    const caregiver = caregiverUserId ? usersById.get(caregiverUserId) : null;

    const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {};
    let hasFieldUpdates = false;

    if (owner) {
      const ownerName = buildOwnerDisplayName(owner);
      const ownerEmail = normalizeEmail(owner.email);
      const currentName = normalizeText(data.ownerName);
      const currentEmail = normalizeEmail(data.ownerEmail);
      if (currentName !== ownerName || currentEmail !== ownerEmail) {
        updates.ownerName = ownerName;
        updates.ownerEmail = ownerEmail;
        hasFieldUpdates = true;
      }
    }

    if (caregiver) {
      const caregiverEmail = normalizeEmail(caregiver.email);
      const currentCaregiverEmail = normalizeEmail(data.caregiverEmail);
      if (currentCaregiverEmail !== caregiverEmail) {
        updates.caregiverEmail = caregiverEmail;
        hasFieldUpdates = true;
      }
    }

    if (!hasFieldUpdates) {
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    pendingUpdates.push({
      ref: doc.ref,
      updates: {
        ...updates,
        updatedAt: now,
      },
    });
    updated += 1;
  }

  if (!dryRun) {
    await denormalizationSyncRepository.applyUpdates(pendingUpdates, {
      batchLimit: DEFAULT_BATCH_LIMIT,
    });
  }

  const hasMore = docs.length > pageSize;
  const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;
  return {
    processed: pageDocs.length,
    updated,
    nextCursor,
    hasMore,
  };
}

async function runReminderFieldBackfillPage(params: {
  denormalizationSyncRepository: Pick<
    DenormalizationSyncRepository,
    'listCollectionPage' | 'getLookupDocsByIds' | 'applyUpdates'
  >;
  cursorDocId: string | null;
  pageSize: number;
  now: FirebaseFirestore.Timestamp;
  dryRun: boolean;
}): Promise<BackfillPageResult> {
  const { denormalizationSyncRepository, cursorDocId, pageSize, now, dryRun } = params;

  const docs = await denormalizationSyncRepository.listCollectionPage('medicationReminders', {
    cursorDocId,
    limit: pageSize + 1,
  });
  if (docs.length === 0) {
    return {
      processed: 0,
      updated: 0,
      nextCursor: null,
      hasMore: false,
    };
  }

  const pageDocs = docs.slice(0, pageSize);

  const medicationIds = pageDocs
    .map((doc) => normalizeText(doc.data().medicationId))
    .filter((medicationId): medicationId is string => Boolean(medicationId));

  const medicationsById = await denormalizationSyncRepository.getLookupDocsByIds(
    'medications',
    medicationIds,
  );
  const pendingUpdates: DenormalizationSyncUpdate[] = [];
  let updated = 0;

  for (const doc of pageDocs) {
    const reminder = doc.data();
    const medicationId = normalizeText(reminder.medicationId);
    if (!medicationId) {
      continue;
    }

    const medication = medicationsById.get(medicationId);
    if (!medication) {
      continue;
    }

    const medicationName = normalizeText(medication.name);
    if (!medicationName) {
      continue;
    }
    const medicationDose = normalizeText(medication.dose);

    const reminderName = normalizeText(reminder.medicationName);
    const reminderDose = normalizeText(reminder.medicationDose);
    if (reminderName === medicationName && reminderDose === medicationDose) {
      continue;
    }

    if (dryRun) {
      updated += 1;
      continue;
    }

    pendingUpdates.push({
      ref: doc.ref,
      updates: {
        medicationName,
        medicationDose,
        updatedAt: now,
      },
    });
    updated += 1;
  }

  if (!dryRun) {
    await denormalizationSyncRepository.applyUpdates(pendingUpdates, {
      batchLimit: DEFAULT_BATCH_LIMIT,
    });
  }

  const hasMore = docs.length > pageSize;
  const nextCursor = hasMore && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1].id : null;
  return {
    processed: pageDocs.length,
    updated,
    nextCursor,
    hasMore,
  };
}

export async function backfillDenormalizedFields(
  params: RunDenormalizationBackfillParams,
): Promise<DenormalizationBackfillResult> {
  const denormalizationSyncRepository =
    params.denormalizationSyncRepository ?? new FirestoreDenormalizationSyncRepository(params.db);
  const dryRun = params.dryRun === true;
  const pageSize = Math.max(
    1,
    Math.min(MAX_BACKFILL_PAGE_SIZE, Math.floor(params.pageSize ?? DEFAULT_BACKFILL_PAGE_SIZE)),
  );
  const stateRef = params.stateCollection.doc(DENORMALIZATION_BACKFILL_STATE_DOC_ID);

  let state: BackfillPageState = {
    sharesCursorDocId: null,
    shareInvitesCursorDocId: null,
    medicationRemindersCursorDocId: null,
  };

  const stateSnapshot = await stateRef.get();
  if (stateSnapshot.exists) {
    const stateData = stateSnapshot.data() ?? {};
    state = {
      sharesCursorDocId: normalizeText(stateData.sharesCursorDocId),
      shareInvitesCursorDocId: normalizeText(stateData.shareInvitesCursorDocId),
      medicationRemindersCursorDocId: normalizeText(stateData.medicationRemindersCursorDocId),
    };
  }

  const [sharesResult, shareInvitesResult, remindersResult] = await Promise.all([
    runOwnerFieldBackfillPage({
      denormalizationSyncRepository,
      collectionName: 'shares',
      cursorDocId: state.sharesCursorDocId,
      pageSize,
      now: params.now,
      dryRun,
    }),
    runOwnerFieldBackfillPage({
      denormalizationSyncRepository,
      collectionName: 'shareInvites',
      cursorDocId: state.shareInvitesCursorDocId,
      pageSize,
      now: params.now,
      dryRun,
    }),
    runReminderFieldBackfillPage({
      denormalizationSyncRepository,
      cursorDocId: state.medicationRemindersCursorDocId,
      pageSize,
      now: params.now,
      dryRun,
    }),
  ]);

  const cursors: BackfillPageState = {
    sharesCursorDocId: sharesResult.nextCursor,
    shareInvitesCursorDocId: shareInvitesResult.nextCursor,
    medicationRemindersCursorDocId: remindersResult.nextCursor,
  };

  if (!dryRun) {
    await stateRef.set(
      {
        ...cursors,
        pageSize,
        lastProcessedAt: params.now,
        lastRun: {
          processedShares: sharesResult.processed,
          updatedShares: sharesResult.updated,
          processedShareInvites: shareInvitesResult.processed,
          updatedShareInvites: shareInvitesResult.updated,
          processedMedicationReminders: remindersResult.processed,
          updatedMedicationReminders: remindersResult.updated,
        },
        completedAt:
          sharesResult.hasMore || shareInvitesResult.hasMore || remindersResult.hasMore
            ? null
            : params.now,
      },
      { merge: true },
    );
  }

  return {
    processedShares: sharesResult.processed,
    updatedShares: sharesResult.updated,
    processedShareInvites: shareInvitesResult.processed,
    updatedShareInvites: shareInvitesResult.updated,
    processedMedicationReminders: remindersResult.processed,
    updatedMedicationReminders: remindersResult.updated,
    hasMore: sharesResult.hasMore || shareInvitesResult.hasMore || remindersResult.hasMore,
    cursors,
    dryRun,
    pageSize,
  };
}
