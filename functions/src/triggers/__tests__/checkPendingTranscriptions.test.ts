jest.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: jest.fn((_config, handler) => handler),
}));

jest.mock('firebase-functions/v2', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../services/assemblyai', () => ({
  getAssemblyAIService: jest.fn(),
}));

import { resolvePendingTranscriptionDecision } from '../checkPendingTranscriptions';

describe('resolvePendingTranscriptionDecision', () => {
  const NOW = Date.parse('2026-02-10T12:00:00.000Z');

  it('returns complete when transcript status is completed', () => {
    const decision = resolvePendingTranscriptionDecision({
      transcriptStatus: 'completed',
      currentTranscriptionStatus: 'processing',
      nowMillis: NOW,
    });

    expect(decision).toBe('complete');
  });

  it('returns error when transcript status is error', () => {
    const decision = resolvePendingTranscriptionDecision({
      transcriptStatus: 'error',
      currentTranscriptionStatus: 'processing',
      nowMillis: NOW,
    });

    expect(decision).toBe('error');
  });

  it('returns timeout when submitted time exceeds threshold', () => {
    const decision = resolvePendingTranscriptionDecision({
      transcriptStatus: 'processing',
      currentTranscriptionStatus: 'processing',
      submittedAtMillis: NOW - 61 * 60 * 1000,
      nowMillis: NOW,
      maxDurationMs: 60 * 60 * 1000,
    });

    expect(decision).toBe('timeout');
  });

  it('returns status_update when status changed and not terminal', () => {
    const decision = resolvePendingTranscriptionDecision({
      transcriptStatus: 'queued',
      currentTranscriptionStatus: 'submitted',
      submittedAtMillis: NOW - 5 * 60 * 1000,
      nowMillis: NOW,
    });

    expect(decision).toBe('status_update');
  });

  it('returns noop when status unchanged and not timed out', () => {
    const decision = resolvePendingTranscriptionDecision({
      transcriptStatus: 'processing',
      currentTranscriptionStatus: 'processing',
      submittedAtMillis: NOW - 5 * 60 * 1000,
      nowMillis: NOW,
    });

    expect(decision).toBe('noop');
  });
});
