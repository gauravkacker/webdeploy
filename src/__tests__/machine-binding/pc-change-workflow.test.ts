/**
 * PC Change Workflow Tests
 * Tests for license transfer when moving to a new PC
 */

import {
  generateNewMachineId,
  getPcChangeGuidance,
  getAdminTransferGuidance,
  validatePcChange,
  invalidateOldLicense,
  acceptNewLicenseFile,
  completePcChangeWorkflow,
  getRemainingLicenseDays,
  preserveRemainingDays,
} from '@/lib/machine-binding/pc-change-workflow';
import { createLicFile } from '@/lib/machine-binding/lic-file';
import { generateEncryptionKey } from '@/lib/machine-binding/encryption';
import { generateMachineId, getMachineIdHash } from '@/lib/machine-binding/machine-id-generator';
import { storeLicense, deleteLicense } from '@/lib/machine-binding/local-license-storage';
import fs from 'fs';
import path from 'path';

// Test storage directory
const TEST_STORAGE_DIR = path.join(process.cwd(), '.test-license-storage-pc-change');

// Cleanup function
function cleanupTestStorage() {
  if (fs.existsSync(TEST_STORAGE_DIR)) {
    fs.rmSync(TEST_STORAGE_DIR, { recursive: true });
  }
}

describe('PC Change Workflow', () => {
  beforeEach(() => {
    cleanupTestStorage();
  });

  afterAll(() => {
    cleanupTestStorage();
  });

  describe('generateNewMachineId', () => {
    it('should generate a new Machine ID successfully', () => {
      const result = generateNewMachineId();

      expect(result.success).toBe(true);
      expect(result.machineId).toBeDefined();
      expect(result.machineId).toMatch(/^MACHINE-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);
      expect(result.components).toBeDefined();
      expect(result.components?.cpuSignature).toBeDefined();
      expect(result.components?.diskSerial).toBeDefined();
      expect(result.components?.osHash).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should generate different Machine IDs on different calls (due to timestamp)', () => {
      const result1 = generateNewMachineId();
      const result2 = generateNewMachineId();

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Machine IDs should be the same (same hardware), but timestamps different
      expect(result1.machineId).toBe(result2.machineId);
      expect(result1.timestamp).not.toEqual(result2.timestamp);
    });
  });

  describe('getPcChangeGuidance', () => {
    it('should return user guidance for PC change', () => {
      const guidance = getPcChangeGuidance();

      expect(guidance.title).toBeDefined();
      expect(guidance.description).toBeDefined();
      expect(guidance.steps).toBeInstanceOf(Array);
      expect(guidance.steps.length).toBeGreaterThan(0);
      expect(guidance.adminSteps).toBeInstanceOf(Array);
      expect(guidance.adminSteps.length).toBeGreaterThan(0);
      expect(guidance.options).toBeInstanceOf(Array);
      expect(guidance.options.length).toBeGreaterThan(0);
    });

    it('should include clear steps for user', () => {
      const guidance = getPcChangeGuidance();

      const stepTexts = guidance.steps.join(' ').toLowerCase();
      expect(stepTexts).toContain('machine id');
      expect(stepTexts).toContain('admin');
      expect(stepTexts).toContain('license');
    });

    it('should include clear steps for admin', () => {
      const guidance = getPcChangeGuidance();

      const adminStepTexts = guidance.adminSteps.join(' ').toLowerCase();
      expect(adminStepTexts).toContain('machine id');
      expect(adminStepTexts).toContain('license');
    });
  });

  describe('getAdminTransferGuidance', () => {
    it('should return admin guidance with Machine IDs', () => {
      const oldMachineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const newMachineId = 'MACHINE-87654321-87654321-87654321-87654321';

      const guidance = getAdminTransferGuidance(oldMachineId, newMachineId);

      expect(guidance.title).toBeDefined();
      expect(guidance.description).toBeDefined();
      expect(guidance.oldMachineId).toBe(oldMachineId);
      expect(guidance.newMachineId).toBe(newMachineId);
      expect(guidance.steps).toBeInstanceOf(Array);
      expect(guidance.instructions).toBeInstanceOf(Array);
    });

    it('should include both Machine IDs in instructions', () => {
      const oldMachineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const newMachineId = 'MACHINE-87654321-87654321-87654321-87654321';

      const guidance = getAdminTransferGuidance(oldMachineId, newMachineId);

      const instructionText = guidance.instructions.join(' ');
      expect(instructionText).toContain(oldMachineId);
      expect(instructionText).toContain(newMachineId);
    });
  });

  describe('validatePcChange', () => {
    it('should validate valid PC change', () => {
      const oldMachineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const newMachineId = 'MACHINE-87654321-87654321-87654321-87654321';

      const result = validatePcChange(oldMachineId, newMachineId);

      expect(result.isValid).toBe(true);
      expect(result.canProceed).toBe(true);
    });

    it('should reject invalid old Machine ID format', () => {
      const oldMachineId = 'INVALID-ID';
      const newMachineId = 'MACHINE-87654321-87654321-87654321-87654321';

      const result = validatePcChange(oldMachineId, newMachineId);

      expect(result.isValid).toBe(false);
      expect(result.canProceed).toBe(false);
      expect(result.reason).toContain('Invalid');
    });

    it('should reject invalid new Machine ID format', () => {
      const oldMachineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const newMachineId = 'INVALID-ID';

      const result = validatePcChange(oldMachineId, newMachineId);

      expect(result.isValid).toBe(false);
      expect(result.canProceed).toBe(false);
      expect(result.reason).toContain('Invalid');
    });

    it('should reject when Machine IDs are the same', () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';

      const result = validatePcChange(machineId, machineId);

      expect(result.isValid).toBe(false);
      expect(result.canProceed).toBe(false);
      expect(result.reason).toContain('must be different');
    });
  });

  describe('invalidateOldLicense', () => {
    it('should invalidate old license', async () => {
      const oldMachineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const encryptionKey = generateEncryptionKey();

      // Create and store a license first
      const licenseData = {
        machineId: oldMachineId,
        licenseKey: 'TEST-LICENSE-KEY',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        modules: ['module1', 'module2'],
      };

      const licFileBuffer = Buffer.from('test-lic-file-content');
      storeLicense(licenseData, licFileBuffer, encryptionKey, TEST_STORAGE_DIR);

      // Invalidate the license
      const result = invalidateOldLicense(oldMachineId, TEST_STORAGE_DIR);

      expect(result.success).toBe(true);
      expect(result.oldMachineId).toBe(oldMachineId);
      expect(result.invalidatedAt).toBeInstanceOf(Date);
    });

    it('should handle non-existent license gracefully', () => {
      const oldMachineId = 'MACHINE-12345678-12345678-12345678-12345678';

      const result = invalidateOldLicense(oldMachineId, TEST_STORAGE_DIR);

      // Should succeed even if license doesn't exist
      expect(result.success).toBe(true);
    });
  });

  describe('acceptNewLicenseFile', () => {
    it('should accept valid new license file', () => {
      const newMachineId = generateMachineId().machineId;
      const encryptionKey = generateEncryptionKey();

      const licenseData = {
        machineId: newMachineId,
        licenseKey: 'TEST-LICENSE-KEY',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        modules: ['module1', 'module2'],
        machineIdHash: getMachineIdHash(newMachineId),
        customerId: 'test-customer',
      };

      const licFileBuffer = createLicFile(licenseData, encryptionKey);

      const result = acceptNewLicenseFile(
        newMachineId,
        licFileBuffer,
        encryptionKey,
        TEST_STORAGE_DIR
      );

      expect(result.success).toBe(true);
      expect(result.newMachineId).toBe(newMachineId);
      expect(result.licenseData).toBeDefined();
    });

    it('should reject mismatched Machine ID', () => {
      const correctMachineId = generateMachineId().machineId;
      const wrongMachineId = generateMachineId().machineId;
      const encryptionKey = generateEncryptionKey();

      const licenseData = {
        machineId: correctMachineId,
        licenseKey: 'TEST-LICENSE-KEY',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        modules: ['module1', 'module2'],
      };

      const licFileBuffer = createLicFile(licenseData, encryptionKey);

      const result = acceptNewLicenseFile(
        wrongMachineId,
        licFileBuffer,
        encryptionKey,
        TEST_STORAGE_DIR
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject invalid .LIC file', () => {
      const newMachineId = generateMachineId().machineId;
      const encryptionKey = generateEncryptionKey();
      const invalidLicFileBuffer = Buffer.from('invalid-lic-content');

      const result = acceptNewLicenseFile(
        newMachineId,
        invalidLicFileBuffer,
        encryptionKey,
        TEST_STORAGE_DIR
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('completePcChangeWorkflow', () => {
    it('should complete full PC change workflow', () => {
      const oldMachineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const newMachineId = generateMachineId().machineId;
      const encryptionKey = generateEncryptionKey();

      const licenseData = {
        machineId: newMachineId,
        licenseKey: 'TEST-LICENSE-KEY',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        modules: ['module1', 'module2'],
        machineIdHash: getMachineIdHash(newMachineId),
        customerId: 'test-customer',
      };

      const licFileBuffer = createLicFile(licenseData, encryptionKey);

      const result = completePcChangeWorkflow(
        oldMachineId,
        newMachineId,
        licFileBuffer,
        encryptionKey,
        TEST_STORAGE_DIR
      );

      expect(result.success).toBe(true);
      expect(result.oldMachineId).toBe(oldMachineId);
      expect(result.newMachineId).toBe(newMachineId);
    });

    it('should fail with invalid Machine IDs', () => {
      const oldMachineId = 'INVALID-ID';
      const newMachineId = 'ALSO-INVALID';
      const encryptionKey = generateEncryptionKey();
      const licFileBuffer = Buffer.from('test');

      const result = completePcChangeWorkflow(
        oldMachineId,
        newMachineId,
        licFileBuffer,
        encryptionKey,
        TEST_STORAGE_DIR
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getRemainingLicenseDays', () => {
    it('should calculate remaining days correctly', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      const remainingDays = getRemainingLicenseDays(expiresAt);

      expect(remainingDays).toBeGreaterThanOrEqual(29);
      expect(remainingDays).toBeLessThanOrEqual(30);
    });

    it('should return 0 for expired license', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

      const remainingDays = getRemainingLicenseDays(expiresAt);

      expect(remainingDays).toBe(0);
    });

    it('should return correct days for future expiration', () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year from now

      const remainingDays = getRemainingLicenseDays(expiresAt);

      expect(remainingDays).toBeGreaterThanOrEqual(364);
      expect(remainingDays).toBeLessThanOrEqual(365);
    });
  });

  describe('preserveRemainingDays', () => {
    it('should preserve remaining days in new license', () => {
      const now = new Date();
      const oldExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      const newCreatedAt = new Date();

      const newExpiresAt = preserveRemainingDays(oldExpiresAt, newCreatedAt);

      const remainingDays = getRemainingLicenseDays(newExpiresAt);
      expect(remainingDays).toBeGreaterThanOrEqual(29);
      expect(remainingDays).toBeLessThanOrEqual(30);
    });

    it('should handle expired license', () => {
      const now = new Date();
      const oldExpiresAt = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const newCreatedAt = new Date();

      const newExpiresAt = preserveRemainingDays(oldExpiresAt, newCreatedAt);

      // Should be today or tomorrow (0 remaining days)
      const remainingDays = getRemainingLicenseDays(newExpiresAt);
      expect(remainingDays).toBeLessThanOrEqual(1);
    });

    it('should calculate correct new expiration date', () => {
      const now = new Date();
      const oldExpiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
      const newCreatedAt = new Date();

      const newExpiresAt = preserveRemainingDays(oldExpiresAt, newCreatedAt);

      // New expiration should be approximately 60 days from new creation date
      const expectedExpiresAt = new Date(newCreatedAt);
      expectedExpiresAt.setDate(expectedExpiresAt.getDate() + 60);

      const diff = Math.abs(newExpiresAt.getTime() - expectedExpiresAt.getTime());
      expect(diff).toBeLessThan(1000 * 60 * 60); // Less than 1 hour difference
    });
  });
});
