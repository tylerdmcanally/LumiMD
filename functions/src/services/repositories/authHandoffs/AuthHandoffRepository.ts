export type AuthHandoffExchangeResult =
  | { status: 'ok'; userId: string }
  | { status: 'invalid' | 'used' | 'expired' };

export interface AuthHandoffRepository {
  create(
    code: string,
    payload: {
      userId: string;
      createdAt: FirebaseFirestore.Timestamp;
      expiresAt: FirebaseFirestore.Timestamp;
    },
  ): Promise<void>;
  exchange(
    code: string,
    params: {
      usedAt: FirebaseFirestore.Timestamp;
      nowMs?: number;
    },
  ): Promise<AuthHandoffExchangeResult>;
}
