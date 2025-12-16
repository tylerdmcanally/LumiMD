/**
 * Firebase Storage utilities
 * Handle audio file uploads to Firebase Storage
 */

import storage from '@react-native-firebase/storage';

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
    // Create a unique filename with timestamp
    const timestamp = Date.now();
    const filename = `visits/${userId}/${timestamp}.m4a`;

    // Create storage reference
    const storageRef = storage().ref(filename);

    // Native SDK prefers file path for uploads
    // Ensure URI is a string (putFile handles 'file://' prefix)
    const uploadTask = storageRef.putFile(uri, {
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
            const downloadURL = await storageRef.getDownloadURL();
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
    // Determine if url is full URL or path
    let storageRef;
    if (url.startsWith('http')) {
      storageRef = storage().refFromURL(url);
    } else {
      storageRef = storage().ref(url);
    }

    // Native SDK has delete() method on reference
    await storageRef.delete();
    console.log('[Storage] Deleted:', url);
  } catch (error) {
    console.error('[Storage] Delete failed:', error);
    throw error;
  }
}

