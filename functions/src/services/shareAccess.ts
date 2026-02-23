import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { ShareDomainService } from './domain/shares/ShareDomainService';
import { FirestoreShareRepository } from './repositories/shares/FirestoreShareRepository';
import type { ShareRecord } from './repositories/shares/ShareRepository';

const getDb = () => admin.firestore();
const SHARE_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

export type AcceptedShareSummary = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
};

type CacheEntry<T> = {
  value: T;
  expiresAtMs: number;
};

const acceptedSharesCache = new Map<string, CacheEntry<AcceptedShareSummary[]>>();
const caregiverAccessCache = new Map<string, CacheEntry<boolean>>();

type ShareAccessDependencies = {
  shareService?: Pick<
    ShareDomainService,
    'listByOwnerId' | 'listByCaregiverUserId' | 'listByCaregiverEmail' | 'getById' | 'setShare'
  >;
  caregiverEmailResolver?: (caregiverId: string) => Promise<string | null>;
  serverTimestampProvider?: () => unknown;
};

function getCaregiverAccessCacheKey(caregiverId: string, ownerId: string): string {
  return `${ownerId}:${caregiverId}`;
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAtMs <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  cache.set(key, {
    value,
    expiresAtMs: Date.now() + SHARE_LOOKUP_CACHE_TTL_MS,
  });
}

function cacheAcceptedShareAccess(caregiverId: string, ownerId: string): void {
  setCachedValue(caregiverAccessCache, getCaregiverAccessCacheKey(caregiverId, ownerId), true);
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.toLowerCase().trim();
  return normalized.length > 0 ? normalized : null;
}

function toAcceptedShareSummary(
  share: { id: string; ownerId?: unknown; ownerName?: unknown; ownerEmail?: unknown },
): AcceptedShareSummary | null {
  const ownerId = typeof share.ownerId === 'string' ? share.ownerId.trim() : '';
  if (!ownerId) {
    return null;
  }

  return {
    id: share.id,
    ownerId,
    ownerName: typeof share.ownerName === 'string' ? share.ownerName : '',
    ownerEmail: typeof share.ownerEmail === 'string' ? share.ownerEmail : '',
  };
}

function isAcceptedShare(share: ShareRecord): boolean {
  return share.status === 'accepted';
}

function hasCaregiverUserId(share: ShareRecord): boolean {
  return typeof share.caregiverUserId === 'string' && share.caregiverUserId.trim().length > 0;
}

async function getCaregiverEmail(caregiverId: string): Promise<string | null> {
  try {
    const caregiverAuth = await admin.auth().getUser(caregiverId);
    return normalizeEmail(caregiverAuth.email);
  } catch (error) {
    functions.logger.warn(
      `[shareAccess] Unable to load auth user for caregiver ${caregiverId} email fallback`,
      error,
    );
    return null;
  }
}

function buildDefaultDependencies(): Required<ShareAccessDependencies> {
  return {
    shareService: new ShareDomainService(new FirestoreShareRepository(getDb())),
    caregiverEmailResolver: getCaregiverEmail,
    serverTimestampProvider: () => admin.firestore.FieldValue.serverTimestamp(),
  };
}

function resolveDependencies(
  overrides: ShareAccessDependencies,
): Required<ShareAccessDependencies> {
  const defaults = buildDefaultDependencies();
  return {
    shareService: overrides.shareService ?? defaults.shareService,
    caregiverEmailResolver: overrides.caregiverEmailResolver ?? defaults.caregiverEmailResolver,
    serverTimestampProvider:
      overrides.serverTimestampProvider ?? defaults.serverTimestampProvider,
  };
}

export function clearCaregiverShareLookupCacheForTests(): void {
  acceptedSharesCache.clear();
  caregiverAccessCache.clear();
}

export function invalidateCaregiverShareLookupCache(caregiverId: string, ownerId?: string): void {
  acceptedSharesCache.delete(caregiverId);

  if (ownerId) {
    caregiverAccessCache.delete(getCaregiverAccessCacheKey(caregiverId, ownerId));
  }

  const caregiverKeySuffix = `:${caregiverId}`;
  Array.from(caregiverAccessCache.keys()).forEach((cacheKey) => {
    if (cacheKey.endsWith(caregiverKeySuffix)) {
      caregiverAccessCache.delete(cacheKey);
    }
  });
}

export async function getAcceptedSharesForCaregiver(
  caregiverId: string,
  dependencyOverrides: ShareAccessDependencies = {},
): Promise<AcceptedShareSummary[]> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const cachedShares = getCachedValue(acceptedSharesCache, caregiverId);
  if (cachedShares) {
    return cachedShares.map((share) => ({ ...share }));
  }

  const directShares = (await dependencies.shareService.listByCaregiverUserId(caregiverId)).filter(
    (share) => isAcceptedShare(share),
  );

  const acceptedSharesMap = new Map<string, AcceptedShareSummary>();
  directShares.forEach((share) => {
    const summary = toAcceptedShareSummary(share);
    if (!summary) {
      return;
    }
    acceptedSharesMap.set(share.id, summary);
  });

  let emailFallbackCount = 0;
  const caregiverEmail = await dependencies.caregiverEmailResolver(caregiverId);
  if (caregiverEmail) {
    const emailShares = (await dependencies.shareService.listByCaregiverEmail(caregiverEmail)).filter(
      (share) => isAcceptedShare(share),
    );
    emailFallbackCount = emailShares.length;

    await Promise.all(
      emailShares.map(async (share) => {
        if (!hasCaregiverUserId(share)) {
          await dependencies.shareService.setShare(
            share.id,
            {
              caregiverUserId: caregiverId,
              updatedAt: dependencies.serverTimestampProvider(),
            },
            { merge: true },
          );
        }

        const summary = toAcceptedShareSummary(share);
        if (!summary) {
          return;
        }
        acceptedSharesMap.set(share.id, summary);
      }),
    );
  }

  const acceptedShares = Array.from(acceptedSharesMap.values());
  setCachedValue(acceptedSharesCache, caregiverId, acceptedShares);
  acceptedShares.forEach((share) => cacheAcceptedShareAccess(caregiverId, share.ownerId));

  functions.logger.info(
    `[shareAccess] Found ${acceptedShares.length} accepted shares for caregiver ${caregiverId} (uid matches=${directShares.length}, email fallback=${emailFallbackCount})`,
  );

  return acceptedShares.map((share) => ({ ...share }));
}

export async function hasAcceptedCaregiverShareAccess(
  caregiverId: string,
  ownerId: string,
  dependencyOverrides: ShareAccessDependencies = {},
): Promise<boolean> {
  const dependencies = resolveDependencies(dependencyOverrides);
  const cacheKey = getCaregiverAccessCacheKey(caregiverId, ownerId);
  const cachedAccess = getCachedValue(caregiverAccessCache, cacheKey);
  if (cachedAccess !== null) {
    return cachedAccess;
  }

  try {
    const ownerShares = await dependencies.shareService.listByOwnerId(ownerId);
    const directShare = ownerShares.find(
      (share) => isAcceptedShare(share) && share.caregiverUserId === caregiverId,
    );
    if (directShare) {
      setCachedValue(caregiverAccessCache, cacheKey, true);
      return true;
    }

    const canonicalShare = await dependencies.shareService.getById(`${ownerId}_${caregiverId}`);
    if (canonicalShare && isAcceptedShare(canonicalShare)) {
      setCachedValue(caregiverAccessCache, cacheKey, true);
      return true;
    }

    const caregiverEmail = await dependencies.caregiverEmailResolver(caregiverId);
    if (caregiverEmail) {
      const emailShare = ownerShares.find(
        (share) =>
          isAcceptedShare(share) &&
          normalizeEmail(share.caregiverEmail) === caregiverEmail,
      );

      if (emailShare) {
        if (!hasCaregiverUserId(emailShare)) {
          await dependencies.shareService.setShare(
            emailShare.id,
            {
              caregiverUserId: caregiverId,
              updatedAt: dependencies.serverTimestampProvider(),
            },
            { merge: true },
          );
        }

        setCachedValue(caregiverAccessCache, cacheKey, true);
        return true;
      }
    }
  } catch (error) {
    functions.logger.warn(
      `[shareAccess] Failed caregiver access lookup for caregiver=${caregiverId} owner=${ownerId}`,
      error,
    );
  }

  setCachedValue(caregiverAccessCache, cacheKey, false);
  return false;
}
