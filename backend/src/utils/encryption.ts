import crypto from 'crypto';
import config from '../config';

/**
 * Encryption utility for HIPAA-compliant data protection
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

/**
 * Generate a secure encryption key
 * @returns 32-byte encryption key in hex format
 */
export const generateEncryptionKey = (): string => {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
};

/**
 * Generate a secure initialization vector
 * @returns 16-byte IV in hex format
 */
export const generateIV = (): string => {
  return crypto.randomBytes(IV_LENGTH).toString('hex');
};

/**
 * Encrypt sensitive data
 * @param text - Plain text to encrypt
 * @returns Encrypted text in format: iv:encrypted:authTag
 */
export const encrypt = (text: string): string => {
  try {
    // Generate a random IV for each encryption
    const iv = crypto.randomBytes(IV_LENGTH);

    // Get encryption key from config
    const key = Buffer.from(config.encryption.key, 'hex');

    if (key.length !== KEY_LENGTH) {
      throw new Error('Invalid encryption key length. Must be 32 bytes.');
    }

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return format: iv:encrypted:authTag
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt encrypted data
 * @param encryptedText - Encrypted text in format: iv:encrypted:authTag
 * @returns Decrypted plain text
 */
export const decrypt = (encryptedText: string): string => {
  try {
    // Split the encrypted text into components
    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }

    const [ivHex, encrypted, authTagHex] = parts;

    // Convert from hex
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = Buffer.from(config.encryption.key, 'hex');

    if (key.length !== KEY_LENGTH) {
      throw new Error('Invalid encryption key length. Must be 32 bytes.');
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = require('bcrypt');
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 * @param password - Plain text password
 * @param hash - Hashed password
 * @returns True if password matches
 */
export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  const bcrypt = require('bcrypt');
  return await bcrypt.compare(password, hash);
};

/**
 * Generate a secure random token
 * @param length - Length of token in bytes (default 32)
 * @returns Hex-encoded random token
 */
export const generateSecureToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash data using SHA-256
 * @param data - Data to hash
 * @returns SHA-256 hash in hex format
 */
export const hashSHA256 = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

export default {
  generateEncryptionKey,
  generateIV,
  encrypt,
  decrypt,
  hashPassword,
  comparePassword,
  generateSecureToken,
  hashSHA256,
};
