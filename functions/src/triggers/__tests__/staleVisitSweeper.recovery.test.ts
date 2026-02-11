import * as admin from 'firebase-admin';
import {
  recoverSummarizingVisit,
  recoverTranscribingVisit,
} from '../staleVisitSweeper';
import { getAssemblyAIService } from '../../services/assemblyai';

jest.mock('../../services/assemblyai', () => ({
  getAssemblyAIService: jest.fn(),
}));

function makeTimestamp(iso: string) {
  const date = new Date(iso);
  return {
    toDate: () => date,
    toMillis: () => date.getTime(),
  };
}

describe('staleVisitSweeper recovery helpers', () => {
  const firestoreMock = admin.firestore as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (firestoreMock as any).Timestamp = {
      now: jest.fn(() => makeTimestamp('2026-02-11T18:00:00.000Z')),
    };
    (firestoreMock as any).FieldValue = {
      increment: jest.fn((value: number) => ({ __op: 'increment', value })),
      delete: jest.fn(() => ({ __op: 'delete' })),
    };
  });

  it('resets transcribing visit to pending when transcriptionId is missing', async () => {
    const visitRef = {
      id: 'visit-1',
      update: jest.fn(async () => undefined),
    } as any;

    const result = await recoverTranscribingVisit(visitRef, {
      retryCount: 0,
    });

    expect(result).toBe('retried');
    expect(visitRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        processingStatus: 'pending',
        processingError: 'Transcription timed out, retrying',
      }),
    );
  });

  it('moves visit to summarizing when AssemblyAI transcript is completed', async () => {
    (getAssemblyAIService as jest.Mock).mockReturnValue({
      getTranscript: jest.fn(async () => ({
        status: 'completed',
        text: 'Recovered transcript',
        utterances: [],
      })),
      formatTranscript: jest.fn(() => 'Speaker 1: Recovered transcript'),
    });

    const visitRef = {
      id: 'visit-2',
      update: jest.fn(async () => undefined),
    } as any;

    const result = await recoverTranscribingVisit(visitRef, {
      retryCount: 1,
      transcriptionId: 'transcript-123',
    });

    expect(result).toBe('retried');
    expect(visitRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        processingStatus: 'summarizing',
        transcript: 'Speaker 1: Recovered transcript',
        transcriptText: 'Recovered transcript',
      }),
    );
  });

  it('marks summarizing visit as failed after max retries', async () => {
    const visitRef = {
      id: 'visit-3',
      update: jest.fn(async () => undefined),
    } as any;

    const result = await recoverSummarizingVisit(visitRef, {
      retryCount: 3,
    });

    expect(result).toBe('failed');
    expect(visitRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        processingStatus: 'failed',
        status: 'failed',
      }),
    );
  });

  it('resets summarizing visit for retry when below max retries', async () => {
    const visitRef = {
      id: 'visit-4',
      update: jest.fn(async () => undefined),
    } as any;

    const result = await recoverSummarizingVisit(visitRef, {
      retryCount: 1,
    });

    expect(result).toBe('retried');
    expect(visitRef.update).toHaveBeenCalledWith(
      expect.objectContaining({
        processingError: 'Summarization timed out, retrying',
      }),
    );
  });
});
