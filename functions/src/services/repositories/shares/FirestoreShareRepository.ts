import * as admin from 'firebase-admin';
import type {
  ShareInviteRecord,
  ShareRecord,
  ShareRepository,
} from './ShareRepository';

function mapShareDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): ShareRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as ShareRecord;
}

function mapShareInviteDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>,
): ShareInviteRecord {
  return {
    id: doc.id,
    ...(doc.data() || {}),
  } as ShareInviteRecord;
}

export class FirestoreShareRepository implements ShareRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async listByOwnerId(ownerId: string): Promise<ShareRecord[]> {
    const snapshot = await this.db.collection('shares').where('ownerId', '==', ownerId).get();
    return snapshot.docs.map((doc) => mapShareDoc(doc));
  }

  async listByCaregiverUserId(caregiverUserId: string): Promise<ShareRecord[]> {
    const snapshot = await this.db
      .collection('shares')
      .where('caregiverUserId', '==', caregiverUserId)
      .get();
    return snapshot.docs.map((doc) => mapShareDoc(doc));
  }

  async listByCaregiverEmail(caregiverEmail: string): Promise<ShareRecord[]> {
    const snapshot = await this.db
      .collection('shares')
      .where('caregiverEmail', '==', caregiverEmail)
      .get();
    return snapshot.docs.map((doc) => mapShareDoc(doc));
  }

  async getById(shareId: string): Promise<ShareRecord | null> {
    const shareDoc = await this.db.collection('shares').doc(shareId).get();
    if (!shareDoc.exists) {
      return null;
    }

    return {
      id: shareDoc.id,
      ...(shareDoc.data() || {}),
    } as ShareRecord;
  }

  async findFirstByOwnerAndCaregiverEmail(
    ownerId: string,
    caregiverEmail: string,
  ): Promise<ShareRecord | null> {
    const snapshot = await this.db
      .collection('shares')
      .where('ownerId', '==', ownerId)
      .where('caregiverEmail', '==', caregiverEmail)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return mapShareDoc(snapshot.docs[0]);
  }

  async updateById(
    shareId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ShareRecord | null> {
    const shareRef = this.db.collection('shares').doc(shareId);
    const shareDoc = await shareRef.get();

    if (!shareDoc.exists) {
      return null;
    }

    await shareRef.update(updates);
    const updatedDoc = await shareRef.get();

    if (!updatedDoc.exists) {
      return null;
    }

    return {
      id: updatedDoc.id,
      ...(updatedDoc.data() || {}),
    } as ShareRecord;
  }

  async setShare(
    shareId: string,
    payload: FirebaseFirestore.DocumentData,
    options?: { merge?: boolean },
  ): Promise<void> {
    const shareRef = this.db.collection('shares').doc(shareId);
    if (options?.merge === true) {
      await shareRef.set(payload, { merge: true });
      return;
    }
    await shareRef.set(payload);
  }

  async listPendingInvitesByLegacyEmail(email: string): Promise<ShareInviteRecord[]> {
    const snapshot = await this.db
      .collection('shareInvites')
      .where('inviteeEmail', '==', email)
      .where('status', '==', 'pending')
      .get();
    return snapshot.docs.map((doc) => mapShareInviteDoc(doc));
  }

  async listPendingInvitesByCaregiverEmail(email: string): Promise<ShareInviteRecord[]> {
    const snapshot = await this.db
      .collection('shareInvites')
      .where('caregiverEmail', '==', email)
      .where('status', '==', 'pending')
      .get();
    return snapshot.docs.map((doc) => mapShareInviteDoc(doc));
  }

  async hasPendingInviteByOwnerAndCaregiverEmail(
    ownerId: string,
    email: string,
  ): Promise<boolean> {
    const snapshot = await this.db
      .collection('shareInvites')
      .where('ownerId', '==', ownerId)
      .where('caregiverEmail', '==', email)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async hasPendingInviteByOwnerAndInviteeEmail(
    ownerId: string,
    email: string,
  ): Promise<boolean> {
    const snapshot = await this.db
      .collection('shareInvites')
      .where('ownerId', '==', ownerId)
      .where('inviteeEmail', '==', email)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async listInvitesByOwnerId(ownerId: string): Promise<ShareInviteRecord[]> {
    const snapshot = await this.db
      .collection('shareInvites')
      .where('ownerId', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => mapShareInviteDoc(doc));
  }

  async getInviteById(inviteId: string): Promise<ShareInviteRecord | null> {
    const inviteDoc = await this.db.collection('shareInvites').doc(inviteId).get();
    if (!inviteDoc.exists) {
      return null;
    }

    return {
      id: inviteDoc.id,
      ...(inviteDoc.data() || {}),
    } as ShareInviteRecord;
  }

  async updateInviteById(
    inviteId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<ShareInviteRecord | null> {
    const inviteRef = this.db.collection('shareInvites').doc(inviteId);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return null;
    }

    await inviteRef.update(updates);
    const updatedDoc = await inviteRef.get();

    if (!updatedDoc.exists) {
      return null;
    }

    return {
      id: updatedDoc.id,
      ...(updatedDoc.data() || {}),
    } as ShareInviteRecord;
  }

  async acceptInviteAndSetShare(
    inviteId: string,
    inviteUpdates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
    shareId: string,
    sharePayload: FirebaseFirestore.DocumentData,
    options?: { merge?: boolean },
  ): Promise<void> {
    const inviteRef = this.db.collection('shareInvites').doc(inviteId);
    const shareRef = this.db.collection('shares').doc(shareId);
    const batch = this.db.batch();

    batch.update(inviteRef, inviteUpdates);
    if (options?.merge === true) {
      batch.set(shareRef, sharePayload, { merge: true });
    } else {
      batch.set(shareRef, sharePayload);
    }

    await batch.commit();
  }

  async createInvite(inviteId: string, payload: FirebaseFirestore.DocumentData): Promise<void> {
    await this.db.collection('shareInvites').doc(inviteId).set(payload);
  }

  async migrateShareToCaregiver(
    currentShareId: string,
    newShareId: string,
    newSharePayload: FirebaseFirestore.DocumentData,
  ): Promise<void> {
    const currentShareRef = this.db.collection('shares').doc(currentShareId);
    const newShareRef = this.db.collection('shares').doc(newShareId);
    const batch = this.db.batch();

    batch.set(newShareRef, newSharePayload);
    batch.delete(currentShareRef);

    await batch.commit();
  }

  async revokeInviteAndRelatedShare(
    inviteId: string,
    invite: ShareInviteRecord,
  ): Promise<void> {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const inviteRef = this.db.collection('shareInvites').doc(inviteId);
    const batch = this.db.batch();

    batch.update(inviteRef, {
      status: 'revoked',
      updatedAt: now,
    });

    const caregiverUserId =
      typeof invite.caregiverUserId === 'string' ? invite.caregiverUserId : '';
    const ownerId = typeof invite.ownerId === 'string' ? invite.ownerId : '';

    if (caregiverUserId && ownerId) {
      const shareId = `${ownerId}_${caregiverUserId}`;
      const shareRef = this.db.collection('shares').doc(shareId);
      const shareDoc = await shareRef.get();

      if (shareDoc.exists) {
        batch.update(shareRef, {
          status: 'revoked',
          updatedAt: now,
        });
      }
    }

    await batch.commit();
  }
}
