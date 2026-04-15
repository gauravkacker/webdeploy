/**
 * Tests for License Renewal
 * Validates renewal .LIC file generation, remaining days calculation, and renewal process
 */

import {
  getRenewalInfo,
  calculateRenewalExpirationDate,
  validateRenewalRequest,
  generateRenewalLicFile,
  invalidateOldLicense,
  processRenewal,
  completeRenewalWorkflow,
} from '@/lib/machine-binding/license-renewal';
import { db } from '@/lib/db/database';

// Mock database
jest.mock('@/lib/db/database', () => ({
  db: {
    query: jest.fn(),
  },
}));

// Mock dependencies
jest.mock('@/lib/machine-binding/lic-file-manager', () => ({
  generateLicFile: jest.fn(),
  getRemainingDays: jest.fn((expiresAt: Date) => {
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }),
}));

jest.mock('@/lib/machine-binding/license-binding', () => ({
  calculateRenewalExpiration: jest.fn((oldExpiresAt: Date, renewalDays: number) => {
    const now = new Date();
    const diffTime = oldExpiresAt.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    const totalDays = remainingDays + renewalDays;
    const newExpiration = new Date();
    newExpiration.setDate(newExpiration.getDate() + totalDays);
    return newExpiration;
  }),
}));

jest.mock('@/lib/machine-binding/machine-id-generator', () => ({
  getMachineIdHash: jest.fn((machineId: string) => `hash-${machineId}`),
}));

const mockDb = db as jest.Mocked<typeof db>;

describe('License Renewal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRenewalInfo', () => {
    it('should retrieve renewal information for active license', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60); // 60 days from now

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            licenseKey: 'KIRO-TEST-1234-5678-ABCD',
            machineId,
            expiresAt: expiresAt.toISOString(),
            modules: ['Prescriptions', 'Billing'],
            customerId: '123e4567-e89b-12d3-a456-426614174000',
          },
        ],
        rowCount: 1,
      } as any);

      const result = await getRenewalInfo(machineId);

      expect(result.success).toBe(true);
      expect(result.info).toBeDefined();
      expect(result.info?.licenseKey).toBe('KIRO-TEST-1234-5678-ABCD');
      expect(result.info?.machineId).toBe(machineId);
      expect(result.info?.modules).toEqual(['Prescriptions', 'Billing']);
      expect(result.info?.remainingDays).toBeGreaterThan(0);
    });

    it('should return error when no active license found', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';

      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await getRenewalInfo(machineId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active license found for this Machine ID');
    });
  });

  describe('calculateRenewalExpirationDate', () => {
    it('should add remaining days to renewal period', () => {
      const oldExpiresAt = new Date();
      oldExpiresAt.setDate(oldExpiresAt.getDate() + 30); // 30 days remaining
      const renewalDays = 365;

      const newExpiresAt = calculateRenewalExpirationDate(oldExpiresAt, renewalDays);

      // Should be approximately 395 days from now (30 remaining + 365 renewal)
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 395);

      const diffDays = Math.abs(
        (newExpiresAt.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBeLessThan(2); // Allow 1-2 days difference for timing
    });

    it('should handle expired license (0 remaining days)', () => {
      const oldExpiresAt = new Date();
      oldExpiresAt.setDate(oldExpiresAt.getDate() - 10); // Expired 10 days ago
      const renewalDays = 365;

      const newExpiresAt = calculateRenewalExpirationDate(oldExpiresAt, renewalDays);

      // Should be approximately 365 days from now (0 remaining + 365 renewal)
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 365);

      const diffDays = Math.abs(
        (newExpiresAt.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBeLessThan(2);
    });
  });

  describe('validateRenewalRequest', () => {
    it('should validate matching license and machine ID', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            machineId,
            status: 'active',
          },
        ],
        rowCount: 1,
      } as any);

      const result = await validateRenewalRequest(machineId, licenseKey);

      expect(result.valid).toBe(true);
    });

    it('should reject when license not found', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';

      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await validateRenewalRequest(machineId, licenseKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('License not found');
    });

    it('should reject when machine ID does not match', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            machineId: 'MACHINE-DIFFERENT-12345678-12345678-12345678',
            status: 'active',
          },
        ],
        rowCount: 1,
      } as any);

      const result = await validateRenewalRequest(machineId, licenseKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('License is not bound to this Machine ID');
    });

    it('should reject when license is not active', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            machineId,
            status: 'inactive',
          },
        ],
        rowCount: 1,
      } as any);

      const result = await validateRenewalRequest(machineId, licenseKey);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('License is not active');
    });
  });

  describe('generateRenewalLicFile', () => {
    it('should generate renewal .LIC file with preserved remaining days', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const renewalDays = 365;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days remaining

      // Mock validation
      mockDb.query.mockResolvedValueOnce({
        rows: [{ machineId, status: 'active' }],
        rowCount: 1,
      } as any);

      // Mock getRenewalInfo
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            licenseKey,
            machineId,
            expiresAt: expiresAt.toISOString(),
            modules: ['Prescriptions'],
            customerId: '123e4567-e89b-12d3-a456-426614174000',
          },
        ],
        rowCount: 1,
      } as any);

      // Mock generateLicFile
      const { generateLicFile } = require('@/lib/machine-binding/lic-file-manager');
      generateLicFile.mockReturnValueOnce({
        success: true,
        licFile: Buffer.from('mock-lic-file'),
      });

      const result = await generateRenewalLicFile(machineId, licenseKey, renewalDays);

      expect(result.success).toBe(true);
      expect(result.renewalLicFile).toBeDefined();
      expect(result.remainingDays).toBeGreaterThan(0);
      expect(result.totalDays).toBeGreaterThan(renewalDays);
    });
  });

  describe('invalidateOldLicense', () => {
    it('should mark old license as renewed', async () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';

      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await invalidateOldLicense(licenseKey);

      expect(result.success).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE licenses'),
        [licenseKey]
      );
    });

    it('should return error when license not found', async () => {
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';

      mockDb.query.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await invalidateOldLicense(licenseKey);

      expect(result.success).toBe(false);
      expect(result.error).toBe('License not found');
    });
  });

  describe('processRenewal', () => {
    it('should process renewal and create audit log', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const renewalLicFile = Buffer.from('mock-renewal-lic-file');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Mock getRenewalInfo
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            licenseKey: 'KIRO-TEST-1234-5678-ABCD',
            machineId,
            expiresAt: expiresAt.toISOString(),
            modules: ['Prescriptions'],
            customerId: '123e4567-e89b-12d3-a456-426614174000',
          },
        ],
        rowCount: 1,
      } as any);

      // Mock invalidateOldLicense
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      // Mock audit log creation
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'audit-log-id' }],
        rowCount: 1,
      } as any);

      const result = await processRenewal(machineId, renewalLicFile);

      expect(result.success).toBe(true);
      expect(result.message).toBe('License renewal processed successfully');
    });
  });

  describe('completeRenewalWorkflow', () => {
    it('should complete full renewal workflow', async () => {
      const request = {
        machineId: 'MACHINE-12345678-12345678-12345678-12345678',
        licenseKey: 'KIRO-TEST-1234-5678-ABCD',
        renewalDays: 365,
        adminId: 'admin-user-id',
      };

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Mock validation
      mockDb.query.mockResolvedValueOnce({
        rows: [{ machineId: request.machineId, status: 'active' }],
        rowCount: 1,
      } as any);

      // Mock getRenewalInfo
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            licenseKey: request.licenseKey,
            machineId: request.machineId,
            expiresAt: expiresAt.toISOString(),
            modules: ['Prescriptions'],
            customerId: '123e4567-e89b-12d3-a456-426614174000',
          },
        ],
        rowCount: 1,
      } as any);

      // Mock generateLicFile
      const { generateLicFile } = require('@/lib/machine-binding/lic-file-manager');
      generateLicFile.mockReturnValueOnce({
        success: true,
        licFile: Buffer.from('mock-lic-file'),
      });

      // Mock update license expiration
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      // Mock audit log creation
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'audit-log-id' }],
        rowCount: 1,
      } as any);

      const result = await completeRenewalWorkflow(request);

      expect(result.success).toBe(true);
      expect(result.message).toBe('License renewal completed successfully');
      expect(result.renewalLicFile).toBeDefined();
      expect(result.newExpiresAt).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle renewal with 0 remaining days', async () => {
      const oldExpiresAt = new Date();
      oldExpiresAt.setDate(oldExpiresAt.getDate() - 5); // Expired 5 days ago
      const renewalDays = 365;

      const newExpiresAt = calculateRenewalExpirationDate(oldExpiresAt, renewalDays);

      // Should be approximately 365 days from now
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 365);

      const diffDays = Math.abs(
        (newExpiresAt.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBeLessThan(2);
    });

    it('should preserve module list during renewal', async () => {
      const machineId = 'MACHINE-12345678-12345678-12345678-12345678';
      const licenseKey = 'KIRO-TEST-1234-5678-ABCD';
      const renewalDays = 365;
      const modules = ['Prescriptions', 'Billing', 'Reports'];

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Mock validation
      mockDb.query.mockResolvedValueOnce({
        rows: [{ machineId, status: 'active' }],
        rowCount: 1,
      } as any);

      // Mock getRenewalInfo
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            licenseKey,
            machineId,
            expiresAt: expiresAt.toISOString(),
            modules,
            customerId: '123e4567-e89b-12d3-a456-426614174000',
          },
        ],
        rowCount: 1,
      } as any);

      // Mock generateLicFile
      const { generateLicFile } = require('@/lib/machine-binding/lic-file-manager');
      let capturedModules: string[] = [];
      generateLicFile.mockImplementationOnce((request: any) => {
        capturedModules = request.modules;
        return {
          success: true,
          licFile: Buffer.from('mock-lic-file'),
        };
      });

      await generateRenewalLicFile(machineId, licenseKey, renewalDays);

      expect(capturedModules).toEqual(modules);
    });
  });
});
