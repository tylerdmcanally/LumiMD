import { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';

const prisma = new PrismaClient();

interface CreateFolderInput {
  name: string;
  color?: string;
  icon?: string;
}

interface UpdateFolderInput {
  name?: string;
  color?: string;
  icon?: string;
}

class VisitFolderService {
  /**
   * Create a new folder for a user
   */
  async createFolder(userId: string, input: CreateFolderInput) {
    // Check if folder with same name already exists
    const existing = await prisma.visitFolder.findFirst({
      where: { userId, name: input.name },
    });

    if (existing) {
      throw new ConflictError(`Folder with name "${input.name}" already exists`);
    }

    const folder = await prisma.visitFolder.create({
      data: {
        userId,
        name: input.name,
        color: input.color,
        icon: input.icon,
      },
      include: {
        _count: {
          select: { visits: true },
        },
      },
    });

    return folder;
  }

  /**
   * List all folders for a user
   */
  async listFolders(userId: string) {
    const folders = await prisma.visitFolder.findMany({
      where: { userId },
      include: {
        _count: {
          select: { visits: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return folders;
  }

  /**
   * Get a single folder by ID
   */
  async getFolderById(folderId: string, userId: string) {
    const folder = await prisma.visitFolder.findFirst({
      where: { id: folderId, userId },
      include: {
        visits: {
          include: {
            provider: true,
          },
          orderBy: { visitDate: 'desc' },
        },
        _count: {
          select: { visits: true },
        },
      },
    });

    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    return folder;
  }

  /**
   * Update a folder
   */
  async updateFolder(folderId: string, userId: string, input: UpdateFolderInput) {
    const folder = await prisma.visitFolder.findFirst({
      where: { id: folderId, userId },
    });

    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // If name is being changed, check for conflicts
    if (input.name && input.name !== folder.name) {
      const existing = await prisma.visitFolder.findFirst({
        where: { userId, name: input.name },
      });

      if (existing) {
        throw new ConflictError(`Folder with name "${input.name}" already exists`);
      }
    }

    const updated = await prisma.visitFolder.update({
      where: { id: folderId },
      data: input,
      include: {
        _count: {
          select: { visits: true },
        },
      },
    });

    return updated;
  }

  /**
   * Delete a folder
   */
  async deleteFolder(folderId: string, userId: string) {
    const folder = await prisma.visitFolder.findFirst({
      where: { id: folderId, userId },
    });

    if (!folder) {
      throw new NotFoundError('Folder not found');
    }

    // Delete the folder (visits will have folderId set to null due to onDelete: SetNull)
    await prisma.visitFolder.delete({
      where: { id: folderId },
    });
  }

  /**
   * Move a visit to a folder
   */
  async moveVisitToFolder(visitId: string, folderId: string | null, userId: string) {
    // Verify visit belongs to user
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, userId },
    });

    if (!visit) {
      throw new NotFoundError('Visit not found');
    }

    // If folderId is provided, verify folder exists and belongs to user
    if (folderId) {
      const folder = await prisma.visitFolder.findFirst({
        where: { id: folderId, userId },
      });

      if (!folder) {
        throw new NotFoundError('Folder not found');
      }
    }

    // Update visit
    const updated = await prisma.visit.update({
      where: { id: visitId },
      data: { folderId },
      include: {
        provider: true,
        folder: true,
      },
    });

    return updated;
  }

  /**
   * Add tags to a visit
   */
  async addTagsToVisit(visitId: string, userId: string, tags: string[]) {
    // Verify visit belongs to user
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, userId },
    });

    if (!visit) {
      throw new NotFoundError('Visit not found');
    }

    // Add tags (ignore duplicates)
    await prisma.$transaction(
      tags.map((tag) =>
        prisma.visitTag.upsert({
          where: {
            visitId_tag: { visitId, tag },
          },
          create: { visitId, tag },
          update: {},
        })
      )
    );

    // Return visit with updated tags
    const updated = await prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        tags: true,
        provider: true,
        folder: true,
      },
    });

    return updated;
  }

  /**
   * Remove tag from a visit
   */
  async removeTagFromVisit(visitId: string, userId: string, tag: string) {
    // Verify visit belongs to user
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, userId },
    });

    if (!visit) {
      throw new NotFoundError('Visit not found');
    }

    // Remove tag if it exists
    await prisma.visitTag.deleteMany({
      where: { visitId, tag },
    });

    // Return visit with updated tags
    const updated = await prisma.visit.findUnique({
      where: { id: visitId },
      include: {
        tags: true,
        provider: true,
        folder: true,
      },
    });

    return updated;
  }

  /**
   * Get all unique tags for a user's visits
   */
  async getUserTags(userId: string) {
    const tags = await prisma.visitTag.findMany({
      where: {
        visit: {
          userId,
        },
      },
      select: {
        tag: true,
      },
      distinct: ['tag'],
      orderBy: {
        tag: 'asc',
      },
    });

    return tags.map((t) => t.tag);
  }
}

export default new VisitFolderService();
