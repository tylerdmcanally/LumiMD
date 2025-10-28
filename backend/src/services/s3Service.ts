import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import logger from '../utils/logger';
import { InternalServerError } from '../utils/errors';

/**
 * AWS S3 service for secure file storage
 * Handles audio file uploads with encryption
 */
class S3Service {
  private s3: AWS.S3;
  private bucket: string;

  constructor() {
    // Configure AWS
    AWS.config.update({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.region,
    });

    this.s3 = new AWS.S3({
      apiVersion: '2006-03-01',
      signatureVersion: 'v4',
    });

    this.bucket = config.aws.s3.bucket;
  }

  /**
   * Upload audio file to S3
   * @param filePath - Local path to audio file
   * @param userId - User ID for organizing files
   * @param visitId - Visit ID for organizing files
   * @returns S3 file URL and key
   */
  async uploadAudioFile(
    filePath: string,
    userId: string,
    visitId: string
  ): Promise<{ url: string; key: string; fileName: string }> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file
      const fileContent = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      const fileExt = path.extname(fileName);

      // Generate unique S3 key
      const timestamp = Date.now();
      const uniqueId = uuidv4();
      const s3Key = `audio/${userId}/${visitId}/${timestamp}-${uniqueId}${fileExt}`;

      logger.info('Uploading audio file to S3', {
        userId,
        visitId,
        fileName,
        fileSize: fileContent.length,
        s3Key,
      });

      // Upload parameters
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: this.getContentType(fileExt),
        ServerSideEncryption: 'AES256', // Enable server-side encryption
        Metadata: {
          userId,
          visitId,
          uploadedAt: new Date().toISOString(),
        },
      };

      // Upload to S3
      const result = await this.s3.upload(params).promise();

      logger.info('Audio file uploaded successfully', {
        url: result.Location,
        key: result.Key,
      });

      return {
        url: result.Location,
        key: result.Key,
        fileName,
      };
    } catch (error: any) {
      logger.error('S3 upload failed', {
        error: error.message,
        filePath,
        userId,
        visitId,
      });
      throw new InternalServerError(
        `File upload failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Upload file from buffer (for direct uploads)
   * @param buffer - File buffer
   * @param fileName - Original file name
   * @param userId - User ID
   * @param visitId - Visit ID
   * @returns S3 file URL and key
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    userId: string,
    visitId: string
  ): Promise<{ url: string; key: string; fileName: string }> {
    try {
      const fileExt = path.extname(fileName);
      const timestamp = Date.now();
      const uniqueId = uuidv4();
      const s3Key = `audio/${userId}/${visitId}/${timestamp}-${uniqueId}${fileExt}`;

      logger.info('Uploading buffer to S3', {
        userId,
        visitId,
        fileName,
        bufferSize: buffer.length,
        s3Key,
      });

      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: this.getContentType(fileExt),
        ServerSideEncryption: 'AES256',
        Metadata: {
          userId,
          visitId,
          uploadedAt: new Date().toISOString(),
        },
      };

      const result = await this.s3.upload(params).promise();

      logger.info('Buffer uploaded successfully', {
        url: result.Location,
        key: result.Key,
      });

      return {
        url: result.Location,
        key: result.Key,
        fileName,
      };
    } catch (error: any) {
      logger.error('S3 buffer upload failed', {
        error: error.message,
        fileName,
        userId,
        visitId,
      });
      throw new InternalServerError(
        `File upload failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Download file from S3 to local path
   * @param s3Key - S3 object key
   * @param destinationPath - Local path to save file
   */
  async downloadFile(s3Key: string, destinationPath: string): Promise<void> {
    try {
      logger.info('Downloading file from S3', { s3Key, destinationPath });

      const params: AWS.S3.GetObjectRequest = {
        Bucket: this.bucket,
        Key: s3Key,
      };

      const data = await this.s3.getObject(params).promise();

      if (!data.Body) {
        throw new Error('No file body returned from S3');
      }

      // Write to local file
      fs.writeFileSync(destinationPath, data.Body as Buffer);

      logger.info('File downloaded successfully', {
        s3Key,
        destinationPath,
      });
    } catch (error: any) {
      logger.error('S3 download failed', {
        error: error.message,
        s3Key,
      });
      throw new InternalServerError(
        `File download failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Get signed URL for temporary file access
   * @param s3Key - S3 object key
   * @param expiresIn - Expiration time in seconds (default 1 hour)
   * @returns Signed URL
   */
  async getSignedUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const params = {
        Bucket: this.bucket,
        Key: s3Key,
        Expires: expiresIn,
      };

      const url = await this.s3.getSignedUrlPromise('getObject', params);

      logger.info('Generated signed URL', { s3Key, expiresIn });

      return url;
    } catch (error: any) {
      logger.error('Failed to generate signed URL', {
        error: error.message,
        s3Key,
      });
      throw new InternalServerError(
        `Failed to generate signed URL: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Delete file from S3
   * @param s3Key - S3 object key
   */
  async deleteFile(s3Key: string): Promise<void> {
    try {
      logger.info('Deleting file from S3', { s3Key });

      const params: AWS.S3.DeleteObjectRequest = {
        Bucket: this.bucket,
        Key: s3Key,
      };

      await this.s3.deleteObject(params).promise();

      logger.info('File deleted successfully', { s3Key });
    } catch (error: any) {
      logger.error('S3 deletion failed', {
        error: error.message,
        s3Key,
      });
      throw new InternalServerError(
        `File deletion failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  /**
   * Check if bucket exists and is accessible
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.s3.headBucket({ Bucket: this.bucket }).promise();
      logger.info('S3 bucket accessible', { bucket: this.bucket });
      return true;
    } catch (error: any) {
      logger.error('S3 bucket not accessible', {
        error: error.message,
        bucket: this.bucket,
      });
      return false;
    }
  }

  /**
   * Get content type from file extension
   */
  private getContentType(extension: string): string {
    const contentTypes: { [key: string]: string } = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.mp4': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
    };

    return contentTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

export default new S3Service();
