import type {
  AuthHandoffExchangeResult,
  AuthHandoffRepository,
} from './AuthHandoffRepository';

export class FirestoreAuthHandoffRepository implements AuthHandoffRepository {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  async create(
    code: string,
    payload: {
      userId: string;
      createdAt: FirebaseFirestore.Timestamp;
      expiresAt: FirebaseFirestore.Timestamp;
    },
  ): Promise<void> {
    await this.db.collection('auth_handoffs').doc(code).set({
      userId: payload.userId,
      createdAt: payload.createdAt,
      expiresAt: payload.expiresAt,
      used: false,
    });
  }

  async exchange(
    code: string,
    params: {
      usedAt: FirebaseFirestore.Timestamp;
      nowMs?: number;
    },
  ): Promise<AuthHandoffExchangeResult> {
    const handoffRef = this.db.collection('auth_handoffs').doc(code);

    return this.db.runTransaction<AuthHandoffExchangeResult>(async (tx) => {
      const handoffDoc = await tx.get(handoffRef);

      if (!handoffDoc.exists) {
        return { status: 'invalid' };
      }

      const handoff = handoffDoc.data() ?? {};
      if (handoff.used === true) {
        return { status: 'used' };
      }

      const now = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
      const expiresAt =
        typeof handoff.expiresAt?.toMillis === 'function'
          ? handoff.expiresAt.toMillis()
          : 0;
      if (now > expiresAt) {
        tx.delete(handoffRef);
        return { status: 'expired' };
      }

      const userId = typeof handoff.userId === 'string' ? handoff.userId : '';
      if (!userId) {
        tx.delete(handoffRef);
        return { status: 'invalid' };
      }

      tx.update(handoffRef, {
        used: true,
        usedAt: params.usedAt,
      });

      return { status: 'ok', userId };
    });
  }
}
