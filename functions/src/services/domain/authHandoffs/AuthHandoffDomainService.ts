import type {
  AuthHandoffExchangeResult,
  AuthHandoffRepository,
} from '../../repositories/authHandoffs/AuthHandoffRepository';

export class AuthHandoffDomainService {
  constructor(private readonly authHandoffRepository: AuthHandoffRepository) {}

  async createHandoff(
    code: string,
    payload: {
      userId: string;
      createdAt: FirebaseFirestore.Timestamp;
      expiresAt: FirebaseFirestore.Timestamp;
    },
  ): Promise<void> {
    await this.authHandoffRepository.create(code, payload);
  }

  async exchangeHandoff(
    code: string,
    params: {
      usedAt: FirebaseFirestore.Timestamp;
      nowMs?: number;
    },
  ): Promise<AuthHandoffExchangeResult> {
    return this.authHandoffRepository.exchange(code, params);
  }
}
