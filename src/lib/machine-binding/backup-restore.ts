/**
 * Backup & Restore Functionality
 * Manages backup and restore of .LIC files for disaster recovery
 * Implements BR10: Backup & Restore requirement
 */

import fs from 'fs';
import path from 'path';
import { LicenseData } from './lic-file';
import { encrypt, decrypt, generateChecksum, verifyChecksum } from './encryption';
import { retrieveLicense } from './local-license-storage';

export interface BackupMetadata {
  backupId: string;
  machineId: string;
  machineIdHash: string;
  timestamp: Date;
  licenseKey: string;
  expiresAt: Date;
  modules: string[];
  version: number;
  checksum: string;
}

export interface BackupInfo {
  backupId: string;
  machineId: string;
  timestamp: Date;
  size: number;
  licenseKey: string;
  expiresAt: Date;
  checksum: string;
}

export interface BackupResult {
  success: boolean;
  backupId?: string;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  licenseData?: LicenseData;
  licFileBuffer?: Buffer;
  error?: string;
}

export interface ListBackupsResult {
  success: boolean;
  backups?: BackupInfo[];
  error?: string;
}

export interface DeleteBackupResult {
  success: boolean;
  error?: string;
}

// Default backup directory
const DEFAULT_BACKUP_DIR = '.license-backups';
const BACKUP_VERSION = 1;

/**
 * Get backup directory path
 */
function getBackupDir(customDir?: string): string {
  return customDir || DEFAULT_BACKUP_DIR;
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(backupDir: string): boolean {
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating backup directory:', error);
    return false;
  }
}

/**
 * Generate backup ID
 */
function generateBackupId(machineId: string, timestamp: Date): string {
  const timestampStr = timestamp.getTime().toString();
  return `backup-${machineId}-${timestampStr}`;
}

/**
 * Get backup file path
 */
function getBackupFilePath(backupDir: string, backupId: string): string {
  return path.join(backupDir, `${backupId}.bin`);
}

/**
 * Get backup metadata file path
 */
function getBackupMetadataPath(backupDir: string, backupId: string): string {
  return path.join(backupDir, `${backupId}.json`);
}

/**
 * Create backup of .LIC file and metadata
 * Encrypts backup file for security
 */
export function backupLicense(
  machineId: string,
  encryptionKey: Buffer,
  storageDir?: string,
  backupDir?: string
): BackupResult {
  try {
    const dir = getBackupDir(backupDir);

    if (!ensureBackupDir(dir)) {
      return {
        success: false,
        error: 'Failed to create backup directory',
      };
    }

    // Retrieve license from local storage
    const retrievalResult = retrieveLicense(machineId, encryptionKey, storageDir);

    if (!retrievalResult.success || !retrievalResult.license) {
      return {
        success: false,
        error: retrievalResult.error || 'Failed to retrieve license for backup',
      };
    }

    const { license } = retrievalResult;
    const timestamp = new Date();
    const backupId = generateBackupId(machineId, timestamp);

    // Create backup payload: .LIC file + metadata
    const backupPayload = Buffer.concat([
      license.licFileBuffer,
      Buffer.from(JSON.stringify({
        licenseData: {
          ...license.licenseData,
          expiresAt: license.licenseData.expiresAt.toISOString(),
          createdAt: license.licenseData.createdAt.toISOString(),
        },
        storedAt: license.storedAt.toISOString(),
        lastValidatedAt: license.lastValidatedAt.toISOString(),
      })),
    ]);

    // Generate checksum before encryption
    const checksum = generateChecksum(backupPayload);

    // Encrypt backup payload
    const encryptedBackup = encrypt(backupPayload, encryptionKey);
    const backupFileData = Buffer.concat([
      encryptedBackup.iv,
      encryptedBackup.encrypted,
      encryptedBackup.authTag,
    ]);

    // Write encrypted backup file
    const backupFilePath = getBackupFilePath(dir, backupId);
    fs.writeFileSync(backupFilePath, backupFileData);

    // Create and write metadata
    const metadata: BackupMetadata = {
      backupId,
      machineId,
      machineIdHash: license.licenseData.machineIdHash,
      timestamp,
      licenseKey: license.licenseData.licenseKey,
      expiresAt: license.licenseData.expiresAt,
      modules: license.licenseData.modules,
      version: BACKUP_VERSION,
      checksum: checksum.toString('hex'),
    };

    const metadataPath = getBackupMetadataPath(dir, backupId);
    fs.writeFileSync(
      metadataPath,
      JSON.stringify({
        ...metadata,
        timestamp: metadata.timestamp.toISOString(),
        expiresAt: metadata.expiresAt.toISOString(),
      }, null, 2)
    );

    return {
      success: true,
      backupId,
    };
  } catch (error) {
    console.error('Error creating backup:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create backup',
    };
  }
}

/**
 * Get backup information
 */
export function getBackupInfo(
  backupId: string,
  backupDir?: string
): BackupInfo | null {
  try {
    const dir = getBackupDir(backupDir);
    const metadataPath = getBackupMetadataPath(dir, backupId);

    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    const backupFilePath = getBackupFilePath(dir, backupId);
    const size = fs.existsSync(backupFilePath) ? fs.statSync(backupFilePath).size : 0;

    return {
      backupId: metadata.backupId,
      machineId: metadata.machineId,
      timestamp: new Date(metadata.timestamp),
      size,
      licenseKey: metadata.licenseKey,
      expiresAt: new Date(metadata.expiresAt),
      checksum: metadata.checksum,
    };
  } catch (error) {
    console.error('Error getting backup info:', error);
    return null;
  }
}

/**
 * List all available backups
 */
export function listBackups(backupDir?: string): ListBackupsResult {
  try {
    const dir = getBackupDir(backupDir);

    if (!fs.existsSync(dir)) {
      return {
        success: true,
        backups: [],
      };
    }

    const files = fs.readdirSync(dir);
    const backupIds = new Set<string>();

    for (const file of files) {
      if (file.endsWith('.json') && file.startsWith('backup-')) {
        const backupId = file.replace('.json', '');
        backupIds.add(backupId);
      }
    }

    const backups: BackupInfo[] = [];

    for (const backupId of backupIds) {
      const info = getBackupInfo(backupId, dir);
      if (info) {
        backups.push(info);
      }
    }

    // Sort by timestamp descending (newest first)
    backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      success: true,
      backups,
    };
  } catch (error) {
    console.error('Error listing backups:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list backups',
    };
  }
}

/**
 * Delete a backup
 */
export function deleteBackup(
  backupId: string,
  backupDir?: string
): DeleteBackupResult {
  try {
    const dir = getBackupDir(backupDir);
    const backupFilePath = getBackupFilePath(dir, backupId);
    const metadataPath = getBackupMetadataPath(dir, backupId);

    if (fs.existsSync(backupFilePath)) {
      fs.unlinkSync(backupFilePath);
    }

    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting backup:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete backup',
    };
  }
}

/**
 * Restore license from backup
 * Validates backup integrity and decrypts backup file
 */
export function restoreBackup(
  backupId: string,
  encryptionKey: Buffer,
  backupDir?: string
): RestoreResult {
  try {
    const dir = getBackupDir(backupDir);
    const backupFilePath = getBackupFilePath(dir, backupId);
    const metadataPath = getBackupMetadataPath(dir, backupId);

    // Check if backup files exist
    if (!fs.existsSync(backupFilePath) || !fs.existsSync(metadataPath)) {
      return {
        success: false,
        error: 'Backup not found',
      };
    }

    // Read metadata
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Read and decrypt backup file
    const backupFileData = fs.readFileSync(backupFilePath);

    // Extract components
    const iv = backupFileData.subarray(0, 16);
    const authTag = backupFileData.subarray(backupFileData.length - 16);
    const encrypted = backupFileData.subarray(16, backupFileData.length - 16);

    const decryptionResult = decrypt(encrypted, iv, authTag, encryptionKey);

    if (!decryptionResult.isValid) {
      return {
        success: false,
        error: decryptionResult.error || 'Failed to decrypt backup file',
      };
    }

    const backupPayload = decryptionResult.decrypted;

    // Verify checksum
    const storedChecksum = Buffer.from(metadata.checksum, 'hex');

    if (!verifyChecksum(backupPayload, storedChecksum)) {
      return {
        success: false,
        error: 'Backup file integrity check failed - checksum mismatch',
      };
    }

    // Parse backup payload
    // Find the JSON metadata within the payload
    let licFileBuffer: Buffer;
    let licenseMetadata: any;

    try {
      // Try to find JSON metadata at the end
      const payloadStr = backupPayload.toString('utf-8', 0, backupPayload.length);
      const jsonMatch = payloadStr.match(/\{[\s\S]*\}$/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        licenseMetadata = JSON.parse(jsonStr);
        const jsonLength = Buffer.byteLength(jsonStr, 'utf-8');
        licFileBuffer = backupPayload.subarray(0, backupPayload.length - jsonLength);
      } else {
        return {
          success: false,
          error: 'Invalid backup file format - metadata not found',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to parse backup file metadata',
      };
    }

    // Reconstruct license data
    const licenseData: LicenseData = {
      ...licenseMetadata.licenseData,
      expiresAt: new Date(licenseMetadata.licenseData.expiresAt),
      createdAt: new Date(licenseMetadata.licenseData.createdAt),
    };

    return {
      success: true,
      licenseData,
      licFileBuffer,
    };
  } catch (error) {
    console.error('Error restoring backup:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore backup',
    };
  }
}

/**
 * Export backup file for external storage
 * Returns the encrypted backup file as a buffer
 */
export function exportBackupFile(
  backupId: string,
  backupDir?: string
): { success: boolean; data?: Buffer; error?: string } {
  try {
    const dir = getBackupDir(backupDir);
    const backupFilePath = getBackupFilePath(dir, backupId);

    if (!fs.existsSync(backupFilePath)) {
      return {
        success: false,
        error: 'Backup file not found',
      };
    }

    const data = fs.readFileSync(backupFilePath);

    return {
      success: true,
      data,
    };
  } catch (error) {
    console.error('Error exporting backup file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export backup file',
    };
  }
}

/**
 * Import backup file from external storage
 * Validates and stores the imported backup
 */
export function importBackupFile(
  backupData: Buffer,
  metadataJson: string,
  backupDir?: string
): BackupResult {
  try {
    const dir = getBackupDir(backupDir);

    if (!ensureBackupDir(dir)) {
      return {
        success: false,
        error: 'Failed to create backup directory',
      };
    }

    // Parse metadata
    const metadata = JSON.parse(metadataJson);
    const backupId = metadata.backupId;

    // Write backup file
    const backupFilePath = getBackupFilePath(dir, backupId);
    fs.writeFileSync(backupFilePath, backupData);

    // Write metadata file
    const metadataPath = getBackupMetadataPath(dir, backupId);
    fs.writeFileSync(metadataPath, metadataJson);

    return {
      success: true,
      backupId,
    };
  } catch (error) {
    console.error('Error importing backup file:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import backup file',
    };
  }
}

/**
 * Validate backup file integrity
 * Checks if backup file can be decrypted and has valid structure
 */
export function validateBackupIntegrity(
  backupId: string,
  encryptionKey: Buffer,
  backupDir?: string
): { valid: boolean; error?: string } {
  try {
    const dir = getBackupDir(backupDir);
    const backupFilePath = getBackupFilePath(dir, backupId);
    const metadataPath = getBackupMetadataPath(dir, backupId);

    // Check if backup files exist
    if (!fs.existsSync(backupFilePath) || !fs.existsSync(metadataPath)) {
      return {
        valid: false,
        error: 'Backup not found',
      };
    }

    // Read metadata
    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Read backup file
    const backupFileData = fs.readFileSync(backupFilePath);

    // Extract components
    const iv = backupFileData.subarray(0, 16);
    const authTag = backupFileData.subarray(backupFileData.length - 16);
    const encrypted = backupFileData.subarray(16, backupFileData.length - 16);

    // Try to decrypt
    const decryptionResult = decrypt(encrypted, iv, authTag, encryptionKey);

    if (!decryptionResult.isValid) {
      return {
        valid: false,
        error: decryptionResult.error || 'Failed to decrypt backup file',
      };
    }

    const backupPayload = decryptionResult.decrypted;

    // Verify checksum
    const storedChecksum = Buffer.from(metadata.checksum, 'hex');

    if (!verifyChecksum(backupPayload, storedChecksum)) {
      return {
        valid: false,
        error: 'Backup file integrity check failed - checksum mismatch',
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating backup integrity:', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Failed to validate backup integrity',
    };
  }
}

/**
 * Get restore information about what will be restored
 * Returns preview of license data without actually restoring
 */
export function getRestoreInfo(
  backupId: string,
  encryptionKey: Buffer,
  backupDir?: string
): {
  success: boolean;
  info?: {
    licenseKey: string;
    machineId: string;
    expiresAt: Date;
    modules: string[];
    createdAt: Date;
  };
  error?: string;
} {
  try {
    const dir = getBackupDir(backupDir);
    const metadataPath = getBackupMetadataPath(dir, backupId);

    if (!fs.existsSync(metadataPath)) {
      return {
        success: false,
        error: 'Backup not found',
      };
    }

    const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    return {
      success: true,
      info: {
        licenseKey: metadata.licenseKey,
        machineId: metadata.machineId,
        expiresAt: new Date(metadata.expiresAt),
        modules: metadata.modules,
        createdAt: new Date(metadata.timestamp),
      },
    };
  } catch (error) {
    console.error('Error getting restore info:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get restore info',
    };
  }
}
