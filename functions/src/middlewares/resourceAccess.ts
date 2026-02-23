type ResourceAccessRecord = Record<string, unknown>;

type ResourceAccessResponse = {
  status: (statusCode: number) => {
    json: (payload: { code: string; message: string }) => void;
  };
};

export type EnsureResourceOwnerAccessOptions = {
  resourceName?: string;
  ownerField?: string;
  deletedField?: string;
  allowDeleted?: boolean;
  allowOperator?: boolean;
  isOperator?: boolean;
  forbiddenCode?: string;
  notFoundCode?: string;
  message?: string;
  notFoundMessage?: string;
  onForbidden?: () => void;
  onNotFound?: () => void;
};

export type EnsureResourceParticipantAccessOptions = Omit<
  EnsureResourceOwnerAccessOptions,
  'ownerField'
> & {
  participantFields?: string[];
};

type ResourceOwnerAccessOptions = Pick<
  EnsureResourceOwnerAccessOptions,
  'ownerField' | 'allowOperator' | 'isOperator'
>;

function rejectNotFound(
  res: ResourceAccessResponse,
  options: EnsureResourceOwnerAccessOptions,
): false {
  options.onNotFound?.();
  res.status(404).json({
    code: options.notFoundCode ?? 'not_found',
    message: options.notFoundMessage ?? `${options.resourceName ?? 'Resource'} not found`,
  });
  return false;
}

function rejectForbidden(
  res: ResourceAccessResponse,
  options: EnsureResourceOwnerAccessOptions,
): false {
  options.onForbidden?.();
  res.status(403).json({
    code: options.forbiddenCode ?? 'forbidden',
    message:
      options.message ??
      `You do not have access to this ${options.resourceName ?? 'resource'}`,
  });
  return false;
}

function getOwnerUserId(
  resource: ResourceAccessRecord | null | undefined,
  ownerField: string,
): string {
  return typeof resource?.[ownerField] === 'string'
    ? (resource[ownerField] as string).trim()
    : '';
}

export function hasResourceOwnerAccess(
  viewerUserId: string,
  resource: ResourceAccessRecord | null | undefined,
  options: ResourceOwnerAccessOptions = {},
): boolean {
  const ownerField = options.ownerField ?? 'userId';
  const ownerUserId = getOwnerUserId(resource, ownerField);
  if (!ownerUserId) {
    return false;
  }

  return (
    ownerUserId === viewerUserId ||
    (options.allowOperator === true && options.isOperator === true)
  );
}

export function ensureResourceOwnerAccessOrReject(
  viewerUserId: string,
  resource: ResourceAccessRecord | null | undefined,
  res: ResourceAccessResponse,
  options: EnsureResourceOwnerAccessOptions = {},
): boolean {
  if (!resource) {
    return rejectNotFound(res, options);
  }

  const ownerField = options.ownerField ?? 'userId';
  const ownerUserId = getOwnerUserId(resource, ownerField);
  if (!ownerUserId) {
    return rejectNotFound(res, options);
  }

  if (!hasResourceOwnerAccess(viewerUserId, resource, options)) {
    return rejectForbidden(res, options);
  }

  const deletedField = options.deletedField ?? 'deletedAt';
  if (!options.allowDeleted && deletedField && resource[deletedField]) {
    return rejectNotFound(res, options);
  }

  return true;
}

export function ensureResourceParticipantAccessOrReject(
  viewerUserId: string,
  resource: ResourceAccessRecord | null | undefined,
  res: ResourceAccessResponse,
  options: EnsureResourceParticipantAccessOptions = {},
): boolean {
  if (!resource) {
    return rejectNotFound(res, options);
  }

  const participantFields =
    Array.isArray(options.participantFields) && options.participantFields.length > 0
      ? options.participantFields
      : ['userId'];

  const participantUserIds = participantFields
    .map((field) =>
      typeof resource[field] === 'string' ? (resource[field] as string).trim() : '',
    )
    .filter((value): value is string => value.length > 0);

  if (participantUserIds.length === 0) {
    return rejectNotFound(res, options);
  }

  const hasParticipantAccess =
    participantUserIds.includes(viewerUserId) ||
    (options.allowOperator === true && options.isOperator === true);
  if (!hasParticipantAccess) {
    return rejectForbidden(res, options);
  }

  const deletedField = options.deletedField ?? 'deletedAt';
  if (!options.allowDeleted && deletedField && resource[deletedField]) {
    return rejectNotFound(res, options);
  }

  return true;
}
