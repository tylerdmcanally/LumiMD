export class RepositoryValidationError extends Error {
  readonly code = 'validation_failed' as const;

  constructor(message: string) {
    super(message);
    this.name = 'RepositoryValidationError';
  }
}
