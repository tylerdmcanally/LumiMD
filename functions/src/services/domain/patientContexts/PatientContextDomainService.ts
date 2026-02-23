import type {
  PatientContextConditionStatus,
  PatientContextRecord,
  PatientContextRepository,
} from '../../repositories/patientContexts/PatientContextRepository';

export type UpdatePatientContextConditionStatusResult =
  | {
      outcome: 'updated';
      condition: {
        id: string;
        status: PatientContextConditionStatus;
      };
    }
  | { outcome: 'context_not_found' }
  | { outcome: 'condition_not_found' };

export class PatientContextDomainService {
  constructor(private readonly patientContextRepository: PatientContextRepository) {}

  async getForUser(userId: string): Promise<PatientContextRecord | null> {
    return this.patientContextRepository.getByUserId(userId);
  }

  async setForUser(
    userId: string,
    payload: FirebaseFirestore.DocumentData,
    options?: { merge?: boolean },
  ): Promise<void> {
    await this.patientContextRepository.setByUserId(userId, payload, options);
  }

  async updateForUser(
    userId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void> {
    await this.patientContextRepository.updateByUserId(userId, updates);
  }

  async updateConditionStatusForUser(
    userId: string,
    conditionId: string,
    status: PatientContextConditionStatus,
  ): Promise<UpdatePatientContextConditionStatusResult> {
    const context = await this.patientContextRepository.getByUserId(userId);

    if (!context) {
      return { outcome: 'context_not_found' };
    }

    const conditions = Array.isArray(context.conditions) ? context.conditions : [];
    const conditionIndex = conditions.findIndex(
      (condition) => typeof condition?.id === 'string' && condition.id === conditionId,
    );

    if (conditionIndex < 0) {
      return { outcome: 'condition_not_found' };
    }

    const updatedConditions = conditions.map((condition, index) => {
      if (index !== conditionIndex) {
        return condition;
      }

      return {
        ...condition,
        status,
      };
    });

    await this.patientContextRepository.updateConditions(userId, updatedConditions, new Date());

    return {
      outcome: 'updated',
      condition: {
        id: conditionId,
        status,
      },
    };
  }
}
