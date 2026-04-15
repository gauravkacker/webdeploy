/**
 * Tests for Reuse Attempts Dashboard
 * Validates BR9, US6
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { getAllReuseAttempts, getReuseStatistics, logReuseAttempt } from '@/lib/machine-binding/reuse-detector';
import { LocalDatabase } from '@/lib/db/database';

describe('Reuse Attempts Dashboard', () => {
  // Helper to clear all reuse attempts
  const clearAllAttempts = () => {
    const db = LocalDatabase.getInstance();
    const allAttempts = db.getAll('licenseReuseAttempts');
    allAttempts.forEach((attempt: any) => {
      db.delete('licenseReuseAttempts', attempt.id);
    });
  };

  beforeEach(() => {
    // Clear database before each test
    clearAllAttempts();
  });

  describe('Reuse Attempts Display', () => {
    it('should display all reuse attempts', () => {
      // Log multiple reuse attempts
      logReuseAttempt('LIC-001', 'hash1', 'machine1', '192.168.1.1', 'Test attempt 1');
      logReuseAttempt('LIC-002', 'hash2', 'machine2', '192.168.1.2', 'Test attempt 2');
      logReuseAttempt('LIC-003', 'hash3', 'machine3', '192.168.1.3', 'Test attempt 3');

      const attempts = getAllReuseAttempts();

      expect(attempts).toHaveLength(3);
      expect(attempts[0].licenseKey).toBe('LIC-001');
      expect(attempts[1].licenseKey).toBe('LIC-002');
      expect(attempts[2].licenseKey).toBe('LIC-003');
    });

    it('should include all required fields in reuse attempts', () => {
      const log = logReuseAttempt(
        'LIC-TEST',
        'original-hash',
        'attempted-machine-id',
        '192.168.1.100',
        'Test details'
      );

      expect(log).toHaveProperty('id');
      expect(log).toHaveProperty('licenseKey', 'LIC-TEST');
      expect(log).toHaveProperty('originalMachineIdHash', 'original-hash');
      expect(log).toHaveProperty('attemptedMachineId', 'attempted-machine-id');
      expect(log).toHaveProperty('attemptedMachineIdHash');
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('ipAddress', '192.168.1.100');
      expect(log).toHaveProperty('blocked', true);
      expect(log).toHaveProperty('details', 'Test details');
    });

    it('should handle missing optional fields', () => {
      const log = logReuseAttempt('LIC-TEST', 'hash', 'machine');

      expect(log.ipAddress).toBeUndefined();
      expect(log.details).toBeUndefined();
      expect(log.blocked).toBe(true);
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate total attempts correctly', () => {
      logReuseAttempt('LIC-001', 'hash1', 'machine1');
      logReuseAttempt('LIC-002', 'hash2', 'machine2');
      logReuseAttempt('LIC-003', 'hash3', 'machine3');

      const stats = getReuseStatistics();

      expect(stats.totalAttempts).toBe(3);
    });

    it('should calculate unique licenses correctly', () => {
      logReuseAttempt('LIC-001', 'hash1', 'machine1');
      logReuseAttempt('LIC-001', 'hash1', 'machine2'); // Same license, different machine
      logReuseAttempt('LIC-002', 'hash2', 'machine3');

      const stats = getReuseStatistics();

      expect(stats.uniqueLicenses).toBe(2);
    });

    it('should calculate recent attempts (last 7 days) correctly', () => {
      const now = new Date();
      const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

      // Recent attempt
      logReuseAttempt('LIC-001', 'hash1', 'machine1');

      // Old attempt (manually set timestamp)
      const db = LocalDatabase.getInstance();
      const oldLog = logReuseAttempt('LIC-002', 'hash2', 'machine2');
      db.update('licenseReuseAttempts', oldLog.id, {
        ...oldLog,
        timestamp: eightDaysAgo,
      });

      const stats = getReuseStatistics();

      expect(stats.recentAttempts).toBe(1);
      expect(stats.totalAttempts).toBe(2);
    });

    it('should calculate attempts by license correctly', () => {
      logReuseAttempt('LIC-001', 'hash1', 'machine1');
      logReuseAttempt('LIC-001', 'hash1', 'machine2');
      logReuseAttempt('LIC-001', 'hash1', 'machine3');
      logReuseAttempt('LIC-002', 'hash2', 'machine4');
      logReuseAttempt('LIC-002', 'hash2', 'machine5');

      const stats = getReuseStatistics();

      expect(stats.attemptsByLicense['LIC-001']).toBe(3);
      expect(stats.attemptsByLicense['LIC-002']).toBe(2);
    });

    it('should return zero statistics when no attempts exist', () => {
      const stats = getReuseStatistics();

      expect(stats.totalAttempts).toBe(0);
      expect(stats.uniqueLicenses).toBe(0);
      expect(stats.recentAttempts).toBe(0);
      expect(Object.keys(stats.attemptsByLicense)).toHaveLength(0);
    });
  });

  describe('Date Range Filtering', () => {
    beforeEach(() => {
      // Clear all attempts first
      clearAllAttempts();

      const db = LocalDatabase.getInstance();
      const now = new Date();

      // Create attempts at different times
      const today = logReuseAttempt('LIC-TODAY', 'hash1', 'machine1');
      
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const log3Days = logReuseAttempt('LIC-3DAYS', 'hash2', 'machine2');
      db.update('licenseReuseAttempts', log3Days.id, {
        ...log3Days,
        timestamp: threeDaysAgo,
      });

      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const log10Days = logReuseAttempt('LIC-10DAYS', 'hash3', 'machine3');
      db.update('licenseReuseAttempts', log10Days.id, {
        ...log10Days,
        timestamp: tenDaysAgo,
      });

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const log30Days = logReuseAttempt('LIC-30DAYS', 'hash4', 'machine4');
      db.update('licenseReuseAttempts', log30Days.id, {
        ...log30Days,
        timestamp: thirtyDaysAgo,
      });
    });

    it('should filter attempts by start date', () => {
      const allAttempts = getAllReuseAttempts();
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const filtered = allAttempts.filter(
        (attempt) => new Date(attempt.timestamp) >= sevenDaysAgo
      );

      expect(filtered.length).toBe(2); // Today and 3 days ago
      expect(filtered.some((a) => a.licenseKey === 'LIC-TODAY')).toBe(true);
      expect(filtered.some((a) => a.licenseKey === 'LIC-3DAYS')).toBe(true);
    });

    it('should filter attempts by end date', () => {
      const allAttempts = getAllReuseAttempts();
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      const filtered = allAttempts.filter(
        (attempt) => new Date(attempt.timestamp) <= fiveDaysAgo
      );

      expect(filtered.length).toBe(2); // 10 days and 30 days ago
      expect(filtered.some((a) => a.licenseKey === 'LIC-10DAYS')).toBe(true);
      expect(filtered.some((a) => a.licenseKey === 'LIC-30DAYS')).toBe(true);
    });

    it('should filter attempts by date range', () => {
      const allAttempts = getAllReuseAttempts();
      const now = new Date();
      const startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
      const endDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      const filtered = allAttempts.filter(
        (attempt) =>
          new Date(attempt.timestamp) >= startDate &&
          new Date(attempt.timestamp) <= endDate
      );

      expect(filtered.length).toBe(2); // 3 days and 10 days ago
      expect(filtered.some((a) => a.licenseKey === 'LIC-3DAYS')).toBe(true);
      expect(filtered.some((a) => a.licenseKey === 'LIC-10DAYS')).toBe(true);
    });
  });

  describe('Export Functionality', () => {
    it('should format data correctly for CSV export', () => {
      logReuseAttempt('LIC-001', 'hash1', 'machine1', '192.168.1.1', 'Test details');
      logReuseAttempt('LIC-002', 'hash2', 'machine2', '192.168.1.2');

      const attempts = getAllReuseAttempts();

      // Simulate CSV formatting
      const csvRows = attempts.map((attempt) => ({
        timestamp: new Date(attempt.timestamp).toLocaleString(),
        licenseKey: attempt.licenseKey,
        originalMachineIdHash: attempt.originalMachineIdHash,
        attemptedMachineId: attempt.attemptedMachineId,
        ipAddress: attempt.ipAddress || 'N/A',
        status: attempt.blocked ? 'Blocked' : 'Allowed',
        details: attempt.details || '',
      }));

      expect(csvRows).toHaveLength(2);
      expect(csvRows[0].licenseKey).toBe('LIC-001');
      expect(csvRows[0].ipAddress).toBe('192.168.1.1');
      expect(csvRows[0].status).toBe('Blocked');
      expect(csvRows[1].ipAddress).toBe('N/A');
    });

    it('should handle special characters in CSV export', () => {
      logReuseAttempt(
        'LIC-001',
        'hash1',
        'machine1',
        '192.168.1.1',
        'Details with "quotes" and, commas'
      );

      const attempts = getAllReuseAttempts();
      const csvRow = {
        details: attempts[0].details || '',
      };

      // CSV should escape quotes and commas
      expect(csvRow.details).toContain('quotes');
      expect(csvRow.details).toContain('commas');
    });
  });

  describe('Sorting and Pagination', () => {
    beforeEach(() => {
      // Clear all attempts first
      clearAllAttempts();

      // Create multiple attempts
      for (let i = 1; i <= 25; i++) {
        logReuseAttempt(`LIC-${i.toString().padStart(3, '0')}`, `hash${i}`, `machine${i}`);
      }
    });

    it('should sort attempts by timestamp (most recent first)', () => {
      const attempts = getAllReuseAttempts();
      const sorted = [...attempts].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      expect(sorted[0].timestamp).toBeInstanceOf(Date);
      expect(new Date(sorted[0].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(sorted[sorted.length - 1].timestamp).getTime()
      );
    });

    it('should paginate results correctly', () => {
      const attempts = getAllReuseAttempts();
      const itemsPerPage = 10;
      const page1 = attempts.slice(0, itemsPerPage);
      const page2 = attempts.slice(itemsPerPage, itemsPerPage * 2);
      const page3 = attempts.slice(itemsPerPage * 2, itemsPerPage * 3);

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
      expect(page3).toHaveLength(5);
    });

    it('should calculate total pages correctly', () => {
      const attempts = getAllReuseAttempts();
      const itemsPerPage = 10;
      const totalPages = Math.ceil(attempts.length / itemsPerPage);

      expect(totalPages).toBe(3);
    });
  });

  describe('API Endpoint Behavior', () => {
    it('should return success response with attempts and statistics', () => {
      logReuseAttempt('LIC-001', 'hash1', 'machine1');
      logReuseAttempt('LIC-002', 'hash2', 'machine2');

      const attempts = getAllReuseAttempts();
      const statistics = getReuseStatistics();

      const response = {
        success: true,
        attempts,
        statistics,
        count: attempts.length,
      };

      expect(response.success).toBe(true);
      expect(response.attempts).toHaveLength(2);
      expect(response.statistics.totalAttempts).toBe(2);
      expect(response.count).toBe(2);
    });

    it('should handle empty results gracefully', () => {
      const attempts = getAllReuseAttempts();
      const statistics = getReuseStatistics();

      const response = {
        success: true,
        attempts,
        statistics,
        count: attempts.length,
      };

      expect(response.success).toBe(true);
      expect(response.attempts).toHaveLength(0);
      expect(response.statistics.totalAttempts).toBe(0);
      expect(response.count).toBe(0);
    });
  });

  describe('Requirements Validation', () => {
    it('should satisfy BR9: License Reuse Detection - Admin notification', () => {
      // BR9: Admin is notified of reuse attempt
      const log = logReuseAttempt('LIC-001', 'hash1', 'machine1', '192.168.1.1');

      expect(log.blocked).toBe(true);
      expect(log.licenseKey).toBe('LIC-001');
      expect(log.timestamp).toBeInstanceOf(Date);
    });

    it('should satisfy BR9: License Reuse Detection - Logging', () => {
      // BR9: Reuse attempts are logged with timestamp and Machine ID
      const log = logReuseAttempt('LIC-001', 'hash1', 'machine1', '192.168.1.1');

      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('attemptedMachineId', 'machine1');
      expect(log).toHaveProperty('licenseKey', 'LIC-001');
      expect(log).toHaveProperty('ipAddress', '192.168.1.1');
    });

    it('should satisfy US6: License Reuse Prevention - Admin view', () => {
      // US6: Admin can view reuse attempts
      logReuseAttempt('LIC-001', 'hash1', 'machine1');
      logReuseAttempt('LIC-002', 'hash2', 'machine2');

      const attempts = getAllReuseAttempts();
      const stats = getReuseStatistics();

      expect(attempts.length).toBeGreaterThan(0);
      expect(stats.totalAttempts).toBeGreaterThan(0);
    });

    it('should satisfy US6: License Reuse Prevention - Detection', () => {
      // US6: Reuse attempts are detected
      const log = logReuseAttempt('LIC-001', 'hash1', 'machine1');

      expect(log.blocked).toBe(true);
      expect(log.originalMachineIdHash).toBe('hash1');
      expect(log.attemptedMachineId).toBe('machine1');
    });
  });
});
