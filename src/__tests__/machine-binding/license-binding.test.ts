/**
 * License Binding Tests
 * Tests for license binding logic and validation
 */

import {
  bindLicenseToMachine,
  verifyLicenseBinding,
  isMachineBound,
  getRemainingDays,
  isExpiringsoon,
  calculateRenewalExpiration,
} from '../../lib/machine-binding/license-binding';
import { generateMachineId, getMachineIdHash } from '../../lib/machine-binding/machine-id-generator';

describe('License Binding', () => {
  const validLicenseKey = 'KIRO-TEST-1234-5678-ABCD';
  const validCustomerId = '550e8400-e29b-41d4-a716-446655440000';
  const validModules = ['doctor', 'pharmacy'];

  let validMachineId: string;
  let validMachineIdHash: string;

  beforeAll(() => {
    const machineIdResult = generateMachineId();
    validMachineId = machineIdResult.machineId;
    validMachineIdHash = getMachineIdHash(validMachineId);
  });

  describe('bindLicenseToMachine', () => {
    it('should bind license with valid data', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        validMachineId,
        expiresAt,
        validModules
      );

      expect(result.success).toBe(true);
      expect(result.binding).toBeDefined();
      expect(result.binding?.licenseKey).toBe(validLicenseKey);
      expect(result.binding?.customerId).toBe(validCustomerId);
      expect(result.binding?.machineId).toBe(validMachineId);
      expect(result.binding?.modules).toEqual(validModules);
    });

    it('should reject invalid license key format', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        'INVALID-KEY',
        validCustomerId,
        validMachineId,
        expiresAt,
        validModules
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid license key format');
    });

    it('should reject invalid Machine ID format', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        'INVALID-MACHINE-ID',
        expiresAt,
        validModules
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Machine ID format');
    });

    it('should reject invalid customer ID format', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        validLicenseKey,
        'invalid-customer-id',
        validMachineId,
        expiresAt,
        validModules
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid customer ID format');
    });

    it('should reject past expiration date', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        validMachineId,
        expiresAt,
        validModules
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('expiration date must be in the future');
    });

    it('should reject empty modules array', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        validMachineId,
        expiresAt,
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one module must be specified');
    });

    it('should generate Machine ID hash', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        validMachineId,
        expiresAt,
        validModules
      );

      expect(result.binding?.machineIdHash).toBeDefined();
      expect(result.binding?.machineIdHash).toBe(validMachineIdHash);
    });

    it('should set binding timestamp', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const beforeBinding = new Date();
      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        validMachineId,
        expiresAt,
        validModules
      );
      const afterBinding = new Date();

      expect(result.binding?.boundAt).toBeDefined();
      expect(result.binding?.boundAt!.getTime()).toBeGreaterThanOrEqual(beforeBinding.getTime());
      expect(result.binding?.boundAt!.getTime()).toBeLessThanOrEqual(afterBinding.getTime());
    });
  });

  describe('verifyLicenseBinding', () => {
    let binding: any;

    beforeEach(() => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        validMachineId,
        expiresAt,
        validModules
      );

      binding = result.binding;
    });

    it('should verify valid binding', () => {
      const result = verifyLicenseBinding(binding, validMachineId);

      expect(result.valid).toBe(true);
      expect(result.isBound).toBe(true);
      expect(result.machineMatch).toBe(true);
      expect(result.notExpired).toBe(true);
    });

    it('should detect Machine ID mismatch', () => {
      // Create a fake different Machine ID (same format but different value)
      const differentMachineId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';

      const result = verifyLicenseBinding(binding, differentMachineId);

      expect(result.valid).toBe(false);
      expect(result.isBound).toBe(true);
      expect(result.machineMatch).toBe(false);
      expect(result.error).toContain('different Machine ID');
    });

    it('should detect expired license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const expiredBinding = {
        ...binding,
        expiresAt,
      };

      const result = verifyLicenseBinding(expiredBinding, validMachineId);

      expect(result.valid).toBe(false);
      expect(result.notExpired).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should handle null binding', () => {
      const result = verifyLicenseBinding(null as any, validMachineId);

      expect(result.valid).toBe(false);
      expect(result.isBound).toBe(false);
      expect(result.error).toContain('No binding found');
    });

    it('should reject invalid Machine ID format', () => {
      const result = verifyLicenseBinding(binding, 'INVALID-MACHINE-ID');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid current Machine ID format');
    });
  });

  describe('isMachineBound', () => {
    let binding: any;

    beforeEach(() => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const result = bindLicenseToMachine(
        validLicenseKey,
        validCustomerId,
        validMachineId,
        expiresAt,
        validModules
      );

      binding = result.binding;
    });

    it('should return true for bound machine', () => {
      const result = isMachineBound(binding, validMachineId);
      expect(result).toBe(true);
    });

    it('should return false for different machine', () => {
      const differentMachineId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';
      const result = isMachineBound(binding, differentMachineId);
      expect(result).toBe(false);
    });

    it('should return false for null binding', () => {
      const result = isMachineBound(null, validMachineId);
      expect(result).toBe(false);
    });

    it('should return false for expired binding', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 10); // 10 days ago

      const expiredBinding = {
        ...binding,
        expiresAt,
      };

      const result = isMachineBound(expiredBinding, validMachineId);
      expect(result).toBe(false);
    });
  });

  describe('getRemainingDays', () => {
    it('should calculate remaining days correctly', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const remainingDays = getRemainingDays(expiresAt);

      expect(remainingDays).toBe(30);
    });

    it('should return 0 for expired license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const remainingDays = getRemainingDays(expiresAt);

      expect(remainingDays).toBe(0);
    });

    it('should handle same day expiration', () => {
      const expiresAt = new Date();
      expiresAt.setHours(23, 59, 59, 999);

      const remainingDays = getRemainingDays(expiresAt);

      expect(remainingDays).toBeGreaterThanOrEqual(0);
      expect(remainingDays).toBeLessThanOrEqual(1);
    });

    it('should handle far future expiration', () => {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 10);

      const remainingDays = getRemainingDays(expiresAt);

      expect(remainingDays).toBeGreaterThan(3650);
    });
  });

  describe('isExpiringsoon', () => {
    it('should detect expiring soon (within 30 days)', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 15);

      const result = isExpiringsoon(expiresAt);

      expect(result).toBe(true);
    });

    it('should not flag as expiring soon (more than 30 days)', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      const result = isExpiringsoon(expiresAt);

      expect(result).toBe(false);
    });

    it('should not flag expired license as expiring soon', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const result = isExpiringsoon(expiresAt);

      expect(result).toBe(false);
    });

    it('should respect custom threshold', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 45);

      const result = isExpiringsoon(expiresAt, 60);

      expect(result).toBe(true);
    });
  });

  describe('calculateRenewalExpiration', () => {
    it('should preserve remaining days on renewal', () => {
      const oldExpiresAt = new Date();
      oldExpiresAt.setDate(oldExpiresAt.getDate() + 30);

      const renewalExpiration = calculateRenewalExpiration(oldExpiresAt, 365);

      const remainingDays = getRemainingDays(renewalExpiration);

      // Should be approximately 30 + 365 = 395 days
      expect(remainingDays).toBeGreaterThanOrEqual(394);
      expect(remainingDays).toBeLessThanOrEqual(396);
    });

    it('should handle expired license renewal', () => {
      const oldExpiresAt = new Date();
      oldExpiresAt.setDate(oldExpiresAt.getDate() - 10);

      const renewalExpiration = calculateRenewalExpiration(oldExpiresAt, 365);

      const remainingDays = getRemainingDays(renewalExpiration);

      // When license is expired, remaining days is 0, so total = 0 + 365 = 365
      expect(remainingDays).toBeGreaterThanOrEqual(364);
      expect(remainingDays).toBeLessThanOrEqual(366);
    });

    it('should add renewal days to remaining days', () => {
      const oldExpiresAt = new Date();
      oldExpiresAt.setDate(oldExpiresAt.getDate() + 100);

      const renewalExpiration = calculateRenewalExpiration(oldExpiresAt, 200);

      const remainingDays = getRemainingDays(renewalExpiration);

      // Should be approximately 100 + 200 = 300 days
      expect(remainingDays).toBeGreaterThanOrEqual(299);
      expect(remainingDays).toBeLessThanOrEqual(301);
    });
  });
});

describe('Multi-PC License Validation', () => {
  const validLicenseKey = 'KIRO-TEST-1234-5678-ABCD';
  const validCustomerId = '550e8400-e29b-41d4-a716-446655440000';
  const validModules = ['doctor', 'pharmacy'];

  // Use hardcoded different Machine IDs for testing
  const machineId1 = 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD';
  const machineId2 = 'MACHINE-11111111-22222222-33333333-44444444';
  const machineId3 = 'MACHINE-FFFFFFFF-EEEEEEEE-99999999-88888888';
  
  let machineIdHash1: string;
  let machineIdHash2: string;
  let machineIdHash3: string;

  beforeAll(() => {
    // Generate hashes for the test Machine IDs
    machineIdHash1 = getMachineIdHash(machineId1);
    machineIdHash2 = getMachineIdHash(machineId2);
    machineIdHash3 = getMachineIdHash(machineId3);
  });

  describe('verifyMultiPCLicenseBinding', () => {
    it('should verify authorized machine in multi-PC license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: machineIdHash2,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { verifyMultiPCLicenseBinding } = require('../../lib/machine-binding/license-binding');
      const result = verifyMultiPCLicenseBinding(binding, machineId1);

      expect(result.valid).toBe(true);
      expect(result.isAuthorized).toBe(true);
      expect(result.machineMatch).toBe(true);
      expect(result.notExpired).toBe(true);
      expect(result.licenseType).toBe('multi-pc');
      expect(result.authorizedMachineCount).toBe(2);
      expect(result.maxMachines).toBe(3);
    });

    it('should reject unauthorized machine in multi-PC license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { verifyMultiPCLicenseBinding } = require('../../lib/machine-binding/license-binding');
      const result = verifyMultiPCLicenseBinding(binding, machineId2);

      expect(result.valid).toBe(false);
      expect(result.isAuthorized).toBe(false);
      expect(result.errorCode).toBe('MACHINE_NOT_AUTHORIZED');
      expect(result.error).toContain('not authorized');
      expect(result.error).toContain(machineId2);
    });

    it('should verify single-PC license (converted from v1.0)', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'single-pc' as const,
        maxMachines: 1,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'system',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { verifyMultiPCLicenseBinding } = require('../../lib/machine-binding/license-binding');
      const result = verifyMultiPCLicenseBinding(binding, machineId1);

      expect(result.valid).toBe(true);
      expect(result.isAuthorized).toBe(true);
      expect(result.licenseType).toBe('single-pc');
      expect(result.maxMachines).toBe(1);
    });

    it('should detect PC limit exceeded', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 2,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: machineIdHash2,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId3,
            machineIdHash: machineIdHash3,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { verifyMultiPCLicenseBinding } = require('../../lib/machine-binding/license-binding');
      const result = verifyMultiPCLicenseBinding(binding, machineId1);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PC_LIMIT_EXCEEDED');
      expect(result.error).toContain('exceeds PC limit');
    });

    it('should detect expired multi-PC license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 10);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { verifyMultiPCLicenseBinding } = require('../../lib/machine-binding/license-binding');
      const result = verifyMultiPCLicenseBinding(binding, machineId1);

      expect(result.valid).toBe(false);
      expect(result.notExpired).toBe(false);
      expect(result.errorCode).toBe('LICENSE_EXPIRED');
    });

    it('should handle invalid Machine ID format', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { verifyMultiPCLicenseBinding } = require('../../lib/machine-binding/license-binding');
      const result = verifyMultiPCLicenseBinding(binding, 'INVALID-MACHINE-ID');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INVALID_MACHINE_ID_FORMAT');
    });

    it('should handle null binding', () => {
      const { verifyMultiPCLicenseBinding } = require('../../lib/machine-binding/license-binding');
      const result = verifyMultiPCLicenseBinding(null as any, machineId1);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('NO_BINDING');
    });
  });

  describe('isMachineAuthorized', () => {
    it('should return true for authorized machine', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
          {
            machineId: machineId2,
            machineIdHash: machineIdHash2,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { isMachineAuthorized } = require('../../lib/machine-binding/license-binding');
      const result = isMachineAuthorized(binding, machineId2);

      expect(result).toBe(true);
    });

    it('should return false for unauthorized machine', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { isMachineAuthorized } = require('../../lib/machine-binding/license-binding');
      const result = isMachineAuthorized(binding, machineId3);

      expect(result).toBe(false);
    });

    it('should return false for null binding', () => {
      const { isMachineAuthorized } = require('../../lib/machine-binding/license-binding');
      const result = isMachineAuthorized(null, machineId1);

      expect(result).toBe(false);
    });

    it('should return false for expired license', () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 10);

      const binding = {
        licenseKey: validLicenseKey,
        customerId: validCustomerId,
        licenseType: 'multi-pc' as const,
        maxMachines: 3,
        authorizedMachines: [
          {
            machineId: machineId1,
            machineIdHash: machineIdHash1,
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ],
        boundAt: new Date(),
        expiresAt,
        modules: validModules,
      };

      const { isMachineAuthorized } = require('../../lib/machine-binding/license-binding');
      const result = isMachineAuthorized(binding, machineId1);

      expect(result).toBe(false);
    });
  });

  describe('validateLicense (unified validation)', () => {
    it('should validate multi-PC license from .LIC file', async () => {
      // This test requires actual .LIC file generation
      // For now, we'll test the function signature and error handling
      const { validateLicense } = require('../../lib/machine-binding/license-binding');
      
      // Test with invalid buffer
      const result = validateLicense(Buffer.from('invalid'), machineId1, Buffer.alloc(32));

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBeDefined();
    });
  });
});
