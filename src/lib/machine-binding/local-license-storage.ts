/**
 * Local License Storage
 * Manages persistent storage of .LIC files and license metadata locally
 */

import fs from 'fs';
import path from 'path';
import { LicenseData } from './lic-file';
import { encrypt, decrypt, generateChecksum, verifyChecksum } from './encryption';

export interface StoredLicense {
  licenseData: LicenseData;
  licFileBuffer: Buffer;
  storedAt: Date;
  lastValidatedAt: Date;
  machineId: string;
  osHash?: string;
}

export interface StorageResult {
  success: boolean;
  error?: string;
}

export interface RetrievalResult {
  success: boolean;
  license?: StoredLicense;
  error?: string;
}

// Default storage directory
const DEFAULT_STORAGE_DIR = '.license-storage';

/**
 * Get storage directory path
 */
function getStorageDir(customDir?: string): string {
  return customDir || DEFAULT_STORAGE_DIR;
}

/**
 * Ensure storage directory exists
 */
function ensureStorageDir(storageDir: string): boolean {
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating storage directory:', error);
    return false;
  }
}

/**
 * Get license file path
 */
function getLicenseFilePath(storageDir: string, machineId: string): string {
  return path.join(storageDir, `license-${machineId}.bin`);
}

/**
 * Get metadata file path
 */
function getMetadataFilePath(storageDir: string, machineId: string): string {
  return path.join(storageDir, `metadata-${machineId}.json`);
}

/**
 * Store license locally
 * Encrypts and stores both .LIC file and metadata
 */
export function storeLicense(
  licenseData: LicenseData,
  licFileBuffer: Buffer,
  encryptionKey: Buffer,
  storageDir?: string,
  osHash?: string
): StorageResult {
  try {
    const dir = getStorageDir(storageDir);

    if (!ensureStorageDir(dir)) {
      return {
        success: false,
        error: 'Failed to create storage directory',
      };
    }

    const machineId = licenseData.machineId;
    const licenseFilePath = getLicenseFilePath(dir, machineId);
    const metadataFilePath = getMetadataFilePath(dir, machineId);

    // Encrypt and store .LIC file
    const encryptedLicFile = encrypt(licFileBuffer, encryptionKey);
    const licFileData = Buffer.concat([
      encryptedLicFile.iv,
      encryptedLicFile.encrypted,
      encryptedLicFile.authTag,
    ]);

    fs.writeFileSync(licenseFilePath, licFileData);

    // Store metadata
    const metadata = {
      licenseData: {
        ...licenseData,
        expiresAt: licenseData.expiresAt.toISOString(),
        createdAt: licenseData.createdAt.toISOString(),
      },
      storedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
      machineId,
      osHash: osHash || null,
    };

    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));

    return { success: true };
  } catch (error) {
    console.error('Error storing license:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to store license',
    };
  }
}

/**
 * Retrieve license from local storage
 * Decrypts and validates stored license
 */
export function retrieveLicense(
  machineId: string,
  encryptionKey: Buffer,
  storageDir?: string
): RetrievalResult {
  try {
    const dir = getStorageDir(storageDir);

    if (!ensureStorageDir(dir)) {
      return {
        success: false,
        error: 'Failed to access storage directory',
      };
    }

    const licenseFilePath = getLicenseFilePath(dir, machineId);
    const metadataFilePath = getMetadataFilePath(dir, machineId);

    // Check if files exist
    if (!fs.existsSync(licenseFilePath) || !fs.existsSync(metadataFilePath)) {
      return {
        success: false,
        error: 'License not found in local storage',
      };
    }

    // Read and decrypt .LIC file
    const licFileData = fs.readFileSync(licenseFilePath);

    // Extract components
    const iv = licFileData.slice(0, 16);
    const authTag = licFileData.slice(licFileData.length - 16);
    const encrypted = licFileData.slice(16, licFileData.length - 16);

    const decryptionResult = decrypt(encrypted, iv, authTag, encryptionKey);

    if (!decryptionResult.isValid) {
      return {
        success: false,
        error: decryptionResult.error || 'Failed to decrypt license file',
      };
    }

    // Read metadata
    const metadataContent = fs.readFileSync(metadataFilePath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Convert date strings back to Date objects
    const licenseData: LicenseData = {
      ...metadata.licenseData,
      expiresAt: new Date(metadata.licenseData.expiresAt),
      createdAt: new Date(metadata.licenseData.createdAt),
    };

    const storedLicense: StoredLicense = {
      licenseData,
      licFileBuffer: decryptionResult.decrypted,
      storedAt: new Date(metadata.storedAt),
      lastValidatedAt: new Date(metadata.lastValidatedAt),
      machineId,
      osHash: metadata.osHash || undefined,
    };

    return {
      success: true,
      license: storedLicense,
    };
  } catch (error) {
    console.error('Error retrieving license:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve license',
    };
  }
}

/**
 * Update license validation timestamp
 */
export function updateValidationTimestamp(
  machineId: string,
  storageDir?: string
): StorageResult {
  try {
    const dir = getStorageDir(storageDir);
    const metadataFilePath = getMetadataFilePath(dir, machineId);

    if (!fs.existsSync(metadataFilePath)) {
      return {
        success: false,
        error: 'License metadata not found',
      };
    }

    const metadataContent = fs.readFileSync(metadataFilePath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    metadata.lastValidatedAt = new Date().toISOString();

    fs.writeFileSync(metadataFilePath, JSON.stringify(metadata, null, 2));

    return { success: true };
  } catch (error) {
    console.error('Error updating validation timestamp:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update timestamp',
    };
  }
}

/**
 * Delete stored license
 */
export function deleteLicense(
  machineId: string,
  storageDir?: string
): StorageResult {
  try {
    const dir = getStorageDir(storageDir);
    const licenseFilePath = getLicenseFilePath(dir, machineId);
    const metadataFilePath = getMetadataFilePath(dir, machineId);

    if (fs.existsSync(licenseFilePath)) {
      fs.unlinkSync(licenseFilePath);
    }

    if (fs.existsSync(metadataFilePath)) {
      fs.unlinkSync(metadataFilePath);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting license:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete license',
    };
  }
}

/**
 * Check if license exists in local storage
 */
export function licenseExists(
  machineId: string,
  storageDir?: string
): boolean {
  try {
    const dir = getStorageDir(storageDir);
    const licenseFilePath = getLicenseFilePath(dir, machineId);
    const metadataFilePath = getMetadataFilePath(dir, machineId);

    return fs.existsSync(licenseFilePath) && fs.existsSync(metadataFilePath);
  } catch (error) {
    console.error('Error checking license existence:', error);
    return false;
  }
}

/**
 * Get all stored licenses
 */
export function getAllStoredLicenses(storageDir?: string): string[] {
  try {
    const dir = getStorageDir(storageDir);

    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir);
    const machineIds = new Set<string>();

    for (const file of files) {
      if (file.startsWith('metadata-') && file.endsWith('.json')) {
        const machineId = file.replace('metadata-', '').replace('.json', '');
        machineIds.add(machineId);
      }
    }

    return Array.from(machineIds);
  } catch (error) {
    console.error('Error getting stored licenses:', error);
    return [];
  }
}

/**
 * Get storage statistics
 */
export function getStorageStats(storageDir?: string): {
  totalLicenses: number;
  totalSize: number;
  licenses: Array<{ machineId: string; size: number; storedAt: Date }>;
} {
  try {
    const dir = getStorageDir(storageDir);

    if (!fs.existsSync(dir)) {
      return {
        totalLicenses: 0,
        totalSize: 0,
        licenses: [],
      };
    }

    const machineIds = getAllStoredLicenses(dir);
    let totalSize = 0;
    const licenses: Array<{ machineId: string; size: number; storedAt: Date }> = [];

    for (const machineId of machineIds) {
      const licenseFilePath = getLicenseFilePath(dir, machineId);
      const metadataFilePath = getMetadataFilePath(dir, machineId);

      if (fs.existsSync(licenseFilePath) && fs.existsSync(metadataFilePath)) {
        const licFileSize = fs.statSync(licenseFilePath).size;
        const metadataSize = fs.statSync(metadataFilePath).size;
        const size = licFileSize + metadataSize;

        const metadataContent = fs.readFileSync(metadataFilePath, 'utf-8');
        const metadata = JSON.parse(metadataContent);

        licenses.push({
          machineId,
          size,
          storedAt: new Date(metadata.storedAt),
        });

        totalSize += size;
      }
    }

    return {
      totalLicenses: machineIds.length,
      totalSize,
      licenses,
    };
  } catch (error) {
    console.error('Error getting storage stats:', error);
    return {
      totalLicenses: 0,
      totalSize: 0,
      licenses: [],
    };
  }
}

/**
 * Clear all stored licenses
 */
export function clearAllLicenses(storageDir?: string): StorageResult {
  try {
    const dir = getStorageDir(storageDir);

    if (!fs.existsSync(dir)) {
      return { success: true };
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (
        (file.startsWith('license-') && file.endsWith('.bin')) ||
        (file.startsWith('metadata-') && file.endsWith('.json'))
      ) {
        fs.unlinkSync(path.join(dir, file));
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error clearing licenses:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear licenses',
    };
  }
}
