import { hasAcceptedCaregiverShareAccess } from '../services/shareAccess';

type VisitAccessResource = {
  userId?: unknown;
  deletedAt?: unknown;
};

type VisitAccessResponse = {
  status: (statusCode: number) => {
    json: (payload: { code: string; message: string }) => void;
  };
};

export type EnsureVisitAccessOptions = {
  message?: string;
  notFoundMessage?: string;
  allowOperator?: boolean;
  isOperator?: boolean;
  allowDeleted?: boolean;
  onForbidden?: () => void;
  onNotFound?: () => void;
};

function rejectVisitNotFound(
  res: VisitAccessResponse,
  options: EnsureVisitAccessOptions,
): false {
  options.onNotFound?.();
  res.status(404).json({
    code: 'not_found',
    message: options.notFoundMessage ?? 'Visit not found',
  });
  return false;
}

function rejectVisitForbidden(
  res: VisitAccessResponse,
  options: EnsureVisitAccessOptions,
): false {
  options.onForbidden?.();
  res.status(403).json({
    code: 'forbidden',
    message: options.message ?? 'You do not have access to this visit',
  });
  return false;
}

function resolveVisitOwnerId(visit: VisitAccessResource | null | undefined): string | null {
  return typeof visit?.userId === 'string' && visit.userId.trim().length > 0
    ? visit.userId
    : null;
}

export async function ensureVisitReadAccessOrReject(
  viewerUserId: string,
  visit: VisitAccessResource | null | undefined,
  res: VisitAccessResponse,
  options: EnsureVisitAccessOptions = {},
): Promise<boolean> {
  if (!visit || visit.deletedAt) {
    return rejectVisitNotFound(res, options);
  }

  const ownerUserId = resolveVisitOwnerId(visit);
  if (!ownerUserId) {
    return rejectVisitNotFound(res, options);
  }

  if (ownerUserId === viewerUserId) {
    return true;
  }

  const hasSharedAccess = await hasAcceptedCaregiverShareAccess(viewerUserId, ownerUserId);
  if (hasSharedAccess) {
    return true;
  }

  return rejectVisitForbidden(res, options);
}

export function ensureVisitOwnerAccessOrReject(
  viewerUserId: string,
  visit: VisitAccessResource | null | undefined,
  res: VisitAccessResponse,
  options: EnsureVisitAccessOptions = {},
): boolean {
  if (!visit) {
    return rejectVisitNotFound(res, options);
  }

  const ownerUserId = resolveVisitOwnerId(visit);
  if (!ownerUserId) {
    return rejectVisitNotFound(res, options);
  }

  const hasOwnerAccess =
    ownerUserId === viewerUserId || (options.allowOperator === true && options.isOperator === true);
  if (!hasOwnerAccess) {
    return rejectVisitForbidden(res, options);
  }

  if (!options.allowDeleted && visit.deletedAt) {
    return rejectVisitNotFound(res, options);
  }

  return true;
}
