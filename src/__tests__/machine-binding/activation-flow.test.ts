/**
 * Activation Flow Tests
 * Tests for license activation workflow
 */

import { generateMachineId, getMachineIdHash } from '../../lib/machine-binding/machine-id-generator';
import { generateLicFile } from '../../lib/machine-binding/lic-file-manager';
import { generateEncryptionKey } from '../../lib/machine-binding/encryption';

describe('Activation Flow', () => {
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
    encryptionKey = generateEncryptionKey();
  });

  describe('First-Time Activation', () => {
    it('should generate valid Machine ID', () => {
      const result = generateMachineId();

      expect(result.machineId).toBeDefined();
      expect(result.machineId).toMatch(
        /^MACHINE-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/
      );
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should generate consistent Machine ID', () => {
      const result1 = generateMachineId();
      const result2 = generateMachineId();

      expect(result1.machineId).toBe(result2.machineId);
    });

    it('should generate .LIC file for activation', () => {
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
    });

    it('should validate .LIC file after generation', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const generateResult = generateLicFile(
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

      expect(generateResult.success).toBe(true);

      // Validate the generated file
      const { validateLicFileForMachine } = require('../../lib/machine-binding/lic-file-manager');
      const validationResult = validateLicFileForMachine(
        generateResult.licFile!,
        validMachineId,
        encryptionKey
      );

      expect(validationResult.valid).toBe(true);
      expect(validationResult.machineMatch).toBe(true);
      expect(validationResult.notExpired).toBe(true);
    });

    it('should reject .LIC file for different Machine ID', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const generateResult = generateLicFile(
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

      const differentMachineId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';

      const { validateLicFileForMachine } = require('../../lib/machine-binding/lic-file-manager');
      const validationResult = validateLicFileForMachine(
        generateResult.licFile!,
        differentMachineId,
        encryptionKey
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.machineMatch).toBe(false);
    });
  });

  describe('Activation Workflow', () => {
    it('should complete full activation workflow', () => {
      // Step 1: Generate Machine ID
      const machineIdResult = generateMachineId();
      expect(machineIdResult.machineId).toBeDefined();

      // Step 2: Generate .LIC file
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licFileResult = generateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          machineId: machineIdResult.machineId,
          machineIdHash: getMachineIdHash(machineIdResult.machineId),
          expiresAt,
          modules: validModules,
        },
        encryptionKey
      );

      expect(licFileResult.success).toBe(true);

      // Step 3: Validate .LIC file
      const { validateLicFileForMachine } = require('../../lib/machine-binding/lic-file-manager');
      const validationResult = validateLicFileForMachine(
        licFileResult.licFile!,
        machineIdResult.machineId,
        encryptionKey
      );

      expect(validationResult.valid).toBe(true);
      expect(validationResult.data?.licenseKey).toBe(validLicenseKey);
      expect(validationResult.data?.customerId).toBe(validCustomerId);
    });

    it('should handle base64 encoded .LIC file', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const generateResult = generateLicFile(
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

      // Convert to base64
      const base64 = generateResult.licFile!.toString('base64');
      expect(typeof base64).toBe('string');

      // Convert back from base64
      const buffer = Buffer.from(base64, 'base64');
      expect(buffer.length).toBe(generateResult.licFile!.length);

      // Validate the converted file
      const { validateLicFileForMachine } = require('../../lib/machine-binding/lic-file-manager');
      const validationResult = validateLicFileForMachine(
        buffer,
        validMachineId,
        encryptionKey
      );

      expect(validationResult.valid).toBe(true);
    });
  });

  describe('Activation Error Handling', () => {
    it('should reject corrupted .LIC file', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const generateResult = generateLicFile(
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

      // Corrupt the file
      const corruptedFile = Buffer.from(generateResult.licFile!);
      corruptedFile[50] = corruptedFile[50] ^ 0xFF;

      const { validateLicFileForMachine } = require('../../lib/machine-binding/lic-file-manager');
      const validationResult = validateLicFileForMachine(
        corruptedFile,
        validMachineId,
        encryptionKey
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });

    it('should reject invalid encryption key', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const generateResult = generateLicFile(
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

      const invalidKey = generateEncryptionKey();

      const { validateLicFileForMachine } = require('../../lib/machine-binding/lic-file-manager');
      const validationResult = validateLicFileForMachine(
        generateResult.licFile!,
        validMachineId,
        invalidKey
      );

      expect(validationResult.valid).toBe(false);
    });

    it('should handle missing .LIC file', () => {
      const emptyBuffer = Buffer.alloc(0);

      const { validateLicFileForMachine } = require('../../lib/machine-binding/lic-file-manager');
      const validationResult = validateLicFileForMachine(
        emptyBuffer,
        validMachineId,
        encryptionKey
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.error).toBeDefined();
    });
  });

  describe('Activation Status', () => {
    it('should report license status after activation', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const { getLicenseStatus } = require('../../lib/machine-binding/lic-file-manager');

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
      expect(status.remainingDays).toBeGreaterThan(0);
      expect(status.message).toContain('active');
    });

    it('should detect expiring license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 15);

      const { getLicenseStatus } = require('../../lib/machine-binding/lic-file-manager');

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
  });
});

describe('Multi-PC License Activation Flow', () => {
  const validLicenseKey = 'KIRO-MULTI-1234-5678-ABCD';
  const validCustomerId = '550e8400-e29b-41d4-a716-446655440000';
  const validModules = ['doctor', 'pharmacy'];

  let machineId1: string;
  let machineId2: string;
  let machineId3: string;
  let encryptionKey: Buffer;

  beforeAll(() => {
    // Generate multiple Machine IDs for testing
    machineId1 = 'MACHINE-11111111-11111111-11111111-11111111';
    machineId2 = 'MACHINE-22222222-22222222-22222222-22222222';
    machineId3 = 'MACHINE-33333333-33333333-33333333-33333333';
    encryptionKey = generateEncryptionKey();
  });

  describe('Multi-PC License Validation', () => {
    it('should validate authorized Machine ID in multi-PC license', () => {
      const { createLicFileV2 } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: getMachineIdHash(machineId1),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: getMachineIdHash(machineId2),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(licenseData, encryptionKey);
      expect(licFile).toBeInstanceOf(Buffer);

      // Validate with first authorized Machine ID
      const { validateLicense } = require('../../lib/machine-binding/license-binding');
      const validationResult1 = validateLicense(
        licFile,
        machineId1,
        encryptionKey
      );

      expect(validationResult1.valid).toBe(true);
      expect(validationResult1.isAuthorized).toBe(true);
      expect(validationResult1.licenseType).toBe('multi-pc');
      expect(validationResult1.authorizedMachineCount).toBe(2);
      expect(validationResult1.maxMachines).toBe(3);

      // Validate with second authorized Machine ID
      const validationResult2 = validateLicense(
        licFile,
        machineId2,
        encryptionKey
      );

      expect(validationResult2.valid).toBe(true);
      expect(validationResult2.isAuthorized).toBe(true);
    });

    it('should reject unauthorized Machine ID in multi-PC license', () => {
      const { createLicFileV2 } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: getMachineIdHash(machineId1),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: getMachineIdHash(machineId2),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(licenseData, encryptionKey);
      expect(licFile).toBeInstanceOf(Buffer);

      // Try to validate with unauthorized Machine ID
      const { validateLicense } = require('../../lib/machine-binding/license-binding');
      const validationResult = validateLicense(
        licFile,
        machineId3,
        encryptionKey
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.isAuthorized).toBe(false);
      expect(validationResult.errorCode).toBe('MACHINE_NOT_AUTHORIZED');
      expect(validationResult.error).toContain('not authorized');
      expect(validationResult.currentMachineId).toBe(machineId3);
    });

    it('should support concurrent activation on all authorized PCs', () => {
      const { createLicFileV2 } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: getMachineIdHash(machineId1),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: getMachineIdHash(machineId2),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId3,
            machineIdHash: getMachineIdHash(machineId3),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(licenseData, encryptionKey);
      expect(licFile).toBeInstanceOf(Buffer);

      // Validate all three machines can activate simultaneously
      const { validateLicense } = require('../../lib/machine-binding/license-binding');
      
      const validation1 = validateLicense(licFile, machineId1, encryptionKey);
      const validation2 = validateLicense(licFile, machineId2, encryptionKey);
      const validation3 = validateLicense(licFile, machineId3, encryptionKey);

      expect(validation1.valid).toBe(true);
      expect(validation2.valid).toBe(true);
      expect(validation3.valid).toBe(true);

      // All should show the same license info
      expect(validation1.authorizedMachineCount).toBe(3);
      expect(validation2.authorizedMachineCount).toBe(3);
      expect(validation3.authorizedMachineCount).toBe(3);
    });
  });

  describe('Format Version Detection', () => {
    it('should parse v2.0 format and extract authorized machines', () => {
      const { createLicFileV2, parseLicFile } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 2,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: getMachineIdHash(machineId1),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: getMachineIdHash(machineId2),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(licenseData, encryptionKey);
      expect(licFile).toBeInstanceOf(Buffer);

      // Parse the file
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data).toBeDefined();
      expect(parseResult.data?.formatVersion).toBe('2.0');
      expect(parseResult.data?.licenseType).toBe('multi-pc');
      expect(parseResult.data?.maxMachines).toBe(2);
      expect(parseResult.data?.authorizedMachines).toHaveLength(2);
      expect(parseResult.data?.authorizedMachines[0].machineId).toBe(machineId1);
      expect(parseResult.data?.authorizedMachines[1].machineId).toBe(machineId2);
    });

    it('should convert v1.0 format to v2.0 internally', () => {
      const { generateLicFile } = require('../../lib/machine-binding/lic-file-manager');
      const { parseLicFile } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      // Generate v1.0 format license
      const licFileResult = generateLicFile(
        {
          licenseKey: validLicenseKey,
          customerId: validCustomerId,
          machineId: machineId1,
          machineIdHash: getMachineIdHash(machineId1),
          expiresAt,
          modules: validModules,
        },
        encryptionKey
      );

      expect(licFileResult.success).toBe(true);

      // Parse should convert to v2.0 format internally
      const parseResult = parseLicFile(licFileResult.licFile!, encryptionKey);

      expect(parseResult.data).toBeDefined();
      expect(parseResult.data?.licenseType).toBe('single-pc');
      expect(parseResult.data?.maxMachines).toBe(1);
      expect(parseResult.data?.authorizedMachines).toHaveLength(1);
      expect(parseResult.data?.authorizedMachines[0].machineId).toBe(machineId1);
    });
  });

  describe('Enhanced Error Messages', () => {
    it('should return enhanced error for MACHINE_NOT_AUTHORIZED', () => {
      const { createLicFileV2 } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 2,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: getMachineIdHash(machineId1),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(licenseData, encryptionKey);
      const { validateLicense } = require('../../lib/machine-binding/license-binding');
      
      const validationResult = validateLicense(
        licFile,
        machineId2,
        encryptionKey
      );

      expect(validationResult.valid).toBe(false);
      expect(validationResult.errorCode).toBe('MACHINE_NOT_AUTHORIZED');
      expect(validationResult.error).toContain('not authorized');
      expect(validationResult.error).toContain(machineId2);
      expect(validationResult.error).toContain('administrator');
    });

    it('should validate PC limit not exceeded', () => {
      const { createLicFileV2 } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      // Create license with more machines than limit (invalid state)
      // This should be caught during parsing as the file itself is invalid
      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 2,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: getMachineIdHash(machineId1),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: getMachineIdHash(machineId2),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId3,
            machineIdHash: getMachineIdHash(machineId3),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(licenseData, encryptionKey);
      const { validateLicense } = require('../../lib/machine-binding/license-binding');
      
      const validationResult = validateLicense(
        licFile,
        machineId1,
        encryptionKey
      );

      // The file is invalid because it exceeds PC limit
      // This is caught during parsing, so we get PARSE_ERROR
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errorCode).toBe('PARSE_ERROR');
      expect(validationResult.error).toContain('exceeds');
    });
  });

  describe('Activation Timestamp Tracking', () => {
    it('should track activation timestamp for each Machine ID', () => {
      const { createLicFileV2, parseLicFile } = require('../../lib/machine-binding/lic-file');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const now = new Date();
      const licenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 2,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: getMachineIdHash(machineId1),
            addedAt: now.toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: getMachineIdHash(machineId2),
            addedAt: now.toISOString(),
            addedBy: 'admin',
          },
        ],
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
        formatVersion: '2.0',
      };

      const licFile = createLicFileV2(licenseData, encryptionKey);
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data?.authorizedMachines[0].addedAt).toBeDefined();
      expect(parseResult.data?.authorizedMachines[1].addedAt).toBeDefined();
      
      // Verify timestamps are valid ISO strings
      const timestamp1 = new Date(parseResult.data?.authorizedMachines[0].addedAt);
      const timestamp2 = new Date(parseResult.data?.authorizedMachines[1].addedAt);
      
      expect(timestamp1.getTime()).toBeGreaterThan(0);
      expect(timestamp2.getTime()).toBeGreaterThan(0);
    });
  });
});
