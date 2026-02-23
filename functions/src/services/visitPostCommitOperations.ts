export const POST_COMMIT_OPERATION_NAMES = [
  'syncMedications',
  'deleteTranscript',
  'lumibotAnalysis',
  'pushNotification',
  'caregiverEmails',
] as const;

export type PostCommitOperationName = (typeof POST_COMMIT_OPERATION_NAMES)[number];

export const RETRYABLE_POST_COMMIT_OPERATIONS: ReadonlySet<PostCommitOperationName> = new Set([
  'syncMedications',
  'deleteTranscript',
  'lumibotAnalysis',
  'pushNotification',
  'caregiverEmails',
]);

export const POST_COMMIT_RETRY_ALERT_THRESHOLD = 3;
export const POST_COMMIT_MAX_RETRY_ATTEMPTS = 5;
const POST_COMMIT_INITIAL_BACKOFF_MINUTES = 5;
const POST_COMMIT_MAX_BACKOFF_MINUTES = 6 * 60;

export function getPostCommitBackoffMs(attemptCount: number): number {
  const normalizedAttempts = Number.isFinite(attemptCount) && attemptCount > 0
    ? Math.floor(attemptCount)
    : 1;
  const minutes = Math.min(
    POST_COMMIT_INITIAL_BACKOFF_MINUTES * (2 ** (normalizedAttempts - 1)),
    POST_COMMIT_MAX_BACKOFF_MINUTES,
  );
  return minutes * 60 * 1000;
}

export function getPostCommitNextRetryDate(
  attemptCount: number,
  now: Date = new Date(),
): Date {
  return new Date(now.getTime() + getPostCommitBackoffMs(attemptCount));
}

export function isPostCommitOperationName(
  value: unknown,
): value is PostCommitOperationName {
  return (
    typeof value === 'string' &&
    (POST_COMMIT_OPERATION_NAMES as readonly string[]).includes(value)
  );
}
