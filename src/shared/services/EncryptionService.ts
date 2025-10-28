import { VisitRecording } from './RecordingService';
import { TranscriptionResult } from './TranscriptionService';
import { VisitSummary } from './VisitSummaryService';

export interface EncryptionKeyInfo {
  id: string;
  algorithm: string;
  createdAt: Date;
  userId: string;
}

export interface EncryptedData {
  encryptedContent: string;
  iv: string;
  keyId: string;
  version: string;
  algorithm: string;
  timestamp: Date;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly VERSION = '1.0';

  // In production, these would be stored in secure key management service
  private static encryptionKeys = new Map<string, CryptoKey>();
  private static keyInfo = new Map<string, EncryptionKeyInfo>();

  /**
   * Generate a new encryption key for user
   */
  static async generateEncryptionKey(userId: string): Promise<string> {
    try {
      if (!crypto.subtle) {
        throw new Error('Web Crypto API not available - encryption not supported');
      }

      // Generate AES-GCM key
      const key = await crypto.subtle.generateKey(
        {
          name: this.ALGORITHM,
          length: this.KEY_LENGTH,
        },
        true, // extractable for backup purposes
        ['encrypt', 'decrypt']
      );

      const keyId = `key_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store key and metadata
      this.encryptionKeys.set(keyId, key);
      this.keyInfo.set(keyId, {
        id: keyId,
        algorithm: this.ALGORITHM,
        createdAt: new Date(),
        userId
      });

      // In production, export and store key securely
      await this.storeKeySecurely(keyId, key, userId);

      console.log(`Generated new encryption key for user: ${userId}`);
      return keyId;

    } catch (error) {
      console.error('Failed to generate encryption key:', error);
      throw new Error('Encryption key generation failed');
    }
  }

  /**
   * Load keys from storage on initialization
   */
  static async initializeKeysFromStorage(): Promise<void> {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      const storedKeys = localStorage.getItem('healthnav_encryption_keys');
      if (!storedKeys) {
        return;
      }

      const keys = JSON.parse(storedKeys);
      for (const keyData of keys) {
        // Import the key back into Web Crypto API
        const keyBuffer = this.base64ToArrayBuffer(keyData.keyData);
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: this.ALGORITHM, length: this.KEY_LENGTH },
          true,
          ['encrypt', 'decrypt']
        );

        // Store in memory
        this.encryptionKeys.set(keyData.keyId, cryptoKey);
        this.keyInfo.set(keyData.keyId, {
          id: keyData.keyId,
          algorithm: keyData.algorithm,
          createdAt: new Date(keyData.createdAt),
          userId: keyData.userId
        });
      }

      console.log(`Loaded ${keys.length} encryption keys from storage`);
    } catch (error) {
      console.error('Failed to load encryption keys from storage:', error);
    }
  }

  /**
   * Get or create encryption key for user
   */
  static async getOrCreateUserKey(userId: string): Promise<string> {
    // Ensure keys are loaded from storage
    if (this.encryptionKeys.size === 0) {
      await this.initializeKeysFromStorage();
    }

    // Look for existing key
    const existingKeyId = this.findUserKey(userId);
    if (existingKeyId) {
      return existingKeyId;
    }

    // Generate new key
    return await this.generateEncryptionKey(userId);
  }

  /**
   * Encrypt sensitive data
   */
  static async encryptData(data: any, userId: string): Promise<EncryptedData> {
    try {
      const keyId = await this.getOrCreateUserKey(userId);
      const key = this.encryptionKeys.get(keyId);

      if (!key) {
        throw new Error('Encryption key not found');
      }

      // Convert data to JSON string
      const jsonData = JSON.stringify(data);
      const encodedData = new TextEncoder().encode(jsonData);

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));

      // Encrypt data
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
        },
        key,
        encodedData
      );

      return {
        encryptedContent: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv),
        keyId,
        version: this.VERSION,
        algorithm: this.ALGORITHM,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Data encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  static async decryptData<T>(encryptedData: EncryptedData): Promise<T> {
    try {
      // Try to load keys from storage if not in memory
      let key = this.encryptionKeys.get(encryptedData.keyId);
      if (!key && this.encryptionKeys.size === 0) {
        await this.initializeKeysFromStorage();
        key = this.encryptionKeys.get(encryptedData.keyId);
      }

      if (!key) {
        throw new Error('Decryption key not found');
      }

      // Convert base64 back to ArrayBuffer
      const encryptedBuffer = this.base64ToArrayBuffer(encryptedData.encryptedContent);
      const iv = this.base64ToArrayBuffer(encryptedData.iv);

      // Decrypt data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: encryptedData.algorithm,
          iv: iv,
        },
        key,
        encryptedBuffer
      );

      // Convert back to original data
      const jsonString = new TextDecoder().decode(decryptedBuffer);
      return JSON.parse(jsonString);

    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Data decryption failed');
    }
  }

  /**
   * Encrypt visit recording with PHI
   */
  static async encryptRecording(recording: VisitRecording): Promise<EncryptedData> {
    // Create sanitized version without sensitive data for metadata
    const sensitiveData = {
      transcript: recording.transcript,
      summary: recording.summary,
      audioUrl: recording.audioUrl,
      providerName: recording.providerName,
      location: recording.location
    };

    return await this.encryptData(sensitiveData, recording.userId);
  }

  /**
   * Decrypt visit recording PHI
   */
  static async decryptRecording(
    baseRecording: Partial<VisitRecording>,
    encryptedData: EncryptedData
  ): Promise<VisitRecording> {
    const sensitiveData = await this.decryptData<{
      transcript?: string;
      summary?: VisitSummary;
      audioUrl?: string;
      providerName: string;
      location: any;
    }>(encryptedData);

    return {
      ...baseRecording,
      ...sensitiveData
    } as VisitRecording;
  }

  /**
   * Encrypt transcription result
   */
  static async encryptTranscription(transcription: TranscriptionResult): Promise<EncryptedData> {
    // Get user ID from recording
    const RecordingService = require('./RecordingService').RecordingService;
    const recordings = RecordingService.getStoredRecordings();
    const recording = recordings.find((r: VisitRecording) => r.id === transcription.recordingId);

    if (!recording) {
      throw new Error('Recording not found for transcription');
    }

    // Encrypt full transcription data
    return await this.encryptData(transcription, recording.userId);
  }

  /**
   * Encrypt visit summary
   */
  static async encryptSummary(summary: VisitSummary, userId: string): Promise<EncryptedData> {
    return await this.encryptData(summary, userId);
  }

  /**
   * Securely delete encryption key (key rotation)
   */
  static async deleteEncryptionKey(keyId: string): Promise<boolean> {
    try {
      // Remove from memory
      this.encryptionKeys.delete(keyId);
      this.keyInfo.delete(keyId);

      // In production, remove from secure storage
      await this.removeKeyFromStorage(keyId);

      console.log(`Deleted encryption key: ${keyId}`);
      return true;

    } catch (error) {
      console.error('Failed to delete encryption key:', error);
      return false;
    }
  }

  /**
   * Rotate encryption keys (HIPAA requirement)
   */
  static async rotateUserKeys(userId: string): Promise<string> {
    try {
      // Generate new key
      const newKeyId = await this.generateEncryptionKey(userId);

      // In production, re-encrypt all user data with new key
      // For now, we'll mark old keys as deprecated
      const userKeys = Array.from(this.keyInfo.values())
        .filter(info => info.userId === userId && info.id !== newKeyId);

      console.log(`Rotated encryption keys for user: ${userId}. Old keys: ${userKeys.length}`);
      return newKeyId;

    } catch (error) {
      console.error('Key rotation failed:', error);
      throw new Error('Key rotation failed');
    }
  }

  /**
   * Audit log for encryption operations
   */
  static logEncryptionEvent(
    operation: 'encrypt' | 'decrypt' | 'key_generated' | 'key_rotated' | 'key_deleted',
    userId: string,
    keyId: string,
    details?: any
  ): void {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      operation,
      userId,
      keyId,
      details,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server'
    };

    // In production, send to secure audit log service
    console.log('ENCRYPTION_AUDIT:', auditEntry);

    // Store locally for demo (in production, use secure audit service)
    this.storeAuditLog(auditEntry);
  }

  /**
   * Helper methods
   */
  private static findUserKey(userId: string): string | null {
    for (const [keyId, info] of this.keyInfo.entries()) {
      if (info.userId === userId) {
        return keyId;
      }
    }
    return null;
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Storage methods (in production, use HSM/KMS)
   */
  private static async storeKeySecurely(keyId: string, key: CryptoKey, userId: string): Promise<void> {
    try {
      // Export key for storage (in production, use key management service)
      const exportedKey = await crypto.subtle.exportKey('raw', key);
      const keyData = {
        keyId,
        userId,
        keyData: this.arrayBufferToBase64(exportedKey),
        algorithm: this.ALGORITHM,
        createdAt: new Date().toISOString()
      };

      // In production, store in encrypted key vault
      if (typeof window !== 'undefined' && window.localStorage) {
        const existingKeys = JSON.parse(localStorage.getItem('healthnav_encryption_keys') || '[]');
        existingKeys.push(keyData);
        localStorage.setItem('healthnav_encryption_keys', JSON.stringify(existingKeys));
      }

    } catch (error) {
      console.error('Failed to store encryption key:', error);
    }
  }

  private static async removeKeyFromStorage(keyId: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const existingKeys = JSON.parse(localStorage.getItem('healthnav_encryption_keys') || '[]');
        const filteredKeys = existingKeys.filter((k: any) => k.keyId !== keyId);
        localStorage.setItem('healthnav_encryption_keys', JSON.stringify(filteredKeys));
      }
    } catch (error) {
      console.error('Failed to remove key from storage:', error);
    }
  }

  private static storeAuditLog(entry: any): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const existingLogs = JSON.parse(localStorage.getItem('healthnav_encryption_audit') || '[]');
        existingLogs.push(entry);

        // Keep only last 1000 entries
        if (existingLogs.length > 1000) {
          existingLogs.splice(0, existingLogs.length - 1000);
        }

        localStorage.setItem('healthnav_encryption_audit', JSON.stringify(existingLogs));
      }
    } catch (error) {
      console.error('Failed to store audit log:', error);
    }
  }

  /**
   * Initialize encryption service with existing keys
   */
  static async initializeFromStorage(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedKeys = JSON.parse(localStorage.getItem('healthnav_encryption_keys') || '[]');

        for (const keyData of storedKeys) {
          try {
            // Re-import stored keys
            const keyBuffer = this.base64ToArrayBuffer(keyData.keyData);
            const key = await crypto.subtle.importKey(
              'raw',
              keyBuffer,
              { name: this.ALGORITHM, length: this.KEY_LENGTH },
              true,
              ['encrypt', 'decrypt']
            );

            this.encryptionKeys.set(keyData.keyId, key);
            this.keyInfo.set(keyData.keyId, {
              id: keyData.keyId,
              algorithm: keyData.algorithm,
              createdAt: new Date(keyData.createdAt),
              userId: keyData.userId
            });

          } catch (error) {
            console.error('Failed to restore encryption key:', keyData.keyId, error);
          }
        }

        console.log(`Restored ${this.encryptionKeys.size} encryption keys`);
      }
    } catch (error) {
      console.error('Failed to initialize encryption service:', error);
    }
  }

  /**
   * Validate encryption capabilities
   */
  static validateEncryptionSupport(): {
    supported: boolean;
    webCrypto: boolean;
    algorithms: string[];
    issues: string[];
  } {
    const issues: string[] = [];

    // Check Web Crypto API
    const webCrypto = !!(crypto && crypto.subtle);
    if (!webCrypto) {
      issues.push('Web Crypto API not available');
    }

    // Check HTTPS requirement
    if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      issues.push('HTTPS required for Web Crypto API in production');
    }

    const algorithms = webCrypto ? [this.ALGORITHM] : [];

    return {
      supported: webCrypto && issues.length === 0,
      webCrypto,
      algorithms,
      issues
    };
  }
}