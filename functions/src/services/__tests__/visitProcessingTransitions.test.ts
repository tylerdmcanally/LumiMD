import {
  buildWebhookVisitUpdate,
  calculateRetryWaitSeconds,
  resolveRetryPath,
  resolveSummarizingRecoveryMode,
  resolveTranscribingRecoveryMode,
} from '../visitProcessingTransitions';

describe('visitProcessingTransitions', () => {
  describe('resolveRetryPath', () => {
    it('chooses summarize when transcript already exists', () => {
      expect(resolveRetryPath({ transcript: 'Visit summary source text' })).toBe('summarize');
      expect(resolveRetryPath({ transcriptText: 'Raw transcript text' })).toBe('summarize');
    });

    it('chooses retranscribe when transcript fields are empty', () => {
      expect(resolveRetryPath({ transcript: '   ', transcriptText: '' })).toBe('retranscribe');
      expect(resolveRetryPath({})).toBe('retranscribe');
    });
  });

  describe('calculateRetryWaitSeconds', () => {
    const NOW = Date.parse('2026-02-10T12:00:00.000Z');

    it('returns 0 when there is no previous retry', () => {
      expect(
        calculateRetryWaitSeconds({
          nowMillis: NOW,
          lastRetryAtMillis: null,
        }),
      ).toBe(0);
    });

    it('returns remaining wait when inside throttle window', () => {
      expect(
        calculateRetryWaitSeconds({
          nowMillis: NOW,
          lastRetryAtMillis: NOW - 5_000,
          minIntervalMs: 30_000,
        }),
      ).toBe(25);
    });

    it('returns 0 when throttle window has elapsed', () => {
      expect(
        calculateRetryWaitSeconds({
          nowMillis: NOW,
          lastRetryAtMillis: NOW - 60_000,
          minIntervalMs: 30_000,
        }),
      ).toBe(0);
    });
  });

  describe('resolveTranscribingRecoveryMode', () => {
    it('fails when retry count exceeds max', () => {
      expect(
        resolveTranscribingRecoveryMode({
          retryCount: 3,
          maxRetries: 3,
          hasTranscriptionId: true,
        }),
      ).toBe('fail_max_retries');
    });

    it('retries pending when transcription id is missing', () => {
      expect(
        resolveTranscribingRecoveryMode({
          retryCount: 1,
          hasTranscriptionId: false,
        }),
      ).toBe('retry_pending');
    });

    it('resumes summarizing when AssemblyAI transcript is completed', () => {
      expect(
        resolveTranscribingRecoveryMode({
          retryCount: 1,
          hasTranscriptionId: true,
          transcriptStatus: 'completed',
        }),
      ).toBe('resume_summarizing');
    });

    it('marks failed when AssemblyAI transcript errors', () => {
      expect(
        resolveTranscribingRecoveryMode({
          retryCount: 1,
          hasTranscriptionId: true,
          transcriptStatus: 'error',
        }),
      ).toBe('mark_failed');
    });

    it('skips when AssemblyAI is still in progress', () => {
      expect(
        resolveTranscribingRecoveryMode({
          retryCount: 1,
          hasTranscriptionId: true,
          transcriptStatus: 'processing',
        }),
      ).toBe('skip');
    });
  });

  describe('resolveSummarizingRecoveryMode', () => {
    it('returns fail_max_retries at max retry count', () => {
      expect(resolveSummarizingRecoveryMode({ retryCount: 3, maxRetries: 3 })).toBe(
        'fail_max_retries',
      );
    });

    it('returns retry below max retry count', () => {
      expect(resolveSummarizingRecoveryMode({ retryCount: 2, maxRetries: 3 })).toBe('retry');
    });
  });

  describe('buildWebhookVisitUpdate', () => {
    it('builds summarizing update payload for completed webhook', () => {
      const now = { seconds: 1 };
      const fieldDelete = { op: 'delete' };
      const payload = buildWebhookVisitUpdate({
        status: 'completed',
        now,
        fieldDelete,
        formattedTranscript: 'Doctor: Hello',
        transcriptText: 'Hello',
      });

      expect(payload.processingStatus).toBe('summarizing');
      expect(payload.transcriptionStatus).toBe('completed');
      expect(payload.transcript).toBe('Doctor: Hello');
      expect(payload.transcriptionError).toBe(fieldDelete);
      expect(payload.webhookTriggered).toBe(true);
    });

    it('builds failed update payload for error webhook', () => {
      const now = { seconds: 1 };
      const fieldDelete = { op: 'delete' };
      const payload = buildWebhookVisitUpdate({
        status: 'error',
        now,
        fieldDelete,
        error: 'Audio quality too poor',
      });

      expect(payload.processingStatus).toBe('failed');
      expect(payload.status).toBe('failed');
      expect(payload.transcriptionStatus).toBe('error');
      expect(payload.processingError).toBe('Audio quality too poor');
    });
  });
});

