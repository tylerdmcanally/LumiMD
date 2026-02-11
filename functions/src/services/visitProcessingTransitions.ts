export type RetryPath = 'summarize' | 'retranscribe';

interface RetryPathVisitShape {
  transcript?: unknown;
  transcriptText?: unknown;
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolveRetryPath(visit: RetryPathVisitShape): RetryPath {
  return hasText(visit.transcript) || hasText(visit.transcriptText)
    ? 'summarize'
    : 'retranscribe';
}

interface CalculateRetryWaitSecondsInput {
  lastRetryAtMillis?: number | null;
  nowMillis: number;
  minIntervalMs?: number;
}

export function calculateRetryWaitSeconds(input: CalculateRetryWaitSecondsInput): number {
  const {
    lastRetryAtMillis,
    nowMillis,
    minIntervalMs = 30 * 1000,
  } = input;

  if (typeof lastRetryAtMillis !== 'number') {
    return 0;
  }

  const elapsedMs = nowMillis - lastRetryAtMillis;
  if (elapsedMs >= minIntervalMs) {
    return 0;
  }

  return Math.ceil((minIntervalMs - elapsedMs) / 1000);
}

export type TranscribingRecoveryMode =
  | 'fail_max_retries'
  | 'retry_pending'
  | 'resume_summarizing'
  | 'mark_failed'
  | 'skip';

interface ResolveTranscribingRecoveryModeInput {
  retryCount: number;
  hasTranscriptionId: boolean;
  transcriptStatus?: string;
  maxRetries?: number;
}

export function resolveTranscribingRecoveryMode(
  input: ResolveTranscribingRecoveryModeInput,
): TranscribingRecoveryMode {
  const {
    retryCount,
    hasTranscriptionId,
    transcriptStatus,
    maxRetries = 3,
  } = input;

  if (retryCount >= maxRetries) {
    return 'fail_max_retries';
  }

  if (!hasTranscriptionId) {
    return 'retry_pending';
  }

  if (transcriptStatus === 'completed') {
    return 'resume_summarizing';
  }

  if (transcriptStatus === 'error') {
    return 'mark_failed';
  }

  return 'skip';
}

export type SummarizingRecoveryMode = 'retry' | 'fail_max_retries';

interface ResolveSummarizingRecoveryModeInput {
  retryCount: number;
  maxRetries?: number;
}

export function resolveSummarizingRecoveryMode(
  input: ResolveSummarizingRecoveryModeInput,
): SummarizingRecoveryMode {
  const { retryCount, maxRetries = 3 } = input;
  return retryCount >= maxRetries ? 'fail_max_retries' : 'retry';
}

interface BuildWebhookVisitUpdateInput {
  status: 'completed' | 'error';
  now: unknown;
  fieldDelete: unknown;
  formattedTranscript?: string;
  transcriptText?: string;
  error?: string;
}

export function buildWebhookVisitUpdate(
  input: BuildWebhookVisitUpdateInput,
): Record<string, unknown> {
  const { status, now, fieldDelete } = input;

  if (status === 'completed') {
    return {
      transcriptionStatus: 'completed',
      transcriptionCompletedAt: now,
      transcriptionError: fieldDelete,
      transcript: input.formattedTranscript || '',
      transcriptText: input.transcriptText || '',
      processingStatus: 'summarizing',
      processingError: fieldDelete,
      updatedAt: now,
      webhookTriggered: true,
    };
  }

  const failureMessage = input.error || 'Transcription failed';
  return {
    transcriptionStatus: 'error',
    transcriptionError: failureMessage,
    processingStatus: 'failed',
    status: 'failed',
    processingError: failureMessage,
    updatedAt: now,
  };
}

