/**
 * Integration Tests for Password-Based License Activation
 * Tests the full flow from password generation to machine binding
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { db } from '@/lib/db/database';
import { generatePassword, generateExpiryDate, formatDateToYYYYMMDD } from '@/lib/license/password-generator';
import { decodePassword } from '@/lib/license/password-decoder';
import { validateSignature, validateExpiry } from '@/lib/license/password-validator';
import { migrateExistingLicenses, isMigrationNeeded, getMigrationStatus } from '@/lib/license/migration';
import type { License } from '@/lib/db/schema';

describe('Password-Based License Activation Integration Tests', () => {
  beforeEach(() => {
    // Clear database before each test
    db.reset();
  });

  afterEach(() => {
    // Clean up after each test
    db.reset();
  });

  describe('License Creation and Password Generation', () => {
    it('should create a license and generate a valid password', () => {
      // Create a test license
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'TEST_KEY_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      expect(license).toBeDefined();
      expect(license.id).toBeDefined();
      expect(license.licenseKey).toBe('TEST_KEY_001');

      // Generate password
      const expiryDate = generateExpiryDate(365);
      const password = generatePassword(license.licenseKey, '1', 1, expiryDate);

      expect(password).toBeDefined();
      expect(password.length).toBeGreaterThan(50);
      expect(password.length).toBeLessThan(150); // Allow up to 150 chars for base64 encoding

      // Verify password can be decoded
      const decoded = decodePassword(password);
      expect(decoded.licenseKey).toBe('TEST_KEY_001');
      expect(decoded.plan).toBe('1');
      expect(decoded.maxMachines).toBe(1);
    });

    it('should generate different passwords for different expiry dates', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'TEST_KEY_002',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      const password1 = generatePassword(license.licenseKey, '1', 1, generateExpiryDate(365));
      const password2 = generatePassword(license.licenseKey, '1', 1, generateExpiryDate(180));

      expect(password1).not.toBe(password2);
    });
  });

  describe('Machine Binding - Single-PC Licenses', () => {
    it('should allow first machine to activate single-pc license', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'SINGLE_PC_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      const canActivate = db.canActivateLicense(license.id, 'MACHINE_001');
      expect(canActivate.allowed).toBe(true);

      // Add machine
      const added = db.addActivatedMachine(license.id, 'MACHINE_001');
      expect(added).toBe(true);

      // Verify machine was added
      const machines = db.getActivatedMachines(license.id);
      expect(machines).toContain('MACHINE_001');
      expect(machines.length).toBe(1);
    });

    it('should reject second machine for single-pc license', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'SINGLE_PC_002',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify(['MACHINE_001']),
        machineCount: 1,
      });

      const canActivate = db.canActivateLicense(license.id, 'MACHINE_002');
      expect(canActivate.allowed).toBe(false);
      expect(canActivate.reason).toContain('already activated');
    });

    it('should allow same machine to activate again (idempotent)', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'SINGLE_PC_003',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify(['MACHINE_001']),
        machineCount: 1,
      });

      const canActivate = db.canActivateLicense(license.id, 'MACHINE_001');
      expect(canActivate.allowed).toBe(true);
      expect(canActivate.reason).toContain('already activated');
    });
  });

  describe('Machine Binding - Multi-PC Licenses', () => {
    it('should allow multiple machines up to limit', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'MULTI_PC_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'multi-pc',
        maxMachines: 3,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      // Add first machine
      let canActivate = db.canActivateLicense(license.id, 'MACHINE_001');
      expect(canActivate.allowed).toBe(true);
      db.addActivatedMachine(license.id, 'MACHINE_001');

      // Add second machine
      canActivate = db.canActivateLicense(license.id, 'MACHINE_002');
      expect(canActivate.allowed).toBe(true);
      db.addActivatedMachine(license.id, 'MACHINE_002');

      // Add third machine
      canActivate = db.canActivateLicense(license.id, 'MACHINE_003');
      expect(canActivate.allowed).toBe(true);
      db.addActivatedMachine(license.id, 'MACHINE_003');

      // Verify all machines added
      const machines = db.getActivatedMachines(license.id);
      expect(machines.length).toBe(3);
      expect(machines).toContain('MACHINE_001');
      expect(machines).toContain('MACHINE_002');
      expect(machines).toContain('MACHINE_003');
    });

    it('should reject machine when limit reached', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'MULTI_PC_002',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'multi-pc',
        maxMachines: 2,
        activatedMachines: JSON.stringify(['MACHINE_001', 'MACHINE_002']),
        machineCount: 2,
      });

      const canActivate = db.canActivateLicense(license.id, 'MACHINE_003');
      expect(canActivate.allowed).toBe(false);
      expect(canActivate.reason).toContain('limit reached');
    });

    it('should update machine count correctly', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'MULTI_PC_003',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'multi-pc',
        maxMachines: 5,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      // Add machines and verify count
      db.addActivatedMachine(license.id, 'MACHINE_001');
      let updated = db.getById<License>('licenses', license.id);
      expect(updated?.machineCount).toBe(1);

      db.addActivatedMachine(license.id, 'MACHINE_002');
      updated = db.getById<License>('licenses', license.id);
      expect(updated?.machineCount).toBe(2);

      // Remove machine and verify count
      db.removeActivatedMachine(license.id, 'MACHINE_001');
      updated = db.getById<License>('licenses', license.id);
      expect(updated?.machineCount).toBe(1);
    });
  });

  describe('Machine Removal', () => {
    it('should remove machine from activated list', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'REMOVE_TEST_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'multi-pc',
        maxMachines: 3,
        activatedMachines: JSON.stringify(['MACHINE_001', 'MACHINE_002']),
        machineCount: 2,
      });

      const removed = db.removeActivatedMachine(license.id, 'MACHINE_001');
      expect(removed).toBe(true);

      const machines = db.getActivatedMachines(license.id);
      expect(machines).not.toContain('MACHINE_001');
      expect(machines).toContain('MACHINE_002');
      expect(machines.length).toBe(1);
    });

    it('should return false when removing non-existent machine', () => {
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'REMOVE_TEST_002',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'multi-pc',
        maxMachines: 3,
        activatedMachines: JSON.stringify(['MACHINE_001']),
        machineCount: 1,
      });

      const removed = db.removeActivatedMachine(license.id, 'MACHINE_999');
      expect(removed).toBe(false);
    });
  });

  describe('Migration', () => {
    it('should migrate existing licenses without new fields', () => {
      // Create licenses without new fields (simulating old data)
      const oldLicense = db.create<any>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'OLD_LICENSE_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
      });

      // Verify migration is needed
      expect(isMigrationNeeded()).toBe(true);

      // Run migration
      const result = migrateExistingLicenses();
      expect(result.success).toBe(true);
      expect(result.migratedCount).toBeGreaterThan(0);

      // Verify migration completed
      expect(isMigrationNeeded()).toBe(false);

      // Verify new fields exist
      const migrated = db.getById<License>('licenses', oldLicense.id);
      expect(migrated?.activatedMachines).toBeDefined();
      expect(migrated?.machineCount).toBeDefined();
    });

    it('should preserve existing machine bindings during migration', () => {
      // Create license with old machineId field
      const oldLicense = db.create<any>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'OLD_LICENSE_002',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        machineId: 'OLD_MACHINE_001', // Old binding
      });

      // Run migration
      migrateExistingLicenses();

      // Verify old binding preserved
      const migrated = db.getById<License>('licenses', oldLicense.id);
      const machines = db.getActivatedMachines(migrated!.id);
      expect(machines).toContain('OLD_MACHINE_001');
      expect(migrated?.machineCount).toBe(1);
    });

    it('should be idempotent', () => {
      // Create license
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'IDEMPOTENT_TEST_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      // Run migration twice
      const result1 = migrateExistingLicenses();
      const result2 = migrateExistingLicenses();

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result2.migratedCount).toBe(0); // No new migrations
    });

    it('should provide migration status', () => {
      // Create mixed licenses (some with new fields, some without)
      db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'STATUS_TEST_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      db.create<any>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'STATUS_TEST_002',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
      });

      const status = getMigrationStatus();
      expect(status.totalLicenses).toBe(2);
      expect(status.migratedLicenses).toBe(1);
      expect(status.pendingLicenses).toBe(1);
      expect(status.needed).toBe(true);
    });
  });

  describe('Password Validation and Expiry', () => {
    it('should validate non-expired password', () => {
      const expiryDate = generateExpiryDate(365); // 1 year from now
      const password = generatePassword('TEST_KEY', '1', 1, expiryDate);

      const decoded = decodePassword(password);
      const isValid = validateSignature(
        decoded.licenseKey,
        decoded.plan,
        decoded.maxMachines,
        decoded.expiryDate,
        decoded.signature
      );

      expect(isValid).toBe(true);

      const expiry = validateExpiry(decoded.expiryDate);
      expect(expiry.isExpired).toBe(false);
      expect(expiry.daysUntilExpiry).toBeGreaterThan(0);
    });

    it('should detect expired password', () => {
      // Create password with past expiry date
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const expiryDate = formatDateToYYYYMMDD(pastDate);
      const password = generatePassword('TEST_KEY', '1', 1, expiryDate);

      const decoded = decodePassword(password);
      const expiry = validateExpiry(decoded.expiryDate);

      expect(expiry.isExpired).toBe(true);
      expect(expiry.daysUntilExpiry).toBeLessThanOrEqual(0);
    });

    it('should reject tampered password', () => {
      const expiryDate = generateExpiryDate(365);
      const password = generatePassword('TEST_KEY', '1', 1, expiryDate);

      // Tamper with password (change one character)
      const tamperedPassword = password.slice(0, -1) + (password[password.length - 1] === 'A' ? 'B' : 'A');

      const decoded = decodePassword(tamperedPassword);
      const isValid = validateSignature(
        decoded.licenseKey,
        decoded.plan,
        decoded.maxMachines,
        decoded.expiryDate,
        decoded.signature
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Full Activation Flow', () => {
    it('should complete full single-pc activation flow', () => {
      // 1. Create license
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'FLOW_TEST_001',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'single-pc',
        maxMachines: 1,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      // 2. Generate password
      const expiryDate = generateExpiryDate(365);
      const password = generatePassword(license.licenseKey, '1', 1, expiryDate);

      // 3. Decode and validate password
      const decoded = decodePassword(password);
      const isSignatureValid = validateSignature(
        decoded.licenseKey,
        decoded.plan,
        decoded.maxMachines,
        decoded.expiryDate,
        decoded.signature
      );
      expect(isSignatureValid).toBe(true);

      // 4. Check if machine can activate
      const canActivate = db.canActivateLicense(license.id, 'MACHINE_001');
      expect(canActivate.allowed).toBe(true);

      // 5. Activate machine
      db.addActivatedMachine(license.id, 'MACHINE_001');

      // 6. Verify activation
      const machines = db.getActivatedMachines(license.id);
      expect(machines).toContain('MACHINE_001');

      // 7. Verify second machine rejected
      const canActivate2 = db.canActivateLicense(license.id, 'MACHINE_002');
      expect(canActivate2.allowed).toBe(false);
    });

    it('should complete full multi-pc activation flow', () => {
      // 1. Create license
      const license = db.create<License>('licenses', {
        customerId: 'cust_123',
        licenseKey: 'FLOW_TEST_002',
        validityType: 'time',
        validityDays: 365,
        modules: [],
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        licenseType: 'multi-pc',
        maxMachines: 2,
        activatedMachines: JSON.stringify([]),
        machineCount: 0,
      });

      // 2. Generate password
      const expiryDate = generateExpiryDate(365);
      const password = generatePassword(license.licenseKey, '2', 2, expiryDate);

      // 3. Activate first machine
      db.addActivatedMachine(license.id, 'MACHINE_001');

      // 4. Activate second machine
      db.addActivatedMachine(license.id, 'MACHINE_002');

      // 5. Verify both machines activated
      const machines = db.getActivatedMachines(license.id);
      expect(machines.length).toBe(2);

      // 6. Verify third machine rejected
      const canActivate = db.canActivateLicense(license.id, 'MACHINE_003');
      expect(canActivate.allowed).toBe(false);

      // 7. Remove first machine
      db.removeActivatedMachine(license.id, 'MACHINE_001');

      // 8. Verify third machine can now activate
      const canActivate2 = db.canActivateLicense(license.id, 'MACHINE_003');
      expect(canActivate2.allowed).toBe(true);
    });
  });
});
