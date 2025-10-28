import { PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword } from '../utils/encryption';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth';
import {
  CreateUserDTO,
  UserProfile,
} from '../types';
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
} from '../utils/errors';
import logger from '../utils/logger';

const prisma = new PrismaClient();

export class AuthService {
  /**
   * Register a new user
   */
  async register(userData: CreateUserDTO): Promise<{
    user: UserProfile;
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: userData.email },
            ...(userData.phone ? [{ phone: userData.phone }] : []),
          ],
        },
      });

      if (existingUser) {
        if (existingUser.email === userData.email) {
          throw new ConflictError('Email already registered');
        }
        if (userData.phone && existingUser.phone === userData.phone) {
          throw new ConflictError('Phone number already registered');
        }
      }

      // Validate invitation PIN if provided
      let pendingInvitation = null;
      if (userData.invitationPin) {
        pendingInvitation = await prisma.pendingInvitation.findFirst({
          where: {
            pin: userData.invitationPin,
            inviteeEmail: userData.email,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
        });

        if (!pendingInvitation) {
          throw new ValidationError('Invalid or expired invitation PIN');
        }
      }

      // Hash password
      const passwordHash = await hashPassword(userData.password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          phone: userData.phone,
          passwordHash,
          firstName: userData.firstName,
          lastName: userData.lastName,
          dateOfBirth: new Date(userData.dateOfBirth),
          lastActiveAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          profilePhoto: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info(`New user registered: ${user.email}`);

      // If there's a pending invitation, create the TrustedAccess relationship
      if (pendingInvitation) {
        await prisma.trustedAccess.create({
          data: {
            grantingUserId: pendingInvitation.inviterUserId,
            trustedUserId: user.id,
            accessLevel: pendingInvitation.accessLevel,
            relationship: pendingInvitation.relationship,
          },
        });

        // Mark invitation as accepted
        await prisma.pendingInvitation.update({
          where: { id: pendingInvitation.id },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
          },
        });

        logger.info(`Invitation accepted: ${pendingInvitation.pin} for user ${user.email}`);
      }

      // Generate tokens
      const accessToken = generateAccessToken(user.id, user.email);
      const refreshToken = generateRefreshToken(user.id, user.email);

      return {
        user,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(
    email: string,
    password: string
  ): Promise<{
    user: UserProfile;
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          profilePhoto: true,
          passwordHash: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.passwordHash);

      if (!isValidPassword) {
        throw new AuthenticationError('Invalid email or password');
      }

      // Update last active
      await prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
      });

      logger.info(`User logged in: ${user.email}`);

      // Generate tokens
      const accessToken = generateAccessToken(user.id, user.email);
      const refreshToken = generateRefreshToken(user.id, user.email);

      // Remove password hash from response
      const { passwordHash, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    refreshToken: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    try {
      // Verify refresh token
      const decoded = verifyRefreshToken(refreshToken);

      // Check if user still exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Generate new tokens
      const newAccessToken = generateAccessToken(user.id, user.email);
      const newRefreshToken = generateRefreshToken(user.id, user.email);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw error;
    }
  }

  /**
   * Logout user (client-side token removal)
   */
  async logout(userId: string): Promise<void> {
    try {
      // Could implement token blacklist here if needed
      logger.info(`User logged out: ${userId}`);
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Request password reset (TODO: Implement email/SMS sending)
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if user exists
        logger.warn(`Password reset requested for non-existent email: ${email}`);
        return;
      }

      // TODO: Generate reset token and send email
      logger.info(`Password reset requested for: ${email}`);
    } catch (error) {
      logger.error('Password reset request error:', error);
      throw error;
    }
  }

  /**
   * Verify user email/phone with OTP (TODO: Implement)
   */
  async verifyOTP(identifier: string, otp: string): Promise<boolean> {
    // TODO: Implement OTP verification
    return true;
  }
}

export default new AuthService();
