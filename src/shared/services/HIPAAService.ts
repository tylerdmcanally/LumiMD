import { EncryptionService } from './EncryptionService';
import { SecureStorageService } from './SecureStorageService';

export interface HIPAAComplianceStatus {
  encryptionSupported: boolean;
  encryptionEnabled: boolean;
  dataInventory: {
    recordings: number;
    transcriptions: number;
    summaries: number;
  };
  auditLogCount: number;
  securityEvents: number;
  complianceScore: number; // 0-100
  recommendations: string[];
}

export interface DataSubjectRights {
  canAccessData: boolean;
  canPortData: boolean;
  canDeleteData: boolean;
  canRectifyData: boolean;
  lastDataExport?: Date;
}

export class HIPAAService {
  private static isInitialized = false;

  /**
   * Initialize HIPAA compliance services
   */
  static async initialize(): Promise<boolean> {
    try {
      console.log('Initializing HIPAA compliance services...');

      // Check encryption support
      const encryptionStatus = EncryptionService.validateEncryptionSupport();
      if (!encryptionStatus.supported) {
        console.error('HIPAA Compliance Error: Encryption not supported');
        console.error('Issues:', encryptionStatus.issues);
        return false;
      }

      // Initialize encryption service with existing keys
      await EncryptionService.initializeFromStorage();

      // Log initialization
      console.log('HIPAA services initialized successfully');
      console.log('Encryption support:', encryptionStatus);

      this.isInitialized = true;
      return true;

    } catch (error) {
      console.error('Failed to initialize HIPAA services:', error);
      return false;
    }
  }

  /**
   * Get comprehensive compliance status
   */
  static async getComplianceStatus(userId: string): Promise<HIPAAComplianceStatus> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const encryptionStatus = EncryptionService.validateEncryptionSupport();
      const dataInventory = await SecureStorageService.getUserDataInventory(userId);
      const auditLogs = this.getAuditLogCount();
      const securityEvents = this.getSecurityEventCount();

      // Calculate compliance score
      let score = 0;
      const recommendations: string[] = [];

      // Encryption (40 points)
      if (encryptionStatus.supported && encryptionStatus.webCrypto) {
        score += 40;
      } else {
        recommendations.push('Enable encryption support (Web Crypto API required)');
      }

      // Data governance (20 points)
      if (dataInventory.recordings.length > 0 || dataInventory.transcriptions.length > 0 || dataInventory.summaries.length > 0) {
        score += 20;
      }

      // Audit logging (20 points)
      if (auditLogs > 0) {
        score += 20;
      } else {
        recommendations.push('Enable audit logging for all data access');
      }

      // Security monitoring (20 points)
      if (securityEvents === 0) {
        score += 20; // No security incidents is good
      } else {
        recommendations.push('Address security incidents in audit log');
      }

      // Additional recommendations
      if (typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        recommendations.push('Use HTTPS in production for data transmission security');
      }

      if (dataInventory.recordings.length > 100) {
        recommendations.push('Consider implementing data retention policies for old recordings');
      }

      return {
        encryptionSupported: encryptionStatus.supported,
        encryptionEnabled: encryptionStatus.supported,
        dataInventory: {
          recordings: dataInventory.recordings.length,
          transcriptions: dataInventory.transcriptions.length,
          summaries: dataInventory.summaries.length
        },
        auditLogCount: auditLogs,
        securityEvents,
        complianceScore: score,
        recommendations
      };

    } catch (error) {
      console.error('Error getting compliance status:', error);
      return {
        encryptionSupported: false,
        encryptionEnabled: false,
        dataInventory: { recordings: 0, transcriptions: 0, summaries: 0 },
        auditLogCount: 0,
        securityEvents: 0,
        complianceScore: 0,
        recommendations: ['Error assessing compliance status']
      };
    }
  }

  /**
   * Data subject rights implementation
   */
  static async getDataSubjectRights(userId: string): Promise<DataSubjectRights> {
    try {
      return {
        canAccessData: true,
        canPortData: true,
        canDeleteData: true,
        canRectifyData: true,
        lastDataExport: this.getLastDataExport(userId)
      };
    } catch (error) {
      console.error('Error getting data subject rights:', error);
      return {
        canAccessData: false,
        canPortData: false,
        canDeleteData: false,
        canRectifyData: false
      };
    }
  }

  /**
   * Export all user data (GDPR/HIPAA requirement)
   */
  static async exportUserData(userId: string): Promise<{
    success: boolean;
    data?: any;
    downloadUrl?: string;
    error?: string;
  }> {
    try {
      const dataInventory = await SecureStorageService.getUserDataInventory(userId);
      const exportData: any = {
        exportDate: new Date().toISOString(),
        userId,
        summary: {
          totalRecordings: dataInventory.recordings.length,
          totalTranscriptions: dataInventory.transcriptions.length,
          totalSummaries: dataInventory.summaries.length,
          dataRange: {
            from: dataInventory.oldestRecord,
            to: dataInventory.newestRecord
          }
        },
        recordings: [],
        transcriptions: [],
        summaries: []
      };

      // Export recordings (decrypt for export)
      for (const recordingMeta of dataInventory.recordings) {
        try {
          const recording = await SecureStorageService.retrieveRecordingSecurely(recordingMeta.id, userId);
          if (recording) {
            // Remove sensitive system fields
            const { audioUrl, ...exportableRecording } = recording;
            exportData.recordings.push(exportableRecording);
          }
        } catch (error) {
          console.error('Error exporting recording:', recordingMeta.id, error);
        }
      }

      // Export transcriptions
      for (const transcriptionMeta of dataInventory.transcriptions) {
        try {
          const transcription = await SecureStorageService.retrieveTranscriptionSecurely(transcriptionMeta.id, userId);
          if (transcription) {
            exportData.transcriptions.push(transcription);
          }
        } catch (error) {
          console.error('Error exporting transcription:', transcriptionMeta.id, error);
        }
      }

      // Export summaries
      for (const summaryMeta of dataInventory.summaries) {
        try {
          const summary = await SecureStorageService.retrieveSummarySecurely(summaryMeta.id, userId);
          if (summary) {
            exportData.summaries.push(summary);
          }
        } catch (error) {
          console.error('Error exporting summary:', summaryMeta.id, error);
        }
      }

      // Create downloadable file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const downloadUrl = URL.createObjectURL(blob);

      // Record export activity
      this.recordDataExport(userId);

      return {
        success: true,
        data: exportData,
        downloadUrl
      };

    } catch (error) {
      console.error('Error exporting user data:', error);
      return {
        success: false,
        error: error.message || 'Data export failed'
      };
    }
  }

  /**
   * Securely delete all user data (GDPR right to be forgotten)
   */
  static async deleteAllUserData(userId: string, confirmationToken: string): Promise<{
    success: boolean;
    deletedItems: number;
    error?: string;
  }> {
    try {
      // Verify confirmation (in production, use proper authentication)
      if (confirmationToken !== `delete_${userId}_confirmed`) {
        throw new Error('Invalid confirmation token');
      }

      const dataInventory = await SecureStorageService.getUserDataInventory(userId);
      let deletedItems = 0;

      // Delete recordings
      for (const recordingMeta of dataInventory.recordings) {
        const success = await SecureStorageService.secureDeleteData(recordingMeta.id, 'recording', userId);
        if (success) deletedItems++;
      }

      // Delete transcriptions
      for (const transcriptionMeta of dataInventory.transcriptions) {
        const success = await SecureStorageService.secureDeleteData(transcriptionMeta.id, 'transcription', userId);
        if (success) deletedItems++;
      }

      // Delete summaries
      for (const summaryMeta of dataInventory.summaries) {
        const success = await SecureStorageService.secureDeleteData(summaryMeta.id, 'summary', userId);
        if (success) deletedItems++;
      }

      // Rotate encryption keys to ensure deleted data cannot be recovered
      await EncryptionService.rotateUserKeys(userId);

      console.log(`Deleted ${deletedItems} items for user: ${userId}`);

      return {
        success: true,
        deletedItems
      };

    } catch (error) {
      console.error('Error deleting user data:', error);
      return {
        success: false,
        deletedItems: 0,
        error: error.message || 'Data deletion failed'
      };
    }
  }

  /**
   * Generate HIPAA compliance report
   */
  static async generateComplianceReport(userId: string): Promise<{
    reportDate: Date;
    complianceStatus: HIPAAComplianceStatus;
    dataSubjectRights: DataSubjectRights;
    auditSummary: {
      totalEvents: number;
      recentEvents: any[];
      securityIncidents: number;
    };
    recommendations: string[];
  }> {
    try {
      const complianceStatus = await this.getComplianceStatus(userId);
      const dataSubjectRights = await this.getDataSubjectRights(userId);
      const auditEvents = this.getRecentAuditEvents(10);
      const securityEvents = this.getRecentSecurityEvents(10);

      return {
        reportDate: new Date(),
        complianceStatus,
        dataSubjectRights,
        auditSummary: {
          totalEvents: auditEvents.length,
          recentEvents: auditEvents,
          securityIncidents: securityEvents.length
        },
        recommendations: [
          ...complianceStatus.recommendations,
          'Regularly review and update data retention policies',
          'Conduct periodic security assessments',
          'Maintain current encryption standards',
          'Monitor audit logs for suspicious activity'
        ]
      };

    } catch (error) {
      console.error('Error generating compliance report:', error);
      throw new Error('Failed to generate compliance report');
    }
  }

  /**
   * Helper methods
   */
  private static getAuditLogCount(): number {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const logs = JSON.parse(localStorage.getItem('healthnav_hipaa_audit') || '[]');
        return logs.length;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  private static getSecurityEventCount(): number {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const events = JSON.parse(localStorage.getItem('healthnav_security_events') || '[]');
        return events.length;
      }
      return 0;
    } catch (error) {
      return 0;
    }
  }

  private static getRecentAuditEvents(limit: number = 10): any[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const logs = JSON.parse(localStorage.getItem('healthnav_hipaa_audit') || '[]');
        return logs.slice(-limit);
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  private static getRecentSecurityEvents(limit: number = 10): any[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const events = JSON.parse(localStorage.getItem('healthnav_security_events') || '[]');
        return events.slice(-limit);
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  private static recordDataExport(userId: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const exports = JSON.parse(localStorage.getItem('healthnav_data_exports') || '[]');
        exports.push({
          userId,
          exportDate: new Date().toISOString(),
          type: 'full_data_export'
        });
        localStorage.setItem('healthnav_data_exports', JSON.stringify(exports));
      }
    } catch (error) {
      console.error('Error recording data export:', error);
    }
  }

  private static getLastDataExport(userId: string): Date | undefined {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const exports = JSON.parse(localStorage.getItem('healthnav_data_exports') || '[]');
        const userExports = exports.filter((exp: any) => exp.userId === userId);
        if (userExports.length > 0) {
          return new Date(userExports[userExports.length - 1].exportDate);
        }
      }
      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Validate data integrity across the system
   */
  static async validateDataIntegrity(userId: string): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      const dataInventory = await SecureStorageService.getUserDataInventory(userId);

      // Check for orphaned data
      const recordingIds = new Set(dataInventory.recordings.map(r => r.id));
      const transcriptionRecordingIds = dataInventory.transcriptions.map(t => t.recordingId);
      const summaryRecordingIds = dataInventory.summaries.map(s => s.recordingId);

      // Find orphaned transcriptions
      const orphanedTranscriptions = transcriptionRecordingIds.filter(rid => !recordingIds.has(rid));
      if (orphanedTranscriptions.length > 0) {
        issues.push(`Found ${orphanedTranscriptions.length} orphaned transcriptions`);
        recommendations.push('Clean up orphaned transcription data');
      }

      // Find orphaned summaries
      const orphanedSummaries = summaryRecordingIds.filter(rid => !recordingIds.has(rid));
      if (orphanedSummaries.length > 0) {
        issues.push(`Found ${orphanedSummaries.length} orphaned summaries`);
        recommendations.push('Clean up orphaned summary data');
      }

      // Check encryption status
      const encryptionStatus = EncryptionService.validateEncryptionSupport();
      if (!encryptionStatus.supported) {
        issues.push('Encryption not supported - data may be stored unencrypted');
        recommendations.push('Upgrade to environment with Web Crypto API support');
      }

      return {
        valid: issues.length === 0,
        issues,
        recommendations
      };

    } catch (error) {
      console.error('Error validating data integrity:', error);
      return {
        valid: false,
        issues: ['Error validating data integrity'],
        recommendations: ['Investigate data integrity validation errors']
      };
    }
  }
}