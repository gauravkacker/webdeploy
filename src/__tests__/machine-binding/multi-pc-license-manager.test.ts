/**
 * Unit Tests for Multi-PC License Manager
 * Tests addMachineId, removeMachineId, upgradeLicense, and validation functions
 */

import { MultiPCLicenseManager } from '@/lib/machine-binding/multi-pc-license-manager';
import type { AuthorizedMachine, MachineHistoryEntry } from '@/lib/db/schema';

// Mock database
const mockDb = {
  licenses: {
    findOne: jest.fn(),
    update: jest.fn(),
  },
  customers: {
    findOne: jest.fn(),
  },
};

describe('Multi-PC License Manager', () => {
  let manager: MultiPCLicenseManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new MultiPCLicenseManager(mockDb as any);
  });

  describe('addMachineId()', () => {
    const validRequest = {
      licenseId: 'license-123',
      machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
      adminUserId: 'admin-1',
    };

    it('should successfully add Machine ID to license with available slots', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'multi-pc',
        maxMachines: 5,
        authorizedMachines: JSON.stringify(existingMachines),
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      const result = await manager.addMachineId(validRequest);

      expect(result.success).toBe(true);
      expect(result.machineId).toBe(validRequest.machineId);
      expect(mockDb.licenses.update).toHaveBeenCalledWith(
        'license-123',
        expect.objectContaining({
          authorizedMachines: expect.any(String),
          machineHistory: expect.any(String),
        })
      );

      // Verify the updated machines array
      const updateCall = mockDb.licenses.update.mock.calls[0][1];
      const updatedMachines = JSON.parse(updateCall.authorizedMachines);
      expect(updatedMachines).toHaveLength(2);
      expect(updatedMachines[1].machineId).toBe(validRequest.machineId);
      expect(updatedMachines[1].addedBy).toBe('admin-1');
    });

    it('should reject when license not found', async () => {
      mockDb.licenses.findOne.mockResolvedValue(null);

      const result = await manager.addMachineId(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LICENSE_NOT_FOUND');
      expect(result.error).toContain('License not found');
    });

    it('should reject invalid Machine ID format', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        maxMachines: 5,
        authorizedMachines: JSON.stringify([]),
      });

      const invalidRequest = {
        ...validRequest,
        machineId: 'INVALID-FORMAT',
      };

      const result = await manager.addMachineId(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_FORMAT');
      expect(result.error).toContain('Invalid Machine ID format');
    });

    it('should reject duplicate Machine ID', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        maxMachines: 5,
        authorizedMachines: JSON.stringify(existingMachines),
      });

      const result = await manager.addMachineId(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MACHINE_ID_ALREADY_EXISTS');
      expect(result.error).toContain('already exists');
    });

    it('should reject when PC limit reached', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
        {
          machineId: 'MACHINE-11111111-22222222-33333333-44444444',
          machineIdHash: 'hash2',
          addedAt: '2024-01-02T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        maxMachines: 2,
        authorizedMachines: JSON.stringify(existingMachines),
      });

      const result = await manager.addMachineId(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PC_LIMIT_EXCEEDED');
      expect(result.error).toContain('PC limit reached');
    });

    it('should record addition in machine history', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        maxMachines: 5,
        authorizedMachines: JSON.stringify([]),
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      await manager.addMachineId(validRequest);

      const updateCall = mockDb.licenses.update.mock.calls[0][1];
      const history: MachineHistoryEntry[] = JSON.parse(updateCall.machineHistory);
      
      expect(history).toHaveLength(1);
      expect(history[0].eventType).toBe('added');
      expect(history[0].machineId).toBe(validRequest.machineId);
      expect(history[0].performedBy).toBe('admin-1');
    });

    it('should handle license with no existing machines', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        maxMachines: 5,
        authorizedMachines: null,
        machineHistory: null,
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      const result = await manager.addMachineId(validRequest);

      expect(result.success).toBe(true);
    });
  });

  describe('removeMachineId()', () => {
    const validRequest = {
      licenseId: 'license-123',
      machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
      adminUserId: 'admin-1',
    };

    it('should successfully remove Machine ID from multi-PC license', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
        {
          machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
          machineIdHash: 'hash2',
          addedAt: '2024-01-02T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'multi-pc',
        authorizedMachines: JSON.stringify(existingMachines),
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      const result = await manager.removeMachineId(validRequest);

      expect(result.success).toBe(true);
      expect(result.machineId).toBe(validRequest.machineId);

      // Verify the machine was removed
      const updateCall = mockDb.licenses.update.mock.calls[0][1];
      const updatedMachines = JSON.parse(updateCall.authorizedMachines);
      expect(updatedMachines).toHaveLength(1);
      expect(updatedMachines[0].machineId).toBe('MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD');
    });

    it('should reject when license not found', async () => {
      mockDb.licenses.findOne.mockResolvedValue(null);

      const result = await manager.removeMachineId(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LICENSE_NOT_FOUND');
    });

    it('should reject when Machine ID not found', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        authorizedMachines: JSON.stringify(existingMachines),
      });

      const result = await manager.removeMachineId(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('MACHINE_NOT_FOUND');
      expect(result.error).toContain('not found');
    });

    it('should reject removing last Machine ID from multi-PC license', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'multi-pc',
        authorizedMachines: JSON.stringify(existingMachines),
      });

      const result = await manager.removeMachineId(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LAST_MACHINE_CANNOT_REMOVE');
      expect(result.error).toContain('Cannot remove the last Machine ID');
    });

    it('should allow removing last Machine ID from single-PC license', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'single-pc',
        authorizedMachines: JSON.stringify(existingMachines),
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      const result = await manager.removeMachineId(validRequest);

      expect(result.success).toBe(true);
    });

    it('should record removal in machine history', async () => {
      const existingMachines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
        {
          machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
          machineIdHash: 'hash2',
          addedAt: '2024-01-02T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'multi-pc',
        authorizedMachines: JSON.stringify(existingMachines),
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      await manager.removeMachineId(validRequest);

      const updateCall = mockDb.licenses.update.mock.calls[0][1];
      const history: MachineHistoryEntry[] = JSON.parse(updateCall.machineHistory);
      
      expect(history).toHaveLength(1);
      expect(history[0].eventType).toBe('removed');
      expect(history[0].machineId).toBe(validRequest.machineId);
      expect(history[0].performedBy).toBe('admin-1');
    });
  });

  describe('upgradeLicense()', () => {
    const validRequest = {
      licenseId: 'license-123',
      newMaxMachines: 5,
      adminUserId: 'admin-1',
    };

    it('should successfully upgrade single-PC to multi-PC', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'single-pc',
        maxMachines: 1,
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      const result = await manager.upgradeLicense(validRequest);

      expect(result.success).toBe(true);
      expect(result.oldType).toBe('single-pc');
      expect(result.newType).toBe('multi-pc');
      expect(result.newMaxMachines).toBe(5);

      expect(mockDb.licenses.update).toHaveBeenCalledWith(
        'license-123',
        expect.objectContaining({
          licenseType: 'multi-pc',
          maxMachines: 5,
        })
      );
    });

    it('should reject when license not found', async () => {
      mockDb.licenses.findOne.mockResolvedValue(null);

      const result = await manager.upgradeLicense(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('LICENSE_NOT_FOUND');
    });

    it('should reject when license is already multi-PC', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'multi-pc',
        maxMachines: 5,
      });

      const result = await manager.upgradeLicense(validRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('ALREADY_MULTI_PC');
      expect(result.error).toContain('already multi-PC');
    });

    it('should reject PC limit less than 2', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'single-pc',
      });

      const invalidRequest = {
        ...validRequest,
        newMaxMachines: 1,
      };

      const result = await manager.upgradeLicense(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PC_LIMIT');
      expect(result.error).toContain('between 2 and 100');
    });

    it('should reject PC limit greater than 100', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'single-pc',
      });

      const invalidRequest = {
        ...validRequest,
        newMaxMachines: 101,
      };

      const result = await manager.upgradeLicense(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INVALID_PC_LIMIT');
    });

    it('should record upgrade in machine history', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: 'single-pc',
        maxMachines: 1,
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      await manager.upgradeLicense(validRequest);

      const updateCall = mockDb.licenses.update.mock.calls[0][1];
      const history: MachineHistoryEntry[] = JSON.parse(updateCall.machineHistory);
      
      expect(history).toHaveLength(1);
      expect(history[0].eventType).toBe('upgraded');
      expect(history[0].performedBy).toBe('admin-1');
      expect(history[0].oldMaxMachines).toBe(1);
      expect(history[0].newMaxMachines).toBe(5);
    });

    it('should handle license with null licenseType (defaults to single-pc)', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseType: null,
        machineHistory: JSON.stringify([]),
      });

      mockDb.licenses.update.mockResolvedValue(undefined);

      const result = await manager.upgradeLicense(validRequest);

      expect(result.success).toBe(true);
      expect(result.oldType).toBe('single-pc');
    });
  });

  describe('validatePCLimit()', () => {
    it('should validate when machines count is within limit', () => {
      const machines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-1',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin',
        },
        {
          machineId: 'MACHINE-2',
          machineIdHash: 'hash2',
          addedAt: '2024-01-02T00:00:00.000Z',
          addedBy: 'admin',
        },
      ];

      const result = manager.validatePCLimit(machines, 5);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject when machines count exceeds limit', () => {
      const machines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-1',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin',
        },
        {
          machineId: 'MACHINE-2',
          machineIdHash: 'hash2',
          addedAt: '2024-01-02T00:00:00.000Z',
          addedBy: 'admin',
        },
        {
          machineId: 'MACHINE-3',
          machineIdHash: 'hash3',
          addedAt: '2024-01-03T00:00:00.000Z',
          addedBy: 'admin',
        },
      ];

      const result = manager.validatePCLimit(machines, 2);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds PC limit');
    });

    it('should reject PC limit less than 1', () => {
      const result = manager.validatePCLimit([], 0);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 1 and 100');
    });

    it('should reject PC limit greater than 100', () => {
      const result = manager.validatePCLimit([], 101);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 1 and 100');
    });

    it('should validate PC limit of 1 (single-PC)', () => {
      const machines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-1',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin',
        },
      ];

      const result = manager.validatePCLimit(machines, 1);

      expect(result.valid).toBe(true);
    });

    it('should validate PC limit of 100 (maximum)', () => {
      const machines: AuthorizedMachine[] = Array.from({ length: 100 }, (_, i) => ({
        machineId: `MACHINE-${i}`,
        machineIdHash: `hash${i}`,
        addedAt: '2024-01-01T00:00:00.000Z',
        addedBy: 'admin',
      }));

      const result = manager.validatePCLimit(machines, 100);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateMachineIdUniqueness()', () => {
    const existingMachines: AuthorizedMachine[] = [
      {
        machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
        machineIdHash: 'hash1',
        addedAt: '2024-01-01T00:00:00.000Z',
        addedBy: 'admin',
      },
      {
        machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
        machineIdHash: 'hash2',
        addedAt: '2024-01-02T00:00:00.000Z',
        addedBy: 'admin',
      },
    ];

    it('should validate unique Machine ID', () => {
      const result = manager.validateMachineIdUniqueness(
        'MACHINE-11111111-22222222-33333333-44444444',
        existingMachines
      );

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject duplicate Machine ID', () => {
      const result = manager.validateMachineIdUniqueness(
        'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
        existingMachines
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should perform case-sensitive comparison', () => {
      const result = manager.validateMachineIdUniqueness(
        'machine-12345678-87654321-abcdefab-cdefabcd', // lowercase
        existingMachines
      );

      // Should be valid because comparison is case-sensitive
      expect(result.valid).toBe(true);
    });

    it('should validate against empty machines list', () => {
      const result = manager.validateMachineIdUniqueness(
        'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
        []
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('getLicenseDetails()', () => {
    it('should return complete license details', async () => {
      const machines: AuthorizedMachine[] = [
        {
          machineId: 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD',
          machineIdHash: 'hash1',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
        {
          machineId: 'MACHINE-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
          machineIdHash: 'hash2',
          addedAt: '2024-01-02T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ];

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        licenseKey: 'KIRO-TEST-1234',
        customerId: 'customer-456',
        licenseType: 'multi-pc',
        maxMachines: 5,
        authorizedMachines: JSON.stringify(machines),
        expiresAt: new Date('2025-12-31'),
        status: 'active',
      });

      mockDb.customers.findOne.mockResolvedValue({
        id: 'customer-456',
        name: 'Test Customer',
        email: 'test@example.com',
      });

      const result = await manager.getLicenseDetails('license-123');

      expect(result).not.toBeNull();
      expect(result?.licenseId).toBe('license-123');
      expect(result?.licenseKey).toBe('KIRO-TEST-1234');
      expect(result?.licenseType).toBe('multi-pc');
      expect(result?.maxMachines).toBe(5);
      expect(result?.authorizedMachines).toHaveLength(2);
      expect(result?.remainingSlots).toBe(3);
      expect(result?.customer.name).toBe('Test Customer');
      expect(result?.status).toBe('active');
    });

    it('should return null when license not found', async () => {
      mockDb.licenses.findOne.mockResolvedValue(null);

      const result = await manager.getLicenseDetails('license-123');

      expect(result).toBeNull();
    });

    it('should return null when customer not found', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        customerId: 'customer-456',
      });

      mockDb.customers.findOne.mockResolvedValue(null);

      const result = await manager.getLicenseDetails('license-123');

      expect(result).toBeNull();
    });

    it('should calculate remaining slots correctly', async () => {
      const machines: AuthorizedMachine[] = Array.from({ length: 7 }, (_, i) => ({
        machineId: `MACHINE-${i}`,
        machineIdHash: `hash${i}`,
        addedAt: '2024-01-01T00:00:00.000Z',
        addedBy: 'admin',
      }));

      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        customerId: 'customer-456',
        licenseType: 'multi-pc',
        maxMachines: 10,
        authorizedMachines: JSON.stringify(machines),
        expiresAt: new Date('2025-12-31'),
        status: 'active',
      });

      mockDb.customers.findOne.mockResolvedValue({
        id: 'customer-456',
        name: 'Test',
        email: 'test@example.com',
      });

      const result = await manager.getLicenseDetails('license-123');

      expect(result?.remainingSlots).toBe(3); // 10 - 7 = 3
    });

    it('should handle license with no machines', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        customerId: 'customer-456',
        licenseType: 'single-pc',
        maxMachines: 1,
        authorizedMachines: null,
        expiresAt: new Date('2025-12-31'),
        status: 'active',
      });

      mockDb.customers.findOne.mockResolvedValue({
        id: 'customer-456',
        name: 'Test',
        email: 'test@example.com',
      });

      const result = await manager.getLicenseDetails('license-123');

      expect(result?.authorizedMachines).toHaveLength(0);
      expect(result?.remainingSlots).toBe(1);
    });

    it('should default to single-pc when licenseType is null', async () => {
      mockDb.licenses.findOne.mockResolvedValue({
        id: 'license-123',
        customerId: 'customer-456',
        licenseType: null,
        maxMachines: null,
        authorizedMachines: JSON.stringify([]),
        expiresAt: new Date('2025-12-31'),
        status: 'active',
      });

      mockDb.customers.findOne.mockResolvedValue({
        id: 'customer-456',
        name: 'Test',
        email: 'test@example.com',
      });

      const result = await manager.getLicenseDetails('license-123');

      expect(result?.licenseType).toBe('single-pc');
      expect(result?.maxMachines).toBe(1);
    });
  });
});
