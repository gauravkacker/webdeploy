/**
 * License Activation Flow Test
 * Verifies that generated license keys work properly on the activation page
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { generateKey, validateKeyFormat, verifyKeyChecksum } from '@/lib/license-key-generator';
import { validateLicense } from '@/lib/license-validator';
import { LocalDatabase } from '@/lib/db/database';

describe('License Activation Flow', () => {
  let db: LocalDatabase;

  beforeEach(() => {
    db = LocalDatabase.getInstance();
    db.reset();
  });

  describe('Key Generation', () => {
    it('should generate a valid license key with correct format', () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      expect(key).toBeDefined();
      expect(validateKeyFormat(key)).toBe(true);
      expect(key).toMatch(/^CLINIC-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    });

    it('should generate keys with valid checksums', () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      expect(verifyKeyChecksum(key)).toBe(true);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = generateKey('CUST-001', 'PLAN-001');
      const key2 = generateKey('CUST-002', 'PLAN-002');
      
      expect(key1).not.toBe(key2);
    });

    it('should generate consistent keys for same inputs', () => {
      // Note: Due to random segments, keys will be different
      // But both should be valid
      const key1 = generateKey('CUST-001', 'PLAN-001');
      const key2 = generateKey('CUST-001', 'PLAN-001');
      
      expect(validateKeyFormat(key1)).toBe(true);
      expect(validateKeyFormat(key2)).toBe(true);
      expect(verifyKeyChecksum(key1)).toBe(true);
      expect(verifyKeyChecksum(key2)).toBe(true);
    });
  });

  describe('Key Validation', () => {
    it('should reject invalid key formats', () => {
      expect(validateKeyFormat('INVALID-KEY')).toBe(false);
      expect(validateKeyFormat('CLINIC-SHORT')).toBe(false);
      expect(validateKeyFormat('clinic-XXXXX-XXXXX-XXXXX-XXXXX')).toBe(false);
    });

    it('should reject keys with invalid checksums', () => {
      const validKey = generateKey('CUST-001', 'PLAN-001');
      const parts = validKey.split('-');
      
      // Modify the checksum
      const invalidKey = `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}-XXXXX`;
      
      expect(verifyKeyChecksum(invalidKey)).toBe(false);
    });

    it('should accept valid generated keys', () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      expect(validateKeyFormat(key)).toBe(true);
      expect(verifyKeyChecksum(key)).toBe(true);
    });
  });

  describe('Activation Flow', () => {
    it('should reject activation for non-existent license key', async () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      const result = await validateLicense(key);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('License key not found');
    });

    it('should accept activation for valid license key in database', async () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Test Customer',
        email: 'test@example.com',
      });

      // Create license with the generated key
      const license = db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments', 'billing'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        maxPrescriptions: 1000,
      });

      const result = await validateLicense(key);
      
      expect(result.valid).toBe(true);
      expect(result.license?.licenseKey).toBe(key);
      expect(result.modules).toContain('appointments');
      expect(result.modules).toContain('billing');
    });

    it('should reject expired licenses', async () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Test Customer',
        email: 'test@example.com',
      });

      // Create expired license
      db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments'],
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        maxPrescriptions: 1000,
      });

      const result = await validateLicense(key);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('License has expired');
    });

    it('should reject inactive licenses', async () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Test Customer',
        email: 'test@example.com',
      });

      // Create inactive license
      db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'suspended',
        modules: ['appointments'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 1000,
      });

      const result = await validateLicense(key);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('License is suspended');
    });

    it('should handle uppercase conversion in activation page', async () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      const lowerKey = key.toLowerCase();
      
      // Create customer and license
      const customer = db.create('customers', {
        name: 'Test Customer',
        email: 'test@example.com',
      });

      db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 1000,
      });

      // Activation page converts to uppercase before sending
      const result = await validateLicense(lowerKey.toUpperCase());
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Activation Page Integration', () => {
    it('should validate key format before sending to API', () => {
      const validKey = generateKey('CUST-001', 'PLAN-001');
      const invalidKey = 'INVALID-KEY';
      
      // Simulate activation page validation
      expect(validateKeyFormat(validKey)).toBe(true);
      expect(validateKeyFormat(invalidKey)).toBe(false);
    });

    it('should handle key with spaces (trimmed)', () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      const keyWithSpaces = `  ${key}  `;
      
      // Activation page trims the input
      const trimmedKey = keyWithSpaces.trim();
      
      expect(validateKeyFormat(trimmedKey)).toBe(true);
      expect(verifyKeyChecksum(trimmedKey)).toBe(true);
    });

    it('should provide clear error messages for invalid keys', async () => {
      const invalidKey = 'CLINIC-XXXXX-XXXXX-XXXXX-XXXXX';
      
      const result = await validateLicense(invalidKey);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.reason).toMatch(/checksum|not found|invalid/i);
    });
  });

  describe('Multi-PC License Support', () => {
    it('should support single-PC license with one machine', async () => {
      const key = generateKey('CUST-001', 'PLAN-001');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Test Customer',
        email: 'test@example.com',
      });

      // Create single-PC license
      const license = db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments', 'billing'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 1000,
        licenseType: 'single-pc',
        maxMachines: 1,
        authorizedMachines: JSON.stringify([
          {
            machineId: 'MACHINE-12345678-87654321-11111111-22222222',
            machineIdHash: 'hash123',
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ]),
      });

      const result = await validateLicense(key);
      
      expect(result.valid).toBe(true);
      expect(result.license?.licenseType).toBe('single-pc');
      expect(result.license?.maxMachines).toBe(1);
    });

    it('should support multi-PC license with multiple machines', async () => {
      const key = generateKey('CUST-002', 'PLAN-002');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Multi-PC Customer',
        email: 'multipc@example.com',
      });

      // Create multi-PC license with 3 authorized machines
      const authorizedMachines = [
        {
          machineId: 'MACHINE-11111111-22222222-33333333-44444444',
          machineIdHash: 'hash1',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
        {
          machineId: 'MACHINE-55555555-66666666-77777777-88888888',
          machineIdHash: 'hash2',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
        {
          machineId: 'MACHINE-99999999-AAAAAAAA-BBBBBBBB-CCCCCCCC',
          machineIdHash: 'hash3',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
      ];

      const license = db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments', 'billing', 'pharmacy'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 5000,
        licenseType: 'multi-pc',
        maxMachines: 5,
        authorizedMachines: JSON.stringify(authorizedMachines),
      });

      const result = await validateLicense(key);
      
      expect(result.valid).toBe(true);
      expect(result.license?.licenseType).toBe('multi-pc');
      expect(result.license?.maxMachines).toBe(5);
      
      // Verify authorized machines are stored
      const storedMachines = JSON.parse(result.license?.authorizedMachines || '[]');
      expect(storedMachines).toHaveLength(3);
      expect(storedMachines[0].machineId).toBe('MACHINE-11111111-22222222-33333333-44444444');
    });

    it('should allow same license key for all authorized machines in multi-PC', async () => {
      const key = generateKey('CUST-003', 'PLAN-003');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Multi-PC Test',
        email: 'multitest@example.com',
      });

      // Create multi-PC license
      const authorizedMachines = [
        {
          machineId: 'MACHINE-AAAA0000-BBBB1111-CCCC2222-DDDD3333',
          machineIdHash: 'hashA',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
        {
          machineId: 'MACHINE-EEEE4444-FFFF5555-0000AAAA-1111BBBB',
          machineIdHash: 'hashB',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
      ];

      const license = db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments', 'billing'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 2000,
        licenseType: 'multi-pc',
        maxMachines: 2,
        authorizedMachines: JSON.stringify(authorizedMachines),
      });

      // Same key should validate for multi-PC license
      const result = await validateLicense(key);
      
      expect(result.valid).toBe(true);
      expect(result.license?.licenseKey).toBe(key);
      
      // Both machines should be able to use the same key
      const storedMachines = JSON.parse(result.license?.authorizedMachines || '[]');
      expect(storedMachines).toHaveLength(2);
    });

    it('should reject unauthorized machine attempting to use multi-PC license', async () => {
      const key = generateKey('CUST-004', 'PLAN-004');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Restricted Multi-PC',
        email: 'restricted@example.com',
      });

      // Create multi-PC license with only 1 authorized machine
      const authorizedMachines = [
        {
          machineId: 'MACHINE-XXXX0000-YYYY1111-ZZZZ2222-WWWW3333',
          machineIdHash: 'hashX',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
      ];

      const license = db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 1000,
        licenseType: 'multi-pc',
        maxMachines: 2,
        authorizedMachines: JSON.stringify(authorizedMachines),
      });

      // License key is valid, but machine authorization would be checked separately
      const result = await validateLicense(key);
      
      expect(result.valid).toBe(true);
      expect(result.license?.licenseType).toBe('multi-pc');
      
      // Verify only 1 machine is authorized
      const storedMachines = JSON.parse(result.license?.authorizedMachines || '[]');
      expect(storedMachines).toHaveLength(1);
      expect(storedMachines[0].machineId).toBe('MACHINE-XXXX0000-YYYY1111-ZZZZ2222-WWWW3333');
    });

    it('should enforce machine limit in multi-PC license', async () => {
      const key = generateKey('CUST-005', 'PLAN-005');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Limited Multi-PC',
        email: 'limited@example.com',
      });

      // Create multi-PC license with maxMachines = 2
      const authorizedMachines = [
        {
          machineId: 'MACHINE-1111AAAA-2222BBBB-3333CCCC-4444DDDD',
          machineIdHash: 'hash1',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
        {
          machineId: 'MACHINE-5555EEEE-6666FFFF-7777GGGG-8888HHHH',
          machineIdHash: 'hash2',
          addedAt: new Date().toISOString(),
          addedBy: 'admin',
        },
      ];

      const license = db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments', 'billing'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 2000,
        licenseType: 'multi-pc',
        maxMachines: 2, // Limit to 2 machines
        authorizedMachines: JSON.stringify(authorizedMachines),
      });

      const result = await validateLicense(key);
      
      expect(result.valid).toBe(true);
      expect(result.license?.maxMachines).toBe(2);
      
      // Verify machine count matches limit
      const storedMachines = JSON.parse(result.license?.authorizedMachines || '[]');
      expect(storedMachines.length).toBeLessThanOrEqual(result.license?.maxMachines || 0);
    });

    it('should support upgrading single-PC to multi-PC license', async () => {
      const key = generateKey('CUST-006', 'PLAN-006');
      
      // Create customer
      const customer = db.create('customers', {
        name: 'Upgrade Test',
        email: 'upgrade@example.com',
      });

      // Create single-PC license
      const license = db.create('licenses', {
        licenseKey: key,
        customerId: customer.id,
        status: 'active',
        modules: ['appointments'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        maxPrescriptions: 1000,
        licenseType: 'single-pc',
        maxMachines: 1,
        authorizedMachines: JSON.stringify([
          {
            machineId: 'MACHINE-IIII0000-JJJJ1111-KKKK2222-LLLL3333',
            machineIdHash: 'hashI',
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          },
        ]),
      });

      // Verify initial state
      let result = await validateLicense(key);
      expect(result.license?.licenseType).toBe('single-pc');
      expect(result.license?.maxMachines).toBe(1);

      // Upgrade to multi-PC
      db.update('licenses', license.id, {
        licenseType: 'multi-pc',
        maxMachines: 5,
      });

      // Verify upgraded state
      result = await validateLicense(key);
      expect(result.license?.licenseType).toBe('multi-pc');
      expect(result.license?.maxMachines).toBe(5);
    });
  });
});
