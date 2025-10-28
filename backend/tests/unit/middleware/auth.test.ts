import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  checkResourceAccess,
} from '../../../src/middleware/auth';
import {
  AuthenticationError,
  AuthorizationError,
} from '../../../src/utils/errors';

describe('auth middleware helpers', () => {
  const userId = 'user-123';
  const email = 'test@example.com';

  it('creates access tokens with expected payload', () => {
    const token = generateAccessToken(userId, email);
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;

    expect(decoded.userId).toEqual(userId);
    expect(decoded.email).toEqual(email);
    expect(decoded.type).toEqual('access');
  });

  it('creates refresh tokens that verify successfully', () => {
    const refreshToken = generateRefreshToken(userId, email);
    const decoded = verifyRefreshToken(refreshToken);

    expect(decoded.userId).toEqual(userId);
    expect(decoded.email).toEqual(email);
    expect(decoded.type).toEqual('refresh');
  });

  it('rejects non-refresh tokens when verifying refresh token', () => {
    const accessToken = generateAccessToken(userId, email);

    expect(() => verifyRefreshToken(accessToken)).toThrow(AuthenticationError);
  });

  it('enforces resource ownership checks', () => {
    expect(() => checkResourceAccess(userId, userId)).not.toThrow();
    expect(() => checkResourceAccess(userId, 'someone-else')).toThrow(AuthorizationError);
  });
});
