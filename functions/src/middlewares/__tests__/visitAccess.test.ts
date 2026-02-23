import {
  ensureVisitOwnerAccessOrReject,
  ensureVisitReadAccessOrReject,
} from '../visitAccess';
import { hasAcceptedCaregiverShareAccess } from '../../services/shareAccess';

jest.mock('../../services/shareAccess', () => ({
  hasAcceptedCaregiverShareAccess: jest.fn(),
}));

function createResponseHarness() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json };
}

describe('visit access guard middleware helpers', () => {
  const hasAcceptedCaregiverShareAccessMock =
    hasAcceptedCaregiverShareAccess as jest.MockedFunction<typeof hasAcceptedCaregiverShareAccess>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows owner read access without writing response', async () => {
    const res = createResponseHarness();

    const result = await ensureVisitReadAccessOrReject(
      'owner-1',
      { userId: 'owner-1', deletedAt: null },
      res,
    );

    expect(result).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows accepted caregiver read access', async () => {
    hasAcceptedCaregiverShareAccessMock.mockResolvedValue(true);
    const res = createResponseHarness();

    const result = await ensureVisitReadAccessOrReject(
      'caregiver-1',
      { userId: 'owner-1', deletedAt: null },
      res,
    );

    expect(result).toBe(true);
    expect(hasAcceptedCaregiverShareAccessMock).toHaveBeenCalledWith('caregiver-1', 'owner-1');
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects reads for soft-deleted visits with not_found', async () => {
    const res = createResponseHarness();

    const result = await ensureVisitReadAccessOrReject(
      'owner-1',
      { userId: 'owner-1', deletedAt: { _seconds: 1 } },
      res,
    );

    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 'not_found',
      message: 'Visit not found',
    });
  });

  it('rejects non-owner write access with forbidden', () => {
    const res = createResponseHarness();

    const result = ensureVisitOwnerAccessOrReject(
      'caregiver-1',
      { userId: 'owner-1', deletedAt: null },
      res,
    );

    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'You do not have access to this visit',
    });
  });

  it('allows operator write access when explicitly enabled', () => {
    const res = createResponseHarness();

    const result = ensureVisitOwnerAccessOrReject(
      'operator-1',
      { userId: 'owner-1', deletedAt: null },
      res,
      {
        allowOperator: true,
        isOperator: true,
      },
    );

    expect(result).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks owner writes for soft-deleted visits unless allowDeleted is true', () => {
    const res = createResponseHarness();
    const deletedVisit = { userId: 'owner-1', deletedAt: { _seconds: 1 } };

    const blockedResult = ensureVisitOwnerAccessOrReject(
      'owner-1',
      deletedVisit,
      res,
    );
    const allowedResult = ensureVisitOwnerAccessOrReject(
      'owner-1',
      deletedVisit,
      res,
      { allowDeleted: true },
    );

    expect(blockedResult).toBe(false);
    expect(allowedResult).toBe(true);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
