/**
 * Unit Tests for Multi-PC Unauthorized Detection
 * Tests the extended reuse detector functionality for multi-PC licenses
 */

import {
  logMultiPCUnauthorizedAttempt,
  blockMultiPCUnauthorizedActivation,
  getReuseStatistics,
  canAddMachineToLicense,
  getAllReuseAttempts,
} from '@/lib/machine-binding/reuse-detector';
import { LocalDatabase } from '@/lib/db/database';

describe('Multi-PC Unauthorized Detection', () => {
  let db: LocalDatabase;

  beforeEach(() => {
    // Get database instance and clear reuse attempts
    db = LocalDatabase.getInstance();
    const allAttempts = db.getAll('licenseReuseAttempts');
    allAttempts.forEach((attempt: any) => {
      db.delete('licenseReuseAttempts', attempt.id);
    });
  });

  afterEach(() => {
    // Clean up after each test
    const allAttempts = db.getAll('licenseReuseAttempts');
    allAttempts.forEach((attempt: any) => {
      db.delete('licenseReuseAttempts', attempt.id);
    });
  });

  describe('logMultiPCUnauthorizedAttempt', () => {
    it('should log multi-PC unauthorized attempt with authorized machines list', () => {
      const licenseKey = 'KIRO-TEST-MULTI-PC01';
      const attemptedMachineId = 'MACHINE-UNAUTHORIZED-001';
      const authorizedMachineIds = [
        'MACHINE-AUTH-001',
        'MACHINE-AUTH-002',
        'MACHINE-AUTH-003',
      ];

      const log = logMultiPCUnauthorizedAttempt(
        licenseKey,
        attemptedMachineId,
        authorizedMachineIds,
        'multi-pc'
      );

      expect(log).toBeDefined();
      expect(log.licenseKey).toBe(licenseKey);
      expect(log.attemptedMachineId).toBe(attemptedMachineId);
      expect(log.licenseType).toBe('multi-pc');
      expect(log.authorizedMachineIds).toEqual(authorizedMachineIds);
      expect(log.blocked).toBe(true);
      expect(log.details).toContain('Multi-PC license unauthorized attempt');
      expect(log.details).toContain('3');
    });

    it('should log single-PC reuse attempt with appropriate details', () => {
      const licenseKey = 'KIRO-TEST-SINGLE-PC01';
      const attemptedMachineId = 'MACHINE-UNAUTHORIZED-002';
      const authorizedMachineIds = ['MACHINE-AUTH-001'];

      const log = logMultiPCUnauthorizedAttempt(
        licenseKey,
        attemptedMachineId,
        authorizedMachineIds,
        'single-pc'
      );

      expect(log).toBeDefined();
      expect(log.licenseType).toBe('single-pc');
      expect(log.details).toContain('Single-PC license reuse attempt');
    });

    it('should include IP address when provided', () => {
      const licenseKey = 'KIRO-TEST-MULTI-PC02';
      const attemptedMachineId = 'MACHINE-UNAUTHORIZED-003';
      const authorizedMachineIds = ['MACHINE-AUTH-001', 'MACHINE-AUTH-002'];
      const ipAddress = '192.168.1.100';

      const log = logMultiPCUnauthorizedAttempt(
        licenseKey,
        attemptedMachineId,
        authorizedMachineIds,
        'multi-pc',
        ipAddress
      );

      expect(log.ipAddress).toBe(ipAddress);
    });

    it('should store the log in the database', () => {
      const licenseKey = 'KIRO-TEST-MULTI-PC03';
      const attemptedMachineId = 'MACHINE-UNAUTHORIZED-004';
      const authorizedMachineIds = ['MACHINE-AUTH-001'];

      logMultiPCUnauthorizedAttempt(
        licenseKey,
        attemptedMachineId,
        authorizedMachineIds,
        'multi-pc'
      );

      const allAttempts = getAllReuseAttempts();
      expect(allAttempts.length).toBe(1);
      expect(allAttempts[0].licenseKey).toBe(licenseKey);
    });
  });

  describe('blockMultiPCUnauthorizedActivation', () => {
    it('should block activation and return appropriate error for multi-PC license', () => {
      const licenseKey = 'KIRO-TEST-MULTI-PC04';
      const currentMachineId = 'MACHINE-UNAUTHORIZED-005';
      const authorizedMachineIds = [
        'MACHINE-AUTH-001',
        'MACHINE-AUTH-002',
        'MACHINE-AUTH-003',
      ];
      const maxMachines = 5;

      const result = blockMultiPCUnauthorizedActivation(
        licenseKey,
        currentMachineId,
        authorizedMachineIds,
        'multi-pc',
        maxMachines
      );

      expect(result.blocked).toBe(true);
      expect(result.message).toBe('Machine Not Authorized');
      expect(result.errorCode).toBe('MACHINE_NOT_AUTHORIZED');
      expect(result.userGuidance).toContain('multi-PC license');
      expect(result.userGuidance).toContain(currentMachineId);
      expect(result.userGuidance).toContain('3/5');
    });

    it('should block activation and return appropriate error for single-PC license', () => {
      const licenseKey = 'KIRO-TEST-SINGLE-PC02';
      const currentMachineId = 'MACHINE-UNAUTHORIZED-006';
      const authorizedMachineIds = ['MACHINE-AUTH-001'];
      const maxMachines = 1;

      const result = blockMultiPCUnauthorizedActivation(
        licenseKey,
        currentMachineId,
        authorizedMachineIds,
        'single-pc',
        maxMachines
      );

      expect(result.blocked).toBe(true);
      expect(result.errorCode).toBe('MACHINE_NOT_AUTHORIZED');
      expect(result.userGuidance).toContain('already bound to a different computer');
      expect(result.userGuidance).toContain(currentMachineId);
      expect(result.userGuidance).not.toContain('multi-PC');
    });

    it('should log the unauthorized attempt', () => {
      const licenseKey = 'KIRO-TEST-MULTI-PC05';
      const currentMachineId = 'MACHINE-UNAUTHORIZED-007';
      const authorizedMachineIds = ['MACHINE-AUTH-001', 'MACHINE-AUTH-002'];

      blockMultiPCUnauthorizedActivation(
        licenseKey,
        currentMachineId,
        authorizedMachineIds,
        'multi-pc',
        5
      );

      const allAttempts = getAllReuseAttempts();
      expect(allAttempts.length).toBe(1);
      expect(allAttempts[0].attemptedMachineId).toBe(currentMachineId);
      expect(allAttempts[0].licenseType).toBe('multi-pc');
    });
  });

  describe('getReuseStatistics', () => {
    it('should distinguish between single-PC and multi-PC attempts', () => {
      // Log some single-PC attempts
      logMultiPCUnauthorizedAttempt(
        'KIRO-SINGLE-01',
        'MACHINE-001',
        ['MACHINE-AUTH-001'],
        'single-pc'
      );
      logMultiPCUnauthorizedAttempt(
        'KIRO-SINGLE-02',
        'MACHINE-002',
        ['MACHINE-AUTH-002'],
        'single-pc'
      );

      // Log some multi-PC attempts
      logMultiPCUnauthorizedAttempt(
        'KIRO-MULTI-01',
        'MACHINE-003',
        ['MACHINE-AUTH-003', 'MACHINE-AUTH-004'],
        'multi-pc'
      );
      logMultiPCUnauthorizedAttempt(
        'KIRO-MULTI-02',
        'MACHINE-004',
        ['MACHINE-AUTH-005', 'MACHINE-AUTH-006', 'MACHINE-AUTH-007'],
        'multi-pc'
      );
      logMultiPCUnauthorizedAttempt(
        'KIRO-MULTI-03',
        'MACHINE-005',
        ['MACHINE-AUTH-008'],
        'multi-pc'
      );

      const stats = getReuseStatistics();

      expect(stats.totalAttempts).toBe(5);
      expect(stats.singlePCAttempts).toBe(2);
      expect(stats.multiPCAttempts).toBe(3);
      expect(stats.uniqueLicenses).toBe(5);
    });

    it('should handle legacy attempts without license type as single-PC', () => {
      // Clear any existing attempts first
      const existingAttempts = db.getAll('licenseReuseAttempts');
      existingAttempts.forEach((attempt: any) => {
        db.delete('licenseReuseAttempts', attempt.id);
      });

      // Log a legacy attempt (no license type)
      db.create('licenseReuseAttempts', {
        id: 'legacy-001',
        licenseKey: 'KIRO-LEGACY-01',
        originalMachineIdHash: 'hash123',
        attemptedMachineId: 'MACHINE-LEGACY-001',
        attemptedMachineIdHash: 'hash456',
        timestamp: new Date(),
        blocked: true,
      });

      // Log a new multi-PC attempt
      logMultiPCUnauthorizedAttempt(
        'KIRO-MULTI-04',
        'MACHINE-006',
        ['MACHINE-AUTH-009'],
        'multi-pc'
      );

      const stats = getReuseStatistics();

      expect(stats.totalAttempts).toBe(2);
      expect(stats.singlePCAttempts).toBe(1); // Legacy treated as single-PC
      expect(stats.multiPCAttempts).toBe(1);
    });
  });

  describe('canAddMachineToLicense', () => {
    it('should return true when there are remaining slots', () => {
      const authorizedMachineIds = ['MACHINE-001', 'MACHINE-002', 'MACHINE-003'];
      const maxMachines = 5;

      const result = canAddMachineToLicense(authorizedMachineIds, maxMachines);

      expect(result.canAdd).toBe(true);
      expect(result.remainingSlots).toBe(2);
      expect(result.reason).toBeUndefined();
    });

    it('should return false when PC limit is reached', () => {
      const authorizedMachineIds = [
        'MACHINE-001',
        'MACHINE-002',
        'MACHINE-003',
        'MACHINE-004',
        'MACHINE-005',
      ];
      const maxMachines = 5;

      const result = canAddMachineToLicense(authorizedMachineIds, maxMachines);

      expect(result.canAdd).toBe(false);
      expect(result.remainingSlots).toBe(0);
      expect(result.reason).toBe('PC limit reached');
    });

    it('should return false when PC limit is exceeded', () => {
      const authorizedMachineIds = [
        'MACHINE-001',
        'MACHINE-002',
        'MACHINE-003',
        'MACHINE-004',
        'MACHINE-005',
        'MACHINE-006',
      ];
      const maxMachines = 5;

      const result = canAddMachineToLicense(authorizedMachineIds, maxMachines);

      expect(result.canAdd).toBe(false);
      expect(result.remainingSlots).toBe(0);
      expect(result.reason).toBe('PC limit reached');
    });

    it('should handle single-PC license (max 1 machine)', () => {
      const authorizedMachineIds = ['MACHINE-001'];
      const maxMachines = 1;

      const result = canAddMachineToLicense(authorizedMachineIds, maxMachines);

      expect(result.canAdd).toBe(false);
      expect(result.remainingSlots).toBe(0);
    });

    it('should handle empty authorized machines list', () => {
      const authorizedMachineIds: string[] = [];
      const maxMachines = 5;

      const result = canAddMachineToLicense(authorizedMachineIds, maxMachines);

      expect(result.canAdd).toBe(true);
      expect(result.remainingSlots).toBe(5);
    });
  });

  describe('Integration: Multi-PC Unauthorized Detection Flow', () => {
    it('should handle complete unauthorized detection flow', () => {
      const licenseKey = 'KIRO-INTEGRATION-01';
      const unauthorizedMachineId = 'MACHINE-UNAUTHORIZED-999';
      const authorizedMachineIds = [
        'MACHINE-AUTH-101',
        'MACHINE-AUTH-102',
        'MACHINE-AUTH-103',
      ];
      const maxMachines = 5;

      // Step 1: Block activation
      const blockResult = blockMultiPCUnauthorizedActivation(
        licenseKey,
        unauthorizedMachineId,
        authorizedMachineIds,
        'multi-pc',
        maxMachines
      );

      expect(blockResult.blocked).toBe(true);
      expect(blockResult.errorCode).toBe('MACHINE_NOT_AUTHORIZED');

      // Step 2: Verify attempt was logged
      const allAttempts = getAllReuseAttempts();
      expect(allAttempts.length).toBe(1);
      expect(allAttempts[0].licenseKey).toBe(licenseKey);
      expect(allAttempts[0].attemptedMachineId).toBe(unauthorizedMachineId);
      expect(allAttempts[0].authorizedMachineIds).toEqual(authorizedMachineIds);

      // Step 3: Check if machine can be added
      const canAddResult = canAddMachineToLicense(authorizedMachineIds, maxMachines);
      expect(canAddResult.canAdd).toBe(true);
      expect(canAddResult.remainingSlots).toBe(2);

      // Step 4: Verify statistics
      const stats = getReuseStatistics();
      expect(stats.totalAttempts).toBe(1);
      expect(stats.multiPCAttempts).toBe(1);
      expect(stats.singlePCAttempts).toBe(0);
    });

    it('should handle multiple unauthorized attempts from different machines', () => {
      const licenseKey = 'KIRO-INTEGRATION-02';
      const authorizedMachineIds = ['MACHINE-AUTH-201', 'MACHINE-AUTH-202'];
      const maxMachines = 3;

      // Multiple unauthorized attempts
      blockMultiPCUnauthorizedActivation(
        licenseKey,
        'MACHINE-UNAUTH-001',
        authorizedMachineIds,
        'multi-pc',
        maxMachines
      );

      blockMultiPCUnauthorizedActivation(
        licenseKey,
        'MACHINE-UNAUTH-002',
        authorizedMachineIds,
        'multi-pc',
        maxMachines
      );

      blockMultiPCUnauthorizedActivation(
        licenseKey,
        'MACHINE-UNAUTH-003',
        authorizedMachineIds,
        'multi-pc',
        maxMachines
      );

      const allAttempts = getAllReuseAttempts();
      expect(allAttempts.length).toBe(3);

      const stats = getReuseStatistics();
      expect(stats.totalAttempts).toBe(3);
      expect(stats.uniqueLicenses).toBe(1);
      expect(stats.attemptsByLicense[licenseKey]).toBe(3);
    });
  });
});
