import { VisitRecording } from './RecordingService';
import { TranscriptionResult } from './TranscriptionService';
import { VisitSummary } from './VisitSummaryService';
import { EncryptionService, EncryptedData } from './EncryptionService';

export interface SecureStorageMetadata {
  id: string;
  userId: string;
  dataType: 'recording' | 'transcription' | 'summary';
  createdAt: Date;
  lastAccessedAt: Date;
  encryptionKeyId: string;
  retentionPolicy?: {
    retainUntil: Date;
    reason: string;
  };
  accessCount: number;
  checksum?: string;
}

export interface HIPAAComplianceInfo {
  dataClassification: 'PHI' | 'non-PHI' | 'de-identified';
  retentionPeriod: number; // days
  accessControls: string[];
  auditRequired: boolean;
  encryptionRequired: boolean;
}

export class SecureStorageService {
  // HIPAA retention requirements
  private static readonly RETENTION_PERIODS = {
    MEDICAL_RECORDS: 365 * 6, // 6 years
    TRANSCRIPTIONS: 365 * 6,
    SUMMARIES: 365 * 6,
    AUDIT_LOGS: 365 * 6,
    CONSENT_RECORDS: 365 * 7 // 7 years for consent
  };

  // Data classification for HIPAA compliance
  private static readonly PHI_FIELDS = new Set([
    'providerName',
    'location',
    'audioUrl',
    'transcript',
    'fullText',
    'segments',
    'summary',
    'keyPoints',
    'diagnoses',
    'medications',
    'followUpActions',
    'nextAppointments',
    'testOrders'
  ]);

  /**
   * Store visit recording securely
   */
  static async storeRecordingSecurely(recording: VisitRecording): Promise<boolean> {
    try {
      const compliance = this.getComplianceInfo('recording');

      // Separate PHI from non-PHI data
      const { phiData, nonPhiData } = this.separatePHI(recording);

      // Encrypt PHI data
      const encryptedPHI = await EncryptionService.encryptData(phiData, recording.userId);

      // Create storage metadata
      const metadata: SecureStorageMetadata = {
        id: recording.id,
        userId: recording.userId,
        dataType: 'recording',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        encryptionKeyId: encryptedPHI.keyId,
        retentionPolicy: {
          retainUntil: new Date(Date.now() + this.RETENTION_PERIODS.MEDICAL_RECORDS * 24 * 60 * 60 * 1000),
          reason: 'HIPAA medical record retention requirement'
        },
        accessCount: 0,
        checksum: await this.generateChecksum(recording)
      };

      // Store encrypted PHI and metadata separately
      await this.storeEncryptedData('recording_phi', recording.id, encryptedPHI);
      await this.storeMetadata('recording_metadata', recording.id, {
        ...nonPhiData,
        metadata
      });

      // Log HIPAA audit trail
      this.logDataAccess('store', 'recording', recording.userId, recording.id);

      EncryptionService.logEncryptionEvent('encrypt', recording.userId, encryptedPHI.keyId, {
        dataType: 'recording',
        recordingId: recording.id
      });

      console.log(`Securely stored recording: ${recording.id}`);
      return true;

    } catch (error) {
      console.error('Failed to store recording securely:', error);
      return false;
    }
  }

  /**
   * Retrieve visit recording securely
   */
  static async retrieveRecordingSecurely(recordingId: string, userId: string): Promise<VisitRecording | null> {
    try {
      // Check access permissions
      if (!await this.checkDataAccess(userId, recordingId, 'recording')) {
        throw new Error('Access denied');
      }

      // Retrieve metadata
      const metadataResult = await this.retrieveMetadata('recording_metadata', recordingId);
      if (!metadataResult) {
        return null;
      }

      const { metadata, ...nonPhiData } = metadataResult;

      // Check retention policy
      if (metadata.retentionPolicy && new Date() > metadata.retentionPolicy.retainUntil) {
        console.warn(`Recording ${recordingId} has exceeded retention period`);
        // In production, this would trigger secure deletion
      }

      // Retrieve and decrypt PHI
      const encryptedPHI = await this.retrieveEncryptedData('recording_phi', recordingId);
      if (!encryptedPHI) {
        throw new Error('Encrypted data not found');
      }

      const phiData = await EncryptionService.decryptData(encryptedPHI);

      // Update access tracking
      metadata.lastAccessedAt = new Date();
      metadata.accessCount++;
      await this.updateMetadata('recording_metadata', recordingId, { metadata, ...nonPhiData });

      // Combine data
      const fullRecording: VisitRecording = {
        ...nonPhiData,
        ...phiData
      } as VisitRecording;

      // Validate data integrity
      const currentChecksum = await this.generateChecksum(fullRecording);
      if (metadata.checksum && metadata.checksum !== currentChecksum) {
        console.error('Data integrity check failed for recording:', recordingId);
        this.logSecurityEvent('integrity_failure', userId, recordingId);
      }

      // Log access
      this.logDataAccess('retrieve', 'recording', userId, recordingId);

      EncryptionService.logEncryptionEvent('decrypt', userId, encryptedPHI.keyId, {
        dataType: 'recording',
        recordingId
      });

      return fullRecording;

    } catch (error) {
      console.error('Failed to retrieve recording securely:', error);
      this.logSecurityEvent('access_failure', userId, recordingId, error.message);
      return null;
    }
  }

  /**
   * Store transcription securely
   */
  static async storeTranscriptionSecurely(transcription: TranscriptionResult): Promise<boolean> {
    try {
      // Get user ID from recording
      const RecordingService = require('./RecordingService').RecordingService;
      const recordings = RecordingService.getStoredRecordings();
      const recording = recordings.find((r: VisitRecording) => r.id === transcription.recordingId);

      if (!recording) {
        throw new Error('Recording not found for transcription');
      }

      // Encrypt entire transcription (all PHI)
      const encryptedData = await EncryptionService.encryptData(transcription, recording.userId);

      // Create metadata
      const metadata: SecureStorageMetadata = {
        id: transcription.id,
        userId: recording.userId,
        dataType: 'transcription',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        encryptionKeyId: encryptedData.keyId,
        retentionPolicy: {
          retainUntil: new Date(Date.now() + this.RETENTION_PERIODS.TRANSCRIPTIONS * 24 * 60 * 60 * 1000),
          reason: 'HIPAA transcription retention requirement'
        },
        accessCount: 0,
        checksum: await this.generateChecksum(transcription)
      };

      // Store encrypted data and metadata
      await this.storeEncryptedData('transcription', transcription.id, encryptedData);
      await this.storeMetadata('transcription_metadata', transcription.id, { metadata });

      this.logDataAccess('store', 'transcription', recording.userId, transcription.id);

      console.log(`Securely stored transcription: ${transcription.id}`);
      return true;

    } catch (error) {
      console.error('Failed to store transcription securely:', error);
      return false;
    }
  }

  /**
   * Retrieve transcription securely
   */
  static async retrieveTranscriptionSecurely(transcriptionId: string, userId: string): Promise<TranscriptionResult | null> {
    try {
      if (!await this.checkDataAccess(userId, transcriptionId, 'transcription')) {
        throw new Error('Access denied');
      }

      const metadataResult = await this.retrieveMetadata('transcription_metadata', transcriptionId);
      if (!metadataResult?.metadata) {
        return null;
      }

      const encryptedData = await this.retrieveEncryptedData('transcription', transcriptionId);
      if (!encryptedData) {
        return null;
      }

      const transcription = await EncryptionService.decryptData<TranscriptionResult>(encryptedData);

      // Update access tracking
      metadataResult.metadata.lastAccessedAt = new Date();
      metadataResult.metadata.accessCount++;
      await this.updateMetadata('transcription_metadata', transcriptionId, metadataResult);

      this.logDataAccess('retrieve', 'transcription', userId, transcriptionId);

      return transcription;

    } catch (error) {
      console.error('Failed to retrieve transcription securely:', error);
      return null;
    }
  }

  /**
   * Store visit summary securely
   */
  static async storeSummarySecurely(summary: VisitSummary, userId: string): Promise<boolean> {
    try {
      const encryptedData = await EncryptionService.encryptData(summary, userId);

      const metadata: SecureStorageMetadata = {
        id: summary.id,
        userId,
        dataType: 'summary',
        createdAt: new Date(),
        lastAccessedAt: new Date(),
        encryptionKeyId: encryptedData.keyId,
        retentionPolicy: {
          retainUntil: new Date(Date.now() + this.RETENTION_PERIODS.SUMMARIES * 24 * 60 * 60 * 1000),
          reason: 'HIPAA summary retention requirement'
        },
        accessCount: 0,
        checksum: await this.generateChecksum(summary)
      };

      await this.storeEncryptedData('summary', summary.id, encryptedData);
      await this.storeMetadata('summary_metadata', summary.id, { metadata });

      this.logDataAccess('store', 'summary', userId, summary.id);

      console.log(`Securely stored summary: ${summary.id}`);
      return true;

    } catch (error) {
      console.error('Failed to store summary securely:', error);
      return false;
    }
  }

  /**
   * Retrieve visit summary securely
   */
  static async retrieveSummarySecurely(summaryId: string, userId: string): Promise<VisitSummary | null> {
    try {
      if (!await this.checkDataAccess(userId, summaryId, 'summary')) {
        throw new Error('Access denied');
      }

      const metadataResult = await this.retrieveMetadata('summary_metadata', summaryId);
      if (!metadataResult?.metadata) {
        return null;
      }

      const encryptedData = await this.retrieveEncryptedData('summary', summaryId);
      if (!encryptedData) {
        return null;
      }

      const summary = await EncryptionService.decryptData<VisitSummary>(encryptedData);

      // Update access tracking
      metadataResult.metadata.lastAccessedAt = new Date();
      metadataResult.metadata.accessCount++;
      await this.updateMetadata('summary_metadata', summaryId, metadataResult);

      this.logDataAccess('retrieve', 'summary', userId, summaryId);

      return summary;

    } catch (error) {
      console.error('Failed to retrieve summary securely:', error);
      return null;
    }
  }

  /**
   * Secure deletion of data (HIPAA requirement)
   */
  static async secureDeleteData(dataId: string, dataType: 'recording' | 'transcription' | 'summary', userId: string): Promise<boolean> {
    try {
      // Verify ownership
      const metadataResult = await this.retrieveMetadata(`${dataType}_metadata`, dataId);
      if (!metadataResult?.metadata || metadataResult.metadata.userId !== userId) {
        throw new Error('Access denied or data not found');
      }

      // Delete encrypted data
      await this.deleteEncryptedData(dataType === 'recording' ? 'recording_phi' : dataType, dataId);
      await this.deleteMetadata(`${dataType}_metadata`, dataId);

      // Log deletion
      this.logDataAccess('delete', dataType, userId, dataId);

      console.log(`Securely deleted ${dataType}: ${dataId}`);
      return true;

    } catch (error) {
      console.error('Failed to securely delete data:', error);
      return false;
    }
  }

  /**
   * Get user's data inventory (HIPAA requirement)
   */
  static async getUserDataInventory(userId: string): Promise<{
    recordings: SecureStorageMetadata[];
    transcriptions: SecureStorageMetadata[];
    summaries: SecureStorageMetadata[];
    totalDataSize: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
  }> {
    try {
      const recordings = await this.getUserMetadata(userId, 'recording');
      const transcriptions = await this.getUserMetadata(userId, 'transcription');
      const summaries = await this.getUserMetadata(userId, 'summary');

      const allRecords = [...recordings, ...transcriptions, ...summaries];
      const dates = allRecords.map(r => r.createdAt);

      return {
        recordings,
        transcriptions,
        summaries,
        totalDataSize: allRecords.length, // In production, calculate actual size
        oldestRecord: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : null,
        newestRecord: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
      };

    } catch (error) {
      console.error('Failed to get user data inventory:', error);
      return {
        recordings: [],
        transcriptions: [],
        summaries: [],
        totalDataSize: 0,
        oldestRecord: null,
        newestRecord: null
      };
    }
  }

  /**
   * HIPAA compliance helpers
   */
  private static getComplianceInfo(dataType: string): HIPAAComplianceInfo {
    return {
      dataClassification: 'PHI',
      retentionPeriod: this.RETENTION_PERIODS.MEDICAL_RECORDS,
      accessControls: ['user_auth', 'encryption', 'audit_log'],
      auditRequired: true,
      encryptionRequired: true
    };
  }

  private static separatePHI(data: any): { phiData: any; nonPhiData: any } {
    const phiData: any = {};
    const nonPhiData: any = {};

    for (const [key, value] of Object.entries(data)) {
      if (this.PHI_FIELDS.has(key)) {
        phiData[key] = value;
      } else {
        nonPhiData[key] = value;
      }
    }

    return { phiData, nonPhiData };
  }

  private static async checkDataAccess(userId: string, dataId: string, dataType: string): Promise<boolean> {
    // In production, implement proper RBAC
    return true; // For demo, allow access
  }

  private static async generateChecksum(data: any): Promise<string> {
    const jsonString = JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(jsonString);

    if (crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }

    // Fallback for environments without crypto.subtle
    return btoa(jsonString).substring(0, 32);
  }

  /**
   * Storage methods (encrypted)
   */
  private static async storeEncryptedData(collection: string, id: string, data: EncryptedData): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = `healthnav_secure_${collection}_${id}`;
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  private static async retrieveEncryptedData(collection: string, id: string): Promise<EncryptedData | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = `healthnav_secure_${collection}_${id}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    }
    return null;
  }

  private static async deleteEncryptedData(collection: string, id: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = `healthnav_secure_${collection}_${id}`;
      localStorage.removeItem(key);
    }
  }

  private static async storeMetadata(collection: string, id: string, metadata: any): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = `healthnav_metadata_${collection}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      existing[id] = metadata;
      localStorage.setItem(key, JSON.stringify(existing));
    }
  }

  private static async retrieveMetadata(collection: string, id: string): Promise<any | null> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = `healthnav_metadata_${collection}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      return existing[id] || null;
    }
    return null;
  }

  private static async updateMetadata(collection: string, id: string, metadata: any): Promise<void> {
    await this.storeMetadata(collection, id, metadata);
  }

  private static async deleteMetadata(collection: string, id: string): Promise<void> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = `healthnav_metadata_${collection}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      delete existing[id];
      localStorage.setItem(key, JSON.stringify(existing));
    }
  }

  private static async getUserMetadata(userId: string, dataType: string): Promise<SecureStorageMetadata[]> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = `healthnav_metadata_${dataType}_metadata`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');

      return Object.values(existing)
        .map((item: any) => item.metadata)
        .filter((metadata: SecureStorageMetadata) => metadata.userId === userId);
    }
    return [];
  }

  /**
   * Audit logging for HIPAA compliance
   */
  private static logDataAccess(
    action: 'store' | 'retrieve' | 'delete',
    dataType: string,
    userId: string,
    dataId: string
  ): void {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      dataType,
      userId,
      dataId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      ipAddress: 'unknown', // In production, capture real IP
      sessionId: 'unknown' // In production, use real session ID
    };

    // Store audit log
    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = JSON.parse(localStorage.getItem('healthnav_hipaa_audit') || '[]');
      existing.push(auditEntry);

      // Keep only last 10000 entries
      if (existing.length > 10000) {
        existing.splice(0, existing.length - 10000);
      }

      localStorage.setItem('healthnav_hipaa_audit', JSON.stringify(existing));
    }

    console.log('HIPAA_AUDIT:', auditEntry);
  }

  private static logSecurityEvent(
    eventType: 'access_failure' | 'integrity_failure' | 'encryption_failure',
    userId: string,
    dataId: string,
    details?: string
  ): void {
    const securityEvent = {
      timestamp: new Date().toISOString(),
      eventType,
      userId,
      dataId,
      details,
      severity: 'HIGH',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server'
    };

    // In production, send to security monitoring system
    console.error('SECURITY_EVENT:', securityEvent);

    if (typeof window !== 'undefined' && window.localStorage) {
      const existing = JSON.parse(localStorage.getItem('healthnav_security_events') || '[]');
      existing.push(securityEvent);
      localStorage.setItem('healthnav_security_events', JSON.stringify(existing));
    }
  }
}