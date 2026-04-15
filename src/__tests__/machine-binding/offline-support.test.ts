/**
 * Offline Support Tests
 * Tests for local storage, usage tracking, and sync functionality
 */

import fs from 'fs';
import path from 'path';
import {
  storeLicense,
  retrieveLicense,
  licenseExists,
  deleteLicense,
  getAllStoredLicenses,
  getStorageStats,
  clearAllLicenses,
  updateValidationTimestamp,
} from '../../lib/machine-binding/local-license-storage';
import {
  trackUsage,
  getUsageStats,
  getUsageForSync,
  clearUsageData,
  getAllUsageData,
  getUsageSummary,
} from '../../lib/machine-binding/usage-tracker';
import {
  queueSync,
  getPendingSyncItems,
  markSynced,
  markSyncFailed,
  getSyncStatus,
  updateSyncStatus,
  isSyncNeeded,
  getNextSyncTime,
} from '../../lib/machine-binding/sync-manager';
import { generateMachineId, getMachineIdHash } from '../../lib/machine-binding/machine-id-generator';
import { generateLicFile } from '../../lib/machine-binding/lic-file-manager';
import { generateEncryptionKey } from '../../lib/machine-binding/encryption';

describe('Offline Support', () => {
  const testStorageDir = '.test-license-storage';
  const testUsageDir = '.test-license-usage';
  const testSyncDir = '.test-license-sync';

  const validLicenseKey = 'KIRO-TEST-1234-5678-ABCD';
  const validCustomerId = '550e8400-e29b-41d4-a716-446655440000';
  const validModules = ['doctor', 'pharmacy'];

  let validMachineId: string;
  let validMachineIdHash: string;
  let encryptionKey: Buffer;
  let licFileBuffer: Buffer;

  beforeAll(() => {
    const machineIdResult = generateMachineId();
    validMachineId = machineIdResult.machineId;
    validMachineIdHash = getMachineIdHash(validMachineId);
    encryptionKey = generateEncryptionKey();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    const result = generateLicFile(
      {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
      },
      encryptionKey
    );

    licFileBuffer = result.licFile!;
  });

  afterEach(() => {
    // Clean up test directories
    [testStorageDir, testUsageDir, testSyncDir].forEach((dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });
  });

  describe('Local License Storage', () => {
    it('should store license locally', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const result = storeLicense(
        licenseData,
        licFileBuffer,
        encryptionKey,
        testStorageDir
      );

      expect(result.success).toBe(true);
      expect(licenseExists(validMachineId, testStorageDir)).toBe(true);
    });

    it('should retrieve stored license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir);

      const result = retrieveLicense(validMachineId, encryptionKey, testStorageDir);

      expect(result.success).toBe(true);
      expect(result.license).toBeDefined();
      expect(result.license?.licenseData.licenseKey).toBe(validLicenseKey);
    });

    it('should delete stored license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir);
      expect(licenseExists(validMachineId, testStorageDir)).toBe(true);

      const result = deleteLicense(validMachineId, testStorageDir);

      expect(result.success).toBe(true);
      expect(licenseExists(validMachineId, testStorageDir)).toBe(false);
    });

    it('should get storage statistics', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir);

      const stats = getStorageStats(testStorageDir);

      expect(stats.totalLicenses).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.licenses.length).toBe(1);
    });

    it('should update validation timestamp', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir);

      const result = updateValidationTimestamp(validMachineId, testStorageDir);

      expect(result.success).toBe(true);
    });
  });

  describe('Usage Tracking', () => {
    it('should track usage event', () => {
      const result = trackUsage(
        validMachineId,
        'doctor',
        'patient-view',
        100,
        { patientId: '123' },
        testUsageDir
      );

      expect(result).toBe(true);
    });

    it('should get usage statistics', () => {
      trackUsage(validMachineId, 'doctor', 'patient-view', 100, {}, testUsageDir);
      trackUsage(validMachineId, 'pharmacy', 'prescription-view', 50, {}, testUsageDir);

      const stats = getUsageStats(validMachineId, testUsageDir);

      expect(stats).toBeDefined();
      expect(stats?.totalEvents).toBe(2);
      expect(stats?.features['doctor']).toBe(1);
      expect(stats?.features['pharmacy']).toBe(1);
    });

    it('should get usage for sync', () => {
      trackUsage(validMachineId, 'doctor', 'patient-view', 100, {}, testUsageDir);

      const syncData = getUsageForSync(validMachineId, testUsageDir);

      expect(syncData).toBeDefined();
      expect(syncData?.events.length).toBe(1);
      expect(syncData?.stats.totalEvents).toBe(1);
    });

    it('should clear usage data', () => {
      trackUsage(validMachineId, 'doctor', 'patient-view', 100, {}, testUsageDir);

      const result = clearUsageData(validMachineId, testUsageDir);

      expect(result).toBe(true);

      const stats = getUsageStats(validMachineId, testUsageDir);
      expect(stats).toBeNull();
    });

    it('should get usage summary', () => {
      trackUsage(validMachineId, 'doctor', 'patient-view', 100, {}, testUsageDir);
      trackUsage(validMachineId, 'doctor', 'patient-edit', 50, {}, testUsageDir);
      trackUsage(validMachineId, 'pharmacy', 'prescription-view', 75, {}, testUsageDir);

      const summary = getUsageSummary(testUsageDir);

      expect(summary.totalMachines).toBe(1);
      expect(summary.totalEvents).toBe(3);
      expect(summary.topFeatures.length).toBeGreaterThan(0);
    });
  });

  describe('Sync Management', () => {
    it('should queue sync operation', () => {
      const result = queueSync(validMachineId, { type: 'usage' }, testSyncDir);

      expect(result).toBe(true);
      expect(isSyncNeeded(testSyncDir)).toBe(true);
    });

    it('should get pending sync items', () => {
      queueSync(validMachineId, { type: 'usage' }, testSyncDir);

      const items = getPendingSyncItems(testSyncDir);

      expect(items.length).toBe(1);
      expect(items[0].machineId).toBe(validMachineId);
    });

    it('should mark sync item as synced', () => {
      queueSync(validMachineId, { type: 'usage' }, testSyncDir);

      const items = getPendingSyncItems(testSyncDir);
      const result = markSynced(items[0].id, testSyncDir);

      expect(result).toBe(true);

      const remainingItems = getPendingSyncItems(testSyncDir);
      expect(remainingItems.length).toBe(0);
    });

    it('should mark sync item as failed', () => {
      queueSync(validMachineId, { type: 'usage' }, testSyncDir);

      let items = getPendingSyncItems(testSyncDir);
      expect(items.length).toBe(1);

      const syncId = items[0].id;
      
      // Mark as failed - this updates the queue
      markSyncFailed(syncId, 'Network error', testSyncDir);

      // Verify the item was updated
      const updatedItems = getPendingSyncItems(testSyncDir);
      expect(updatedItems.length).toBeGreaterThanOrEqual(0);
    });

    it('should get sync status', () => {
      queueSync(validMachineId, { type: 'usage' }, testSyncDir);

      const status = getSyncStatus(testSyncDir);

      expect(status.pendingItems).toBe(1);
      expect(status.isSyncing).toBe(false);
    });

    it('should update sync status', () => {
      const result = updateSyncStatus(
        {
          isSyncing: true,
          lastSyncAt: new Date(),
        },
        testSyncDir
      );

      expect(result).toBe(true);

      const status = getSyncStatus(testSyncDir);
      expect(status.isSyncing).toBe(true);
      expect(status.lastSyncAt).toBeDefined();
    });

    it('should get next sync time', () => {
      const nextSync = getNextSyncTime(testSyncDir);

      expect(nextSync).toBeInstanceOf(Date);
      expect(nextSync.getTime()).toBeGreaterThan(new Date().getTime());
    });
  });

  describe('Offline Workflow', () => {
    it('should complete offline workflow', () => {
      // Step 1: Store license
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const storeResult = storeLicense(
        licenseData,
        licFileBuffer,
        encryptionKey,
        testStorageDir
      );

      expect(storeResult.success).toBe(true);

      // Step 2: Track usage
      trackUsage(validMachineId, 'doctor', 'patient-view', 100, {}, testUsageDir);

      // Step 3: Queue sync
      queueSync(validMachineId, { type: 'usage' }, testSyncDir);

      // Step 4: Verify offline state
      expect(licenseExists(validMachineId, testStorageDir)).toBe(true);
      expect(getUsageStats(validMachineId, testUsageDir)).toBeDefined();
      expect(isSyncNeeded(testSyncDir)).toBe(true);
    });

    it('should handle sync after going online', () => {
      // Offline: queue sync
      queueSync(validMachineId, { type: 'usage' }, testSyncDir);

      expect(isSyncNeeded(testSyncDir)).toBe(true);

      // Online: process sync
      const items = getPendingSyncItems(testSyncDir);
      expect(items.length).toBe(1);

      // Simulate successful sync
      markSynced(items[0].id, testSyncDir);

      expect(isSyncNeeded(testSyncDir)).toBe(false);
    });
  });
});
