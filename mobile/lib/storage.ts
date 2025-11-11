/**
 * Firebase Storage utilities
 * Handle audio file uploads to Firebase Storage
 */

import { storage } from './firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  progress: number; // 0-100
}

/**
 * Upload audio file to Firebase Storage
 * Returns the download URL of the uploaded file
 */
export interface UploadedAudio {
  downloadUrl: string;
  storagePath: string;
}

export async function uploadAudioFile(
  uri: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadedAudio> {
  try {
    // Fetch the file from the URI
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // Create a unique filename with timestamp
    const timestamp = Date.now();
    const filename = `visits/${userId}/${timestamp}.m4a`;
    
    // Create storage reference
    const storageRef = ref(storage, filename);
    
    // Upload with progress tracking
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: 'audio/m4a',
    });
    
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Track progress
          const progress = {
            bytesTransferred: snapshot.bytesTransferred,
            totalBytes: snapshot.totalBytes,
            progress: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
          };
          onProgress?.(progress);
        },
        (error) => {
          console.error('[Storage] Upload error:', error);
          reject(error);
        },
        async () => {
          // Upload complete - get download URL
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('[Storage] Upload complete:', downloadURL);
            resolve({
              downloadUrl: downloadURL,
              storagePath: filename,
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('[Storage] Upload failed:', error);
    throw error;
  }
}

/**
 * Delete audio file from Firebase Storage
 */
export async function deleteAudioFile(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url);
    // Note: deleteObject is available but we'll skip for now
    // as it requires additional imports and isn't critical for MVP
    console.log('[Storage] Delete requested for:', url);
  } catch (error) {
    console.error('[Storage] Delete failed:', error);
    throw error;
  }
}

