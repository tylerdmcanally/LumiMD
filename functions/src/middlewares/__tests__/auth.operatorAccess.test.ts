import {
  ensureOperatorAccessOrReject,
  ensureOperatorRestoreReasonOrReject,
} from '../auth';

function createResponseHarness() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json };
}

describe('ensureOperatorAccessOrReject', () => {
  it('allows users with operator claims', () => {
    const res = createResponseHarness();

    const allowed = ensureOperatorAccessOrReject(
      { uid: 'operator-1', operator: true } as unknown as any,
      res,
    );

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects non-operator users with forbidden response', () => {
    const res = createResponseHarness();

    const allowed = ensureOperatorAccessOrReject(
      { uid: 'member-1' } as unknown as any,
      res,
    );

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'Operator access required',
    });
  });

  it('uses custom forbidden message when provided', () => {
    const res = createResponseHarness();

    const allowed = ensureOperatorAccessOrReject(
      { uid: 'member-2' } as unknown as any,
      res,
      'Custom operator message',
    );

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'Custom operator message',
    });
  });
});

describe('ensureOperatorRestoreReasonOrReject', () => {
  it('allows non-operator restores without a reason', () => {
    const res = createResponseHarness();

    const allowed = ensureOperatorRestoreReasonOrReject({
      actorUserId: 'member-1',
      ownerUserId: 'member-2',
      isOperator: false,
      reason: undefined,
      res,
    });

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows operator self-restores without a reason', () => {
    const res = createResponseHarness();

    const allowed = ensureOperatorRestoreReasonOrReject({
      actorUserId: 'operator-1',
      ownerUserId: 'operator-1',
      isOperator: true,
      reason: undefined,
      res,
    });

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('requires reason for operator cross-user restores', () => {
    const res = createResponseHarness();

    const allowed = ensureOperatorRestoreReasonOrReject({
      actorUserId: 'operator-1',
      ownerUserId: 'member-1',
      isOperator: true,
      reason: undefined,
      res,
    });

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'reason_required',
      message: 'Restore reason is required for operator-initiated restores',
    });
  });

  it('allows operator cross-user restores when reason exists', () => {
    const res = createResponseHarness();

    const allowed = ensureOperatorRestoreReasonOrReject({
      actorUserId: 'operator-1',
      ownerUserId: 'member-1',
      isOperator: true,
      reason: 'Patient requested restore',
      res,
    });

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });
});
