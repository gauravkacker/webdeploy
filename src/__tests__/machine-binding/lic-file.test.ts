/**
 * Unit Tests for .LIC File Format
 * Tests .LIC file creation, parsing, and integrity verification
 */

import crypto from 'crypto';
import {
  createLicFile,
  parseLicFile,
  validateLicFileStructure,
  estimateLicFileSize,
  exportLicFileAsBase64,
  importLicFileFromBase64,
  type LicenseData,
} from '@/lib/machine-binding/lic-file';
import { generateEncryptionKey } from '@/lib/machine-binding/encryption';

describe('.LIC File Format', () => {
  let encryptionKey: Buffer;
  let testLicenseData: LicenseData;

  beforeEach(() => {
    encryptionKey = generateEncryptionKey();
    testLicenseData = {
      licenseKey: 'CLINIC-A1B2C-D3E4F-G5H6I-J7K8L',
      customerId: 'customer-123',
      machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
      machineIdHash: 'abc123def456',
      expiresAt: new Date('2025-12-31'),
      modules: ['appointments', 'billing', 'pharmacy'],
      maxPrescriptions: 1000,
      createdAt: new Date('2024-01-01'),
    };
  });

  describe('createLicFile', () => {
    it('should create a valid .LIC file', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);

      expect(licFile).toBeInstanceOf(Buffer);
      expect(licFile.length).toBeGreaterThan(0);
    });

    it('should create .LIC file with correct size range', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);

      // .LIC file should be 2-5 KB
      expect(licFile.length).toBeGreaterThanOrEqual(2000);
      expect(licFile.length).toBeLessThanOrEqual(5000);
    });

    it('should create binary (non-human-readable) .LIC file', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);

      // Should not be valid UTF-8 text
      const asString = licFile.toString('utf-8');
      expect(asString).not.toContain(testLicenseData.licenseKey);
      expect(asString).not.toContain(testLicenseData.customerId);
    });

    it('should create different .LIC files for same data (due to random IV)', () => {
      const licFile1 = createLicFile(testLicenseData, encryptionKey);
      const licFile2 = createLicFile(testLicenseData, encryptionKey);

      // Files should be different due to random IV
      expect(licFile1).not.toEqual(licFile2);
    });

    it('should handle license data with all fields', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).not.toBeNull();
      expect(parsed.data?.licenseKey).toBe(testLicenseData.licenseKey);
      expect(parsed.data?.customerId).toBe(testLicenseData.customerId);
      expect(parsed.data?.machineId).toBe(testLicenseData.machineId);
      expect(parsed.data?.modules).toEqual(testLicenseData.modules);
      expect(parsed.data?.maxPrescriptions).toBe(testLicenseData.maxPrescriptions);
    });

    it('should handle license data without optional fields', () => {
      const minimalData: LicenseData = {
        licenseKey: 'CLINIC-A1B2C-D3E4F-G5H6I-J7K8L',
        customerId: 'customer-123',
        machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
        machineIdHash: 'abc123def456',
        expiresAt: new Date('2025-12-31'),
        modules: [],
        createdAt: new Date('2024-01-01'),
      };

      const licFile = createLicFile(minimalData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).not.toBeNull();
      expect(parsed.data?.modules).toEqual([]);
      expect(parsed.data?.maxPrescriptions).toBeUndefined();
    });

    it('should handle very long module list', () => {
      const dataWithManyModules: LicenseData = {
        ...testLicenseData,
        modules: Array.from({ length: 100 }, (_, i) => `module-${i}`),
      };

      const licFile = createLicFile(dataWithManyModules, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.modules.length).toBe(100);
    });
  });

  describe('parseLicFile', () => {
    it('should parse a valid .LIC file', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).not.toBeNull();
      expect(parsed.error).toBeUndefined();
    });

    /**
     * Property 2: .LIC File Round-Trip Consistency
     * .LIC file can be written and read back with identical data
     */
    it('should maintain data integrity through create/parse cycle (Property 2)', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).not.toBeNull();
      expect(parsed.data?.licenseKey).toBe(testLicenseData.licenseKey);
      expect(parsed.data?.customerId).toBe(testLicenseData.customerId);
      expect(parsed.data?.machineId).toBe(testLicenseData.machineId);
      expect(parsed.data?.machineIdHash).toBe(testLicenseData.machineIdHash);
      expect(parsed.data?.expiresAt.getTime()).toBe(testLicenseData.expiresAt.getTime());
      expect(parsed.data?.modules).toEqual(testLicenseData.modules);
      expect(parsed.data?.maxPrescriptions).toBe(testLicenseData.maxPrescriptions);
      expect(parsed.data?.createdAt.getTime()).toBe(testLicenseData.createdAt.getTime());
    });

    it('should reject .LIC file with wrong encryption key', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const wrongKey = generateEncryptionKey();

      const parsed = parseLicFile(licFile, wrongKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toBeDefined();
    });

    it('should reject corrupted .LIC file', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);

      // Corrupt the file
      const corrupted = Buffer.from(licFile);
      corrupted[50] ^= 0xff;

      const parsed = parseLicFile(corrupted, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toBeDefined();
    });

    it('should reject .LIC file with invalid size', () => {
      const tooSmall = Buffer.alloc(10);
      const parsed = parseLicFile(tooSmall, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('size');
    });

    it('should reject .LIC file with tampered checksum', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);

      // Tamper with checksum (last 32 bytes)
      const tampered = Buffer.from(licFile);
      tampered[tampered.length - 1] ^= 0xff;

      const parsed = parseLicFile(tampered, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('checksum');
    });

    it('should handle empty .LIC file', () => {
      const empty = Buffer.alloc(0);
      const parsed = parseLicFile(empty, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toBeDefined();
    });
  });

  describe('validateLicFileStructure', () => {
    it('should validate a valid .LIC file structure', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const validation = validateLicFileStructure(licFile);

      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should reject .LIC file with invalid size', () => {
      const tooSmall = Buffer.alloc(10);
      const validation = validateLicFileStructure(tooSmall);

      expect(validation.valid).toBe(false);
      expect(validation.error).toBeDefined();
    });

    it('should reject .LIC file with corrupted checksum', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);

      // Tamper with checksum
      const tampered = Buffer.from(licFile);
      tampered[tampered.length - 1] ^= 0xff;

      const validation = validateLicFileStructure(tampered);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('checksum');
    });

    it('should not require decryption key for structure validation', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);

      // Should validate without needing the key
      const validation = validateLicFileStructure(licFile);

      expect(validation.valid).toBe(true);
    });
  });

  describe('estimateLicFileSize', () => {
    it('should estimate .LIC file size', () => {
      const estimatedSize = estimateLicFileSize(testLicenseData);

      expect(estimatedSize).toBeGreaterThan(0);
      expect(estimatedSize).toBeLessThanOrEqual(5000);
    });

    it('should estimate size within reasonable range', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const estimatedSize = estimateLicFileSize(testLicenseData);

      // Estimated size should be close to actual size
      expect(Math.abs(licFile.length - estimatedSize)).toBeLessThan(100);
    });

    it('should handle large module lists', () => {
      const dataWithManyModules: LicenseData = {
        ...testLicenseData,
        modules: Array.from({ length: 100 }, (_, i) => `module-${i}`),
      };

      const estimatedSize = estimateLicFileSize(dataWithManyModules);

      expect(estimatedSize).toBeGreaterThan(0);
      expect(estimatedSize).toBeLessThanOrEqual(5000);
    });
  });

  describe('exportLicFileAsBase64 and importLicFileFromBase64', () => {
    it('should export .LIC file as base64', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const base64 = exportLicFileAsBase64(licFile);

      expect(typeof base64).toBe('string');
      expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });

    it('should import .LIC file from base64', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const base64 = exportLicFileAsBase64(licFile);
      const imported = importLicFileFromBase64(base64);

      expect(imported).toEqual(licFile);
    });

    it('should handle round-trip export/import', () => {
      const licFile = createLicFile(testLicenseData, encryptionKey);
      const base64 = exportLicFileAsBase64(licFile);
      const imported = importLicFileFromBase64(base64);
      const parsed = parseLicFile(imported, encryptionKey);

      expect(parsed.data?.licenseKey).toBe(testLicenseData.licenseKey);
    });

    it('should reject invalid base64', () => {
      const invalidBase64 = '!!!invalid!!!';

      expect(() => importLicFileFromBase64(invalidBase64)).toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete .LIC file lifecycle', () => {
      // Create
      const licFile = createLicFile(testLicenseData, encryptionKey);

      // Validate structure
      const validation = validateLicFileStructure(licFile);
      expect(validation.valid).toBe(true);

      // Parse
      const parsed = parseLicFile(licFile, encryptionKey);
      expect(parsed.data).not.toBeNull();

      // Export as base64
      const base64 = exportLicFileAsBase64(licFile);
      expect(typeof base64).toBe('string');

      // Import from base64
      const imported = importLicFileFromBase64(base64);
      expect(imported).toEqual(licFile);

      // Parse imported file
      const reparsed = parseLicFile(imported, encryptionKey);
      expect(reparsed.data?.licenseKey).toBe(testLicenseData.licenseKey);
    });

    it('should handle multiple .LIC files with same data', () => {
      const licFile1 = createLicFile(testLicenseData, encryptionKey);
      const licFile2 = createLicFile(testLicenseData, encryptionKey);

      // Files should be different (different IVs)
      expect(licFile1).not.toEqual(licFile2);

      // But both should parse to same data
      const parsed1 = parseLicFile(licFile1, encryptionKey);
      const parsed2 = parseLicFile(licFile2, encryptionKey);

      expect(parsed1.data?.licenseKey).toBe(parsed2.data?.licenseKey);
      expect(parsed1.data?.customerId).toBe(parsed2.data?.customerId);
    });

    it('should handle .LIC file with future expiration', () => {
      const futureData: LicenseData = {
        ...testLicenseData,
        expiresAt: new Date('2099-12-31'),
      };

      const licFile = createLicFile(futureData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.expiresAt.getFullYear()).toBe(2099);
    });

    it('should handle .LIC file with past expiration', () => {
      const pastData: LicenseData = {
        ...testLicenseData,
        expiresAt: new Date('2020-01-01'),
      };

      const licFile = createLicFile(pastData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.expiresAt.getFullYear()).toBe(2020);
    });
  });

  describe('Edge Cases', () => {
    it('should handle license data with special characters', () => {
      const specialData: LicenseData = {
        ...testLicenseData,
        licenseKey: 'CLINIC-!@#$%-^&*()',
        customerId: 'customer-你好-مرحبا',
      };

      const licFile = createLicFile(specialData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.licenseKey).toBe(specialData.licenseKey);
      expect(parsed.data?.customerId).toBe(specialData.customerId);
    });

    it('should handle license data with very long strings', () => {
      const longData: LicenseData = {
        ...testLicenseData,
        licenseKey: 'CLINIC-' + 'A'.repeat(1000),
        customerId: 'customer-' + 'B'.repeat(1000),
      };

      const licFile = createLicFile(longData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.licenseKey).toBe(longData.licenseKey);
      expect(parsed.data?.customerId).toBe(longData.customerId);
    });
  });
});
