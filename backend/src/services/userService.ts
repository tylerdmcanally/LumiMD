import { PrismaClient } from '@prisma/client';
import { UpdateUserDTO } from '../types';
import { NotFoundError, ConflictError } from '../utils/errors';
import logger from '../utils/logger';
import s3Service from './s3Service';

const prisma = new PrismaClient();

/**
 * User service
 * Handles user profile management
 */
class UserService {
  /**
   * Get user profile
   */
  async getUserProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
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
          lastActiveAt: true,
          _count: {
            select: {
              visits: true,
              providers: true,
              conditions: true,
              medications: true,
            },
          },
        },
      });

      if (!user) {
        throw new NotFoundError('User not found');
      }

      return user;
    } catch (error) {
      logger.error('Failed to get user profile', { error, userId });
      throw error;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, data: UpdateUserDTO) {
    try {
      // Check if email is being changed and if it's already taken
      if (data.email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email: data.email,
            NOT: { id: userId },
          },
        });

        if (existingUser) {
          throw new ConflictError('Email already in use');
        }
      }

      // Check if phone is being changed and if it's already taken
      if (data.phone) {
        const existingUser = await prisma.user.findFirst({
          where: {
            phone: data.phone,
            NOT: { id: userId },
          },
        });

        if (existingUser) {
          throw new ConflictError('Phone number already in use');
        }
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.firstName && { firstName: data.firstName }),
          ...(data.lastName && { lastName: data.lastName }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.dateOfBirth && { dateOfBirth: new Date(data.dateOfBirth) }),
          ...(data.profilePhoto && { profilePhoto: data.profilePhoto }),
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

      logger.info('User profile updated', { userId });

      return updatedUser;
    } catch (error) {
      logger.error('Failed to update user profile', { error, userId });
      throw error;
    }
  }

  /**
   * Upload profile photo
   */
  async uploadProfilePhoto(
    userId: string,
    file: Express.Multer.File
  ): Promise<{ url: string; user: any }> {
    try {
      logger.info('Uploading profile photo', {
        userId,
        fileName: file.originalname,
        fileSize: file.size,
      });

      // Upload to S3 in a photos folder
      const { url } = await s3Service.uploadBuffer(
        file.buffer,
        file.originalname,
        userId,
        'profile'
      );

      // Update user with new photo URL
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { profilePhoto: url },
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

      logger.info('Profile photo uploaded successfully', { userId, url });

      return {
        url,
        user: updatedUser,
      };
    } catch (error) {
      logger.error('Failed to upload profile photo', { error, userId });
      throw error;
    }
  }

  /**
   * Delete user account (soft delete)
   */
  async deleteUserAccount(userId: string) {
    try {
      // In a real app, you might want to:
      // 1. Soft delete (mark as deleted, keep data for X days)
      // 2. Anonymize data
      // 3. Export data for user before deletion
      // For now, we'll just delete

      // Delete all user data (cascade will handle relationships)
      await prisma.user.delete({
        where: { id: userId },
      });

      logger.info('User account deleted', { userId });
    } catch (error) {
      logger.error('Failed to delete user account', { error, userId });
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(userId: string) {
    try {
      const [
        visitsCount,
        providersCount,
        conditionsCount,
        medicationsCount,
        allergiesCount,
        recentVisits,
        upcomingActionItems,
      ] = await Promise.all([
        prisma.visit.count({ where: { userId } }),
        prisma.provider.count({ where: { userId } }),
        prisma.condition.count({ where: { userId, active: true } }),
        prisma.medication.count({ where: { userId, active: true } }),
        prisma.allergy.count({ where: { userId } }),
        prisma.visit.findMany({
          where: { userId },
          orderBy: { visitDate: 'desc' },
          take: 5,
          include: { provider: true },
        }),
        prisma.actionItem.findMany({
          where: {
            visit: { userId },
            completed: false,
            dueDate: { gte: new Date() },
          },
          orderBy: { dueDate: 'asc' },
          take: 5,
          include: { visit: { include: { provider: true } } },
        }),
      ]);

      return {
        counts: {
          visits: visitsCount,
          providers: providersCount,
          conditions: conditionsCount,
          medications: medicationsCount,
          allergies: allergiesCount,
        },
        recentVisits,
        upcomingActionItems,
      };
    } catch (error) {
      logger.error('Failed to get user statistics', { error, userId });
      throw error;
    }
  }
}

export default new UserService();
