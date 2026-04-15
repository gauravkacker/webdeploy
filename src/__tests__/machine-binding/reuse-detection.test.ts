/**
 * License Reuse Detection Tests
 * Tests for detecting and preventing .LIC file usage on different machines
 */

import {
  detectReuseAttempt,
  logReuseAttempt,
  getReuseAttempts,
  getAllReuseAttempts,
  blockActivationOnReuse,
  hasReuseAttempts,
  getReuseStatistics,
  notifyAdminOfReuse,
  getUnreadNotifications,
  markNotificationAsRead,
} from '@/lib/machine-binding/reuse-detector';
import { createLicFile } from '@/lib/machine-binding/lic-file';
import { generateEncryptionKey } from '@/lib/machine-binding/encryption';
import { getMachineIdHash } from '@/lib/machine-binding/machine-id-generator';
import { LocalDatabase } from '@/lib/db/database';

describe('License Reuse Detection', () => {
  let encryptionKey: Buffer;
  let db: LocalDatabase;

  beforeEach(() => {
    // Generate encryption key for tests
    encryptionKey = generateEncryptionKey();
    
    // Get database instance and clear reuse attempts
    db = LocalDatabase.getInstance();
    const allAttempts = db.getAll('licenseReuseAttempts');
    allAttempts.forEach((attempt: any) => {
      db.delete('licenseReuseAttempts', attempt.id);
    });
    
    const allNotifications = db.getAll('adminNotifications');
    allNotifications.forEach((notification: any) => {
      db.delete('adminNotifications', notification.id);
    });
  });

  describe('detectReuseAttempt', () => {
    it('should detect reuse when .LIC file is used on different machine', () => {
      // Create .LIC file for Machine A
      const machineIdA = 'MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA';
      const machineIdHashA = getMachineIdHash(machineIdA);

      const licenseData = {
        licenseKey: 'KIRO-TEST-1234-5678-ABCD',
        customerId: '12345678-1234-1234-1234-123456789012',
        machineId: machineIdA,
        machineIdHash: machineIdHashA,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        modules: ['appointments', 'prescriptions'],
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Try to use .LIC file on Machine B
      const machineIdB = 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB';

      const result = detectReuseAttempt(licFile, machineIdB, encryptionKey);

      expect(result.isReuse).toBe(true);
      expect(result.machineMatch).toBe(false);
      expect(result.licenseKey).toBe('KIRO-TEST-1234-5678-ABCD');
      expect(result.originalMachineIdHash).toBe(machineIdHashA);
      expect(result.currentMachineIdHash).toBe(getMachineIdHash(machineIdB));
    });

    it('should not detect reuse when .LIC file is used on same machine', () => {
      // Create .LIC file for Machine A
      const machineIdA = 'MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA';
      const machineIdHashA = getMachineIdHash(machineIdA);

      const licenseData = {
        licenseKey: 'KIRO-TEST-1234-5678-ABCD',
        customerId: '12345678-1234-1234-1234-123456789012',
        machineId: machineIdA,
        machineIdHash: machineIdHashA,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: ['appointments', 'prescriptions'],
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Use .LIC file on same Machine A
      const result = detectReuseAttempt(licFile, machineIdA, encryptionKey);

      expect(result.isReuse).toBe(false);
      expect(result.machineMatch).toBe(true);
      expect(result.licenseKey).toBe('KIRO-TEST-1234-5678-ABCD');
    });

    it('should handle corrupted .LIC file gracefully', () => {
      const corruptedLicFile = Buffer.from('corrupted data');
      const machineId = 'MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA';

      const result = detectReuseAttempt(corruptedLicFile, machineId, encryptionKey);

      expect(result.isReuse).toBe(false);
      expect(result.machineMatch).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('logReuseAttempt', () => {
    it('should log reuse attempt to database', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');
      const attemptedMachineId = 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB';
      const ipAddress = '192.168.1.100';

      const log = logReuseAttempt(
        licenseKey,
        originalMachineIdHash,
        attemptedMachineId,
        ipAddress,
        'Test reuse attempt'
      );

      expect(log.id).toBeDefined();
      expect(log.licenseKey).toBe(licenseKey);
      expect(log.originalMachineIdHash).toBe(originalMachineIdHash);
      expect(log.attemptedMachineId).toBe(attemptedMachineId);
      expect(log.ipAddress).toBe(ipAddress);
      expect(log.blocked).toBe(true);
      expect(log.timestamp).toBeInstanceOf(Date);

      // Verify it's stored in database
      const attempts = getReuseAttempts(licenseKey);
      expect(attempts.length).toBe(1);
      expect(attempts[0].licenseKey).toBe(licenseKey);
    });

    it('should log multiple reuse attempts for same license', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');

      // Log first attempt
      logReuseAttempt(
        licenseKey,
        originalMachineIdHash,
        'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB',
        '192.168.1.100'
      );

      // Log second attempt
      logReuseAttempt(
        licenseKey,
        originalMachineIdHash,
        'MACHINE-CCCCCCCC-CCCCCCCC-CCCCCCCC-CCCCCCCC',
        '192.168.1.101'
      );

      const attempts = getReuseAttempts(licenseKey);
      expect(attempts.length).toBe(2);
    });
  });

  describe('getReuseAttempts', () => {
    it('should return all reuse attempts for specific license', () => {
      const licenseKey1 = 'KIRO-TEST-1111-1111-1111';
      const licenseKey2 = 'KIRO-TEST-2222-2222-2222';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');

      // Log attempts for license 1
      logReuseAttempt(licenseKey1, originalMachineIdHash, 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB');
      logReuseAttempt(licenseKey1, originalMachineIdHash, 'MACHINE-CCCCCCCC-CCCCCCCC-CCCCCCCC-CCCCCCCC');

      // Log attempt for license 2
      logReuseAttempt(licenseKey2, originalMachineIdHash, 'MACHINE-DDDDDDDD-DDDDDDDD-DDDDDDDD-DDDDDDDD');

      const attempts1 = getReuseAttempts(licenseKey1);
      const attempts2 = getReuseAttempts(licenseKey2);

      expect(attempts1.length).toBe(2);
      expect(attempts2.length).toBe(1);
    });

    it('should return empty array for license with no attempts', () => {
      const attempts = getReuseAttempts('KIRO-TEST-9999-9999-9999');
      expect(attempts).toEqual([]);
    });
  });

  describe('blockActivationOnReuse', () => {
    it('should block activation and return user guidance', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const currentMachineId = 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');

      const result = blockActivationOnReuse(licenseKey, currentMachineId, originalMachineIdHash);

      expect(result.blocked).toBe(true);
      expect(result.message).toBe('License Reuse Detected');
      expect(result.userGuidance).toContain('This license is already bound to a different computer');
      expect(result.userGuidance).toContain(currentMachineId);

      // Verify reuse attempt was logged
      const attempts = getReuseAttempts(licenseKey);
      expect(attempts.length).toBe(1);
    });
  });

  describe('hasReuseAttempts', () => {
    it('should return true when license has reuse attempts', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');

      logReuseAttempt(licenseKey, originalMachineIdHash, 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB');

      expect(hasReuseAttempts(licenseKey)).toBe(true);
    });

    it('should return false when license has no reuse attempts', () => {
      expect(hasReuseAttempts('KIRO-TEST-9999-9999-9999')).toBe(false);
    });
  });

  describe('getReuseStatistics', () => {
    it('should return correct statistics', () => {
      const licenseKey1 = 'KIRO-TEST-1111-1111-1111';
      const licenseKey2 = 'KIRO-TEST-2222-2222-2222';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');

      // Log attempts
      logReuseAttempt(licenseKey1, originalMachineIdHash, 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB');
      logReuseAttempt(licenseKey1, originalMachineIdHash, 'MACHINE-CCCCCCCC-CCCCCCCC-CCCCCCCC-CCCCCCCC');
      logReuseAttempt(licenseKey2, originalMachineIdHash, 'MACHINE-DDDDDDDD-DDDDDDDD-DDDDDDDD-DDDDDDDD');

      const stats = getReuseStatistics();

      expect(stats.totalAttempts).toBe(3);
      expect(stats.uniqueLicenses).toBe(2);
      expect(stats.recentAttempts).toBe(3); // All are recent
      expect(stats.attemptsByLicense[licenseKey1]).toBe(2);
      expect(stats.attemptsByLicense[licenseKey2]).toBe(1);
    });

    it('should return zero statistics when no attempts', () => {
      // Clear all attempts first
      const allAttempts = getAllReuseAttempts();
      allAttempts.forEach((attempt: any) => {
        db.delete('licenseReuseAttempts', attempt.id);
      });

      const stats = getReuseStatistics();

      expect(stats.totalAttempts).toBe(0);
      expect(stats.uniqueLicenses).toBe(0);
      expect(stats.recentAttempts).toBe(0);
      expect(Object.keys(stats.attemptsByLicense).length).toBe(0);
    });
  });

  describe('notifyAdminOfReuse', () => {
    it('should create admin notification', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');
      const attemptedMachineId = 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB';

      const attemptLog = logReuseAttempt(
        licenseKey,
        originalMachineIdHash,
        attemptedMachineId,
        '192.168.1.100'
      );

      const result = notifyAdminOfReuse(licenseKey, attemptLog);

      expect(result.notified).toBe(true);
      expect(result.notification.title).toBe('License Reuse Attempt Detected');
      expect(result.notification.message).toContain(licenseKey);
      expect(result.notification.severity).toBe('warning');
      expect(result.notification.details.licenseKey).toBe(licenseKey);

      // Verify notification is stored
      const notifications = getUnreadNotifications();
      expect(notifications.length).toBe(1);
      expect(notifications[0].title).toBe('License Reuse Attempt Detected');
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return only unread notifications', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');
      const attemptedMachineId = 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB';

      const attemptLog = logReuseAttempt(licenseKey, originalMachineIdHash, attemptedMachineId);
      notifyAdminOfReuse(licenseKey, attemptLog);

      const unread = getUnreadNotifications();
      expect(unread.length).toBe(1);
      expect(unread[0].read).toBe(false);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');
      const attemptedMachineId = 'MACHINE-BBBBBBBB-BBBBBBBB-BBBBBBBB-BBBBBBBB';

      const attemptLog = logReuseAttempt(licenseKey, originalMachineIdHash, attemptedMachineId);
      const result = notifyAdminOfReuse(licenseKey, attemptLog);

      const unreadBefore = getUnreadNotifications();
      expect(unreadBefore.length).toBe(1);

      // Get notification ID from database
      const allNotifications = db.getAll('adminNotifications') as any[];
      const notificationId = allNotifications[0].id;

      const marked = markNotificationAsRead(notificationId);
      expect(marked).toBe(true);

      const unreadAfter = getUnreadNotifications();
      expect(unreadAfter.length).toBe(0);
    });

    it('should return false for non-existent notification', () => {
      const marked = markNotificationAsRead('non-existent-id');
      expect(marked).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle same machine ID with different formats', () => {
      const machineId = 'MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA';
      const machineIdHash = getMachineIdHash(machineId);

      const licenseData = {
        licenseKey: 'KIRO-TEST-1234-5678-ABCD',
        customerId: '12345678-1234-1234-1234-123456789012',
        machineId,
        machineIdHash,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        modules: ['appointments'],
        createdAt: new Date(),
      };

      const licFile = createLicFile(licenseData, encryptionKey);

      // Use same machine ID (should not be reuse)
      const result = detectReuseAttempt(licFile, machineId, encryptionKey);

      expect(result.isReuse).toBe(false);
      expect(result.machineMatch).toBe(true);
    });

    it('should handle multiple rapid reuse attempts', () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const originalMachineIdHash = getMachineIdHash('MACHINE-AAAAAAAA-AAAAAAAA-AAAAAAAA-AAAAAAAA');

      // Simulate 10 rapid attempts
      for (let i = 0; i < 10; i++) {
        logReuseAttempt(
          licenseKey,
          originalMachineIdHash,
          `MACHINE-${i.toString().padStart(8, '0')}-BBBBBBBB-BBBBBBBB-BBBBBBBB`
        );
      }

      const attempts = getReuseAttempts(licenseKey);
      expect(attempts.length).toBe(10);

      const stats = getReuseStatistics();
      expect(stats.totalAttempts).toBe(10);
      expect(stats.attemptsByLicense[licenseKey]).toBe(10);
    });
  });
});
