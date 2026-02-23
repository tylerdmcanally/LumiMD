import { ensureCaregiverAccessOrReject } from '../caregiverAccess';
import { hasAcceptedCaregiverShareAccess } from '../../services/shareAccess';

jest.mock('../../services/shareAccess', () => ({
  hasAcceptedCaregiverShareAccess: jest.fn(),
}));

function createResponseHarness() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return { status, json };
}

describe('ensureCaregiverAccessOrReject', () => {
  const hasAcceptedCaregiverShareAccessMock =
    hasAcceptedCaregiverShareAccess as jest.MockedFunction<typeof hasAcceptedCaregiverShareAccess>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true and does not write response when caregiver has access', async () => {
    hasAcceptedCaregiverShareAccessMock.mockResolvedValue(true);
    const res = createResponseHarness();

    const result = await ensureCaregiverAccessOrReject(
      'caregiver-1',
      'patient-1',
      res,
    );

    expect(result).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns false and writes default forbidden response when caregiver lacks access', async () => {
    hasAcceptedCaregiverShareAccessMock.mockResolvedValue(false);
    const res = createResponseHarness();

    const result = await ensureCaregiverAccessOrReject(
      'caregiver-1',
      'patient-1',
      res,
    );

    expect(result).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'You do not have access to this patient\'s data',
    });
  });

  it('supports custom message and forbidden callback', async () => {
    hasAcceptedCaregiverShareAccessMock.mockResolvedValue(false);
    const res = createResponseHarness();
    const onForbidden = jest.fn();

    const result = await ensureCaregiverAccessOrReject(
      'caregiver-1',
      'patient-1',
      res,
      {
        message: 'Access denied',
        onForbidden,
      },
    );

    expect(result).toBe(false);
    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: 'forbidden',
      message: 'Access denied',
    });
  });
});
