export type PatientContextConditionStatus = 'active' | 'resolved' | 'monitoring';

export type PatientContextConditionRecord = FirebaseFirestore.DocumentData & {
  id: string;
  name: string;
  status: PatientContextConditionStatus;
  diagnosedAt?: FirebaseFirestore.Timestamp | null;
  sourceVisitId?: string;
  notes?: string;
};

export type PatientContextRecord = FirebaseFirestore.DocumentData & {
  id: string;
  userId: string;
  conditions?: PatientContextConditionRecord[];
};

export interface PatientContextRepository {
  getByUserId(userId: string): Promise<PatientContextRecord | null>;
  setByUserId(
    userId: string,
    payload: FirebaseFirestore.DocumentData,
    options?: { merge?: boolean },
  ): Promise<void>;
  updateByUserId(
    userId: string,
    updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
  ): Promise<void>;
  updateConditions(
    userId: string,
    conditions: PatientContextConditionRecord[],
    updatedAt: Date,
  ): Promise<void>;
}
