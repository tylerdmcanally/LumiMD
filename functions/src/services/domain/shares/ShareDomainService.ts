import type {
  ShareInviteRecord,
  ShareRecord,
  ShareRepository,
} from '../../repositories/shares/ShareRepository';

type ShareStatusTransition = 'accepted' | 'revoked';
type ShareTransitionTimestamps = {
  updatedAt: unknown;
  acceptedAt?: unknown;
};

export type ShareStatusTransitionResult =
  | { outcome: 'not_found' }
  | { outcome: 'invalid_transition' }
  | { outcome: 'updated'; share: ShareRecord };

export type RevokeInviteByOwnerResult =
  | { outcome: 'not_found' }
  | { outcome: 'forbidden' }
  | { outcome: 'revoked'; invite: ShareInviteRecord };

export type AcceptInviteAndSetShareParams = {
  inviteId: string;
  inviteUpdates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>;
  shareId: string;
  sharePayload: FirebaseFirestore.DocumentData;
  mergeShare?: boolean;
};

export type MigrateShareToCaregiverParams = {
  currentShareId: string;
  newShareId: string;
  newSharePayload: FirebaseFirestore.DocumentData;
};

export class ShareDomainService {
  constructor(private readonly shareRepository: ShareRepository) {}

  async listByOwnerId(ownerId: string): Promise<ShareRecord[]> {
    return this.shareRepository.listByOwnerId(ownerId);
  }

  async listByCaregiverUserId(caregiverUserId: string): Promise<ShareRecord[]> {
    return this.shareRepository.listByCaregiverUserId(caregiverUserId);
  }

  async listByCaregiverEmail(caregiverEmail: string): Promise<ShareRecord[]> {
    return this.shareRepository.listByCaregiverEmail(caregiverEmail);
  }

  async getById(shareId: string): Promise<ShareRecord | null> {
    return this.shareRepository.getById(shareId);
  }

  async findFirstByOwnerAndCaregiverEmail(
    ownerId: string,
    caregiverEmail: string,
  ): Promise<ShareRecord | null> {
    return this.shareRepository.findFirstByOwnerAndCaregiverEmail(ownerId, caregiverEmail);
  }

  async setShare(
    shareId: string,
    payload: FirebaseFirestore.DocumentData,
    options?: { merge?: boolean },
  ): Promise<void> {
    await this.shareRepository.setShare(shareId, payload, options);
  }

  async listPendingInvitesForCaregiverEmail(email: string): Promise<ShareInviteRecord[]> {
    const [legacyInvites, caregiverInvites] = await Promise.all([
      this.shareRepository.listPendingInvitesByLegacyEmail(email),
      this.shareRepository.listPendingInvitesByCaregiverEmail(email),
    ]);

    const invitesById = new Map<string, ShareInviteRecord>();
    legacyInvites.forEach((invite) => invitesById.set(invite.id, invite));
    caregiverInvites.forEach((invite) => invitesById.set(invite.id, invite));

    return Array.from(invitesById.values());
  }

  async listInvitesByOwnerId(ownerId: string): Promise<ShareInviteRecord[]> {
    return this.shareRepository.listInvitesByOwnerId(ownerId);
  }

  async hasPendingInviteByOwnerAndCaregiverEmail(
    ownerId: string,
    email: string,
  ): Promise<boolean> {
    return this.shareRepository.hasPendingInviteByOwnerAndCaregiverEmail(ownerId, email);
  }

  async hasPendingInviteByOwnerAndInviteeEmail(
    ownerId: string,
    email: string,
  ): Promise<boolean> {
    return this.shareRepository.hasPendingInviteByOwnerAndInviteeEmail(ownerId, email);
  }

  async getInviteById(inviteId: string): Promise<ShareInviteRecord | null> {
    return this.shareRepository.getInviteById(inviteId);
  }

  async updateInviteRecord(
    inviteId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ShareInviteRecord | null> {
    return this.shareRepository.updateInviteById(inviteId, updates);
  }

  async acceptInviteAndSetShare(params: AcceptInviteAndSetShareParams): Promise<void> {
    await this.shareRepository.acceptInviteAndSetShare(
      params.inviteId,
      params.inviteUpdates,
      params.shareId,
      params.sharePayload,
      params.mergeShare ? { merge: true } : undefined,
    );
  }

  async createInvite(inviteId: string, payload: FirebaseFirestore.DocumentData): Promise<void> {
    await this.shareRepository.createInvite(inviteId, payload);
  }

  async migrateShareToCaregiver(params: MigrateShareToCaregiverParams): Promise<void> {
    await this.shareRepository.migrateShareToCaregiver(
      params.currentShareId,
      params.newShareId,
      params.newSharePayload,
    );
  }

  async transitionStatus(
    shareId: string,
    actorUserId: string,
    targetStatus: ShareStatusTransition,
    timestamps: ShareTransitionTimestamps,
  ): Promise<ShareStatusTransitionResult> {
    const share = await this.shareRepository.getById(shareId);

    if (!share) {
      return { outcome: 'not_found' };
    }

    const ownerId = typeof share.ownerId === 'string' ? share.ownerId : '';
    const caregiverUserId =
      typeof share.caregiverUserId === 'string' ? share.caregiverUserId : '';
    const shareStatus = typeof share.status === 'string' ? share.status : '';

    const isOwnerRevoking = actorUserId === ownerId && targetStatus === 'revoked';
    const isCaregiverAccepting =
      actorUserId === caregiverUserId &&
      targetStatus === 'accepted' &&
      shareStatus === 'pending';

    if (!isOwnerRevoking && !isCaregiverAccepting) {
      return { outcome: 'invalid_transition' };
    }

    const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = isOwnerRevoking
      ? {
          status: 'revoked',
          updatedAt: timestamps.updatedAt,
        }
      : {
          status: 'accepted',
          acceptedAt: timestamps.acceptedAt ?? timestamps.updatedAt,
          updatedAt: timestamps.updatedAt,
        };

    const updatedShare = await this.shareRepository.updateById(shareId, updates);

    if (!updatedShare) {
      return { outcome: 'not_found' };
    }

    return {
      outcome: 'updated',
      share: updatedShare,
    };
  }

  async revokeInviteByOwner(
    inviteId: string,
    ownerId: string,
  ): Promise<RevokeInviteByOwnerResult> {
    const invite = await this.shareRepository.getInviteById(inviteId);

    if (!invite) {
      return { outcome: 'not_found' };
    }

    const inviteOwnerId = typeof invite.ownerId === 'string' ? invite.ownerId : '';
    if (!inviteOwnerId || inviteOwnerId !== ownerId) {
      return { outcome: 'forbidden' };
    }

    await this.shareRepository.revokeInviteAndRelatedShare(inviteId, invite);

    return {
      outcome: 'revoked',
      invite,
    };
  }
}
