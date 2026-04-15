// Mock the database first before importing
const mockQuery = jest.fn();

jest.mock('@/lib/db/database', () => ({
  db: {
    query: mockQuery,
  },
}));

// Mock the lic-file-manager
jest.mock('@/lib/machine-binding/lic-file-manager', () => ({
  generateLicFile: jest.fn().mockResolvedValue({
    success: true,
    licFile: Buffer.from('mock-lic-file-content'),
  }),
}));

// Mock the pc-change-workflow
jest.mock('@/lib/machine-binding/pc-change-workflow', () => ({
  getRemainingLicenseDays: jest.fn().mockReturnValue(30),
  preserveRemainingDays: jest.fn().mockReturnValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
}));

// Mock the license-binding
jest.mock('@/lib/machine-binding/license-binding', () => ({
  validateMachineIdFormat: jest.fn().mockReturnValue(true),
}));

import {
  validateAdminAuthorization,
  generateNewLicFileForMachineId,
  invalidateOldLicenseFile,
  createTransferRecord,
  getTransferHistory,
  completeLicenseTransfer,
} from '@/lib/machine-binding/admin-license-transfer';

describe('Admin License Transfer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockClear();
  });

  describe('validateAdminAuthorization', () => {
    it('should return true for admin user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'admin' }],
        rowCount: 1,
      } as any);

      const result = await validateAdminAuthorization('admin-user-id');
      expect(result).toBe(true);
    });

    it('should return true for superadmin user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'superadmin' }],
        rowCount: 1,
      } as any);

      const result = await validateAdminAuthorization('superadmin-user-id');
      expect(result).toBe(true);
    });

    it('should return false for non-admin user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'user' }],
        rowCount: 1,
      } as any);

      const result = await validateAdminAuthorization('regular-user-id');
      expect(result).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await validateAdminAuthorization('non-existent-user-id');
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await validateAdminAuthorization('user-id');
      expect(result).toBe(false);
    });
  });

  describe('generateNewLicFileForMachineId', () => {
    it('should generate new .LIC file with remaining days preserved', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            machineId: 'old-machine-id',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            modules: ['module1', 'module2'],
          },
        ],
        rowCount: 1,
      } as any);

      const result = await generateNewLicFileForMachineId(
        'old-machine-id',
        'new-machine-id',
        'test-license-key'
      );

      expect(result.success).toBe(true);
      expect(result.newLicFile).toBeDefined();
      expect(result.remainingDays).toBe(30);
    });

    it('should fail if old Machine ID does not match', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            machineId: 'different-machine-id',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        ],
        rowCount: 1,
      } as any);

      const result = await generateNewLicFileForMachineId(
        'old-machine-id',
        'new-machine-id',
        'test-license-key'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not match');
    });

    it('should fail if license has expired', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            machineId: 'old-machine-id',
            expiresAt: new Date(Date.now() - 1000), // Expired
          },
        ],
        rowCount: 1,
      } as any);

      // Mock getRemainingLicenseDays to return negative value for expired license
      const { getRemainingLicenseDays } = require('@/lib/machine-binding/pc-change-workflow');
      getRemainingLicenseDays.mockReturnValueOnce(-1);

      const result = await generateNewLicFileForMachineId(
        'old-machine-id',
        'new-machine-id',
        'test-license-key'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('expired');
    });

    it('should fail if license not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await generateNewLicFileForMachineId(
        'old-machine-id',
        'new-machine-id',
        'test-license-key'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('invalidateOldLicenseFile', () => {
    it('should invalidate old license file', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 1,
      } as any);

      const result = await invalidateOldLicenseFile('old-machine-id');
      expect(result).toBe(true);
    });

    it('should return false if no license found to invalidate', async () => {
      mockQuery.mockResolvedValueOnce({
        rowCount: 0,
      } as any);

      const result = await invalidateOldLicenseFile('non-existent-machine-id');
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await invalidateOldLicenseFile('old-machine-id');
      expect(result).toBe(false);
    });
  });

  describe('createTransferRecord', () => {
    it('should create transfer record for audit trail', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'license-id' }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({
          rows: [{ expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({
          rows: [{ id: 'transfer-record-id' }],
          rowCount: 1,
        } as any);

      const result = await createTransferRecord(
        'old-machine-id',
        'new-machine-id',
        'test-license-key',
        'admin-id'
      );

      expect(result.success).toBe(true);
      expect(result.transferId).toBe('transfer-record-id');
      expect(result.remainingDays).toBe(30);
    });

    it('should fail if license not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await createTransferRecord(
        'old-machine-id',
        'new-machine-id',
        'test-license-key',
        'admin-id'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('getTransferHistory', () => {
    it('should retrieve transfer history for machine ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'transfer-1',
            licenseId: 'license-1',
            details: JSON.stringify({
              oldMachineId: 'old-machine-id',
              newMachineId: 'new-machine-id',
              remainingDaysPreserved: 30,
            }),
            performedBy: 'admin-id',
            createdAt: new Date(),
          },
        ],
        rowCount: 1,
      } as any);

      const result = await getTransferHistory('old-machine-id');

      expect(result).toHaveLength(1);
      expect(result[0].oldMachineId).toBe('old-machine-id');
      expect(result[0].newMachineId).toBe('new-machine-id');
      expect(result[0].remainingDaysPreserved).toBe(30);
    });

    it('should return empty array if no transfer history found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await getTransferHistory('machine-id');

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await getTransferHistory('machine-id');

      expect(result).toEqual([]);
    });
  });

  describe('completeLicenseTransfer', () => {
    it('should complete full license transfer process', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ role: 'admin' }],
          rowCount: 1,
        } as any)
        // Mock license lookup for new .LIC file generation
        .mockResolvedValueOnce({
          rows: [
            {
              machineId: 'old-machine-id',
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              modules: ['module1'],
            },
          ],
          rowCount: 1,
        } as any)
        // Mock invalidate old license
        .mockResolvedValueOnce({
          rowCount: 1,
        } as any)
        // Mock license lookup for transfer record
        .mockResolvedValueOnce({
          rows: [{ id: 'license-id' }],
          rowCount: 1,
        } as any)
        // Mock expiration lookup for transfer record
        .mockResolvedValueOnce({
          rows: [{ expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }],
          rowCount: 1,
        } as any)
        // Mock create transfer record
        .mockResolvedValueOnce({
          rows: [{ id: 'transfer-record-id' }],
          rowCount: 1,
        } as any)
        // Mock update license with new machine ID
        .mockResolvedValueOnce({
          rowCount: 1,
        } as any);

      const result = await completeLicenseTransfer({
        oldMachineId: 'old-machine-id',
        newMachineId: 'new-machine-id',
        licenseKey: 'test-license-key',
        adminId: 'admin-id',
      });

      expect(result.success).toBe(true);
      expect(result.newLicFile).toBeDefined();
      expect(result.transferId).toBe('transfer-record-id');
      expect(result.remainingDays).toBe(30);
    });

    it('should fail if user is not admin', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'user' }],
        rowCount: 1,
      } as any);

      const result = await completeLicenseTransfer({
        oldMachineId: 'old-machine-id',
        newMachineId: 'new-machine-id',
        licenseKey: 'test-license-key',
        adminId: 'user-id',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unauthorized');
    });

    it('should handle errors during transfer process', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await completeLicenseTransfer({
        oldMachineId: 'old-machine-id',
        newMachineId: 'new-machine-id',
        licenseKey: 'test-license-key',
        adminId: 'admin-id',
      });

      expect(result.success).toBe(false);
    });
  });
});
