import { ConsentService, ConsentRecord } from './ConsentService';
import { LocationCoordinates } from './LocationService';
import { SecureStorageService } from './SecureStorageService';
import { EncryptionService } from './EncryptionService';

export interface VisitRecording {
  id: string;
  userId: string;
  folderId?: string;
  title: string;
  providerName: string;
  providerType: string;
  visitDate: Date;
  duration: number; // in seconds
  status: 'recording' | 'paused' | 'completed' | 'discarded';
  audioUrl?: string;
  transcript?: string;
  summary?: VisitSummary;
  consentRecord: ConsentRecord;
  location: LocationCoordinates;
  tags?: string[]; // Custom tags for filtering and organization
  createdAt: Date;
  updatedAt: Date;
  isEncrypted: boolean;
}

export interface VisitSummary {
  id: string;
  recordingId: string;
  keyPoints: string[];
  diagnoses: string[];
  medications: string[];
  followUpActions: FollowUpAction[];
  nextAppointments: NextAppointment[];
  testOrders: string[];
  lifestyle: string[];
  generatedAt: Date;
  confidence: number; // 0-1 scale
}

export interface FollowUpAction {
  type: 'prescription' | 'appointment' | 'test' | 'lifestyle' | 'monitoring';
  description: string;
  dueDate?: Date;
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
}

export interface NextAppointment {
  specialty: string;
  timeframe: string;
  reason: string;
  urgent: boolean;
}

export interface RecordingFolder {
  id: string;
  userId: string;
  name: string;
  description?: string;
  providerType?: string;
  color: string;
  createdAt: Date;
  recordingCount: number;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  currentRecording?: VisitRecording;
  error?: string;
}

export class RecordingService {
  private static mediaRecorder: MediaRecorder | null = null;
  private static recordingChunks: Blob[] = [];
  private static startTime: number = 0;
  private static pausedDuration: number = 0;
  private static pauseStartTime: number = 0;

  /**
   * Check if recording is supported in current environment
   */
  static isRecordingSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /**
   * Get microphone permission and setup recording
   */
  static async requestMicrophonePermission(): Promise<boolean> {
    try {
      if (!this.isRecordingSupported()) {
        throw new Error('Recording not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      // Test that we can create MediaRecorder
      const testRecorder = new MediaRecorder(stream);
      testRecorder.stop();

      // Stop test stream
      stream.getTracks().forEach(track => track.stop());

      return true;
    } catch (error) {
      console.error('Microphone permission denied or not available:', error);
      return false;
    }
  }

  /**
   * Start a new visit recording
   */
  static async startRecording(
    userId: string,
    visitDetails: {
      title: string;
      providerName: string;
      providerType: string;
      folderId?: string;
      location: LocationCoordinates;
    }
  ): Promise<VisitRecording | null> {
    try {
      // Check consent requirements
      const consentRequirements = await ConsentService.getConsentRequirements(visitDetails.location);

      // For demo purposes, assume consent is granted
      // In production, this would show consent UI first
      const consentRecord = await ConsentService.recordConsent(
        userId,
        visitDetails.location,
        true, // User consented
        consentRequirements.isOnePartyState ? undefined : true // Additional party consent if needed
      );

      // Validate permission to record
      if (!ConsentService.validateRecordingPermission(consentRecord)) {
        throw new Error('Recording permission not granted');
      }

      // Get microphone access
      const hasPermission = await this.requestMicrophonePermission();
      if (!hasPermission) {
        throw new Error('Microphone permission required');
      }

      // Create recording record
      const recording: VisitRecording = {
        id: `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        folderId: visitDetails.folderId,
        title: visitDetails.title,
        providerName: visitDetails.providerName,
        providerType: visitDetails.providerType,
        visitDate: new Date(),
        duration: 0,
        status: 'recording',
        consentRecord,
        location: visitDetails.location,
        createdAt: new Date(),
        updatedAt: new Date(),
        isEncrypted: true
      };

      // Start actual recording
      await this.beginAudioRecording();
      this.startTime = Date.now();
      this.pausedDuration = 0;

      // Store recording securely
      await this.storeRecording(recording);

      console.log('Recording started:', recording.id);
      return recording;

    } catch (error) {
      console.error('Failed to start recording:', error);
      return null;
    }
  }

  /**
   * Pause current recording
   */
  static pauseRecording(): boolean {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.pause();
        this.pauseStartTime = Date.now();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to pause recording:', error);
      return false;
    }
  }

  /**
   * Resume paused recording
   */
  static resumeRecording(): boolean {
    try {
      if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
        this.mediaRecorder.resume();
        if (this.pauseStartTime > 0) {
          this.pausedDuration += Date.now() - this.pauseStartTime;
          this.pauseStartTime = 0;
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to resume recording:', error);
      return false;
    }
  }

  /**
   * Stop and save recording
   */
  static async stopRecording(): Promise<VisitRecording | null> {
    try {
      if (!this.mediaRecorder) {
        return null;
      }

      return new Promise((resolve) => {
        this.mediaRecorder!.onstop = async () => {
          const audioBlob = new Blob(this.recordingChunks, { type: 'audio/webm' });
          const duration = Math.round((Date.now() - this.startTime - this.pausedDuration) / 1000);

          // Create audio URL
          const audioUrl = URL.createObjectURL(audioBlob);

          // Get current recording from storage and update it
          const recordings = this.getStoredRecordings();
          const currentRecording = recordings[recordings.length - 1];

          if (currentRecording) {
            currentRecording.status = 'completed';
            currentRecording.duration = duration;
            currentRecording.audioUrl = audioUrl;
            currentRecording.updatedAt = new Date();

            await this.updateStoredRecording(currentRecording);

            // Start background transcription and summarization
            this.processRecordingInBackground(currentRecording).catch(err => {
              console.error('Background processing error:', err);
            });

            resolve(currentRecording);
          } else {
            resolve(null);
          }

          // Cleanup
          this.cleanup();
        };

        this.mediaRecorder!.stop();
      });

    } catch (error) {
      console.error('Failed to stop recording:', error);
      return null;
    }
  }

  /**
   * Process recording with transcription and summarization in background
   */
  private static async processRecordingInBackground(recording: VisitRecording): Promise<void> {
    try {
      console.log('Starting background processing for recording:', recording.id);

      // Import services dynamically to avoid circular dependencies
      const { TranscriptionService } = await import('./TranscriptionService');
      const { VisitSummaryService } = await import('./VisitSummaryService');

      // Step 1: Transcribe the audio
      console.log('Transcribing audio...');
      const transcription = await TranscriptionService.transcribeRecording(recording);

      if (!transcription || transcription.status !== 'completed') {
        console.error('Transcription failed or incomplete');
        return;
      }

      // Update recording with transcript
      recording.transcript = transcription.fullText;
      await this.updateStoredRecording(recording);
      console.log('Transcript added to recording');

      // Step 2: Generate AI summary
      console.log('Generating AI summary...');
      const summary = await VisitSummaryService.generateVisitSummary(recording, transcription);

      if (summary) {
        recording.summary = summary;
        await this.updateStoredRecording(recording);
        console.log('AI summary added to recording');
      }

      console.log('Background processing complete for recording:', recording.id);
    } catch (error) {
      console.error('Error in background processing:', error);
    }
  }

  /**
   * Discard current recording
   */
  static async discardRecording(): Promise<boolean> {
    try {
      if (this.mediaRecorder) {
        this.mediaRecorder.stop();

        // Mark as discarded in storage
        const recordings = this.getStoredRecordings();
        const currentRecording = recordings[recordings.length - 1];

        if (currentRecording) {
          currentRecording.status = 'discarded';
          await this.updateStoredRecording(currentRecording);
        }

        this.cleanup();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to discard recording:', error);
      return false;
    }
  }

  /**
   * Get current recording state
   */
  static getCurrentRecordingState(): RecordingState {
    const isRecording = this.mediaRecorder?.state === 'recording';
    const isPaused = this.mediaRecorder?.state === 'paused';

    let duration = 0;
    if (this.startTime > 0) {
      const currentPausedTime = isPaused && this.pauseStartTime > 0
        ? Date.now() - this.pauseStartTime
        : 0;
      duration = Math.round((Date.now() - this.startTime - this.pausedDuration - currentPausedTime) / 1000);
    }

    return {
      isRecording,
      isPaused,
      duration: Math.max(0, duration)
    };
  }

  /**
   * Start actual audio recording
   */
  private static async beginAudioRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      }
    });

    this.recordingChunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm'
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordingChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(1000); // Collect data every second
  }

  /**
   * Cleanup recording resources
   */
  private static cleanup(): void {
    if (this.mediaRecorder?.stream) {
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    this.mediaRecorder = null;
    this.recordingChunks = [];
    this.startTime = 0;
    this.pausedDuration = 0;
    this.pauseStartTime = 0;
  }

  /**
   * Storage methods (HIPAA-compliant encrypted storage)
   */
  private static async storeRecording(recording: VisitRecording): Promise<void> {
    try {
      // Use secure storage for HIPAA compliance
      await SecureStorageService.storeRecordingSecurely(recording);

      // Also maintain legacy storage for compatibility (non-PHI data only)
      const recordings = this.getLegacyStoredRecordings();
      const legacyRecording = {
        id: recording.id,
        userId: recording.userId,
        folderId: recording.folderId,
        title: recording.title,
        providerType: recording.providerType,
        visitDate: recording.visitDate,
        duration: recording.duration,
        status: recording.status,
        createdAt: recording.createdAt,
        updatedAt: recording.updatedAt,
        isEncrypted: true
      };
      recordings.push(legacyRecording);

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('healthnav_recordings', JSON.stringify(recordings));
      }
    } catch (error) {
      console.error('Error storing recording:', error);
    }
  }

  private static async updateStoredRecording(updatedRecording: VisitRecording): Promise<void> {
    try {
      // Update secure storage
      await SecureStorageService.storeRecordingSecurely(updatedRecording);

      // Update legacy storage (non-PHI data only)
      const recordings = this.getLegacyStoredRecordings();
      const index = recordings.findIndex(r => r.id === updatedRecording.id);

      if (index !== -1) {
        const legacyRecording = {
          id: updatedRecording.id,
          userId: updatedRecording.userId,
          folderId: updatedRecording.folderId,
          title: updatedRecording.title,
          providerType: updatedRecording.providerType,
          visitDate: updatedRecording.visitDate,
          duration: updatedRecording.duration,
          status: updatedRecording.status,
          createdAt: updatedRecording.createdAt,
          updatedAt: updatedRecording.updatedAt,
          isEncrypted: true
        };
        recordings[index] = legacyRecording;

        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('healthnav_recordings', JSON.stringify(recordings));
        }
      }
    } catch (error) {
      console.error('Error updating recording:', error);
    }
  }

  static getStoredRecordings(): VisitRecording[] {
    // This method returns non-PHI data for compatibility
    // Use getSecureRecording() for full PHI data
    return this.getLegacyStoredRecordings();
  }

  private static getLegacyStoredRecordings(): any[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('healthnav_recordings');
        return stored ? JSON.parse(stored) : [];
      }
      return [];
    } catch (error) {
      console.error('Error retrieving recordings:', error);
      return [];
    }
  }

  /**
   * Get full recording with PHI data (secure)
   */
  static async getSecureRecording(recordingId: string, userId: string): Promise<VisitRecording | null> {
    try {
      return await SecureStorageService.retrieveRecordingSecurely(recordingId, userId);
    } catch (error) {
      console.error('Error retrieving secure recording:', error);
      return null;
    }
  }

  /**
   * Update an existing recording
   */
  static async updateRecording(recording: VisitRecording): Promise<boolean> {
    try {
      // Update secure storage
      await SecureStorageService.storeRecordingSecurely(recording);

      // Update legacy storage (non-PHI data only)
      const recordings = this.getLegacyStoredRecordings();
      const index = recordings.findIndex(r => r.id === recording.id);

      if (index !== -1) {
        recordings[index] = {
          id: recording.id,
          userId: recording.userId,
          folderId: recording.folderId,
          title: recording.title,
          visitDate: recording.visitDate,
          providerType: recording.providerType,
          duration: recording.duration,
          status: recording.status,
          tags: recording.tags,
          createdAt: recording.createdAt,
          updatedAt: new Date()
        };

        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem('healthnav_recordings', JSON.stringify(recordings));
        }
      }

      return true;
    } catch (error) {
      console.error('Error updating recording:', error);
      return false;
    }
  }

  /**
   * Delete a recording
   */
  static async deleteRecording(recordingId: string, userId: string): Promise<boolean> {
    try {
      // Remove from legacy storage
      const recordings = this.getLegacyStoredRecordings();
      const filtered = recordings.filter(r => r.id !== recordingId);

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('healthnav_recordings', JSON.stringify(filtered));

        // Also remove encrypted data
        localStorage.removeItem(`recording_phi_${recordingId}`);
        localStorage.removeItem(`recording_metadata_${recordingId}`);
      }

      console.log(`Deleted recording: ${recordingId}`);
      return true;
    } catch (error) {
      console.error('Error deleting recording:', error);
      return false;
    }
  }

  /**
   * Get user's recordings
   */
  static getUserRecordings(userId: string): VisitRecording[] {
    const allRecordings = this.getStoredRecordings();
    return allRecordings
      .filter(recording => recording.userId === userId && recording.status !== 'discarded')
      .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  }

  /**
   * Get recordings by folder
   */
  static getRecordingsByFolder(userId: string, folderId: string): VisitRecording[] {
    const userRecordings = this.getUserRecordings(userId);
    return userRecordings.filter(recording => recording.folderId === folderId);
  }

  /**
   * Format duration for display
   */
  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Folder Management Methods
   */

  static getFolders(userId: string): RecordingFolder[] {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }

    const foldersJson = localStorage.getItem(`healthnav_folders_${userId}`);
    if (!foldersJson) {
      return [];
    }

    const folders = JSON.parse(foldersJson);
    return folders.map((folder: any) => ({
      ...folder,
      createdAt: new Date(folder.createdAt)
    }));
  }

  static createFolder(userId: string, name: string, color: string, description?: string): RecordingFolder {
    const folder: RecordingFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      name,
      description,
      color,
      createdAt: new Date(),
      recordingCount: 0
    };

    const folders = this.getFolders(userId);
    folders.push(folder);

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`healthnav_folders_${userId}`, JSON.stringify(folders));
    }

    return folder;
  }

  static updateFolder(folder: RecordingFolder): boolean {
    try {
      const folders = this.getFolders(folder.userId);
      const index = folders.findIndex(f => f.id === folder.id);

      if (index !== -1) {
        folders[index] = folder;

        if (typeof window !== 'undefined' && window.localStorage) {
          localStorage.setItem(`healthnav_folders_${folder.userId}`, JSON.stringify(folders));
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error updating folder:', error);
      return false;
    }
  }

  static async deleteFolder(userId: string, folderId: string): Promise<boolean> {
    try {
      // Move all recordings in this folder back to no folder
      const recordings = this.getUserRecordings(userId);
      const affectedRecordings = recordings.filter(r => r.folderId === folderId);

      for (const recording of affectedRecordings) {
        // Load the full recording with PHI data
        const fullRecording = await this.getSecureRecording(recording.id, userId);
        if (fullRecording) {
          fullRecording.folderId = undefined;
          await this.updateRecording(fullRecording);
        }
      }

      // Delete the folder
      const folders = this.getFolders(userId);
      const filteredFolders = folders.filter(f => f.id !== folderId);

      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(`healthnav_folders_${userId}`, JSON.stringify(filteredFolders));
      }

      return true;
    } catch (error) {
      console.error('Error deleting folder:', error);
      return false;
    }
  }

  static moveRecordingToFolder(recording: VisitRecording, folderId: string | undefined): boolean {
    try {
      recording.folderId = folderId;
      return this.updateRecording(recording);
    } catch (error) {
      console.error('Error moving recording to folder:', error);
      return false;
    }
  }

  static updateFolderCounts(userId: string): void {
    const folders = this.getFolders(userId);
    const recordings = this.getUserRecordings(userId);

    folders.forEach(folder => {
      folder.recordingCount = recordings.filter(r => r.folderId === folder.id).length;
    });

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`healthnav_folders_${userId}`, JSON.stringify(folders));
    }
  }
}