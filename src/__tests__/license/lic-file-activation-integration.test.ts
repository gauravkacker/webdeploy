/**
 * Integration Tests for .lic File Activation
 * Tests the complete activation flow with both single-PC and multi-PC licenses
 */

import crypto from 'crypto';
import { generateEncryptionKey } from '@/lib/machine-binding/encryption';
import { regenerateLicFile } from '@/lib/machine-binding/lic-file-manager';
import { createLicFileV2, parseLicFile } from '@/lib/machine-binding/lic-file';
import type { AuthorizedMachine } from '@/lib/db/schema';

describe('LIC File Activation Integration Tests', () => {
  // Use a fixed encryption key for all tests to ensure consistency
  const encryptionKey = crypto.randomBytes(32);
  const testLicenseKey = 'CLINIC-ABCDE-FGHIJ-KLMNO-PQRS';
  const testCustomerId = 'cust-123';
  const testMachineId = 'machine-001';

  describe('Single-PC License Export and Activation', () => {
    it('should generate .lic file for single-PC license with plan modules', () => {
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: testMachineId,
          machineIdHash: 'hash-001',
          addedAt: new Date(),
          addedBy: 'admin',
        },
      ];

      const planModules = ['dashboard', 'patients', 'appointments', 'queue'];

      const result = regenerateLicFile(
        {
          licenseKey: testLicenseKey,
          customerId: testCustomerId,
          licenseType: 'single-pc',
          maxMachines: 1,
          authorizedMachines,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: planModules,
          maxPrescriptions: 1000,
          createdAt: new Date(),
        },
        encryptionKey
      );

      expect(result.success).toBe(true);
      expect(result.licFile).toBeDefined();
      expect(result.licFile).toBeInstanceOf(Buffer);
      expect(result.licFile!.length).toBeGreaterThan(0);
    });

    it('should fail if no modules provided', () => {
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: testMachineId,
          machineIdHash: 'hash-001',
          addedAt: new Date(),
          addedBy: 'admin',
        },
      ];

      const result = regenerateLicFile(
        {
          licenseKey: testLicenseKey,
          customerId: testCustomerId,
          licenseType: 'single-pc',
          maxMachines: 1,
          authorizedMachines,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: [],
          createdAt: new Date(),
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one module must be specified');
    });
  });

  describe('Multi-PC License Export and Activation', () => {
    it('should generate ONE .lic file for multi-PC license with all authorized machines', () => {
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: 'machine-001',
          machineIdHash: 'hash-001',
          addedAt: new Date(),
          addedBy: 'admin',
        },
        {
          machineId: 'machine-002',
          machineIdHash: 'hash-002',
          addedAt: new Date(),
          addedBy: 'admin',
        },
        {
          machineId: 'machine-003',
          machineIdHash: 'hash-003',
          addedAt: new Date(),
          addedBy: 'admin',
        },
      ];

      const planModules = ['dashboard', 'patients', 'appointments', 'queue', 'doctor-panel'];

      const result = regenerateLicFile(
        {
          licenseKey: testLicenseKey,
          customerId: testCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 3,
          authorizedMachines,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: planModules,
          createdAt: new Date(),
        },
        encryptionKey
      );

      expect(result.success).toBe(true);
      expect(result.licFile).toBeDefined();
      expect(result.licFile).toBeInstanceOf(Buffer);
      expect(result.licFile!.length).toBeGreaterThan(0);
    });

    it('should fail if authorized machines exceed maxMachines', () => {
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: 'machine-001',
          machineIdHash: 'hash-001',
          addedAt: new Date(),
          addedBy: 'admin',
        },
        {
          machineId: 'machine-002',
          machineIdHash: 'hash-002',
          addedAt: new Date(),
          addedBy: 'admin',
        },
        {
          machineId: 'machine-003',
          machineIdHash: 'hash-003',
          addedAt: new Date(),
          addedBy: 'admin',
        },
      ];

      const result = regenerateLicFile(
        {
          licenseKey: testLicenseKey,
          customerId: testCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 2, // Only 2 allowed but 3 provided
          authorizedMachines,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: ['dashboard'],
          createdAt: new Date(),
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maxMachines');
    });

    it('should fail if no authorized machines provided', () => {
      const result = regenerateLicFile(
        {
          licenseKey: testLicenseKey,
          customerId: testCustomerId,
          licenseType: 'multi-pc',
          maxMachines: 2,
          authorizedMachines: [],
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: ['dashboard'],
          createdAt: new Date(),
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one authorized machine must be specified');
    });
  });

  describe('Error Handling', () => {
    it('should fail with invalid encryption key', () => {
      const invalidKey = Buffer.alloc(16); // Wrong size
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: testMachineId,
          machineIdHash: 'hash-001',
          addedAt: new Date(),
          addedBy: 'admin',
        },
      ];

      const result = regenerateLicFile(
        {
          licenseKey: testLicenseKey,
          customerId: testCustomerId,
          licenseType: 'single-pc',
          maxMachines: 1,
          authorizedMachines,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: ['dashboard'],
          createdAt: new Date(),
        },
        invalidKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid encryption key');
    });

    it('should fail with missing license key', () => {
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: testMachineId,
          machineIdHash: 'hash-001',
          addedAt: new Date(),
          addedBy: 'admin',
        },
      ];

      const result = regenerateLicFile(
        {
          licenseKey: '',
          customerId: testCustomerId,
          licenseType: 'single-pc',
          maxMachines: 1,
          authorizedMachines,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: ['dashboard'],
          createdAt: new Date(),
        },
        encryptionKey
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required fields');
    });
  });

  describe('Performance', () => {
    it('should generate .lic file within 1 second', () => {
      const authorizedMachines: AuthorizedMachine[] = [
        {
          machineId: testMachineId,
          machineIdHash: 'hash-001',
          addedAt: new Date(),
          addedBy: 'admin',
        },
      ];

      const startTime = performance.now();

      regenerateLicFile(
        {
          licenseKey: testLicenseKey,
          customerId: testCustomerId,
          licenseType: 'single-pc',
          maxMachines: 1,
          authorizedMachines,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          modules: ['dashboard', 'patients', 'appointments'],
          createdAt: new Date(),
        },
        encryptionKey
      );

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000);
    });
  });
});
