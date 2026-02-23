import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import {
  FirestoreSoftDeleteRetentionRepository,
  SoftDeleteRetentionRepository,
} from './repositories';

const getDb = () => admin.firestore();

const DEFAULT_SOFT_DELETE_RETENTION_DAYS = 90;
const DEFAULT_PURGE_PAGE_SIZE = 250;
const MAX_PURGE_PAGE_SIZE = 500;

const SOFT_DELETED_COLLECTIONS = [
  'actions',
  'visits',
  'medications',
  'healthLogs',
  'medicationReminders',
  'careTasks',
] as const;

type SoftDeletedCollection = (typeof SOFT_DELETED_COLLECTIONS)[number];

type SoftDeleteRetentionDependencies = {
  retentionRepository?: Pick<SoftDeleteRetentionRepository, 'listSoftDeleted' | 'purgeByRefs'>;
};

function resolveDependencies(
  overrides: SoftDeleteRetentionDependencies = {},
): Required<SoftDeleteRetentionDependencies> {
  return {
    retentionRepository:
      overrides.retentionRepository ?? new FirestoreSoftDeleteRetentionRepository(getDb()),
  };
}

type CollectionPurgeResult = {
  collection: SoftDeletedCollection;
  scanned: number;
  purged: number;
  hasMore: boolean;
};

export async function purgeSoftDeletedCollections(options?: {
  retentionDays?: number;
  pageSize?: number;
  collections?: SoftDeletedCollection[];
}, dependencyOverrides: SoftDeleteRetentionDependencies = {}): Promise<{
  retentionDays: number;
  cutoffIso: string;
  totalScanned: number;
  totalPurged: number;
  hasMore: boolean;
  collections: CollectionPurgeResult[];
}> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const repository = dependencies.retentionRepository;
  const retentionDays = Math.max(
    1,
    Math.floor(options?.retentionDays ?? DEFAULT_SOFT_DELETE_RETENTION_DAYS),
  );
  const requestedPageSize = options?.pageSize ?? DEFAULT_PURGE_PAGE_SIZE;
  const pageSize = Math.max(1, Math.min(MAX_PURGE_PAGE_SIZE, Math.floor(requestedPageSize)));
  const collections = options?.collections?.length
    ? options.collections
    : [...SOFT_DELETED_COLLECTIONS];

  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoff = admin.firestore.Timestamp.fromDate(cutoffDate);

  const collectionResults: CollectionPurgeResult[] = [];

  for (const collection of collections) {
    const records = await repository.listSoftDeleted(collection, cutoff, pageSize);

    if (records.length === 0) {
      collectionResults.push({
        collection,
        scanned: 0,
        purged: 0,
        hasMore: false,
      });
      continue;
    }

    const purged = await repository.purgeByRefs(records.map((record) => record.ref));

    collectionResults.push({
      collection,
      scanned: records.length,
      purged,
      hasMore: records.length === pageSize,
    });
  }

  const totalScanned = collectionResults.reduce((sum, result) => sum + result.scanned, 0);
  const totalPurged = collectionResults.reduce((sum, result) => sum + result.purged, 0);
  const hasMore = collectionResults.some((result) => result.hasMore);

  functions.logger.info('[SoftDeleteRetention] Purge run complete', {
    retentionDays,
    cutoffIso: cutoffDate.toISOString(),
    totalScanned,
    totalPurged,
    hasMore,
    collections: collectionResults,
  });

  return {
    retentionDays,
    cutoffIso: cutoffDate.toISOString(),
    totalScanned,
    totalPurged,
    hasMore,
    collections: collectionResults,
  };
}
