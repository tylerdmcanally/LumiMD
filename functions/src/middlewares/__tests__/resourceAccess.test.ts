import {
  hasResourceOwnerAccess,
  ensureResourceOwnerAccessOrReject,
  ensureResourceParticipantAccessOrReject,
} from '../resourceAccess';

function createResponseHarness() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json };
}

describe('hasResourceOwnerAccess', () => {
  it('returns true for owner access', () => {
    const allowed = hasResourceOwnerAccess('user-1', { userId: 'user-1' });
    expect(allowed).toBe(true);
  });

  it('returns false when owner field is missing', () => {
    const allowed = hasResourceOwnerAccess('user-1', { id: 'resource-1' });
    expect(allowed).toBe(false);
  });

  it('returns true for operator access when explicitly enabled', () => {
    const allowed = hasResourceOwnerAccess(
      'operator-1',
      { userId: 'user-1' },
      { allowOperator: true, isOperator: true },
    );
    expect(allowed).toBe(true);
  });
});

describe('ensureResourceOwnerAccessOrReject', () => {
  it('allows owner access when resource is active', () => {
    const res = createResponseHarness();

    const allowed = ensureResourceOwnerAccessOrReject(
      'user-1',
      { userId: 'user-1', deletedAt: null },
      res,
      { resourceName: 'action', notFoundMessage: 'Action not found' },
    );

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects non-owner access with forbidden', () => {
    const res = createResponseHarness();

    const allowed = ensureResourceOwnerAccessOrReject(
      'user-2',
      { userId: 'user-1', deletedAt: null },
      res,
      { resourceName: 'action', message: 'You do not have access to this action' },
    );

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'You do not have access to this action',
    });
  });

  it('rejects deleted resources when allowDeleted is false', () => {
    const res = createResponseHarness();

    const allowed = ensureResourceOwnerAccessOrReject(
      'user-1',
      { userId: 'user-1', deletedAt: { _seconds: 1 } },
      res,
      { resourceName: 'action', notFoundMessage: 'Action not found' },
    );

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 'not_found',
      message: 'Action not found',
    });
  });

  it('allows operator access when explicitly enabled', () => {
    const res = createResponseHarness();

    const allowed = ensureResourceOwnerAccessOrReject(
      'operator-1',
      { userId: 'user-1', deletedAt: { _seconds: 1 } },
      res,
      {
        resourceName: 'action',
        allowOperator: true,
        isOperator: true,
        allowDeleted: true,
      },
    );

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('ensureResourceParticipantAccessOrReject', () => {
  it('allows access when viewer matches one participant field', () => {
    const res = createResponseHarness();

    const allowed = ensureResourceParticipantAccessOrReject(
      'caregiver-1',
      { ownerId: 'owner-1', caregiverUserId: 'caregiver-1', deletedAt: null },
      res,
      {
        resourceName: 'share',
        participantFields: ['ownerId', 'caregiverUserId'],
        notFoundMessage: 'Share not found',
        message: 'You do not have access to this share',
      },
    );

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects access when viewer matches no participant field', () => {
    const res = createResponseHarness();

    const allowed = ensureResourceParticipantAccessOrReject(
      'viewer-1',
      { ownerId: 'owner-1', caregiverUserId: 'caregiver-1', deletedAt: null },
      res,
      {
        resourceName: 'share',
        participantFields: ['ownerId', 'caregiverUserId'],
        message: 'You do not have access to this share',
      },
    );

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'You do not have access to this share',
    });
  });

  it('rejects with not_found when participant fields are missing', () => {
    const res = createResponseHarness();

    const allowed = ensureResourceParticipantAccessOrReject(
      'viewer-1',
      { deletedAt: null },
      res,
      {
        resourceName: 'share',
        participantFields: ['ownerId', 'caregiverUserId'],
        notFoundMessage: 'Share not found',
      },
    );

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 'not_found',
      message: 'Share not found',
    });
  });
});
