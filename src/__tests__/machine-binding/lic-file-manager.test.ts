/**
 * .LIC File Manager Tests
 * Tests for .LIC file generation, validation, and management
 */

import {
  generateLicFile,
  validateLicFileForMachine,
  extractLicenseData,
  getRemainingDays,
  isExpiringsSoon,
  getLicenseStatus,
  regenerateLicFile,
} from '../../lib/machine-binding/lic-file-manager';
import { generateMachineId, getMachineIdHash, generateEncryptionKey } from '../../lib/machine-binding/machine-id-generator';
import { generateEncryptionKey as generateKey } from '../../lib/machine-binding/encryption';
import { parseLicFile } from '../../lib/machine-binding/lic-file';
import type { AuthorizedMachine } from '../../lib/db/schema';

describe('.LIC File Manager', () => {
  const validLicenseKey = 'KIRO-TEST-1234-5678-ABCD';
  const validCustomerId = '550e8400-e29b-41d4-a716-446655440000';
  const validModules = ['doctor', 'pharmacy'];

  let validMachineId: string;
  let validMachineIdHash: string;
  let encryptionKey: Buffer;

  beforeAll(() => {
    const machineIdResult = generateMachineId();
    validMachineId = machineIdResult.machineId;
    validMachineIdHash = getMachineIdHash(validMachineId);
    encryptionKey = generateKey();
  });

  describe('generateLicFile', () => {
    it('should generate valid .LIC file', () => {
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

      expect(result.success).toBe(true);
      expect(result.licFile).toBeDefined();
      expect(result.licFile).toBeInstanceOf(Buffer);
      expect(result.licFile!.length).toBeGreaterThan(80);
    });

    it('should reject invalid encryption key', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const invalidKey = Buffer.from('short-key');

      const result = generateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          machineId: validMachineId,
          machineIdHash: validMachineIdHash,
          expiresAt,
          modules: validModules,
        },
        invalidKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid encryption key');
    });

    it('should reject missing required fields', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = generateLicFile(
        {
          licenseKey: '',
          customerId: validCustomerId,
          machineId: validMachineId,
          machineIdHash: validMachineIdHash,
          expiresAt,
          modules: validModules,
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should reject empty modules', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = generateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          machineId: validMachineId,
          machineIdHash: validMachineIdHash,
          expiresAt,
          modules: [],
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one module must be specified');
    });

    it('should reject past expiration date', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

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

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expiration date must be in the future');
    });

    it('should include maxPrescriptions if provided', () => {
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
          maxPrescriptions: 1000,
        },
        encryptionKey
      );

      expect(result.success).toBe(true);

      // Verify by extracting
      const extractResult = extractLicenseData(result.licFile!, encryptionKey);
      expect(extractResult.data?.maxPrescriptions).toBe(1000);
    });
  });

  describe('validateLicFileForMachine', () => {
    let licFile: Buffer;

    beforeEach(() => {
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

    it('should validate correct .LIC file', () => {
      const result = validateLicFileForMachine(licFile, validMachineId, encryptionKey);

      expect(result.valid).toBe(true);
      expect(result.machineMatch).toBe(true);
      expect(result.notExpired).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should detect Machine ID mismatch', () => {
      const differentMachineId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';

      const result = validateLicFileForMachine(licFile, differentMachineId, encryptionKey);

      expect(result.valid).toBe(false);
      expect(result.machineMatch).toBe(false);
      expect(result.error).toContain('different Machine ID');
    });

    it('should reject invalid encryption key', () => {
      const invalidKey = generateKey();

      const result = validateLicFileForMachine(licFile, validMachineId, invalidKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject corrupted .LIC file', () => {
      const corruptedFile = Buffer.from(licFile);
      corruptedFile[50] = corruptedFile[50] ^ 0xFF; // Flip bits

      const result = validateLicFileForMachine(corruptedFile, validMachineId, encryptionKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('extractLicenseData', () => {
    let licFile: Buffer;

    beforeEach(() => {
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
          maxPrescriptions: 500,
        },
        encryptionKey
      );

      licFile = result.licFile!;
    });

    it('should extract license data', () => {
      const result = extractLicenseData(licFile, encryptionKey);

      expect(result.data).toBeDefined();
      expect(result.data?.licenseKey).toBe(validLicenseKey);
      expect(result.data?.customerId).toBe(validCustomerId);
      expect(result.data?.machineId).toBe(validMachineId);
      expect(result.data?.modules).toEqual(validModules);
      expect(result.data?.maxPrescriptions).toBe(500);
    });

    it('should reject invalid encryption key', () => {
      const invalidKey = generateKey();

      const result = extractLicenseData(licFile, invalidKey);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('getRemainingDays', () => {
    it('should calculate remaining days', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const remainingDays = getRemainingDays(expiresAt);

      expect(remainingDays).toBe(30);
    });

    it('should return 0 for expired date', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const remainingDays = getRemainingDays(expiresAt);

      expect(remainingDays).toBe(0);
    });
  });

  describe('isExpiringsSoon', () => {
    it('should detect expiring soon', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 15);

      const result = isExpiringsSoon(expiresAt);

      expect(result).toBe(true);
    });

    it('should not flag as expiring soon', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      const result = isExpiringsSoon(expiresAt);

      expect(result).toBe(false);
    });

    it('should respect custom threshold', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 45);

      const result = isExpiringsSoon(expiresAt, 60);

      expect(result).toBe(true);
    });
  });

  describe('getLicenseStatus', () => {
    it('should return active status', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 100);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const status = getLicenseStatus(licenseData);

      expect(status.status).toBe('active');
      expect(status.remainingDays).toBe(100);
    });

    it('should return expiring_soon status', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 15);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const status = getLicenseStatus(licenseData);

      expect(status.status).toBe('expiring_soon');
      expect(status.remainingDays).toBe(15);
    });

    it('should return expired status', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId: validMachineId,
        machineIdHash: validMachineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const status = getLicenseStatus(licenseData);

      expect(status.status).toBe('expired');
      expect(status.remainingDays).toBe(0);
    });
  });
});

  describe('regenerateLicFile', () => {
    const validLicenseKey = 'KIRO-REGEN-1234-5678-ABCD';
    const validCustomerId = '550e8400-e29b-41d4-a716-446655440001';
    const validModules = ['doctor', 'pharmacy', 'billing'];
    let encryptionKey: Buffer;
    let authorizedMachines: AuthorizedMachine[];

    beforeAll(() => {
      encryptionKey = generateKey();
      
      // Create authorized machines
      authorizedMachines = [
        {
          machineId: 'MACHINE-11111111-11111111-11111111-11111111',
          machineIdHash: getMachineIdHash('MACHINE-11111111-11111111-11111111-11111111'),
          addedAt: new Date('2024-01-01'),
          addedBy: 'admin-user-1',
        },
        {
          machineId: 'MACHINE-22222222-22222222-22222222-22222222',
          machineIdHash: getMachineIdHash('MACHINE-22222222-22222222-22222222-22222222'),
          addedAt: new Date('2024-01-02'),
          addedBy: 'admin-user-1',
        },
      ];
    });

    it('should regenerate .LIC file preserving all non-machine data', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');
      const maxPrescriptions = 1000;

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          maxPrescriptions,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(true);
      expect(result.licFile).toBeDefined();
      expect(result.licFile).toBeInstanceOf(Buffer);

      // Parse and verify all properties are preserved
      const parseResult = parseLicFile(result.licFile!, encryptionKey);
      expect(parseResult.data).toBeDefined();
      expect(parseResult.data?.licenseKey).toBe(validLicenseKey);
      expect(parseResult.data?.customerId).toBe(validCustomerId);
      expect(parseResult.data?.licenseType).toBe('multi-pc');
      expect(parseResult.data?.maxMachines).toBe(5);
      expect(parseResult.data?.modules).toEqual(validModules);
      expect(parseResult.data?.maxPrescriptions).toBe(maxPrescriptions);
      expect(parseResult.data?.expiresAt.toISOString()).toBe(expiresAt.toISOString());
      expect(parseResult.data?.createdAt.toISOString()).toBe(createdAt.toISOString());
      expect(parseResult.data?.formatVersion).toBe('2.0');
    });

    it('should preserve authorized machines array', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(true);

      // Parse and verify authorized machines
      const parseResult = parseLicFile(result.licFile!, encryptionKey);
      expect(parseResult.data?.authorizedMachines).toHaveLength(2);
      expect(parseResult.data?.authorizedMachines[0].machineId).toBe(authorizedMachines[0].machineId);
      expect(parseResult.data?.authorizedMachines[1].machineId).toBe(authorizedMachines[1].machineId);
    });

    it('should work with single-PC license', () => {
      const singleMachine: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-33333333-33333333-33333333-33333333',
          machineIdHash: getMachineIdHash('MACHINE-33333333-33333333-33333333-33333333'),
          addedAt: new Date('2024-01-01'),
          addedBy: 'admin-user-1',
        },
      ];

      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'single-pc',
          maxMachines: 1,
          authorizedMachines: singleMachine,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(true);

      // Parse and verify
      const parseResult = parseLicFile(result.licFile!, encryptionKey);
      expect(parseResult.data?.licenseType).toBe('single-pc');
      expect(parseResult.data?.maxMachines).toBe(1);
      expect(parseResult.data?.authorizedMachines).toHaveLength(1);
    });

    it('should reject invalid encryption key', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');
      const invalidKey = Buffer.from('short-key');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        invalidKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid encryption key');
    });

    it('should reject missing required fields', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: '',
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });

    it('should reject empty modules', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines,
          expiresAt,
          modules: [],
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one module must be specified');
    });

    it('should reject empty authorized machines', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines: [],
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one authorized machine must be specified');
    });

    it('should reject single-PC with maxMachines != 1', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'single-pc',
          maxMachines: 5,
          authorizedMachines: [authorizedMachines[0]],
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Single-PC license must have maxMachines = 1');
    });

    it('should reject multi-PC with maxMachines < 2', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 1,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Multi-PC license must have maxMachines >= 2');
    });

    it('should reject when authorized machines exceed maxMachines', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');
      
      // Create 3 machines but set maxMachines to 2
      const tooManyMachines: AuthorizedMachine[] = [
        authorizedMachines[0],
        authorizedMachines[1],
        {
          machineId: 'MACHINE-33333333-33333333-33333333-33333333',
          machineIdHash: getMachineIdHash('MACHINE-33333333-33333333-33333333-33333333'),
          addedAt: new Date('2024-01-03'),
          addedBy: 'admin-user-1',
        },
      ];

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 2,
          authorizedMachines: tooManyMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maxMachines');
    });

    it('should preserve maxPrescriptions when undefined', () => {
      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      expect(result.success).toBe(true);

      // Parse and verify maxPrescriptions is undefined
      const parseResult = parseLicFile(result.licFile!, encryptionKey);
      expect(parseResult.data?.maxPrescriptions).toBeUndefined();
    });
  });

  describe('regenerateLicFile - Performance Tests', () => {
    const validLicenseKey = 'KIRO-PERF-1234-5678-ABCD';
    const validCustomerId = '550e8400-e29b-41d4-a716-446655440002';
    const validModules = ['doctor', 'pharmacy', 'billing'];
    let encryptionKey: Buffer;

    beforeAll(() => {
      encryptionKey = generateKey();
    });

    it('should complete regeneration within 1 second for 2 machines', () => {
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-11111111-11111111-11111111-11111111',
          machineIdHash: getMachineIdHash('MACHINE-11111111-11111111-11111111-11111111'),
          addedAt: new Date(),
          addedBy: 'admin-user-1',
        },
        {
          machineId: 'MACHINE-22222222-22222222-22222222-22222222',
          machineIdHash: getMachineIdHash('MACHINE-22222222-22222222-22222222-22222222'),
          addedAt: new Date(),
          addedBy: 'admin-user-1',
        },
      ];

      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const startTime = performance.now();
      
      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 5,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(1000); // Must complete within 1 second
    });

    it('should complete regeneration within 1 second for 10 machines', () => {
      const authorizedMachines: AuthorizedMachine[] = Array.from({ length: 10 }, (_, i) => ({
        machineId: `MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`,
        machineIdHash: getMachineIdHash(`MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`),
        addedAt: new Date(),
        addedBy: 'admin-user-1',
      }));

      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const startTime = performance.now();
      
      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 10,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(1000); // Must complete within 1 second
    });

    it('should complete regeneration within 1 second for 50 machines', () => {
      const authorizedMachines: AuthorizedMachine[] = Array.from({ length: 50 }, (_, i) => ({
        machineId: `MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`,
        machineIdHash: getMachineIdHash(`MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`),
        addedAt: new Date(),
        addedBy: 'admin-user-1',
      }));

      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const startTime = performance.now();
      
      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 50,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(1000); // Must complete within 1 second
    });

    it('should complete regeneration within 1 second for 100 machines (max limit)', () => {
      const authorizedMachines: AuthorizedMachine[] = Array.from({ length: 100 }, (_, i) => ({
        machineId: `MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`,
        machineIdHash: getMachineIdHash(`MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`),
        addedAt: new Date(),
        addedBy: 'admin-user-1',
      }));

      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const startTime = performance.now();
      
      const result = regenerateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 100,
          authorizedMachines,
          expiresAt,
          modules: validModules,
          createdAt,
        },
        encryptionKey
      );

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      expect(result.success).toBe(true);
      expect(durationMs).toBeLessThan(1000); // Must complete within 1 second
    });

    it('should measure average regeneration time over multiple runs', () => {
      const authorizedMachines: AuthorizedMachine[] = Array.from({ length: 10 }, (_, i) => ({
        machineId: `MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`,
        machineIdHash: getMachineIdHash(`MACHINE-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}-${String(i).padStart(8, '0')}`),
        addedAt: new Date(),
        addedBy: 'admin-user-1',
      }));

      const expiresAt = new Date('2025-12-31');
      const createdAt = new Date('2024-01-01');

      const runs = 10;
      const durations: number[] = [];

      for (let i = 0; i < runs; i++) {
        const startTime = performance.now();
        
        const result = regenerateLicFile(
          {
            licenseKey: validLicenseKey,
            customerId: validCustomerId,
            licenseType: 'multi-pc',
            maxMachines: 10,
            authorizedMachines,
            expiresAt,
            modules: validModules,
            createdAt,
          },
          encryptionKey
        );

        const endTime = performance.now();
        durations.push(endTime - startTime);

        expect(result.success).toBe(true);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / runs;
      const maxDuration = Math.max(...durations);

      // Log performance metrics
      console.log(`Average regeneration time: ${avgDuration.toFixed(2)}ms`);
      console.log(`Max regeneration time: ${maxDuration.toFixed(2)}ms`);
      console.log(`Min regeneration time: ${Math.min(...durations).toFixed(2)}ms`);

      expect(avgDuration).toBeLessThan(1000);
      expect(maxDuration).toBeLessThan(1000);
    });
  });
