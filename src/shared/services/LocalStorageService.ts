import AsyncStorage from '@react-native-async-storage/async-storage';
// Using legacy API to maintain compatibility with existing code
// TODO: Migrate to new File/Directory API in future update
import * as FileSystem from 'expo-file-system/legacy';

const documentDirectory = FileSystem.documentDirectory;

const PENDING_UPLOADS_KEY = '@lumimd/pending_uploads';
const LOCAL_RECORDINGS_DIR = `${documentDirectory ?? ''}recordings/`;

export interface PendingUpload {
  id: string;
  localAudioUri: string;
  visitData: {
    visitDate: string;
    visitType: string;
    consent: any;
    location?: any;
  };
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export class LocalStorageService {
  /**
   * Initialize the local storage system
   * Creates the recordings directory if it doesn't exist
   */
  static async init(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(LOCAL_RECORDINGS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(LOCAL_RECORDINGS_DIR, { intermediates: true });
        console.log('📁 Created local recordings directory');
      }
    } catch (error) {
      console.error('❌ Failed to initialize local storage:', error);
    }
  }

  /**
   * Save a recording locally before attempting upload
   * Returns the unique ID for this pending upload
   */
  static async saveRecordingLocally(
    sourceUri: string,
    visitData: PendingUpload['visitData']
  ): Promise<string> {
    try {
      // Ensure directory exists
      await this.init();

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `recording_${timestamp}.m4a`;
      const localUri = `${LOCAL_RECORDINGS_DIR}${filename}`;

      // Copy recording to local storage
      await FileSystem.copyAsync({ from: sourceUri, to: localUri });
      console.log('💾 Saved recording locally:', localUri);

      // Create pending upload record
      const pendingUpload: PendingUpload = {
        id: timestamp.toString(),
        localAudioUri: localUri,
        visitData,
        timestamp,
        retryCount: 0,
      };

      // Add to pending uploads list
      await this.addPendingUpload(pendingUpload);

      return pendingUpload.id;
    } catch (error) {
      console.error('❌ Failed to save recording locally:', error);
      throw error;
    }
  }

  /**
   * Get all pending uploads
   */
  static async getPendingUploads(): Promise<PendingUpload[]> {
    try {
      const data = await AsyncStorage.getItem(PENDING_UPLOADS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('❌ Failed to get pending uploads:', error);
      return [];
    }
  }

  /**
   * Add a new pending upload
   */
  private static async addPendingUpload(upload: PendingUpload): Promise<void> {
    try {
      const pending = await this.getPendingUploads();
      pending.push(upload);
      await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(pending));
      console.log('📝 Added pending upload:', upload.id);
    } catch (error) {
      console.error('❌ Failed to add pending upload:', error);
      throw error;
    }
  }

  /**
   * Remove a pending upload after successful upload
   */
  static async removePendingUpload(id: string): Promise<void> {
    try {
      const pending = await this.getPendingUploads();
      const upload = pending.find(u => u.id === id);
      
      // Remove from list
      const filtered = pending.filter(u => u.id !== id);
      await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(filtered));

      // Delete local file
      if (upload?.localAudioUri) {
        const fileInfo = await FileSystem.getInfoAsync(upload.localAudioUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(upload.localAudioUri, { idempotent: true });
          console.log('🗑️  Deleted local recording:', upload.localAudioUri);
        }
      }

      console.log('✅ Removed pending upload:', id);
    } catch (error) {
      console.error('❌ Failed to remove pending upload:', error);
    }
  }

  /**
   * Update a pending upload (e.g., increment retry count, update error)
   */
  static async updatePendingUpload(
    id: string,
    updates: Partial<PendingUpload>
  ): Promise<void> {
    try {
      const pending = await this.getPendingUploads();
      const index = pending.findIndex(u => u.id === id);
      
      if (index !== -1) {
        pending[index] = { ...pending[index], ...updates };
        await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(pending));
        console.log('📝 Updated pending upload:', id);
      }
    } catch (error) {
      console.error('❌ Failed to update pending upload:', error);
    }
  }

  /**
   * Get count of pending uploads
   */
  static async getPendingCount(): Promise<number> {
    const pending = await this.getPendingUploads();
    return pending.length;
  }

  /**
   * Clear all pending uploads (use with caution)
   */
  static async clearAllPendingUploads(): Promise<void> {
    try {
      const pending = await this.getPendingUploads();
      
      // Delete all local files
      for (const upload of pending) {
        if (upload.localAudioUri) {
          const fileInfo = await FileSystem.getInfoAsync(upload.localAudioUri);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(upload.localAudioUri, { idempotent: true });
          }
        }
      }

      // Clear list
      await AsyncStorage.removeItem(PENDING_UPLOADS_KEY);
      console.log('🗑️  Cleared all pending uploads');
    } catch (error) {
      console.error('❌ Failed to clear pending uploads:', error);
    }
  }

  /**
   * Get total size of pending uploads
   */
  static async getPendingUploadsSize(): Promise<number> {
    try {
      const pending = await this.getPendingUploads();
      let totalSize = 0;

      for (const upload of pending) {
        const fileInfo = await FileSystem.getInfoAsync(upload.localAudioUri);
        if (fileInfo.exists && 'size' in fileInfo) {
          totalSize += fileInfo.size;
        }
      }

      return totalSize;
    } catch (error) {
      console.error('❌ Failed to get pending uploads size:', error);
      return 0;
    }
  }

  /**
   * Format bytes to human-readable size
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

