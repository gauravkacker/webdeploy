/**
 * Offline Validator Tests
 * Tests for offline license validation and caching
 */

import fs from 'fs';
import path from 'path';
import {
  validateOffline,
  cacheValidation,
  getCachedValidation,
  isCachedValidationValid,
  getCacheAge,
  validateWithFallback,
  clearValidationCache,
} from '../../lib/machine-binding/offline-validator';
import { generateLicFile } from '../../lib/machine-binding/lic-file-manager';
import { generateMachineId, getMachineIdHash } from '../../lib/machine-binding/machine-id-generator';
import { generateEncryptionKey } from '../../lib/machine-binding/encryption';
import { LicenseData } from '../../lib/machine-binding/lic-file';

describe('Offline Validator', () => {
  const validLicenseKey = 'KIRO-TEST-1234-5678-ABCD';
  const validCustomerId = '550e8400-e29b-41d4-a716-446655440000';
  const validModules = ['doctor', 'pharmacy'];
  const testCacheDir = '.test-license-cache';

  let validMachineId: string;
  let validMachineIdHash: string;
  let encryptionKey: Buffer;
  let licFile: Buffer;

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

    licFile = result.licFile!;
  });

  afterEach(() => {
    // Clean up test cache
    if (fs.existsSync(testCacheDir)) {
      fs.rmSync(testCacheDir, { recursive: true });
    }
  });

  describe('validateOffline', () => {
    it('should validate .LIC file offline', () => {
      const result = validateOffline(licFile, validMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
      expect(result.licenseData).toBeDefined();
      expect(result.remainingDays).toBeGreaterThan(0);
    });

    it('should cache validation result', () => {
      validateOffline(licFile, validMachineId, encryptionKey, testCacheDir);

      const cacheFile = path.join(testCacheDir, 'validation-cache.json');
      expect(fs.existsSync(cacheFile)).toBe(true);
    });

    it('should detect Machine ID mismatch', () => {
      const differentMachineId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';

      const result = validateOffline(licFile, differentMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('different Machine ID');
    });

    it('should reject corrupted .LIC file', () => {
      const corruptedFile = Buffer.from(licFile);
      corruptedFile[50] = corruptedFile[50] ^ 0xFF;

      const result = validateOffline(corruptedFile, validMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(false);
    });

    it('should use cache when .LIC file validation fails', () => {
      // First validation to populate cache
      validateOffline(licFile, validMachineId, encryptionKey, testCacheDir);

      // Create corrupted file
      const corruptedFile = Buffer.from(licFile);
      corruptedFile[50] = corruptedFile[50] ^ 0xFF;

      // Should fall back to cache
      const result = validateOffline(corruptedFile, validMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(true);
      expect(result.cached).toBe(true);
    });

    it('should reject cache for different machine', () => {
      // First validation to populate cache
      validateOffline(licFile, validMachineId, encryptionKey, testCacheDir);

      // Try with different machine
      const differentMachineId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';
      const corruptedFile = Buffer.from(licFile);
      corruptedFile[50] = corruptedFile[50] ^ 0xFF;

      const result = validateOffline(corruptedFile, differentMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('different Machine ID');
    });

    it('should reject expired cached license', () => {
      // Create expired license data
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const expiredLicenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      // Cache it
      cacheValidation(expiredLicenseData, validMachineId, testCacheDir);

      // Try to validate with corrupted file (will fall back to cache)
      const corruptedFile = Buffer.from(licFile);
      corruptedFile[50] = corruptedFile[50] ^ 0xFF;

      const result = validateOffline(corruptedFile, validMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });
  });

  describe('cacheValidation', () => {
    it('should cache license data', () => {
      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      const result = cacheValidation(licenseData, validMachineId, testCacheDir);

      expect(result).toBe(true);

      const cacheFile = path.join(testCacheDir, 'validation-cache.json');
      expect(fs.existsSync(cacheFile)).toBe(true);
    });

    it('should overwrite existing cache', () => {
      const licenseData1: LicenseData = {
        licenseKey: 'KIRO-OLD1-1234-5678-ABCD',
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      cacheValidation(licenseData1, validMachineId, testCacheDir);

      const licenseData2: LicenseData = {
        licenseKey: 'KIRO-NEW2-1234-5678-ABCD',
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      cacheValidation(licenseData2, validMachineId, testCacheDir);

      const cached = getCachedValidation(testCacheDir);
      expect(cached?.licenseData.licenseKey).toBe('KIRO-NEW2-1234-5678-ABCD');
    });
  });

  describe('getCachedValidation', () => {
    it('should retrieve cached validation', () => {
      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      cacheValidation(licenseData, validMachineId, testCacheDir);

      const cached = getCachedValidation(testCacheDir);

      expect(cached).toBeDefined();
      expect(cached?.licenseData.licenseKey).toBe(validLicenseKey);
      expect(cached?.machineId).toBe(validMachineId);
    });

    it('should return null if no cache exists', () => {
      const cached = getCachedValidation(testCacheDir);
      expect(cached).toBeNull();
    });
  });

  describe('isCachedValidationValid', () => {
    it('should return true for valid cached license', () => {
      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      cacheValidation(licenseData, validMachineId, testCacheDir);

      const result = isCachedValidationValid(testCacheDir);
      expect(result).toBe(true);
    });

    it('should return false for expired cached license', () => {
      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() - 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      cacheValidation(licenseData, validMachineId, testCacheDir);

      const result = isCachedValidationValid(testCacheDir);
      expect(result).toBe(false);
    });

    it('should return false if no cache exists', () => {
      const result = isCachedValidationValid(testCacheDir);
      expect(result).toBe(false);
    });
  });

  describe('getCacheAge', () => {
    it('should return cache age in seconds', () => {
      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      cacheValidation(licenseData, validMachineId, testCacheDir);

      const age = getCacheAge(testCacheDir);

      expect(age).toBeDefined();
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(5); // Should be very recent
    });

    it('should return null if no cache exists', () => {
      const age = getCacheAge(testCacheDir);
      expect(age).toBeNull();
    });
  });

  describe('validateWithFallback', () => {
    it('should validate with .LIC file', () => {
      const result = validateWithFallback(licFile, validMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(true);
      expect(result.cached).toBe(false);
    });

    it('should fall back to cache when .LIC file unavailable', () => {
      // First validation to populate cache
      validateWithFallback(licFile, validMachineId, encryptionKey, testCacheDir);

      // Validate with null .LIC file
      const result = validateWithFallback(null, validMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(true);
      expect(result.cached).toBe(true);
    });

    it('should reject if no .LIC file and no cache', () => {
      const result = validateWithFallback(null, validMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('No valid license or cache found');
    });

    it('should reject cache for different machine', () => {
      // First validation to populate cache
      validateWithFallback(licFile, validMachineId, encryptionKey, testCacheDir);

      // Try with different machine
      const differentMachineId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';
      const result = validateWithFallback(null, differentMachineId, encryptionKey, testCacheDir);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('different Machine ID');
    });
  });

  describe('clearValidationCache', () => {
    it('should clear cache', () => {
      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: validModules,
        createdAt: new Date(),
      };

      cacheValidation(licenseData, validMachineId, testCacheDir);

      const result = clearValidationCache(testCacheDir);

      expect(result).toBe(true);

      const cached = getCachedValidation(testCacheDir);
      expect(cached).toBeNull();
    });

    it('should handle clearing non-existent cache', () => {
      const result = clearValidationCache(testCacheDir);
      expect(result).toBe(true);
    });
  });
});
