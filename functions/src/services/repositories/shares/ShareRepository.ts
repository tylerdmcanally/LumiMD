export type ShareRecord = FirebaseFirestore.DocumentData & {
  id: string;
  ownerId?: string;
  caregiverUserId?: string;
  caregiverEmail?: string;
};

export type ShareInviteRecord = FirebaseFirestore.DocumentData & {
  id: string;
  ownerId?: string;
  caregiverUserId?: string | null;
  caregiverEmail?: string;
  inviteeEmail?: string;
  status?: string;
};

export interface ShareRepository {
  listByOwnerId(ownerId: string): Promise<ShareRecord[]>;
  listByCaregiverUserId(caregiverUserId: string): Promise<ShareRecord[]>;
  listByCaregiverEmail(caregiverEmail: string): Promise<ShareRecord[]>;
  getById(shareId: string): Promise<ShareRecord | null>;
  findFirstByOwnerAndCaregiverEmail(
    ownerId: string,
    caregiverEmail: string,
  ): Promise<ShareRecord | null>;
  updateById(
    shareId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ShareRecord | null>;
  setShare(
    shareId: string,
    payload: FirebaseFirestore.DocumentData,
    options?: { merge?: boolean },
  ): Promise<void>;
  listPendingInvitesByLegacyEmail(email: string): Promise<ShareInviteRecord[]>;
  listPendingInvitesByCaregiverEmail(email: string): Promise<ShareInviteRecord[]>;
  hasPendingInviteByOwnerAndCaregiverEmail(ownerId: string, email: string): Promise<boolean>;
  hasPendingInviteByOwnerAndInviteeEmail(ownerId: string, email: string): Promise<boolean>;
  listInvitesByOwnerId(ownerId: string): Promise<ShareInviteRecord[]>;
  getInviteById(inviteId: string): Promise<ShareInviteRecord | null>;
  updateInviteById(
    inviteId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ShareInviteRecord | null>;
  acceptInviteAndSetShare(
    inviteId: string,
    inviteUpdates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
    shareId: string,
    sharePayload: FirebaseFirestore.DocumentData,
    options?: { merge?: boolean },
  ): Promise<void>;
  createInvite(inviteId: string, payload: FirebaseFirestore.DocumentData): Promise<void>;
  migrateShareToCaregiver(
    currentShareId: string,
    newShareId: string,
    newSharePayload: FirebaseFirestore.DocumentData,
  ): Promise<void>;
  revokeInviteAndRelatedShare(inviteId: string, invite: ShareInviteRecord): Promise<void>;
}
