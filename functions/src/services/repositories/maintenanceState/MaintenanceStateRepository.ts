export type MaintenanceStateSetOptions = {
  merge?: boolean;
};

export interface MaintenanceStateRepository {
  getState(
    documentId: string,
  ): Promise<FirebaseFirestore.DocumentData | null>;
  setState(
    documentId: string,
    data: FirebaseFirestore.DocumentData,
    options?: MaintenanceStateSetOptions,
  ): Promise<void>;
}
