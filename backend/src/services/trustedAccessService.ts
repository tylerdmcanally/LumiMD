import { PrismaClient } from '@prisma/client';
import { CreateTrustedAccessDTO, UpdateTrustedAccessDTO } from '../types';
import { NotFoundError, ConflictError } from '../utils/errors';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Trusted Access service
 * Handles sharing healthcare information with family/caregivers
 */
class TrustedAccessService {
  /**
   * List trusted users (people I've granted access to) + pending invitations
   */
  async listTrustedUsers(userId: string) {
    try {
      // Get active trusted access
      const trustedAccess = await prisma.trustedAccess.findMany({
        where: {
          grantingUserId: userId,
          revokedAt: null,
        },
        include: {
          trustedUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              profilePhoto: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get pending invitations
      const pendingInvitations = await prisma.pendingInvitation.findMany({
        where: {
          inviterUserId: userId,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Format pending invitations to match trusted access structure
      const formattedPending = pendingInvitations.map((inv) => ({
        id: inv.id,
        grantingUserId: userId,
        trustedUserId: null,
        trustedUser: {
          id: null,
          email: inv.inviteeEmail,
          firstName: null,
          lastName: null,
          profilePhoto: null,
        },
        accessLevel: inv.accessLevel,
        relationship: inv.relationship,
        createdAt: inv.createdAt,
        revokedAt: null,
        isPending: true,
        token: inv.token,
        pin: inv.pin,
        expiresAt: inv.expiresAt,
      }));

      // Combine and return
      return [...trustedAccess, ...formattedPending];
    } catch (error) {
      logger.error('Failed to list trusted users', { error, userId });
      throw error;
    }
  }

  /**
   * List users who have granted me access
   */
  async listGrantingUsers(userId: string) {
    try {
      const trustedAccess = await prisma.trustedAccess.findMany({
        where: {
          trustedUserId: userId,
          revokedAt: null,
        },
        include: {
          grantingUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              profilePhoto: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return trustedAccess;
    } catch (error) {
      logger.error('Failed to list granting users', { error, userId });
      throw error;
    }
  }

  /**
   * Invite/grant trusted access to another user
   * Creates pending invitation if user doesn't have account yet
   */
  async inviteTrustedUser(
    userId: string,
    data: CreateTrustedAccessDTO & { trustedUserId?: string }
  ) {
    try {
      if (!data.trustedUserEmail) {
        throw new Error('Email is required to invite a user');
      }

      // Check if user is trying to invite themselves
      const inviter = await prisma.user.findUnique({ where: { id: userId } });
      if (inviter?.email.toLowerCase() === data.trustedUserEmail.toLowerCase()) {
        throw new Error('Cannot grant access to yourself');
      }

      // Check if invited user already has an account
      const trustedUser = await prisma.user.findUnique({
        where: { email: data.trustedUserEmail },
      });

      if (trustedUser) {
        // User exists - create immediate access
        const existing = await prisma.trustedAccess.findFirst({
          where: {
            grantingUserId: userId,
            trustedUserId: trustedUser.id,
            revokedAt: null,
          },
        });

        if (existing) {
          throw new ConflictError('Access already granted to this user');
        }

        const trustedAccess = await prisma.trustedAccess.create({
          data: {
            grantingUserId: userId,
            trustedUserId: trustedUser.id,
            accessLevel: data.accessLevel as any,
            relationship: data.relationship,
          },
          include: {
            trustedUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                profilePhoto: true,
              },
            },
          },
        });

        logger.info('Trusted access granted (existing user)', {
          grantingUserId: userId,
          trustedUserId: trustedUser.id,
        });

        return trustedAccess;
      } else {
        // User doesn't exist - check for existing invitation
        const existingInvite = await prisma.pendingInvitation.findFirst({
          where: {
            inviterUserId: userId,
            inviteeEmail: data.trustedUserEmail,
          },
        });

        // If there's an existing invitation, handle it
        if (existingInvite) {
          if (existingInvite.status === 'PENDING') {
            throw new ConflictError('Invitation already sent to this email');
          }
          // If cancelled or expired, delete it so we can create a new one
          await prisma.pendingInvitation.delete({
            where: { id: existingInvite.id },
          });
          logger.info('Deleted old invitation before creating new one', {
            oldInviteId: existingInvite.id,
            oldStatus: existingInvite.status,
          });
        }

        // Generate unique token for invite link
        const token = require('crypto').randomBytes(32).toString('hex');

        // Generate simple 6-digit PIN for easy sharing
        const generatePin = async (): Promise<string> => {
          let pin: string;
          let isUnique = false;

          while (!isUnique) {
            pin = Math.floor(100000 + Math.random() * 900000).toString();
            const existing = await prisma.pendingInvitation.findUnique({
              where: { pin },
            });
            if (!existing) isUnique = true;
          }
          return pin!;
        };

        const pin = await generatePin();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        const pendingInvitation = await prisma.pendingInvitation.create({
          data: {
            inviterUserId: userId,
            inviteeEmail: data.trustedUserEmail,
            relationship: data.relationship,
            accessLevel: data.accessLevel as any,
            token,
            pin,
            expiresAt,
          },
          include: {
            inviterUser: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        logger.info('Pending invitation created', {
          inviterUserId: userId,
          inviteeEmail: data.trustedUserEmail,
          token,
        });

        // Return in similar format for frontend compatibility
        return {
          id: pendingInvitation.id,
          grantingUserId: userId,
          trustedUser: {
            email: data.trustedUserEmail,
            firstName: null,
            lastName: null,
          },
          accessLevel: pendingInvitation.accessLevel,
          relationship: pendingInvitation.relationship,
          createdAt: pendingInvitation.createdAt,
          isPending: true,
          token: pendingInvitation.token,
          pin: pendingInvitation.pin,
        };
      }
    } catch (error) {
      logger.error('Failed to invite trusted user', { error, userId });
      throw error;
    }
  }

  /**
   * Update trusted access level
   */
  async updateTrustedAccess(
    trustedAccessId: string,
    userId: string,
    data: UpdateTrustedAccessDTO
  ) {
    try {
      // Verify ownership
      const trustedAccess = await prisma.trustedAccess.findFirst({
        where: {
          id: trustedAccessId,
          grantingUserId: userId,
          revokedAt: null,
        },
      });

      if (!trustedAccess) {
        throw new NotFoundError('Trusted access not found or already revoked');
      }

      // Update access level
      const updated = await prisma.trustedAccess.update({
        where: { id: trustedAccessId },
        data: {
          ...(data.accessLevel && { accessLevel: data.accessLevel as any }),
        },
        include: {
          trustedUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              profilePhoto: true,
            },
          },
        },
      });

      logger.info('Trusted access updated', { trustedAccessId, userId });

      return updated;
    } catch (error) {
      logger.error('Failed to update trusted access', {
        error,
        trustedAccessId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Revoke trusted access or cancel pending invitation
   */
  async revokeTrustedAccess(trustedAccessId: string, userId: string) {
    try {
      // First check if it's a trusted access record
      const trustedAccess = await prisma.trustedAccess.findFirst({
        where: {
          id: trustedAccessId,
          grantingUserId: userId,
          revokedAt: null,
        },
      });

      if (trustedAccess) {
        // Mark as revoked
        await prisma.trustedAccess.update({
          where: { id: trustedAccessId },
          data: { revokedAt: new Date() },
        });

        logger.info('Trusted access revoked', { trustedAccessId, userId });
        return;
      }

      // Check if it's a pending invitation
      const pendingInvitation = await prisma.pendingInvitation.findFirst({
        where: {
          id: trustedAccessId,
          inviterUserId: userId,
          status: 'PENDING',
        },
      });

      if (pendingInvitation) {
        // Cancel the pending invitation
        await prisma.pendingInvitation.update({
          where: { id: trustedAccessId },
          data: { status: 'CANCELLED' },
        });

        logger.info('Pending invitation cancelled', { invitationId: trustedAccessId, userId });
        return;
      }

      // Neither found
      throw new NotFoundError('Access or invitation not found or already revoked');
    } catch (error) {
      logger.error('Failed to revoke access or cancel invitation', {
        error,
        trustedAccessId,
        userId,
      });
      throw error;
    }
  }

  /**
   * Get visits shared with me
   */
  async getSharedVisits(userId: string) {
    try {
      // Find all users who have granted me access
      const trustedAccess = await prisma.trustedAccess.findMany({
        where: {
          trustedUserId: userId,
          revokedAt: null,
        },
        select: {
          grantingUserId: true,
          accessLevel: true,
          relationship: true,
          grantingUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Get all visits from users who have granted me access
      const grantingUserIds = trustedAccess.map((ta) => ta.grantingUserId);

      const sharedVisits = await prisma.visit.findMany({
        where: {
          userId: { in: grantingUserIds },
        },
        include: {
          provider: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          actionItems: {
            where: { completed: false },
          },
        },
        orderBy: { visitDate: 'desc' },
      });

      // Add access level info to each visit
      const visitsWithAccess = sharedVisits.map((visit) => {
        const access = trustedAccess.find(
          (ta) => ta.grantingUserId === visit.userId
        );
        return {
          ...visit,
          accessLevel: access?.accessLevel,
          relationship: access?.relationship,
        };
      });

      return visitsWithAccess;
    } catch (error) {
      logger.error('Failed to get shared visits', { error, userId });
      throw error;
    }
  }

  /**
   * Check if user has access to another user's data
   */
  async checkAccess(
    userId: string,
    targetUserId: string
  ): Promise<{ hasAccess: boolean; accessLevel?: string }> {
    try {
      const trustedAccess = await prisma.trustedAccess.findFirst({
        where: {
          grantingUserId: targetUserId,
          trustedUserId: userId,
          revokedAt: null,
        },
      });

      return {
        hasAccess: !!trustedAccess,
        accessLevel: trustedAccess?.accessLevel,
      };
    } catch (error) {
      logger.error('Failed to check access', { error, userId, targetUserId });
      throw error;
    }
  }
}

export default new TrustedAccessService();
