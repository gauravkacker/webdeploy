/**
 * Tests for Backup & Restore Functionality
 * Tests BR10: Backup & Restore requirement
 */

import fs from 'fs';
import path from 'path';
import {
  backupLicense,
  getBackupInfo,
  listBackups,
  deleteBackup,
  restoreBackup,
  exportBackupFile,
  importBackupFile,
  validateBackupIntegrity,
  getRestoreInfo,
} from '../../lib/machine-binding/backup-restore';
import {
  storeLicense,
  deleteLicense,
} from '../../lib/machine-binding/local-license-storage';
import { generateEncryptionKey } from '../../lib/machine-binding/encryption';
import { LicenseData } from '../../lib/machine-binding/lic-file';

describe('Backup & Restore Functionality', () => {
  const testStorageDir = '.test-license-storage-backup';
  const testBackupDir = '.test-license-backups';
  const encryptionKey = generateEncryptionKey();

  const mockLicenseData: LicenseData = {
    licenseKey: 'TEST-LICENSE-KEY-12345',
    customerId: 'test-customer-id',
    machineId: 'test-machine-id-12345',
    machineIdHash: 'test-machine-id-hash',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    createdAt: new Date(),
    modules: ['doctor', 'pharmacy', 'billing'],
  };

  const mockLicFileBuffer = Buffer.from('MOCK_LIC_FILE_CONTENT_12345');

  beforeEach(() => {
    // Clean up test directories
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true });
    }
    if (fs.existsSync(testBackupDir)) {
      fs.rmSync(testBackupDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true });
    }
    if (fs.existsSync(testBackupDir)) {
      fs.rmSync(testBackupDir, { recursive: true });
    }
  });

  describe('backupLicense', () => {
    it('should create a backup of .LIC file and metadata', () => {
      // Store license first
      const storeResult = storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );
      expect(storeResult.success).toBe(true);

      // Create backup
      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      expect(backupResult.success).toBe(true);
      expect(backupResult.backupId).toBeDefined();
      expect(backupResult.backupId).toMatch(/^backup-test-machine-id-12345-\d+$/);
    });

    it('should encrypt backup file', () => {
      // Store license first
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      // Create backup
      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      expect(backupResult.success).toBe(true);

      // Verify backup file is encrypted (not readable as plain text)
      const backupFilePath = path.join(
        testBackupDir,
        `${backupResult.backupId}.bin`
      );
      const backupFileContent = fs.readFileSync(backupFilePath);

      // Encrypted content should not contain original license key
      expect(backupFileContent.toString('utf-8')).not.toContain(
        mockLicenseData.licenseKey
      );
    });

    it('should store backup metadata separately', () => {
      // Store license first
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      // Create backup
      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      expect(backupResult.success).toBe(true);

      // Verify metadata file exists
      const metadataPath = path.join(
        testBackupDir,
        `${backupResult.backupId}.json`
      );
      expect(fs.existsSync(metadataPath)).toBe(true);

      // Verify metadata content
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      expect(metadata.backupId).toBe(backupResult.backupId);
      expect(metadata.machineId).toBe(mockLicenseData.machineId);
      expect(metadata.licenseKey).toBe(mockLicenseData.licenseKey);
      expect(metadata.modules).toEqual(mockLicenseData.modules);
    });

    it('should fail if license does not exist', () => {
      const backupResult = backupLicense(
        'non-existent-machine-id',
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      expect(backupResult.success).toBe(false);
      expect(backupResult.error).toBeDefined();
    });

    it('should generate unique backup IDs for different timestamps', () => {
      // Store license
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      // Create first backup
      const backup1 = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Wait a bit to ensure different timestamp
      const delay = new Promise(resolve => setTimeout(resolve, 10));

      delay.then(() => {
        // Create second backup
        const backup2 = backupLicense(
          mockLicenseData.machineId,
          encryptionKey,
          testStorageDir,
          testBackupDir
        );

        expect(backup1.backupId).not.toBe(backup2.backupId);
      });
    });
  });

  describe('getBackupInfo', () => {
    it('should return backup information', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Get backup info
      const info = getBackupInfo(backupResult.backupId!, testBackupDir);

      expect(info).not.toBeNull();
      expect(info!.backupId).toBe(backupResult.backupId);
      expect(info!.machineId).toBe(mockLicenseData.machineId);
      expect(info!.licenseKey).toBe(mockLicenseData.licenseKey);
      expect(info!.size).toBeGreaterThan(0);
      expect(info!.checksum).toBeDefined();
    });

    it('should return null for non-existent backup', () => {
      const info = getBackupInfo('non-existent-backup-id', testBackupDir);
      expect(info).toBeNull();
    });
  });

  describe('listBackups', () => {
    it('should list all available backups', () => {
      // Store license
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      // Create multiple backups
      const backup1 = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      const backup2 = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // List backups
      const result = listBackups(testBackupDir);

      expect(result.success).toBe(true);
      expect(result.backups).toBeDefined();
      expect(result.backups!.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty list when no backups exist', () => {
      const result = listBackups(testBackupDir);

      expect(result.success).toBe(true);
      expect(result.backups).toEqual([]);
    });

    it('should sort backups by timestamp descending', () => {
      // Store license
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      // Create backups
      backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // List backups
      const result = listBackups(testBackupDir);

      expect(result.backups!.length).toBeGreaterThanOrEqual(2);
      // Verify sorted by timestamp descending
      for (let i = 0; i < result.backups!.length - 1; i++) {
        expect(result.backups![i].timestamp.getTime()).toBeGreaterThanOrEqual(
          result.backups![i + 1].timestamp.getTime()
        );
      }
    });
  });

  describe('deleteBackup', () => {
    it('should delete a backup', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Delete backup
      const deleteResult = deleteBackup(backupResult.backupId!, testBackupDir);

      expect(deleteResult.success).toBe(true);

      // Verify backup is deleted
      const info = getBackupInfo(backupResult.backupId!, testBackupDir);
      expect(info).toBeNull();
    });

    it('should handle deletion of non-existent backup gracefully', () => {
      const deleteResult = deleteBackup('non-existent-backup-id', testBackupDir);

      expect(deleteResult.success).toBe(true);
    });
  });

  describe('restoreBackup', () => {
    it('should restore license from backup', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Delete original license
      deleteLicense(mockLicenseData.machineId, testStorageDir);

      // Restore from backup
      const restoreResult = restoreBackup(
        backupResult.backupId!,
        encryptionKey,
        testBackupDir
      );

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.licenseData).toBeDefined();
      expect(restoreResult.licFileBuffer).toBeDefined();
      expect(restoreResult.licenseData!.licenseKey).toBe(
        mockLicenseData.licenseKey
      );
      expect(restoreResult.licenseData!.machineId).toBe(
        mockLicenseData.machineId
      );
      expect(restoreResult.licenseData!.modules).toEqual(
        mockLicenseData.modules
      );
    });

    it('should validate backup integrity', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Corrupt backup file
      const backupFilePath = path.join(
        testBackupDir,
        `${backupResult.backupId}.bin`
      );
      const corruptedData = Buffer.from('CORRUPTED_DATA');
      fs.writeFileSync(backupFilePath, corruptedData);

      // Try to restore corrupted backup
      const restoreResult = restoreBackup(
        backupResult.backupId!,
        encryptionKey,
        testBackupDir
      );

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toBeDefined();
    });

    it('should fail if backup does not exist', () => {
      const restoreResult = restoreBackup(
        'non-existent-backup-id',
        encryptionKey,
        testBackupDir
      );

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toBeDefined();
    });

    it('should fail with wrong encryption key', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Try to restore with wrong key
      const wrongKey = generateEncryptionKey();
      const restoreResult = restoreBackup(
        backupResult.backupId!,
        wrongKey,
        testBackupDir
      );

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.error).toBeDefined();
    });
  });

  describe('exportBackupFile', () => {
    it('should export backup file as buffer', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Export backup file
      const exportResult = exportBackupFile(
        backupResult.backupId!,
        testBackupDir
      );

      expect(exportResult.success).toBe(true);
      expect(exportResult.data).toBeDefined();
      expect(exportResult.data).toBeInstanceOf(Buffer);
      expect(exportResult.data!.length).toBeGreaterThan(0);
    });

    it('should fail if backup file does not exist', () => {
      const exportResult = exportBackupFile(
        'non-existent-backup-id',
        testBackupDir
      );

      expect(exportResult.success).toBe(false);
      expect(exportResult.error).toBeDefined();
    });
  });

  describe('importBackupFile', () => {
    it('should import backup file from external storage', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Export backup
      const exportResult = exportBackupFile(
        backupResult.backupId!,
        testBackupDir
      );

      // Get metadata
      const metadataPath = path.join(
        testBackupDir,
        `${backupResult.backupId}.json`
      );
      const metadataJson = fs.readFileSync(metadataPath, 'utf-8');

      // Create new backup directory for import
      const importDir = '.test-license-backups-import';
      if (fs.existsSync(importDir)) {
        fs.rmSync(importDir, { recursive: true });
      }

      // Import backup
      const importResult = importBackupFile(
        exportResult.data!,
        metadataJson,
        importDir
      );

      expect(importResult.success).toBe(true);
      expect(importResult.backupId).toBe(backupResult.backupId);

      // Verify imported backup can be restored
      const restoreResult = restoreBackup(
        importResult.backupId!,
        encryptionKey,
        importDir
      );

      expect(restoreResult.success).toBe(true);

      // Clean up
      if (fs.existsSync(importDir)) {
        fs.rmSync(importDir, { recursive: true });
      }
    });
  });

  describe('Backup Integrity', () => {
    it('should preserve license data through backup and restore cycle', () => {
      // Store license
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      // Create backup
      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Delete original
      deleteLicense(mockLicenseData.machineId, testStorageDir);

      // Restore from backup
      const restoreResult = restoreBackup(
        backupResult.backupId!,
        encryptionKey,
        testBackupDir
      );

      // Verify all data is preserved
      expect(restoreResult.licenseData!.licenseKey).toBe(
        mockLicenseData.licenseKey
      );
      expect(restoreResult.licenseData!.machineId).toBe(
        mockLicenseData.machineId
      );
      expect(restoreResult.licenseData!.machineIdHash).toBe(
        mockLicenseData.machineIdHash
      );
      expect(restoreResult.licenseData!.modules).toEqual(
        mockLicenseData.modules
      );
      expect(restoreResult.licenseData!.expiresAt.getTime()).toBe(
        mockLicenseData.expiresAt.getTime()
      );
      expect(restoreResult.licFileBuffer).toEqual(mockLicFileBuffer);
    });
  });

  describe('validateBackupIntegrity', () => {
    it('should validate backup integrity successfully', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Validate backup integrity
      const validationResult = validateBackupIntegrity(
        backupResult.backupId!,
        encryptionKey,
        testBackupDir
      );

      expect(validationResult.valid).toBe(true);
      expect(validationResult.error).toBeUndefined();
    });

    it('should detect corrupted backup file', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Corrupt backup file
      const backupFilePath = path.join(
        testBackupDir,
        `${backupResult.backupId}.bin`
      );
      const corruptedData = Buffer.from('CORRUPTED_DATA');
      fs.writeFileSync(backupFilePath, corruptedData);

      // Validate backup integrity
      const validationResult = validateBackupIntegrity(
        backupResult.backupId!,
        encryptionKey,
        testBackupDir
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });

    it('should fail validation with wrong encryption key', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Validate with wrong key
      const wrongKey = generateEncryptionKey();
      const validationResult = validateBackupIntegrity(
        backupResult.backupId!,
        wrongKey,
        testBackupDir
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });

    it('should fail validation for non-existent backup', () => {
      const validationResult = validateBackupIntegrity(
        'non-existent-backup-id',
        encryptionKey,
        testBackupDir
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });
  });

  describe('getRestoreInfo', () => {
    it('should return restore information', () => {
      // Store license and create backup
      storeLicense(
        mockLicenseData,
        mockLicFileBuffer,
        encryptionKey,
        testStorageDir
      );

      const backupResult = backupLicense(
        mockLicenseData.machineId,
        encryptionKey,
        testStorageDir,
        testBackupDir
      );

      // Get restore info
      const infoResult = getRestoreInfo(
        backupResult.backupId!,
        encryptionKey,
        testBackupDir
      );

      expect(infoResult.success).toBe(true);
      expect(infoResult.info).toBeDefined();
      expect(infoResult.info!.licenseKey).toBe(mockLicenseData.licenseKey);
      expect(infoResult.info!.machineId).toBe(mockLicenseData.machineId);
      expect(infoResult.info!.modules).toEqual(mockLicenseData.modules);
      expect(infoResult.info!.expiresAt.getTime()).toBe(
        mockLicenseData.expiresAt.getTime()
      );
    });

    it('should fail for non-existent backup', () => {
      const infoResult = getRestoreInfo(
        'non-existent-backup-id',
        encryptionKey,
        testBackupDir
      );

      expect(infoResult.success).toBe(false);
      expect(infoResult.error).toBeDefined();
    });
  });
});
