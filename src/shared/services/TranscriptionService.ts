import { VisitRecording } from './RecordingService';
import { SecureStorageService } from './SecureStorageService';
import { ENV } from '@/shared/config/env';

export interface TranscriptionSegment {
  id: string;
  text: string;
  timestamp: number; // seconds from start
  confidence: number; // 0-1 scale
  speaker?: 'patient' | 'provider' | 'unknown';
}

export interface TranscriptionResult {
  id: string;
  recordingId: string;
  segments: TranscriptionSegment[];
  fullText: string;
  language: string;
  confidence: number;
  processingTime: number; // milliseconds
  createdAt: Date;
  status: 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface TranscriptionProgress {
  recordingId: string;
  progress: number; // 0-100
  currentSegment?: TranscriptionSegment;
  estimatedTimeRemaining?: number; // seconds
}

export class TranscriptionService {
  private static getApiKey() {
    return ENV.OPENAI_API_KEY;
  }
  private static baseUrl = 'https://api.openai.com/v1/audio/transcriptions';

  // Real-time transcription state
  private static activeTranscriptions = new Map<string, TranscriptionProgress>();
  private static transcriptionCallbacks = new Map<string, (progress: TranscriptionProgress) => void>();

  /**
   * Start real-time transcription for a recording
   */
  static async startRealTimeTranscription(
    recordingId: string,
    audioStream: MediaStream,
    onProgress?: (progress: TranscriptionProgress) => void
  ): Promise<boolean> {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.error('OpenAI API key not configured');
        return false;
      }

      console.log(`Starting real-time transcription for recording: ${recordingId}`);

      // Initialize transcription progress
      const progress: TranscriptionProgress = {
        recordingId,
        progress: 0,
        estimatedTimeRemaining: undefined
      };

      this.activeTranscriptions.set(recordingId, progress);

      if (onProgress) {
        this.transcriptionCallbacks.set(recordingId, onProgress);
      }

      // For real-time transcription, we'll process audio chunks as they come in
      // This is a simplified implementation - in production, you'd want more sophisticated chunking
      this.setupRealTimeProcessing(recordingId, audioStream);

      return true;
    } catch (error) {
      console.error('Error starting real-time transcription:', error);
      return false;
    }
  }

  /**
   * Transcribe a completed recording
   */
  static async transcribeRecording(recording: VisitRecording): Promise<TranscriptionResult | null> {
    try {
      const apiKey = this.getApiKey();
      console.log('API Key check:', apiKey ? 'Found' : 'Missing');

      if (!apiKey) {
        console.error('OpenAI API key not configured');
        return null;
      }

      if (!recording.audioUrl) {
        console.error('No audio URL found for recording');
        return null;
      }

      console.log(`Transcribing recording: ${recording.id}`);
      console.log('Audio URL:', recording.audioUrl);

      const startTime = Date.now();

      // Convert audio URL to blob
      const audioBlob = await this.getAudioBlob(recording.audioUrl);
      if (!audioBlob) {
        throw new Error('Failed to get audio data');
      }

      console.log('Audio blob size:', audioBlob.size, 'bytes');
      console.log('Audio blob type:', audioBlob.type);

      // Prepare form data for Whisper API
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en'); // Can be made configurable
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'segment');

      // Add medical context prompt to improve accuracy
      const medicalPrompt = `This is a medical appointment recording between a healthcare provider and patient. The conversation may include medical terminology, symptoms, medications, and treatment discussions. Please transcribe accurately with attention to medical terms.`;
      formData.append('prompt', medicalPrompt);

      console.log('Calling OpenAI Whisper API...');

      // Call OpenAI Whisper API
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      console.log('Whisper API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper API error: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      // Process the response into our format
      const transcriptionResult = this.processWhisperResponse(
        recording.id,
        data,
        processingTime
      );

      console.log(`Transcription completed for ${recording.id} in ${processingTime}ms`);
      console.log(`Transcribed ${transcriptionResult.segments.length} segments`);

      // Store transcription securely
      await this.storeTranscriptionSecurely(transcriptionResult);

      return transcriptionResult;

    } catch (error) {
      console.error('Error transcribing recording:', error);

      // Return failed transcription result
      return {
        id: `transcription_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recordingId: recording.id,
        segments: [],
        fullText: '',
        language: 'en',
        confidence: 0,
        processingTime: 0,
        createdAt: new Date(),
        status: 'failed',
        error: error.message || 'Unknown transcription error'
      };
    }
  }

  /**
   * Get transcription by recording ID (secure)
   */
  static async getTranscription(recordingId: string, userId: string): Promise<TranscriptionResult | null> {
    try {
      // First try to find the transcription ID from legacy storage
      const legacyTranscriptions = this.getStoredTranscriptions();
      const transcriptionMeta = legacyTranscriptions.find(t => t.recordingId === recordingId);

      if (transcriptionMeta?.id) {
        return await SecureStorageService.retrieveTranscriptionSecurely(transcriptionMeta.id, userId);
      }

      return null;
    } catch (error) {
      console.error('Error retrieving transcription:', error);
      return null;
    }
  }

  /**
   * Get transcription by ID (secure)
   */
  static async getTranscriptionById(transcriptionId: string, userId: string): Promise<TranscriptionResult | null> {
    try {
      return await SecureStorageService.retrieveTranscriptionSecurely(transcriptionId, userId);
    } catch (error) {
      console.error('Error retrieving transcription by ID:', error);
      return null;
    }
  }

  /**
   * Search transcriptions by text
   */
  static searchTranscriptions(
    userId: string,
    query: string,
    options?: {
      dateFrom?: Date;
      dateTo?: Date;
      providerType?: string;
    }
  ): Array<{
    transcription: TranscriptionResult;
    recording: VisitRecording;
    matches: TranscriptionSegment[];
  }> {
    try {
      const transcriptions = this.getStoredTranscriptions();
      const RecordingService = require('./RecordingService').RecordingService;
      const userRecordings = RecordingService.getUserRecordings(userId);

      const results: Array<{
        transcription: TranscriptionResult;
        recording: VisitRecording;
        matches: TranscriptionSegment[];
      }> = [];

      const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);

      transcriptions.forEach(transcription => {
        const recording = userRecordings.find(r => r.id === transcription.recordingId);
        if (!recording) return;

        // Apply filters
        if (options?.dateFrom && new Date(recording.visitDate) < options.dateFrom) return;
        if (options?.dateTo && new Date(recording.visitDate) > options.dateTo) return;
        if (options?.providerType && recording.providerType !== options.providerType) return;

        // Find matching segments
        const matches = transcription.segments.filter(segment =>
          searchTerms.some(term => segment.text.toLowerCase().includes(term))
        );

        if (matches.length > 0) {
          results.push({
            transcription,
            recording,
            matches
          });
        }
      });

      // Sort by relevance (number of matches and confidence)
      return results.sort((a, b) => {
        const aScore = a.matches.length * a.transcription.confidence;
        const bScore = b.matches.length * b.transcription.confidence;
        return bScore - aScore;
      });

    } catch (error) {
      console.error('Error searching transcriptions:', error);
      return [];
    }
  }

  /**
   * Extract medical terms from transcription
   */
  static extractMedicalTerms(transcription: TranscriptionResult): {
    medications: string[];
    symptoms: string[];
    procedures: string[];
    diagnoses: string[];
  } {
    const text = transcription.fullText.toLowerCase();

    // Simple pattern matching - in production, use medical NLP
    const medications = this.extractPatterns(text, [
      /(?:taking|prescribed|medication|drug|pills?)\s+([a-z]+(?:in|ol|ide|ate|ine)\w*)/gi,
      /(\w+(?:cillin|mycin|prazole|statin|blocker))/gi
    ]);

    const symptoms = this.extractPatterns(text, [
      /(headache|fever|nausea|dizziness|fatigue|pain|ache|sore|swelling|rash)/gi,
      /(?:feeling|having|experiencing)\s+([a-z]+(?:ness|ache|pain))/gi
    ]);

    const procedures = this.extractPatterns(text, [
      /(x-ray|mri|ct scan|ultrasound|blood test|surgery|biopsy|endoscopy)/gi,
      /(?:need|order|schedule)\s+(?:a|an)\s+([a-z\s]+(?:scan|test|procedure))/gi
    ]);

    const diagnoses = this.extractPatterns(text, [
      /(diabetes|hypertension|asthma|arthritis|depression|anxiety|migraine)/gi,
      /(?:diagnosed with|diagnosis of)\s+([a-z\s]+)/gi
    ]);

    return {
      medications: [...new Set(medications)],
      symptoms: [...new Set(symptoms)],
      procedures: [...new Set(procedures)],
      diagnoses: [...new Set(diagnoses)]
    };
  }

  /**
   * Stop real-time transcription
   */
  static stopRealTimeTranscription(recordingId: string): void {
    this.activeTranscriptions.delete(recordingId);
    this.transcriptionCallbacks.delete(recordingId);
    console.log(`Stopped real-time transcription for: ${recordingId}`);
  }

  /**
   * Get real-time transcription progress
   */
  static getTranscriptionProgress(recordingId: string): TranscriptionProgress | null {
    return this.activeTranscriptions.get(recordingId) || null;
  }

  /**
   * Setup real-time audio processing
   */
  private static setupRealTimeProcessing(recordingId: string, audioStream: MediaStream): void {
    // This is a simplified implementation
    // In production, you'd want to:
    // 1. Split audio into chunks (e.g., 30-second segments)
    // 2. Send chunks to Whisper API as they're recorded
    // 3. Combine results in real-time
    // 4. Handle overlapping speech and context

    console.log(`Setting up real-time processing for: ${recordingId}`);

    // For now, we'll simulate progress updates
    let progress = 0;
    const interval = setInterval(() => {
      if (!this.activeTranscriptions.has(recordingId)) {
        clearInterval(interval);
        return;
      }

      progress += Math.random() * 10; // Simulate progress
      if (progress > 100) progress = 100;

      const transcriptionProgress: TranscriptionProgress = {
        recordingId,
        progress: Math.min(progress, 100),
        currentSegment: progress > 20 ? {
          id: `segment_${Date.now()}`,
          text: `[Real-time transcription segment at ${Math.round(progress)}%]`,
          timestamp: Date.now() / 1000,
          confidence: 0.8 + Math.random() * 0.2
        } : undefined,
        estimatedTimeRemaining: progress < 100 ? Math.round((100 - progress) * 0.5) : 0
      };

      this.activeTranscriptions.set(recordingId, transcriptionProgress);

      const callback = this.transcriptionCallbacks.get(recordingId);
      if (callback) {
        callback(transcriptionProgress);
      }

      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 2000);
  }

  /**
   * Process Whisper API response into our format
   */
  private static processWhisperResponse(
    recordingId: string,
    whisperData: any,
    processingTime: number
  ): TranscriptionResult {
    const segments: TranscriptionSegment[] = [];

    if (whisperData.segments) {
      whisperData.segments.forEach((segment: any, index: number) => {
        segments.push({
          id: `segment_${recordingId}_${index}`,
          text: segment.text.trim(),
          timestamp: segment.start,
          confidence: segment.avg_logprob ? Math.exp(segment.avg_logprob) : 0.8,
          speaker: 'unknown' // Speaker identification would require additional processing
        });
      });
    }

    return {
      id: `transcription_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      recordingId,
      segments,
      fullText: whisperData.text || '',
      language: whisperData.language || 'en',
      confidence: segments.length > 0
        ? segments.reduce((sum, seg) => sum + seg.confidence, 0) / segments.length
        : 0,
      processingTime,
      createdAt: new Date(),
      status: 'completed'
    };
  }

  /**
   * Convert audio URL to blob
   */
  private static async getAudioBlob(audioUrl: string): Promise<Blob | null> {
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
      }
      return await response.blob();
    } catch (error) {
      console.error('Error getting audio blob:', error);
      return null;
    }
  }

  /**
   * Extract patterns from text using regex
   */
  private static extractPatterns(text: string, patterns: RegExp[]): string[] {
    const matches: string[] = [];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          matches.push(match[1].trim());
        } else if (match[0]) {
          matches.push(match[0].trim());
        }
      }
    });

    return matches;
  }

  /**
   * Storage methods (HIPAA-compliant encrypted storage)
   */
  private static async storeTranscriptionSecurely(transcription: TranscriptionResult): Promise<void> {
    try {
      // Store securely with encryption
      await SecureStorageService.storeTranscriptionSecurely(transcription);

      // Store metadata in legacy storage for compatibility (no PHI)
      const stored = this.getStoredTranscriptions();
      const transcriptionMeta = {
        id: transcription.id,
        recordingId: transcription.recordingId,
        language: transcription.language,
        confidence: transcription.confidence,
        processingTime: transcription.processingTime,
        createdAt: transcription.createdAt,
        status: transcription.status,
        isEncrypted: true
      };
      stored.push(transcriptionMeta);

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('healthnav_transcriptions', JSON.stringify(stored));
      }

      console.log('Transcription stored securely:', transcription.id);
    } catch (error) {
      console.error('Error storing transcription:', error);
    }
  }

  private static getStoredTranscriptions(): TranscriptionResult[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('healthnav_transcriptions');
        return stored ? JSON.parse(stored) : [];
      }
      return [];
    } catch (error) {
      console.error('Error retrieving transcriptions:', error);
      return [];
    }
  }

  /**
   * Get transcription statistics
   */
  static getTranscriptionStats(userId: string): {
    totalTranscriptions: number;
    totalWords: number;
    averageConfidence: number;
    languageDistribution: { [key: string]: number };
  } {
    try {
      const RecordingService = require('./RecordingService').RecordingService;
      const userRecordings = RecordingService.getUserRecordings(userId);
      const recordingIds = new Set(userRecordings.map(r => r.id));

      const transcriptions = this.getStoredTranscriptions()
        .filter(t => recordingIds.has(t.recordingId) && t.status === 'completed');

      const totalWords = transcriptions.reduce((sum, t) => sum + t.fullText.split(' ').length, 0);
      const averageConfidence = transcriptions.length > 0
        ? transcriptions.reduce((sum, t) => sum + t.confidence, 0) / transcriptions.length
        : 0;

      const languageDistribution: { [key: string]: number } = {};
      transcriptions.forEach(t => {
        languageDistribution[t.language] = (languageDistribution[t.language] || 0) + 1;
      });

      return {
        totalTranscriptions: transcriptions.length,
        totalWords,
        averageConfidence,
        languageDistribution
      };
    } catch (error) {
      console.error('Error getting transcription stats:', error);
      return {
        totalTranscriptions: 0,
        totalWords: 0,
        averageConfidence: 0,
        languageDistribution: {}
      };
    }
  }

  /**
   * Format transcription for display
   */
  static formatTranscriptionForDisplay(
    transcription: TranscriptionResult,
    options?: {
      showTimestamps?: boolean;
      showConfidence?: boolean;
      highlightTerms?: string[];
    }
  ): string {
    if (!transcription.segments.length) {
      return transcription.fullText;
    }

    return transcription.segments
      .map(segment => {
        let text = segment.text;

        // Highlight search terms
        if (options?.highlightTerms) {
          options.highlightTerms.forEach(term => {
            const regex = new RegExp(`(${term})`, 'gi');
            text = text.replace(regex, '**$1**');
          });
        }

        const parts = [];

        // Add timestamp
        if (options?.showTimestamps) {
          const minutes = Math.floor(segment.timestamp / 60);
          const seconds = Math.floor(segment.timestamp % 60);
          parts.push(`[${minutes}:${seconds.toString().padStart(2, '0')}]`);
        }

        parts.push(text);

        // Add confidence
        if (options?.showConfidence) {
          parts.push(`(${Math.round(segment.confidence * 100)}%)`);
        }

        return parts.join(' ');
      })
      .join('\n\n');
  }
}
