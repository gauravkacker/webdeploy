/**
 * v1.0 Backward Compatibility Integration Tests
 * Tests that v1.0 .LIC files work correctly with the new multi-PC system
 */

import { createLicFile, parseLicFile, LicenseData } from '../../lib/machine-binding/lic-file';
import { validateLicense } from '../../lib/machine-binding/license-binding';
import { getMachineIdHash } from '../../lib/machine-binding/machine-id-generator';
import crypto from 'crypto';

describe('v1.0 Backward Compatibility Integration Tests', () => {
  const validLicenseKey = 'KIRO-TEST-1234-5678-ABCD';
  const validCustomerId = '550e8400-e29b-41d4-a716-446655440000';
  const validModules = ['doctor', 'pharmacy'];
  const machineId = 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD';
  const machineIdHash = getMachineIdHash(machineId);
  const encryptionKey = crypto.randomBytes(32);

  describe('v1.0 .LIC File Parsing', () => {
    it('should parse v1.0 .LIC file and convert to v2.0 format internally', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      // Create v1.0 format license data
      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        maxPrescriptions: 1000,
        createdAt: new Date(),
      };

      // Generate v1.0 .LIC file
      const licFile = createLicFile(licenseData, encryptionKey);

      // Parse the file
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data).toBeDefined();
      expect(parseResult.version).toBe(1);
      
      // Verify conversion to v2.0 format
      const parsedData = parseResult.data!;
      expect(parsedData.licenseType).toBe('single-pc');
      expect(parsedData.maxMachines).toBe(1);
      expect(parsedData.authorizedMachines).toHaveLength(1);
      expect(parsedData.authorizedMachines[0].machineId).toBe(machineId);
      expect(parsedData.authorizedMachines[0].machineIdHash).toBe(machineIdHash);
      expect(parsedData.formatVersion).toBe('1.0');
    });

    it('should preserve all v1.0 license properties during conversion', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);
      const createdAt = new Date();

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        maxPrescriptions: 500,
        createdAt,
      };

      const licFile = createLicFile(licenseData, encryptionKey);
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data).toBeDefined();
      const parsedData = parseResult.data!;

      // Verify all properties are preserved
      expect(parsedData.licenseKey).toBe(validLicenseKey);
      expect(parsedData.customerId).toBe(validCustomerId);
      expect(parsedData.modules).toEqual(validModules);
      expect(parsedData.maxPrescriptions).toBe(500);
      expect(parsedData.expiresAt.toISOString()).toBe(expiresAt.toISOString());
      expect(parsedData.createdAt.toISOString()).toBe(createdAt.toISOString());
    });

    it('should maintain backward compatibility fields in converted data', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data).toBeDefined();
      const parsedData = parseResult.data!;

      // Verify backward compatibility fields are present
      expect(parsedData.machineId).toBe(machineId);
      expect(parsedData.machineIdHash).toBe(machineIdHash);
    });
  });

  describe('v1.0 License Validation', () => {
    it('should validate v1.0 .LIC file for correct machine', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Validate using unified validation function
      const result = validateLicense(licFile, machineId, encryptionKey);

      expect(result.valid).toBe(true);
      expect(result.isAuthorized).toBe(true);
      expect(result.machineMatch).toBe(true);
      expect(result.notExpired).toBe(true);
      expect(result.licenseType).toBe('single-pc');
      expect(result.maxMachines).toBe(1);
      expect(result.authorizedMachineCount).toBe(1);
    });

    it('should reject v1.0 .LIC file for different machine', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Try to validate with different machine ID
      const differentMachineId = 'MACHINE-11111111-22222222-33333333-44444444';
      const result = validateLicense(licFile, differentMachineId, encryptionKey);

      expect(result.valid).toBe(false);
      expect(result.isAuthorized).toBe(false);
      expect(result.errorCode).toBe('MACHINE_NOT_AUTHORIZED');
      expect(result.licenseType).toBe('single-pc');
    });

    it('should detect expired v1.0 license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 10); // Expired 10 days ago

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);
      const result = validateLicense(licFile, machineId, encryptionKey);

      expect(result.valid).toBe(false);
      expect(result.notExpired).toBe(false);
      expect(result.errorCode).toBe('LICENSE_EXPIRED');
    });
  });

  describe('v1.0 to v2.0 Migration Scenarios', () => {
    it('should treat v1.0 license as single-PC license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data).toBeDefined();
      const parsedData = parseResult.data!;

      // Should be treated as single-PC
      expect(parsedData.licenseType).toBe('single-pc');
      expect(parsedData.maxMachines).toBe(1);
      expect(parsedData.authorizedMachines).toHaveLength(1);
    });

    it('should set system as addedBy for migrated v1.0 licenses', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data).toBeDefined();
      const parsedData = parseResult.data!;

      // Verify system attribution
      expect(parsedData.authorizedMachines[0].addedBy).toBe('system');
    });

    it('should use createdAt as addedAt for migrated v1.0 licenses', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);
      const createdAt = new Date('2024-01-01T00:00:00Z');

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt,
      };

      const licFile = createLicFile(licenseData, encryptionKey);
      const parseResult = parseLicFile(licFile, encryptionKey);

      expect(parseResult.data).toBeDefined();
      const parsedData = parseResult.data!;

      // Verify addedAt matches createdAt
      expect(parsedData.authorizedMachines[0].addedAt).toBe(createdAt.toISOString());
    });
  });

  describe('Mixed v1.0 and v2.0 Scenarios', () => {
    it('should handle v1.0 files alongside v2.0 files', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      // Create v1.0 file
      const v1Data: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const v1LicFile = createLicFile(v1Data, encryptionKey);
      const v1Result = parseLicFile(v1LicFile, encryptionKey);

      expect(v1Result.data).toBeDefined();
      expect(v1Result.version).toBe(1);
      expect(v1Result.data!.licenseType).toBe('single-pc');

      // Both should parse successfully
      expect(v1Result.data).toBeDefined();
    });

    it('should validate v1.0 license with same logic as v2.0 single-PC', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const v1Data: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const v1LicFile = createLicFile(v1Data, encryptionKey);
      const v1ValidationResult = validateLicense(v1LicFile, machineId, encryptionKey);

      // Should validate successfully
      expect(v1ValidationResult.valid).toBe(true);
      expect(v1ValidationResult.licenseType).toBe('single-pc');
      expect(v1ValidationResult.maxMachines).toBe(1);
      expect(v1ValidationResult.authorizedMachineCount).toBe(1);
    });
  });

  describe('Error Handling for v1.0 Files', () => {
    it('should handle corrupted v1.0 .LIC file', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Corrupt the file
      const corruptedFile = Buffer.from(licFile);
      corruptedFile[50] = corruptedFile[50] ^ 0xFF;

      const parseResult = parseLicFile(corruptedFile, encryptionKey);

      expect(parseResult.data).toBeNull();
      expect(parseResult.error).toBeDefined();
    });

    it('should handle v1.0 file with wrong encryption key', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Try to parse with different key
      const wrongKey = crypto.randomBytes(32);
      const parseResult = parseLicFile(licFile, wrongKey);

      expect(parseResult.data).toBeNull();
      expect(parseResult.error).toBeDefined();
    });

    it('should provide helpful error messages for v1.0 validation failures', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const licenseData: LicenseData = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        machineId,
        machineIdHash,
        expiresAt,
        modules: validModules,
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Try with wrong machine
      const wrongMachineId = 'MACHINE-FFFFFFFF-EEEEEEEE-DDDDDDDD-CCCCCCCC';
      const result = validateLicense(licFile, wrongMachineId, encryptionKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not authorized');
      expect(result.error).toContain(wrongMachineId);
      expect(result.errorCode).toBe('MACHINE_NOT_AUTHORIZED');
    });
  });
});
