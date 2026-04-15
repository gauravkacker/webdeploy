/**
 * .LIC File Format Implementation
 * Defines the binary format for machine-bound license files
 */

import crypto from 'crypto';
import { encrypt, decrypt, generateChecksum, verifyChecksum } from './encryption';
import type { AuthorizedMachine } from '../db/schema';

// Legacy v1.0 format (single Machine ID)
export interface LicenseData {
  licenseKey: string;
  customerId: string;
  machineId: string;
  machineIdHash: string;
  expiresAt: Date;
  modules: string[];
  maxPrescriptions?: number;
  createdAt: Date;
}

// v2.0 format (multi-PC support)
export interface LicenseDataV2 {
  licenseKey: string;
  customerId: string;
  
  // Multi-PC fields
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  authorizedMachines: AuthorizedMachine[]; // Array of authorized Machine IDs
  
  // Legacy compatibility (deprecated in v2.0, kept for migration)
  machineId?: string;
  machineIdHash?: string;
  
  // Standard fields
  expiresAt: Date;
  modules: string[];
  maxPrescriptions?: number;
  createdAt: Date;
  formatVersion: string; // "2.0"
}

export interface LicFileHeader {
  version: number;
  algorithm: string;
  timestamp: number;
}

export interface LicFileStructure {
  header: LicFileHeader;
  encryptedPayload: Buffer;
  iv: Buffer;
  authTag: Buffer;
  checksum: Buffer;
}

// .LIC file format versions
const LIC_FILE_VERSION_V1 = 1;
const LIC_FILE_VERSION_V2 = 2;
const LIC_FILE_VERSION = LIC_FILE_VERSION_V1; // Default for v1.0 compatibility
const LIC_ALGORITHM = 'aes-256-gcm';

/**
 * Create v2.0 .LIC file from license data (supports multi-PC)
 * Returns binary buffer ready to be written to disk
 */
export function createLicFileV2(
  licenseData: LicenseDataV2,
  encryptionKey: Buffer
): Buffer {
  // Serialize license data to JSON
  const licenseJson = JSON.stringify({
    licenseKey: licenseData.licenseKey,
    customerId: licenseData.customerId,
    licenseType: licenseData.licenseType,
    maxMachines: licenseData.maxMachines,
    authorizedMachines: licenseData.authorizedMachines,
    expiresAt: licenseData.expiresAt.toISOString(),
    modules: licenseData.modules,
    maxPrescriptions: licenseData.maxPrescriptions,
    createdAt: licenseData.createdAt.toISOString(),
    formatVersion: '2.0',
  });

  const payloadBuffer = Buffer.from(licenseJson, 'utf-8');

  // Encrypt payload
  const encryptionResult = encrypt(payloadBuffer, encryptionKey);

  // Create header with v2 marker
  const header = Buffer.alloc(20); // Extended header for v2
  header.writeUInt8(LIC_FILE_VERSION_V2, 0);
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 4);
  header.write(LIC_ALGORITHM.padEnd(11, '\0'), 5, 11, 'utf-8');
  header.write('2.0\0', 16, 4, 'utf-8'); // Format version marker

  // Combine all components
  const combined = Buffer.concat([
    header,
    encryptionResult.iv,
    encryptionResult.encrypted,
    encryptionResult.authTag,
  ]);

  // Generate checksum
  const checksum = generateChecksum(combined);

  // Final .LIC file: combined + checksum
  const licFile = Buffer.concat([combined, checksum]);

  return licFile;
}

/**
 * Create v1.0 .LIC file from license data (legacy single-PC)
 * Returns binary buffer ready to be written to disk
 */
export function createLicFile(
  licenseData: LicenseData,
  encryptionKey: Buffer
): Buffer {
  // Serialize license data to JSON
  const licenseJson = JSON.stringify({
    licenseKey: licenseData.licenseKey,
    customerId: licenseData.customerId,
    machineId: licenseData.machineId,
    machineIdHash: licenseData.machineIdHash,
    expiresAt: licenseData.expiresAt.toISOString(),
    modules: licenseData.modules,
    maxPrescriptions: licenseData.maxPrescriptions,
    createdAt: licenseData.createdAt.toISOString(),
  });

  const payloadBuffer = Buffer.from(licenseJson, 'utf-8');

  // Encrypt payload
  const encryptionResult = encrypt(payloadBuffer, encryptionKey);

  // Create header
  const header = Buffer.alloc(16);
  header.writeUInt8(LIC_FILE_VERSION, 0);
  header.writeUInt32BE(Math.floor(Date.now() / 1000), 4);
  header.write(LIC_ALGORITHM.padEnd(11, '\0'), 5, 11, 'utf-8');

  // Combine all components
  const combined = Buffer.concat([
    header,
    encryptionResult.iv,
    encryptionResult.encrypted,
    encryptionResult.authTag,
  ]);

  // Generate checksum
  const checksum = generateChecksum(combined);

  // Final .LIC file: combined + checksum
  const licFile = Buffer.concat([combined, checksum]);

  return licFile;
}

/**
 * Parse .LIC file and extract license data
 * Automatically detects v1.0 or v2.0 format
 * Validates file integrity and decrypts content
 */
export function parseLicFile(
  licFileBuffer: Buffer,
  encryptionKey: Buffer
): { data: LicenseDataV2 | null; error?: string; version?: number } {
  try {
    // Minimum size: header(16) + iv(16) + encrypted(min 1) + authTag(16) + checksum(32)
    if (licFileBuffer.length < 81) {
      return { data: null, error: 'Invalid .LIC file size' };
    }

    // Extract checksum (last 32 bytes)
    const checksum = licFileBuffer.slice(licFileBuffer.length - 32);
    const fileContent = licFileBuffer.slice(0, licFileBuffer.length - 32);

    // Verify checksum
    if (!verifyChecksum(fileContent, checksum)) {
      return { data: null, error: 'Checksum verification failed - file may be corrupted' };
    }

    // Extract header
    const headerSize = fileContent.length >= 20 && fileContent.readUInt8(0) === LIC_FILE_VERSION_V2 ? 20 : 16;
    const header = fileContent.slice(0, headerSize);
    const version = header.readUInt8(0);
    const timestamp = header.readUInt32BE(4);
    const algorithm = header.toString('utf-8', 5, 16).replace(/\0/g, '');

    // Validate version
    if (version !== LIC_FILE_VERSION_V1 && version !== LIC_FILE_VERSION_V2) {
      return { data: null, error: `Unsupported .LIC file version: ${version}` };
    }

    // Validate algorithm
    if (algorithm !== LIC_ALGORITHM) {
      return { data: null, error: `Unsupported encryption algorithm: ${algorithm}` };
    }

    // Extract format version for v2
    let formatVersion = '1.0';
    if (version === LIC_FILE_VERSION_V2 && headerSize === 20) {
      formatVersion = header.toString('utf-8', 16, 20).replace(/\0/g, '');
    }

    // Extract IV, encrypted data, and auth tag
    const iv = fileContent.slice(headerSize, headerSize + 16);
    const authTag = fileContent.slice(fileContent.length - 16);
    const encrypted = fileContent.slice(headerSize + 16, fileContent.length - 16);

    // Decrypt payload
    const decryptionResult = decrypt(encrypted, iv, authTag, encryptionKey);

    if (!decryptionResult.isValid) {
      return { data: null, error: `Decryption failed: ${decryptionResult.error}` };
    }

    try {
      const licenseJson = decryptionResult.decrypted.toString('utf-8');
      const licenseData = JSON.parse(licenseJson);

      if (!licenseData) {
        return { data: null, error: 'Empty license data in .LIC file' };
      }
    } catch (error) {
      return { data: null, error: 'Invalid JSON in .LIC file' };
    }

    // Detect format version from payload if not in header
    const payloadFormatVersion = licenseData.formatVersion || '1.0';

    // Handle v1.0 format (convert to v2.0 internally)
    if (payloadFormatVersion === '1.0' || version === LIC_FILE_VERSION_V1) {
      // Validate v1.0 required fields
      const requiredFields = [
        'licenseKey',
        'customerId',
        'machineId',
        'machineIdHash',
        'expiresAt',
        'modules',
      ];

      for (const field of requiredFields) {
        if (!(field in licenseData)) {
          return { data: null, error: `Missing required field in .LIC file: ${field}` };
        }
      }

      // Convert v1.0 to v2.0 format
      const expiresAt = new Date(licenseData.expiresAt);
      const createdAt = new Date(licenseData.createdAt);

      if (isNaN(expiresAt.getTime()) || isNaN(createdAt.getTime())) {
        return { data: null, error: 'Invalid date format in .LIC file' };
      }

      if (!Array.isArray(licenseData.modules)) {
        return { data: null, error: 'Modules must be an array' };
      }

      const result: LicenseDataV2 = {
        licenseKey: licenseData.licenseKey,
        customerId: licenseData.customerId,
        licenseType: 'single-pc',
        maxMachines: 1,
        authorizedMachines: [
          {
            machineId: licenseData.machineId,
            machineIdHash: licenseData.machineIdHash,
            addedAt: createdAt.toISOString(),
            addedBy: 'system',
          },
        ],
        machineId: licenseData.machineId, // Keep for backward compatibility
        machineIdHash: licenseData.machineIdHash,
        expiresAt,
        modules: licenseData.modules,
        maxPrescriptions: licenseData.maxPrescriptions,
        createdAt,
        formatVersion: '1.0', // Mark as migrated from v1.0
      };

      return { data: result, version: 1 };
    }

    // Handle v2.0 format
    const requiredFieldsV2 = [
      'licenseKey',
      'customerId',
      'licenseType',
      'maxMachines',
      'authorizedMachines',
      'expiresAt',
      'modules',
    ];

    for (const field of requiredFieldsV2) {
      if (!(field in licenseData)) {
        return { data: null, error: `Missing required field: ${field}` };
      }
    }

    // Validate license type
    if (licenseData.licenseType !== 'single-pc' && licenseData.licenseType !== 'multi-pc') {
      return { data: null, error: `Invalid license type: ${licenseData.licenseType}` };
    }

    // Validate max machines
    if (typeof licenseData.maxMachines !== 'number' || licenseData.maxMachines < 1 || licenseData.maxMachines > 100) {
      return { data: null, error: `Invalid maxMachines: ${licenseData.maxMachines}` };
    }

    // Validate authorized machines array
    if (!Array.isArray(licenseData.authorizedMachines)) {
      return { data: null, error: 'authorizedMachines must be an array' };
    }

    if (licenseData.authorizedMachines.length === 0) {
      return { data: null, error: 'authorizedMachines cannot be empty' };
    }

    if (licenseData.authorizedMachines.length > licenseData.maxMachines) {
      return { data: null, error: `authorizedMachines count (${licenseData.authorizedMachines.length}) exceeds maxMachines (${licenseData.maxMachines})` };
    }

    // Convert dates
    const expiresAt = new Date(licenseData.expiresAt);
    const createdAt = new Date(licenseData.createdAt);

    if (isNaN(expiresAt.getTime()) || isNaN(createdAt.getTime())) {
      return { data: null, error: 'Invalid date format in .LIC file' };
    }

    // Validate modules array
    if (!Array.isArray(licenseData.modules)) {
      return { data: null, error: 'Modules must be an array' };
    }

    const result: LicenseDataV2 = {
      licenseKey: licenseData.licenseKey,
      customerId: licenseData.customerId,
      licenseType: licenseData.licenseType,
      maxMachines: licenseData.maxMachines,
      authorizedMachines: licenseData.authorizedMachines,
      expiresAt,
      modules: licenseData.modules,
      maxPrescriptions: licenseData.maxPrescriptions,
      createdAt,
      formatVersion: '2.0',
    };

    return { data: result, version: 2 };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to parse .LIC file',
    };
  }
}

/**
 * Validate .LIC file without decrypting
 * Checks file structure and integrity
 * Supports both v1.0 and v2.0 formats
 */
export function validateLicFileStructure(licFileBuffer: Buffer): {
  valid: boolean;
  error?: string;
  version?: number;
} {
  try {
    // Check minimum size
    if (licFileBuffer.length < 81) {
      return { valid: false, error: 'Invalid .LIC file size' };
    }

    // Extract checksum
    const checksum = licFileBuffer.slice(licFileBuffer.length - 32);
    const fileContent = licFileBuffer.slice(0, licFileBuffer.length - 32);

    // Verify checksum
    if (!verifyChecksum(fileContent, checksum)) {
      return { valid: false, error: 'Checksum verification failed' };
    }

    // Detect version from first byte
    const version = fileContent.readUInt8(0);
    
    // Determine header size
    const headerSize = version === LIC_FILE_VERSION_V2 ? 20 : 16;
    const header = fileContent.slice(0, headerSize);
    const algorithm = header.toString('utf-8', 5, 16).replace(/\0/g, '');

    if (version !== LIC_FILE_VERSION_V1 && version !== LIC_FILE_VERSION_V2) {
      return { valid: false, error: `Unsupported version: ${version}` };
    }

    if (algorithm !== LIC_ALGORITHM) {
      return { valid: false, error: `Unsupported algorithm: ${algorithm}` };
    }

    return { valid: true, version };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Get .LIC file size estimate for v2.0
 */
export function estimateLicFileV2Size(licenseData: LicenseDataV2): number {
  // Estimate JSON size
  const jsonSize = JSON.stringify(licenseData).length;

  // Add encryption overhead
  // header(20) + iv(16) + encrypted(jsonSize + padding) + authTag(16) + checksum(32)
  const encryptedSize = Math.ceil(jsonSize / 16) * 16; // AES block size
  const totalSize = 20 + 16 + encryptedSize + 16 + 32;

  return totalSize;
}

/**
 * Get .LIC file size estimate
 * Useful for validation
 */
export function estimateLicFileSize(licenseData: LicenseData): number {
  // Estimate JSON size
  const jsonSize = JSON.stringify(licenseData).length;

  // Add encryption overhead
  // header(16) + iv(16) + encrypted(jsonSize + padding) + authTag(16) + checksum(32)
  const encryptedSize = Math.ceil(jsonSize / 16) * 16; // AES block size
  const totalSize = 16 + 16 + encryptedSize + 16 + 32;

  return totalSize;
}

/**
 * Export .LIC file as base64 for transmission
 */
export function exportLicFileAsBase64(licFileBuffer: Buffer): string {
  return licFileBuffer.toString('base64');
}

/**
 * Import .LIC file from base64
 */
export function importLicFileFromBase64(base64Data: string): Buffer {
  return Buffer.from(base64Data, 'base64');
}
