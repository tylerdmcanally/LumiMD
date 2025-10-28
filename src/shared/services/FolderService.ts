import { RecordingFolder } from './RecordingService';

export class FolderService {
  // Predefined folder colors
  private static folderColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#FFB366', '#A8E6CF', '#FFD93D', '#6C5CE7'
  ];

  // Default provider type folders
  private static defaultFolders = [
    {
      name: 'Primary Care',
      description: 'Family medicine, internal medicine, and general practice visits',
      providerType: 'primary_care',
      color: '#4ECDC4'
    },
    {
      name: 'Specialists',
      description: 'Cardiology, dermatology, and other specialist appointments',
      providerType: 'specialist',
      color: '#45B7D1'
    },
    {
      name: 'Urgent Care',
      description: 'Urgent care and walk-in clinic visits',
      providerType: 'urgent_care',
      color: '#FF6B6B'
    },
    {
      name: 'Emergency',
      description: 'Emergency room and urgent medical situations',
      providerType: 'emergency',
      color: '#E74C3C'
    }
  ];

  /**
   * Create default folders for new user
   */
  static createDefaultFolders(userId: string): RecordingFolder[] {
    const folders = this.defaultFolders.map((folder, index) => ({
      id: `folder_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      name: folder.name,
      description: folder.description,
      providerType: folder.providerType,
      color: folder.color,
      createdAt: new Date(),
      recordingCount: 0
    }));

    // Store folders
    this.storeFolders(folders);
    return folders;
  }

  /**
   * Create a new custom folder
   */
  static createFolder(
    userId: string,
    name: string,
    description?: string,
    providerType?: string,
    color?: string
  ): RecordingFolder {
    const folder: RecordingFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      name: name.trim(),
      description: description?.trim(),
      providerType,
      color: color || this.getRandomColor(),
      createdAt: new Date(),
      recordingCount: 0
    };

    // Add to stored folders
    const existingFolders = this.getUserFolders(userId);
    existingFolders.push(folder);
    this.storeFolders(existingFolders);

    console.log('Created folder:', folder.name);
    return folder;
  }

  /**
   * Update existing folder
   */
  static updateFolder(
    folderId: string,
    updates: Partial<Pick<RecordingFolder, 'name' | 'description' | 'color' | 'providerType'>>
  ): boolean {
    try {
      const allFolders = this.getStoredFolders();
      const folderIndex = allFolders.findIndex(f => f.id === folderId);

      if (folderIndex === -1) {
        return false;
      }

      // Update folder
      allFolders[folderIndex] = {
        ...allFolders[folderIndex],
        ...updates,
        name: updates.name?.trim() || allFolders[folderIndex].name
      };

      this.storeFolders(allFolders);
      return true;
    } catch (error) {
      console.error('Error updating folder:', error);
      return false;
    }
  }

  /**
   * Delete folder (and handle recordings)
   */
  static deleteFolder(
    folderId: string,
    moveRecordingsToFolderId?: string
  ): boolean {
    try {
      const allFolders = this.getStoredFolders();
      const folderIndex = allFolders.findIndex(f => f.id === folderId);

      if (folderIndex === -1) {
        return false;
      }

      const folder = allFolders[folderIndex];

      // Handle recordings in this folder
      if (folder.recordingCount > 0) {
        this.moveRecordingsFromFolder(folderId, moveRecordingsToFolderId);
      }

      // Remove folder
      allFolders.splice(folderIndex, 1);
      this.storeFolders(allFolders);

      console.log('Deleted folder:', folder.name);
      return true;
    } catch (error) {
      console.error('Error deleting folder:', error);
      return false;
    }
  }

  /**
   * Get user's folders
   */
  static getUserFolders(userId: string): RecordingFolder[] {
    const allFolders = this.getStoredFolders();
    const userFolders = allFolders.filter(folder => folder.userId === userId);

    // Create default folders if user has none
    if (userFolders.length === 0) {
      return this.createDefaultFolders(userId);
    }

    // Update recording counts
    return userFolders.map(folder => ({
      ...folder,
      recordingCount: this.getFolderRecordingCount(folder.id)
    }));
  }

  /**
   * Get folder by ID
   */
  static getFolderById(folderId: string): RecordingFolder | null {
    const allFolders = this.getStoredFolders();
    const folder = allFolders.find(f => f.id === folderId);

    if (folder) {
      return {
        ...folder,
        recordingCount: this.getFolderRecordingCount(folderId)
      };
    }

    return null;
  }

  /**
   * Get folders by provider type
   */
  static getFoldersByProviderType(userId: string, providerType: string): RecordingFolder[] {
    const userFolders = this.getUserFolders(userId);
    return userFolders.filter(folder => folder.providerType === providerType);
  }

  /**
   * Find or create folder for provider type
   */
  static findOrCreateFolderForProvider(
    userId: string,
    providerType: string,
    providerName?: string
  ): RecordingFolder {
    // Try to find existing folder for this provider type
    const existingFolders = this.getFoldersByProviderType(userId, providerType);

    if (existingFolders.length > 0) {
      return existingFolders[0]; // Return first matching folder
    }

    // Create new folder based on provider type
    const folderName = this.getFolderNameForProviderType(providerType, providerName);
    const folderColor = this.getColorForProviderType(providerType);

    return this.createFolder(
      userId,
      folderName,
      `Visits with ${providerType.replace('_', ' ')} providers`,
      providerType,
      folderColor
    );
  }

  /**
   * Move recordings from one folder to another
   */
  private static moveRecordingsFromFolder(
    fromFolderId: string,
    toFolderId?: string
  ): void {
    try {
      // This would integrate with RecordingService to move recordings
      // For now, we'll implement the interface

      // Import RecordingService here to avoid circular dependency
      const RecordingService = require('./RecordingService').RecordingService;
      const recordings = RecordingService.getStoredRecordings();

      recordings.forEach((recording: any) => {
        if (recording.folderId === fromFolderId) {
          recording.folderId = toFolderId || null;
          RecordingService.updateStoredRecording(recording);
        }
      });

    } catch (error) {
      console.error('Error moving recordings:', error);
    }
  }

  /**
   * Get recording count for folder
   */
  private static getFolderRecordingCount(folderId: string): number {
    try {
      // Import RecordingService here to avoid circular dependency
      const RecordingService = require('./RecordingService').RecordingService;
      const recordings = RecordingService.getStoredRecordings();

      return recordings.filter((recording: any) =>
        recording.folderId === folderId && recording.status !== 'discarded'
      ).length;

    } catch (error) {
      console.error('Error getting folder recording count:', error);
      return 0;
    }
  }

  /**
   * Get random color for new folder
   */
  private static getRandomColor(): string {
    return this.folderColors[Math.floor(Math.random() * this.folderColors.length)];
  }

  /**
   * Get appropriate color for provider type
   */
  private static getColorForProviderType(providerType: string): string {
    const colorMap: { [key: string]: string } = {
      'primary_care': '#4ECDC4',
      'urgent_care': '#FF6B6B',
      'emergency': '#E74C3C',
      'specialist': '#45B7D1',
      'cardiology': '#8E44AD',
      'dermatology': '#F39C12',
      'orthopedics': '#27AE60',
      'neurology': '#3498DB',
      'psychiatry': '#9B59B6',
      'gynecology': '#E91E63',
      'pediatrics': '#FF9800',
      'oncology': '#795548'
    };

    return colorMap[providerType] || this.getRandomColor();
  }

  /**
   * Get appropriate folder name for provider type
   */
  private static getFolderNameForProviderType(
    providerType: string,
    providerName?: string
  ): string {
    const nameMap: { [key: string]: string } = {
      'primary_care': 'Primary Care',
      'urgent_care': 'Urgent Care',
      'emergency': 'Emergency Visits',
      'specialist': 'Specialist Visits',
      'cardiology': 'Cardiology',
      'dermatology': 'Dermatology',
      'orthopedics': 'Orthopedics',
      'neurology': 'Neurology',
      'psychiatry': 'Mental Health',
      'gynecology': 'Gynecology',
      'pediatrics': 'Pediatrics',
      'oncology': 'Oncology'
    };

    if (providerName) {
      return `${providerName} Visits`;
    }

    return nameMap[providerType] || providerType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Storage methods (in production, these would use encrypted backend storage)
   */
  private static storeFolders(folders: RecordingFolder[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('healthnav_folders', JSON.stringify(folders));
      }
    } catch (error) {
      console.error('Error storing folders:', error);
    }
  }

  private static getStoredFolders(): RecordingFolder[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('healthnav_folders');
        return stored ? JSON.parse(stored) : [];
      }
      return [];
    } catch (error) {
      console.error('Error retrieving folders:', error);
      return [];
    }
  }

  /**
   * Validate folder name
   */
  static validateFolderName(name: string, userId: string, excludeFolderId?: string): string | null {
    const trimmed = name.trim();

    if (!trimmed) {
      return 'Folder name cannot be empty';
    }

    if (trimmed.length > 50) {
      return 'Folder name cannot exceed 50 characters';
    }

    // Check for duplicate names
    const userFolders = this.getUserFolders(userId);
    const duplicate = userFolders.find(folder =>
      folder.name.toLowerCase() === trimmed.toLowerCase() &&
      folder.id !== excludeFolderId
    );

    if (duplicate) {
      return 'A folder with this name already exists';
    }

    return null; // No validation errors
  }

  /**
   * Get folder statistics
   */
  static getFolderStats(userId: string): {
    totalFolders: number;
    totalRecordings: number;
    foldersByType: { [key: string]: number };
  } {
    const folders = this.getUserFolders(userId);
    const totalRecordings = folders.reduce((sum, folder) => sum + folder.recordingCount, 0);

    const foldersByType: { [key: string]: number } = {};
    folders.forEach(folder => {
      if (folder.providerType) {
        foldersByType[folder.providerType] = (foldersByType[folder.providerType] || 0) + 1;
      }
    });

    return {
      totalFolders: folders.length,
      totalRecordings,
      foldersByType
    };
  }
}