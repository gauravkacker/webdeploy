/**
 * Encryption Utilities for .LIC Files
 * Provides AES-256-GCM encryption/decryption for machine-bound license files
 */

import crypto from 'crypto';

export interface EncryptionResult {
  encrypted: Buffer;
  iv: Buffer;
  authTag: Buffer;
  algorithm: string;
}

export interface DecryptionResult {
  decrypted: Buffer;
  isValid: boolean;
  error?: string;
}

// Encryption algorithm and key size
const ALGORITHM = 'aes-256-gcm';
const KEY_SIZE = 32; // 256 bits
const IV_SIZE = 16; // 128 bits
const AUTH_TAG_SIZE = 16; // 128 bits

/**
 * Generate a secure encryption key
 * Should be stored securely and not hardcoded
 */
export function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(KEY_SIZE);
}

/**
 * Derive encryption key from a passphrase
 * Uses PBKDF2 for key derivation
 */
export function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Buffer = crypto.randomBytes(16)
): { key: Buffer; salt: Buffer } {
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, KEY_SIZE, 'sha256');
  return { key, salt };
}

/**
 * Encrypt data using AES-256-GCM
 * Returns encrypted data with IV and authentication tag
 */
export function encrypt(
  data: Buffer,
  encryptionKey: Buffer
): EncryptionResult {
  if (encryptionKey.length !== KEY_SIZE) {
    throw new Error(`Encryption key must be ${KEY_SIZE} bytes`);
  }

  // Generate random IV
  const iv = crypto.randomBytes(IV_SIZE);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

  // Encrypt data
  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final(),
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv,
    authTag,
    algorithm: ALGORITHM,
  };
}

/**
 * Decrypt data using AES-256-GCM
 * Verifies authentication tag for integrity
 */
export function decrypt(
  encrypted: Buffer,
  iv: Buffer,
  authTag: Buffer,
  encryptionKey: Buffer
): DecryptionResult {
  try {
    if (encryptionKey.length !== KEY_SIZE) {
      return {
        decrypted: Buffer.alloc(0),
        isValid: false,
        error: `Encryption key must be ${KEY_SIZE} bytes`,
      };
    }

    if (iv.length !== IV_SIZE) {
      return {
        decrypted: Buffer.alloc(0),
        isValid: false,
        error: `IV must be ${IV_SIZE} bytes`,
      };
    }

    if (authTag.length !== AUTH_TAG_SIZE) {
      return {
        decrypted: Buffer.alloc(0),
        isValid: false,
        error: `Authentication tag must be ${AUTH_TAG_SIZE} bytes`,
      };
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);

    // Set authentication tag
    decipher.setAuthTag(authTag);

    // Decrypt data
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return {
      decrypted,
      isValid: true,
    };
  } catch (error) {
    return {
      decrypted: Buffer.alloc(0),
      isValid: false,
      error: error instanceof Error ? error.message : 'Decryption failed',
    };
  }
}

/**
 * Encrypt data and return as base64 string
 * Useful for transmission and storage
 */
export function encryptToBase64(
  data: Buffer,
  encryptionKey: Buffer
): string {
  const result = encrypt(data, encryptionKey);

  // Combine IV, encrypted data, and auth tag
  const combined = Buffer.concat([
    result.iv,
    result.encrypted,
    result.authTag,
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt data from base64 string
 * Extracts IV and auth tag from combined buffer
 */
export function decryptFromBase64(
  base64Data: string,
  encryptionKey: Buffer
): DecryptionResult {
  try {
    const combined = Buffer.from(base64Data, 'base64');

    // Extract components
    const iv = combined.slice(0, IV_SIZE);
    const authTag = combined.slice(combined.length - AUTH_TAG_SIZE);
    const encrypted = combined.slice(IV_SIZE, combined.length - AUTH_TAG_SIZE);

    return decrypt(encrypted, iv, authTag, encryptionKey);
  } catch (error) {
    return {
      decrypted: Buffer.alloc(0),
      isValid: false,
      error: error instanceof Error ? error.message : 'Base64 decryption failed',
    };
  }
}

/**
 * Generate HMAC for data integrity verification
 * Used as additional integrity check beyond GCM
 */
export function generateHmac(data: Buffer, key: Buffer): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * Verify HMAC
 */
export function verifyHmac(data: Buffer, hmac: Buffer, key: Buffer): boolean {
  const generated = generateHmac(data, key);
  return crypto.timingSafeEqual(generated, hmac);
}

/**
 * Generate checksum for file integrity
 * Used to detect file corruption
 */
export function generateChecksum(data: Buffer): Buffer {
  return crypto.createHash('sha256').update(data).digest();
}

/**
 * Verify checksum
 */
export function verifyChecksum(data: Buffer, checksum: Buffer): boolean {
  const generated = generateChecksum(data);
  return crypto.timingSafeEqual(generated, checksum);
}
