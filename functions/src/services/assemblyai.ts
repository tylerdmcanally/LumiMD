import axios, { AxiosInstance } from 'axios';
import { assemblyAIConfig } from '../config';

const BASE_URL = 'https://api.assemblyai.com/v2';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 12 * 60 * 1000; // 12 minutes safety window

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

  async submitTranscription(audioUrl: string): Promise<string> {
    const response = await this.client.post<AssemblyAITranscript>('/transcript', {
      audio_url: audioUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
      language_code: 'en_us',
      disfluencies: true,
      auto_chapters: false,
    });

    return response.data.id;
  }

  async getTranscript(transcriptId: string): Promise<AssemblyAITranscript> {
    const response = await this.client.get<AssemblyAITranscript>(`/transcript/${transcriptId}`);
    return response.data;
  }

  async pollUntilComplete(transcriptId: string): Promise<AssemblyAITranscript> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
      const response = await this.client.get<AssemblyAITranscript>(`/transcript/${transcriptId}`);
      const data = response.data;

      if (data.status === 'completed') {
        return data;
      }

      if (data.status === 'error') {
        throw new Error(data.error || 'AssemblyAI transcription failed');
      }

      await sleep(POLL_INTERVAL_MS);
    }

    throw new Error('AssemblyAI transcription timed out');
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


