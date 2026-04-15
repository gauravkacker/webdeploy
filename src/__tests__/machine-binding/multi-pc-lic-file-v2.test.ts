/**
 * Unit Tests for .LIC File Format v2.0 (Multi-PC Support)
 * Tests v2.0 .LIC file creation, parsing, and format version detection
 */

import crypto from 'crypto';
import {
  createLicFileV2,
  parseLicFile,
  type LicenseDataV2,
  type AuthorizedMachine,
} from '@/lib/machine-binding/lic-file';
import { generateEncryptionKey } from '@/lib/machine-binding/encryption';

describe('.LIC File Format v2.0 - Multi-PC Support', () => {
  let encryptionKey: Buffer;
  let testMultiPCLicenseData: LicenseDataV2;
  let testSinglePCLicenseData: LicenseDataV2;

  beforeEach(() => {
    encryptionKey = generateEncryptionKey();
    
    // Multi-PC license with 3 machines
    testMultiPCLicenseData = {
      licenseKey: 'CLINIC-A1B2C-D3E4F-G5H6I-J7K8L',
      customerId: 'customer-123',
      licenseType: 'multi-pc',
      maxMachines: 5,
      authorizedMachines: [
        {
          machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
        {
          machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
          machineIdHash: 'hash2',
          addedAt: '2024-01-02T00:00:00.000Z',
          addedBy: 'admin-1',
        },
        {
          machineId: 'MACHINE-11111111-22222222-33333333-44444444',
          machineIdHash: 'hash3',
          addedAt: '2024-01-03T00:00:00.000Z',
          addedBy: 'admin-2',
        },
      ],
      expiresAt: new Date('2025-12-31'),
      modules: ['appointments', 'billing', 'pharmacy'],
      maxPrescriptions: 1000,
      createdAt: new Date('2024-01-01'),
      formatVersion: '2.0',
    };

    // Single-PC license in v2.0 format
    testSinglePCLicenseData = {
      licenseKey: 'CLINIC-X1Y2Z-A3B4C-D5E6F-G7H8I',
      customerId: 'customer-456',
      licenseType: 'single-pc',
      maxMachines: 1,
      authorizedMachines: [
        {
          machineId: 'MACHINE-99999999-88888888-77777777-66666666',
          machineIdHash: 'hash-single',
          addedAt: '2024-02-01T00:00:00.000Z',
          addedBy: 'system',
        },
      ],
      expiresAt: new Date('2025-06-30'),
      modules: ['appointments'],
      createdAt: new Date('2024-02-01'),
      formatVersion: '2.0',
    };
  });

  describe('createLicFileV2 - Multi-PC License Generation', () => {
    it('should create a valid v2.0 .LIC file with multiple Machine IDs', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);

      expect(licFile).toBeInstanceOf(Buffer);
      expect(licFile.length).toBeGreaterThan(0);
    });

    it('should create v2.0 .LIC file with correct header version', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);

      // First byte should be version 2
      const version = licFile.readUInt8(0);
      expect(version).toBe(2);
    });

    it('should include format version marker in header', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);

      // Bytes 16-19 should contain "2.0\0"
      const formatVersion = licFile.toString('utf-8', 16, 20).replace(/\0/g, '');
      expect(formatVersion).toBe('2.0');
    });

    it('should encrypt all Machine IDs in the payload', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);

      // Should not contain plaintext Machine IDs
      const asString = licFile.toString('utf-8');
      expect(asString).not.toContain('MACHINE-12345678');
      expect(asString).not.toContain('MACHINE-AAAAAAAA');
      expect(asString).not.toContain('MACHINE-11111111');
    });

    it('should create different .LIC files for same data (due to random IV)', () => {
      const licFile1 = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const licFile2 = createLicFileV2(testMultiPCLicenseData, encryptionKey);

      // Files should be different due to random IV
      expect(licFile1).not.toEqual(licFile2);
    });

    it('should handle single-PC license in v2.0 format', () => {
      const licFile = createLicFileV2(testSinglePCLicenseData, encryptionKey);

      expect(licFile).toBeInstanceOf(Buffer);
      expect(licFile.length).toBeGreaterThan(0);
      
      // Verify it's v2.0 format
      const version = licFile.readUInt8(0);
      expect(version).toBe(2);
    });

    it('should handle license with maximum machines (100)', () => {
      const maxMachinesData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        maxMachines: 100,
        authorizedMachines: Array.from({ length: 100 }, (_, i) => ({
          machineId: `MACHINE-${String(i).padStart(8, '0')}-AAAAAAAA-BBBBBBBB-CCCCCCCC`,
          machineIdHash: `hash-${i}`,
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        })),
      };

      const licFile = createLicFileV2(maxMachinesData, encryptionKey);
      expect(licFile).toBeInstanceOf(Buffer);
      expect(licFile.length).toBeGreaterThan(0);
    });

    it('should handle license with minimal machines (1)', () => {
      const licFile = createLicFileV2(testSinglePCLicenseData, encryptionKey);
      expect(licFile).toBeInstanceOf(Buffer);
    });

    it('should handle license without optional fields', () => {
      const minimalData: LicenseDataV2 = {
        licenseKey: 'CLINIC-MIN-TEST',
        customerId: 'customer-min',
        licenseType: 'multi-pc',
        maxMachines: 2,
        authorizedMachines: [
          {
            machineId: 'MACHINE-MIN-TEST-1',
            machineIdHash: 'hash-min',
            addedAt: '2024-01-01T00:00:00.000Z',
            addedBy: 'admin',
          },
        ],
        expiresAt: new Date('2025-12-31'),
        modules: [],
        createdAt: new Date('2024-01-01'),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(minimalData, encryptionKey);
      expect(licFile).toBeInstanceOf(Buffer);
    });
  });

  describe('parseLicFile - v2.0 Format Parsing', () => {
    it('should parse v2.0 .LIC file and extract all Machine IDs', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).not.toBeNull();
      expect(parsed.version).toBe(2);
      expect(parsed.data?.authorizedMachines).toHaveLength(3);
      expect(parsed.data?.authorizedMachines[0].machineId).toBe('MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD');
      expect(parsed.data?.authorizedMachines[1].machineId).toBe('MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD');
      expect(parsed.data?.authorizedMachines[2].machineId).toBe('MACHINE-11111111-22222222-33333333-44444444');
    });

    it('should extract license type correctly', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.licenseType).toBe('multi-pc');
    });

    it('should extract maxMachines correctly', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.maxMachines).toBe(5);
    });

    it('should extract Machine ID metadata (addedAt, addedBy)', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.authorizedMachines[0].addedAt).toBe('2024-01-01T00:00:00.000Z');
      expect(parsed.data?.authorizedMachines[0].addedBy).toBe('admin-1');
      expect(parsed.data?.authorizedMachines[2].addedBy).toBe('admin-2');
    });

    it('should parse single-PC license in v2.0 format', () => {
      const licFile = createLicFileV2(testSinglePCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).not.toBeNull();
      expect(parsed.version).toBe(2);
      expect(parsed.data?.licenseType).toBe('single-pc');
      expect(parsed.data?.maxMachines).toBe(1);
      expect(parsed.data?.authorizedMachines).toHaveLength(1);
    });

    it('should preserve all license properties during round-trip', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.licenseKey).toBe(testMultiPCLicenseData.licenseKey);
      expect(parsed.data?.customerId).toBe(testMultiPCLicenseData.customerId);
      expect(parsed.data?.modules).toEqual(testMultiPCLicenseData.modules);
      expect(parsed.data?.maxPrescriptions).toBe(testMultiPCLicenseData.maxPrescriptions);
      expect(parsed.data?.expiresAt.toISOString()).toBe(testMultiPCLicenseData.expiresAt.toISOString());
      expect(parsed.data?.formatVersion).toBe('2.0');
    });

    it('should detect format version as 2.0', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.formatVersion).toBe('2.0');
    });

    it('should fail with wrong encryption key', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const wrongKey = generateEncryptionKey();
      const parsed = parseLicFile(licFile, wrongKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toBeDefined();
    });

    it('should fail with corrupted .LIC file', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      
      // Corrupt the file by modifying a byte
      licFile[50] = licFile[50] ^ 0xFF;
      
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toBeDefined();
    });

    it('should fail with tampered Machine ID list', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      
      // Corrupt the checksum
      const checksumStart = licFile.length - 32;
      licFile[checksumStart] = licFile[checksumStart] ^ 0xFF;
      
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('Checksum verification failed');
    });
  });

  describe('Format Version Detection', () => {
    it('should detect v2.0 format from header', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.version).toBe(2);
      expect(parsed.data?.formatVersion).toBe('2.0');
    });

    it('should distinguish between single-pc and multi-pc in v2.0', () => {
      const multiPCFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const singlePCFile = createLicFileV2(testSinglePCLicenseData, encryptionKey);

      const multiPCParsed = parseLicFile(multiPCFile, encryptionKey);
      const singlePCParsed = parseLicFile(singlePCFile, encryptionKey);

      expect(multiPCParsed.data?.licenseType).toBe('multi-pc');
      expect(singlePCParsed.data?.licenseType).toBe('single-pc');
    });

    it('should validate maxMachines matches authorizedMachines count constraint', () => {
      // Create a license where authorizedMachines exceeds maxMachines
      const invalidData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        maxMachines: 2, // Only 2 allowed
        authorizedMachines: [
          ...testMultiPCLicenseData.authorizedMachines, // But has 3 machines
        ],
      };

      const licFile = createLicFileV2(invalidData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      // Parser should detect this violation
      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('exceeds maxMachines');
    });

    it('should reject empty authorizedMachines array', () => {
      const invalidData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        authorizedMachines: [],
      };

      const licFile = createLicFileV2(invalidData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('cannot be empty');
    });

    it('should reject invalid license type', () => {
      const invalidData = {
        ...testMultiPCLicenseData,
        licenseType: 'invalid-type' as any,
      };

      const licFile = createLicFileV2(invalidData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('Invalid license type');
    });

    it('should reject maxMachines out of range (< 1)', () => {
      const invalidData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        maxMachines: 0,
      };

      const licFile = createLicFileV2(invalidData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('Invalid maxMachines');
    });

    it('should reject maxMachines out of range (> 100)', () => {
      const invalidData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        maxMachines: 101,
      };

      const licFile = createLicFileV2(invalidData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data).toBeNull();
      expect(parsed.error).toContain('Invalid maxMachines');
    });
  });

  describe('Machine ID Array Integrity', () => {
    it('should preserve Machine ID order during round-trip', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.authorizedMachines[0].machineId).toBe(
        testMultiPCLicenseData.authorizedMachines[0].machineId
      );
      expect(parsed.data?.authorizedMachines[1].machineId).toBe(
        testMultiPCLicenseData.authorizedMachines[1].machineId
      );
      expect(parsed.data?.authorizedMachines[2].machineId).toBe(
        testMultiPCLicenseData.authorizedMachines[2].machineId
      );
    });

    it('should preserve all Machine ID metadata fields', () => {
      const licFile = createLicFileV2(testMultiPCLicenseData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      const firstMachine = parsed.data?.authorizedMachines[0];
      expect(firstMachine?.machineId).toBe(testMultiPCLicenseData.authorizedMachines[0].machineId);
      expect(firstMachine?.machineIdHash).toBe(testMultiPCLicenseData.authorizedMachines[0].machineIdHash);
      expect(firstMachine?.addedAt).toBe(testMultiPCLicenseData.authorizedMachines[0].addedAt);
      expect(firstMachine?.addedBy).toBe(testMultiPCLicenseData.authorizedMachines[0].addedBy);
    });

    it('should handle Machine IDs with special characters', () => {
      const specialData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        authorizedMachines: [
          {
            machineId: 'MACHINE-FFFFFFFF-EEEEEEEE-DDDDDDDD-CCCCCCCC',
            machineIdHash: 'hash-special-!@#$%',
            addedAt: '2024-01-01T00:00:00.000Z',
            addedBy: 'admin-special',
          },
        ],
      };

      const licFile = createLicFileV2(specialData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.authorizedMachines[0].machineIdHash).toBe('hash-special-!@#$%');
    });

    it('should handle very long Machine ID arrays (100 machines)', () => {
      const manyMachinesData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        maxMachines: 100,
        authorizedMachines: Array.from({ length: 100 }, (_, i) => ({
          machineId: `MACHINE-${String(i).padStart(8, '0')}-AAAAAAAA-BBBBBBBB-CCCCCCCC`,
          machineIdHash: `hash-${i}`,
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        })),
      };

      const licFile = createLicFileV2(manyMachinesData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.authorizedMachines).toHaveLength(100);
      expect(parsed.data?.authorizedMachines[0].machineId).toContain('00000000');
      expect(parsed.data?.authorizedMachines[99].machineId).toContain('00000099');
    });
  });

  describe('Edge Cases', () => {
    it('should handle license with empty modules array', () => {
      const emptyModulesData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        modules: [],
      };

      const licFile = createLicFileV2(emptyModulesData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.modules).toEqual([]);
    });

    it('should handle license without maxPrescriptions', () => {
      const noMaxPrescData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        maxPrescriptions: undefined,
      };

      const licFile = createLicFileV2(noMaxPrescData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.maxPrescriptions).toBeUndefined();
    });

    it('should handle dates far in the future', () => {
      const futureData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        expiresAt: new Date('2099-12-31'),
      };

      const licFile = createLicFileV2(futureData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.expiresAt.getFullYear()).toBe(2099);
    });

    it('should handle dates in the past', () => {
      const pastData: LicenseDataV2 = {
        ...testMultiPCLicenseData,
        createdAt: new Date('2020-01-01'),
      };

      const licFile = createLicFileV2(pastData, encryptionKey);
      const parsed = parseLicFile(licFile, encryptionKey);

      expect(parsed.data?.createdAt.getFullYear()).toBe(2020);
    });
  });
});
