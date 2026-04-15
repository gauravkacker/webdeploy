/**
 * API Integration Tests for Machine Management Endpoints
 * Tests POST /api/admin/licenses/[id]/machines (add machine)
 * Tests DELETE /api/admin/licenses/[id]/machines (remove machine)
 * Tests GET /api/admin/licenses/[id]/machines (list machines)
 */

import { GET, POST, DELETE } from '@/app/api/admin/licenses/[id]/machines/route';
import { NextRequest } from 'next/server';
import type { AuthorizedMachine } from '@/lib/db/schema';

// Mock dependencies
const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
const mockGetLicenseDetails = jest.fn();
const mockAddMachineId = jest.fn();
const mockRemoveMachineId = jest.fn();
const mockRegenerateLicFile = jest.fn();

jest.mock('@/lib/db/server-database', () => ({
  getServerDatabase: jest.fn(() => ({
    licenses: {
      findOne: mockFindOne,
      update: mockUpdate,
    },
    customers: {
      findOne: jest.fn(),
    },
  })),
}));

jest.mock('@/lib/machine-binding/multi-pc-license-manager', () => ({
  createMultiPCLicenseManager: jest.fn(() => ({
    getLicenseDetails: mockGetLicenseDetails,
    addMachineId: mockAddMachineId,
    removeMachineId: mockRemoveMachineId,
  })),
}));

jest.mock('@/lib/machine-binding/lic-file-manager', () => ({
  regenerateLicFile: jest.fn((...args) => mockRegenerateLicFile(...args)),
}));

describe('Machine Management API Endpoints', () => {
  const testLicenseId = 'license-123';
  const testMachineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
  const testAdminUserId = 'admin-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/licenses/[id]/machines - List Machines', () => {
    it('should return list of authorized machines', async () => {
      const mockMachines: AuthorizedMachine[] = [
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
          addedBy: 'admin-2',
        },
      ];

      mockGetLicenseDetails.mockResolvedValue({
        licenseId: testLicenseId,
        licenseType: 'multi-pc',
        maxMachines: 5,
        authorizedMachines: mockMachines,
        remainingSlots: 3,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines');
      const response = await GET(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.licenseId).toBe(testLicenseId);
      expect(data.licenseType).toBe('multi-pc');
      expect(data.maxMachines).toBe(5);
      expect(data.authorizedMachines).toHaveLength(2);
      expect(data.remainingSlots).toBe(3);
    });

    it('should return 404 when license not found', async () => {
      mockGetLicenseDetails.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/licenses/nonexistent/machines');
      const response = await GET(request, { params: { id: 'nonexistent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('License not found');
    });

    it('should handle empty machines list', async () => {
      mockGetLicenseDetails.mockResolvedValue({
        licenseId: testLicenseId,
        licenseType: 'single-pc',
        maxMachines: 1,
        authorizedMachines: [],
        remainingSlots: 1,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines');
      const response = await GET(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.authorizedMachines).toHaveLength(0);
      expect(data.remainingSlots).toBe(1);
    });

    it('should handle database errors gracefully', async () => {
      mockGetLicenseDetails.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines');
      const response = await GET(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to list authorized machines');
    });
  });

  describe('POST /api/admin/licenses/[id]/machines - Add Machine', () => {
    const mockLicense = {
      id: testLicenseId,
      licenseKey: 'KIRO-TEST-1234',
      customerId: 'customer-123',
      licenseType: 'multi-pc',
      maxMachines: 5,
      authorizedMachines: JSON.stringify([
        {
          machineId: 'MACHINE-EXISTING-MACHINE',
          machineIdHash: 'hash-existing',
          addedAt: '2024-01-01T00:00:00.000Z',
          addedBy: 'admin-1',
        },
      ]),
      machineHistory: JSON.stringify([]),
      expiresAt: new Date('2025-12-31'),
      modules: ['appointments', 'billing'],
      createdAt: new Date('2024-01-01'),
    };

    it('should successfully add Machine ID and return .LIC file', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockAddMachineId.mockResolvedValue({
        success: true,
        machineId: testMachineId,
      });

      const updatedLicense = {
        ...mockLicense,
        authorizedMachines: JSON.stringify([
          JSON.parse(mockLicense.authorizedMachines)[0],
          {
            machineId: testMachineId,
            machineIdHash: 'hash-new',
            addedAt: '2024-01-02T00:00:00.000Z',
            addedBy: testAdminUserId,
          },
        ]),
      };

      mockFindOne.mockResolvedValueOnce(mockLicense).mockResolvedValueOnce(updatedLicense);
      mockUpdate.mockResolvedValue(undefined);

      const mockLicFileBuffer = Buffer.from('mock-lic-file-content');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines', {
        method: 'POST',
        body: JSON.stringify({
          machineId: testMachineId,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.machineId).toBe(testMachineId);
      expect(data.licFile).toBeDefined();
      expect(data.message).toContain('added successfully');
    });

    it('should return 400 when machineId is missing', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines', {
        method: 'POST',
        body: JSON.stringify({
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('machineId and adminUserId are required');
    });

    it('should return 400 when adminUserId is missing', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines', {
        method: 'POST',
        body: JSON.stringify({
          machineId: testMachineId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('machineId and adminUserId are required');
    });

    it('should return 404 when license not found', async () => {
      mockFindOne.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/licenses/nonexistent/machines', {
        method: 'POST',
        body: JSON.stringify({
          machineId: testMachineId,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: 'nonexistent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('License not found');
    });

    it('should return 400 when PC limit exceeded', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockAddMachineId.mockResolvedValue({
        success: false,
        error: 'PC limit reached (5/5)',
        errorCode: 'PC_LIMIT_EXCEEDED',
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines', {
        method: 'POST',
        body: JSON.stringify({
          machineId: testMachineId,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('PC limit reached');
      expect(data.errorCode).toBe('PC_LIMIT_EXCEEDED');
    });

    it('should return 400 when Machine ID already exists', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockAddMachineId.mockResolvedValue({
        success: false,
        error: 'Machine ID already exists in authorized list',
        errorCode: 'MACHINE_ID_ALREADY_EXISTS',
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines', {
        method: 'POST',
        body: JSON.stringify({
          machineId: testMachineId,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('already exists');
      expect(data.errorCode).toBe('MACHINE_ID_ALREADY_EXISTS');
    });

    it('should return 400 when Machine ID format is invalid', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockAddMachineId.mockResolvedValue({
        success: false,
        error: 'Invalid Machine ID format',
        errorCode: 'INVALID_FORMAT',
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines', {
        method: 'POST',
        body: JSON.stringify({
          machineId: 'INVALID-FORMAT',
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid Machine ID format');
      expect(data.errorCode).toBe('INVALID_FORMAT');
    });

    it('should rollback changes when .LIC file regeneration fails', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockAddMachineId.mockResolvedValue({
        success: true,
        machineId: testMachineId,
      });

      const updatedLicense = {
        ...mockLicense,
        authorizedMachines: JSON.stringify([
          JSON.parse(mockLicense.authorizedMachines)[0],
          {
            machineId: testMachineId,
            machineIdHash: 'hash-new',
            addedAt: '2024-01-02T00:00:00.000Z',
            addedBy: testAdminUserId,
          },
        ]),
      };

      mockFindOne.mockResolvedValueOnce(mockLicense).mockResolvedValueOnce(updatedLicense);
      mockUpdate.mockResolvedValue(undefined);

      mockRegenerateLicFile.mockReturnValue({
        success: false,
        error: 'Encryption failed',
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/machines', {
        method: 'POST',
        body: JSON.stringify({
          machineId: testMachineId,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to regenerate license file');
      expect(data.details).toContain('Encryption failed');

      // Verify rollback was called
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: testLicenseId },
        expect.objectContaining({
          authorizedMachines: mockLicense.authorizedMachines,
          machineHistory: mockLicense.machineHistory,
        })
      );
    });
  });

  describe('DELETE /api/admin/licenses/[id]/machines - Remove Machine', () => {
    const mockLicense = {
      id: testLicenseId,
      licenseKey: 'KIRO-TEST-1234',
      customerId: 'customer-123',
      licenseType: 'multi-pc',
      maxMachines: 5,
      authorizedMachines: JSON.stringify([
        {
          machineId: testMachineId,
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
      ]),
      machineHistory: JSON.stringify([]),
      expiresAt: new Date('2025-12-31'),
      modules: ['appointments', 'billing'],
      createdAt: new Date('2024-01-01'),
    };

    it('should successfully remove Machine ID and return .LIC file', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockRemoveMachineId.mockResolvedValue({
        success: true,
        machineId: testMachineId,
      });

      const updatedLicense = {
        ...mockLicense,
        authorizedMachines: JSON.stringify([
          JSON.parse(mockLicense.authorizedMachines)[1],
        ]),
      };

      mockFindOne.mockResolvedValueOnce(mockLicense).mockResolvedValueOnce(updatedLicense);
      mockUpdate.mockResolvedValue(undefined);

      const mockLicFileBuffer = Buffer.from('mock-lic-file-content');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const url = `http://localhost/api/admin/licenses/license-123/machines?machineId=${testMachineId}&adminUserId=${testAdminUserId}`;
      const request = new NextRequest(url, { method: 'DELETE' });

      const response = await DELETE(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.machineId).toBe(testMachineId);
      expect(data.licFile).toBeDefined();
      expect(data.message).toContain('removed successfully');
    });

    it('should return 400 when machineId is missing', async () => {
      const url = `http://localhost/api/admin/licenses/license-123/machines?adminUserId=${testAdminUserId}`;
      const request = new NextRequest(url, { method: 'DELETE' });

      const response = await DELETE(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('machineId and adminUserId are required');
    });

    it('should return 400 when adminUserId is missing', async () => {
      const url = `http://localhost/api/admin/licenses/license-123/machines?machineId=${testMachineId}`;
      const request = new NextRequest(url, { method: 'DELETE' });

      const response = await DELETE(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('machineId and adminUserId are required');
    });

    it('should return 404 when license not found', async () => {
      mockFindOne.mockResolvedValue(null);

      const url = `http://localhost/api/admin/licenses/nonexistent/machines?machineId=${testMachineId}&adminUserId=${testAdminUserId}`;
      const request = new NextRequest(url, { method: 'DELETE' });

      const response = await DELETE(request, { params: { id: 'nonexistent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('License not found');
    });

    it('should return 400 when Machine ID not found', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockRemoveMachineId.mockResolvedValue({
        success: false,
        error: 'Machine ID not found in authorized list',
        errorCode: 'MACHINE_NOT_FOUND',
      });

      const url = `http://localhost/api/admin/licenses/license-123/machines?machineId=MACHINE-NONEXISTENT&adminUserId=${testAdminUserId}`;
      const request = new NextRequest(url, { method: 'DELETE' });

      const response = await DELETE(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('not found');
      expect(data.errorCode).toBe('MACHINE_NOT_FOUND');
    });

    it('should return 400 when trying to remove last Machine ID from multi-PC license', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockRemoveMachineId.mockResolvedValue({
        success: false,
        error: 'Cannot remove the last Machine ID from a multi-PC license',
        errorCode: 'LAST_MACHINE_CANNOT_REMOVE',
      });

      const url = `http://localhost/api/admin/licenses/license-123/machines?machineId=${testMachineId}&adminUserId=${testAdminUserId}`;
      const request = new NextRequest(url, { method: 'DELETE' });

      const response = await DELETE(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Cannot remove the last Machine ID');
      expect(data.errorCode).toBe('LAST_MACHINE_CANNOT_REMOVE');
    });

    it('should rollback changes when .LIC file regeneration fails', async () => {
      mockFindOne.mockResolvedValue(mockLicense);
      mockRemoveMachineId.mockResolvedValue({
        success: true,
        machineId: testMachineId,
      });

      const updatedLicense = {
        ...mockLicense,
        authorizedMachines: JSON.stringify([
          JSON.parse(mockLicense.authorizedMachines)[1],
        ]),
      };

      mockFindOne.mockResolvedValueOnce(mockLicense).mockResolvedValueOnce(updatedLicense);
      mockUpdate.mockResolvedValue(undefined);

      mockRegenerateLicFile.mockReturnValue({
        success: false,
        error: 'Encryption failed',
      });

      const url = `http://localhost/api/admin/licenses/license-123/machines?machineId=${testMachineId}&adminUserId=${testAdminUserId}`;
      const request = new NextRequest(url, { method: 'DELETE' });

      const response = await DELETE(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to regenerate license file');
      expect(data.details).toContain('Encryption failed');

      // Verify rollback was called
      expect(mockUpdate).toHaveBeenCalledWith(
        { id: testLicenseId },
        expect.objectContaining({
          authorizedMachines: mockLicense.authorizedMachines,
          machineHistory: mockLicense.machineHistory,
        })
      );
    });
  });
});
