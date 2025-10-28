import { PrismaClient } from '@prisma/client';
import { CreateProviderDTO, UpdateProviderDTO } from '../types';
import { NotFoundError } from '../utils/errors';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Provider service
 * Handles healthcare provider management
 */
class ProviderService {
  /**
   * Create new provider
   */
  async createProvider(userId: string, data: CreateProviderDTO) {
    try {
      const provider = await prisma.provider.create({
        data: {
          userId,
          name: data.name,
          specialty: data.specialty,
          practice: data.practice,
          phone: data.phone,
          address: data.address,
          notes: data.notes,
        },
      });

      logger.info('Provider created', { providerId: provider.id, userId });

      return provider;
    } catch (error) {
      logger.error('Failed to create provider', { error, userId });
      throw error;
    }
  }

  /**
   * Get provider by ID
   */
  async getProviderById(providerId: string, userId: string) {
    try {
      const provider = await prisma.provider.findFirst({
        where: {
          id: providerId,
          userId,
        },
        include: {
          visits: {
            orderBy: {
              visitDate: 'desc',
            },
            take: 5, // Recent 5 visits
          },
        },
      });

      if (!provider) {
        throw new NotFoundError('Provider not found');
      }

      return provider;
    } catch (error) {
      logger.error('Failed to get provider', { error, providerId, userId });
      throw error;
    }
  }

  /**
   * List all providers for user
   */
  async listProviders(userId: string) {
    try {
      const providers = await prisma.provider.findMany({
        where: { userId },
        include: {
          _count: {
            select: { visits: true },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      return providers;
    } catch (error) {
      logger.error('Failed to list providers', { error, userId });
      throw error;
    }
  }

  /**
   * Search providers by name or specialty
   */
  async searchProviders(userId: string, query: string) {
    try {
      const providers = await prisma.provider.findMany({
        where: {
          userId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { specialty: { contains: query, mode: 'insensitive' } },
            { practice: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          _count: {
            select: { visits: true },
          },
        },
      });

      return providers;
    } catch (error) {
      logger.error('Failed to search providers', { error, userId, query });
      throw error;
    }
  }

  /**
   * Update provider
   */
  async updateProvider(
    providerId: string,
    userId: string,
    data: UpdateProviderDTO
  ) {
    try {
      // Verify ownership
      const provider = await prisma.provider.findFirst({
        where: { id: providerId, userId },
      });

      if (!provider) {
        throw new NotFoundError('Provider not found');
      }

      // Update provider
      const updatedProvider = await prisma.provider.update({
        where: { id: providerId },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.specialty && { specialty: data.specialty }),
          ...(data.practice !== undefined && { practice: data.practice }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      });

      logger.info('Provider updated', { providerId, userId });

      return updatedProvider;
    } catch (error) {
      logger.error('Failed to update provider', { error, providerId, userId });
      throw error;
    }
  }

  /**
   * Delete provider
   */
  async deleteProvider(providerId: string, userId: string) {
    try {
      // Verify ownership
      const provider = await prisma.provider.findFirst({
        where: { id: providerId, userId },
      });

      if (!provider) {
        throw new NotFoundError('Provider not found');
      }

      // Check if provider has visits
      const visitCount = await prisma.visit.count({
        where: { providerId },
      });

      if (visitCount > 0) {
        throw new Error(
          `Cannot delete provider with ${visitCount} associated visits`
        );
      }

      // Delete provider
      await prisma.provider.delete({
        where: { id: providerId },
      });

      logger.info('Provider deleted', { providerId, userId });
    } catch (error) {
      logger.error('Failed to delete provider', { error, providerId, userId });
      throw error;
    }
  }
}

export default new ProviderService();
