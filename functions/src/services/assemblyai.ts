import axios, { AxiosInstance } from 'axios';
import { assemblyAIConfig, webhookConfig } from '../config';

import { withRetry } from '../utils/retryUtils';

const BASE_URL = 'https://api.assemblyai.com/v2';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 8 * 60 * 1000; // 8 minutes safety window (must be < 9 min function timeout)

export type AssemblyAIStatus = 'queued' | 'initialized' | 'processing' | 'completed' | 'error';

export interface AssemblyAIUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface AssemblyAITranscript {
  id: string;
  status: AssemblyAIStatus;
  text: string;
  error?: string;
  utterances?: AssemblyAIUtterance[];
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class AssemblyAIService {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('AssemblyAI API key is not configured');
    }

    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async submitTranscription(audioUrl: string, webhookUrl?: string): Promise<string> {
    return withRetry(async () => {
      try {
        // Build request payload
        const requestPayload: Record<string, unknown> = {
          audio_url: audioUrl,
          speaker_labels: true,
          punctuate: true,
          format_text: true,
          language_code: 'en_us',
          disfluencies: true,
          auto_chapters: false,
        };

        // Add webhook URL if provided (for instant callbacks)
        // The secret is passed as a query param on the webhook URL for validation
        if (webhookUrl) {
          const secret = webhookConfig.assemblyaiWebhookSecret;
          requestPayload.webhook_url = secret
            ? `${webhookUrl}?secret=${encodeURIComponent(secret)}`
            : webhookUrl;
        }

        const response = await this.client.post<AssemblyAITranscript>('/transcript', requestPayload);

        return response.data.id;
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const message = error.response?.data?.error || error.message;

          if (status === 401) {
            throw new Error('AssemblyAI authentication failed - API key may be invalid');
          }
          if (status === 400) {
            throw new Error(`AssemblyAI request error: ${message}`);
          }
          // Allow retry for 429 and 5xx
          if (status === 429 || (status && status >= 500)) {
            throw error; // Rethrow to trigger retry
          }

          throw new Error(`Failed to submit transcription: ${message}`);
        }

        throw new Error(`Unexpected error submitting transcription: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, {
      shouldRetry: (error) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          return status === 429 || (!!status && status >= 500);
        }
        return false;
      }
    });
  }

  async getTranscript(transcriptId: string): Promise<AssemblyAITranscript> {
    return withRetry(async () => {
      try {
        const response = await this.client.get<AssemblyAITranscript>(`/transcript/${transcriptId}`);
        return response.data;
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const message = error.response?.data?.error || error.message;

          if (status === 401) {
            throw new Error('AssemblyAI authentication failed - API key may be invalid');
          }
          if (status === 404) {
            throw new Error(`Transcript not found: ${transcriptId}`);
          }
          // Allow retry for 5xx
          if (status && status >= 500) {
            throw error; // Rethrow to trigger retry
          }

          throw new Error(`Failed to get transcript: ${message}`);
        }

        throw new Error(`Unexpected error getting transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, {
      shouldRetry: (error) => {
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          return !!status && status >= 500;
        }
        return false;
      }
    });
  }

  async pollUntilComplete(transcriptId: string): Promise<AssemblyAITranscript> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
      try {
        // Use the retrying getTranscript method
        const data = await this.getTranscript(transcriptId);

        if (data.status === 'completed') {
          return data;
        }

        if (data.status === 'error') {
          throw new Error(data.error || 'AssemblyAI transcription failed');
        }

        await sleep(POLL_INTERVAL_MS);
      } catch (error: unknown) {
        // If this is an expected transcription error (status === 'error'), re-throw it
        if (error instanceof Error && error.message.includes('transcription failed')) {
          throw error;
        }

        // For network/API errors, we already have retry logic in getTranscript,
        // but if that fails after all retries, we might want to continue polling loop
        // unless it's a fatal error
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;

          // Auth errors should fail immediately
          if (status === 401) {
            throw new Error('AssemblyAI authentication failed - API key may be invalid');
          }

          // 404 means it's gone
          if (status === 404) {
            throw new Error(`Transcript not found: ${transcriptId}`);
          }
        }

        // Log and continue polling
        console.warn('AssemblyAI polling error, continuing...', error instanceof Error ? error.message : 'Unknown error');
        await sleep(POLL_INTERVAL_MS);
      }
    }

    throw new Error('AssemblyAI transcription timed out after 8 minutes');
  }

  async deleteTranscript(transcriptId: string): Promise<void> {
    if (!transcriptId) {
      return;
    }

    try {
      await this.client.delete(`/transcript/${transcriptId}`);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 404) {
          // Already gone
          return;
        }

        if (status === 401) {
          throw new Error('AssemblyAI authentication failed - cannot delete transcript');
        }

        const message = error.response?.data?.error || error.message;
        throw new Error(`Failed to delete transcript ${transcriptId}: ${message}`);
      }

      throw new Error(
        `Unexpected error deleting transcript ${transcriptId}: ${error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  formatTranscript(utterances?: AssemblyAIUtterance[], fallbackText?: string): string {
    if (!utterances || utterances.length === 0) {
      return fallbackText || '';
    }

    return utterances
      .map((utterance) => {
        const startSeconds = Math.floor(utterance.start / 1000);
        const minutes = Math.floor(startSeconds / 60)
          .toString()
          .padStart(2, '0');
        const seconds = (startSeconds % 60).toString().padStart(2, '0');
        const timestamp = `${minutes}:${seconds}`;
        return `[${timestamp}] Speaker ${utterance.speaker}: ${utterance.text.trim()}`;
      })
      .join('\n');
  }
}

let assemblyAIServiceInstance: AssemblyAIService | null = null;

export const getAssemblyAIService = (): AssemblyAIService => {
  if (!assemblyAIServiceInstance) {
    assemblyAIServiceInstance = new AssemblyAIService(assemblyAIConfig.apiKey);
  }

  return assemblyAIServiceInstance;
};


