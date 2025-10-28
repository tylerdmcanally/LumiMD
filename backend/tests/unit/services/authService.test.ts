import { PrismaClient } from '@prisma/client';
import authService from '../../../src/services/authService';
import { ConflictError, AuthenticationError } from '../../../src/utils/errors';
import logger from '../../../src/utils/logger';

jest.mock('@prisma/client', () => {
  const userModel = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  return {
    PrismaClient: jest.fn(() => ({ user: userModel })),
  };
});

jest.mock('../../../src/utils/encryption', () => ({
  hashPassword: jest.fn(async (password: string) => `hashed-${password}`),
  comparePassword: jest.fn(async (password: string, hash: string) => hash === `hashed-${password}`),
}));

jest.mock('../../../src/middleware/auth', () => ({
  generateAccessToken: jest.fn(() => 'access-token'),
  generateRefreshToken: jest.fn(() => 'refresh-token'),
  verifyRefreshToken: jest.fn(() => ({ userId: 'user-id', email: 'user@example.com', type: 'refresh' })),
}));

jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const prismaMock = new PrismaClient();
const { user: userModel } = prismaMock as any;

const resetMocks = () => {
  jest.clearAllMocks();
  userModel.findFirst.mockReset();
  userModel.findUnique.mockReset();
  userModel.create.mockReset();
  userModel.update.mockReset();
};

describe('AuthService', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('register', () => {
    it('creates a new user and returns tokens', async () => {
      userModel.findFirst.mockResolvedValue(null);
      userModel.create.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        phone: null,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01'),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01'),
      } as any);

      expect(userModel.findFirst).toHaveBeenCalledWith({
        where: { OR: [{ email: 'test@example.com' }] },
      });
      expect(userModel.create).toHaveBeenCalled();
      expect(result.accessToken).toEqual('access-token');
      expect(result.refreshToken).toEqual('refresh-token');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('New user registered'));
    });

    it('throws ConflictError when email already exists', async () => {
      userModel.findFirst.mockResolvedValue({ email: 'test@example.com' });

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'Password123',
          firstName: 'Test',
          lastName: 'User',
          dateOfBirth: new Date('1990-01-01'),
        } as any)
      ).rejects.toBeInstanceOf(ConflictError);

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      userModel.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        phone: null,
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01'),
        profilePhoto: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: 'hashed-Password123',
      });

      const result = await authService.login('test@example.com', 'Password123');

      expect(userModel.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: expect.any(Object),
      });
      expect(userModel.update).toHaveBeenCalled();
      expect(result.accessToken).toEqual('access-token');
      expect(result.refreshToken).toEqual('refresh-token');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('User logged in'));
    });

    it('throws AuthenticationError for invalid email', async () => {
      userModel.findUnique.mockResolvedValue(null);

      await expect(authService.login('missing@example.com', 'Password123')).rejects.toBeInstanceOf(
        AuthenticationError
      );

      expect(logger.error).toHaveBeenCalled();
    });

    it('throws AuthenticationError for invalid password', async () => {
      userModel.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: 'hashed-other',
      });

      await expect(authService.login('test@example.com', 'Password123')).rejects.toBeInstanceOf(
        AuthenticationError
      );

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('returns new tokens for valid refresh token', async () => {
      userModel.findUnique.mockResolvedValue({ id: 'user-id', email: 'user@example.com' });

      const result = await authService.refreshAccessToken('refresh-token');

      expect(result.accessToken).toEqual('access-token');
      expect(result.refreshToken).toEqual('refresh-token');
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
