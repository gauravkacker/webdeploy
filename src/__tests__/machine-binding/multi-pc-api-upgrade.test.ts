/**
 * API Integration Tests for License Upgrade Endpoint
 * Tests POST /api/admin/licenses/[id]/upgrade
 * Tests upgrade validation (minimum 2 PCs)
 * Tests preservation of existing Machine ID
 */

import { POST } from '@/app/api/admin/licenses/[id]/upgrade/route';
import { NextRequest } from 'next/server';
import type { AuthorizedMachine } from '@/lib/db/schema';

// Mock dependencies
const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
const mockUpgradeLicense = jest.fn();
const mockRegenerateLicFile = jest.fn();

jest.mock('@/lib/db/server-database', () => ({
  getServerDatabase: jest.fn(() => ({
    licenses: {
      findOne: mockFindOne,
      update: mockUpdate,
    },
  })),
}));

jest.mock('@/lib/machine-binding/multi-pc-license-manager', () => ({
  createMultiPCLicenseManager: jest.fn(() => ({
    upgradeLicense: mockUpgradeLicense,
  })),
}));

jest.mock('@/lib/machine-binding/lic-file-manager', () => ({
  regenerateLicFile: jest.fn((...args) => mockRegenerateLicFile(...args)),
}));

describe('License Upgrade API Endpoint', () => {
  const testLicenseId = 'license-123';
  const testAdminUserId = 'admin-1';
  const existingMachineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';

  const mockSinglePCLicense = {
    id: testLicenseId,
    licenseKey: 'KIRO-TEST-1234',
    customerId: 'customer-123',
    licenseType: 'single-pc',
    maxMachines: 1,
    authorizedMachines: JSON.stringify([
      {
        machineId: existingMachineId,
        machineIdHash: 'hash1',
        addedAt: '2024-01-01T00:00:00.000Z',
        addedBy: 'system',
      },
    ]),
    machineHistory: JSON.stringify([]),
    expiresAt: new Date('2025-12-31'),
    modules: ['appointments', 'billing'],
    maxPrescriptions: 1000,
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/admin/licenses/[id]/upgrade - Successful Upgrades', () => {
    it('should successfully upgrade single-PC to multi-PC license', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 5,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 5,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);
      mockUpdate.mockResolvedValue(undefined);

      const mockLicFileBuffer = Buffer.from('mock-upgraded-lic-file');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.oldType).toBe('single-pc');
      expect(data.newType).toBe('multi-pc');
      expect(data.newMaxMachines).toBe(5);
      expect(data.licFile).toBeDefined();
      expect(data.message).toContain('upgraded successfully');
    });

    it('should preserve existing Machine ID during upgrade', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 3,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 3,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);

      const mockLicFileBuffer = Buffer.from('mock-lic-file');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 3,
          adminUserId: testAdminUserId,
        }),
      });

      await POST(request, { params: { id: testLicenseId } });

      // Verify regenerateLicFile was called with the existing machine
      expect(mockRegenerateLicFile).toHaveBeenCalledWith(
        expect.objectContaining({
          licenseType: 'multi-pc',
          maxMachines: 3,
          authorizedMachines: expect.arrayContaining([
            expect.objectContaining({
              machineId: existingMachineId,
            }),
          ]),
        }),
        expect.any(Buffer)
      );
    });

    it('should upgrade to minimum PC limit (2)', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 2,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 2,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);

      const mockLicFileBuffer = Buffer.from('mock-lic-file');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 2,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.newMaxMachines).toBe(2);
    });

    it('should upgrade to maximum PC limit (100)', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 100,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 100,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);

      const mockLicFileBuffer = Buffer.from('mock-lic-file');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 100,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.newMaxMachines).toBe(100);
    });
  });

  describe('POST /api/admin/licenses/[id]/upgrade - Validation Errors', () => {
    it('should return 400 when newMaxMachines is missing', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('newMaxMachines and adminUserId are required');
    });

    it('should return 400 when adminUserId is missing', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('newMaxMachines and adminUserId are required');
    });

    it('should return 400 when newMaxMachines is less than 2', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 1,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('must be between 2 and 100');
    });

    it('should return 400 when newMaxMachines is greater than 100', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 101,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('must be between 2 and 100');
    });

    it('should return 400 when newMaxMachines is not a number', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 'five',
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('must be between 2 and 100');
    });

    it('should return 400 when newMaxMachines is zero', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 0,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      // Zero is falsy, so it's caught by the "required" check first
      expect(data.error).toBeDefined();
    });

    it('should return 400 when newMaxMachines is negative', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: -5,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('must be between 2 and 100');
    });
  });

  describe('POST /api/admin/licenses/[id]/upgrade - License Not Found', () => {
    it('should return 404 when license not found', async () => {
      mockFindOne.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/admin/licenses/nonexistent/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: 'nonexistent' } });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('License not found');
    });
  });

  describe('POST /api/admin/licenses/[id]/upgrade - Already Multi-PC', () => {
    it('should return 400 when license is already multi-PC', async () => {
      const multiPCLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 5,
      };

      mockFindOne.mockResolvedValue(multiPCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: false,
        error: 'License is already multi-PC',
        errorCode: 'ALREADY_MULTI_PC',
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 10,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('already multi-PC');
      expect(data.errorCode).toBe('ALREADY_MULTI_PC');
    });
  });

  describe('POST /api/admin/licenses/[id]/upgrade - Rollback on Failure', () => {
    it('should rollback changes when .LIC file regeneration fails', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 5,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 5,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);
      mockUpdate.mockResolvedValue(undefined);

      mockRegenerateLicFile.mockReturnValue({
        success: false,
        error: 'Encryption failed',
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
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
          licenseType: mockSinglePCLicense.licenseType,
          maxMachines: mockSinglePCLicense.maxMachines,
          machineHistory: mockSinglePCLicense.machineHistory,
        })
      );
    });

    it('should handle database errors during rollback gracefully', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 5,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 5,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);
      mockUpdate.mockRejectedValue(new Error('Database connection lost'));

      mockRegenerateLicFile.mockReturnValue({
        success: false,
        error: 'Encryption failed',
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });

  describe('POST /api/admin/licenses/[id]/upgrade - LIC File Generation', () => {
    it('should generate v2.0 .LIC file with correct format', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 5,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 5,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);

      const mockLicFileBuffer = Buffer.from('mock-lic-file-v2');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.licFile).toBe(mockLicFileBuffer.toString('base64'));

      // Verify regenerateLicFile was called with multi-pc type
      expect(mockRegenerateLicFile).toHaveBeenCalledWith(
        expect.objectContaining({
          licenseType: 'multi-pc',
          maxMachines: 5,
        }),
        expect.any(Buffer)
      );
    });

    it('should include all license properties in regenerated file', async () => {
      mockFindOne.mockResolvedValue(mockSinglePCLicense);
      mockUpgradeLicense.mockResolvedValue({
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: 5,
      });

      const upgradedLicense = {
        ...mockSinglePCLicense,
        licenseType: 'multi-pc',
        maxMachines: 5,
      };

      mockFindOne.mockResolvedValueOnce(mockSinglePCLicense).mockResolvedValueOnce(upgradedLicense);

      const mockLicFileBuffer = Buffer.from('mock-lic-file');
      mockRegenerateLicFile.mockReturnValue({
        success: true,
        licFile: mockLicFileBuffer,
      });

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
          adminUserId: testAdminUserId,
        }),
      });

      await POST(request, { params: { id: testLicenseId } });

      // Verify all properties are preserved
      expect(mockRegenerateLicFile).toHaveBeenCalledWith(
        expect.objectContaining({
          licenseKey: mockSinglePCLicense.licenseKey,
          customerId: mockSinglePCLicense.customerId,
          modules: mockSinglePCLicense.modules,
          maxPrescriptions: mockSinglePCLicense.maxPrescriptions,
          expiresAt: mockSinglePCLicense.expiresAt,
          createdAt: mockSinglePCLicense.createdAt,
        }),
        expect.any(Buffer)
      );
    });
  });

  describe('POST /api/admin/licenses/[id]/upgrade - Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      mockFindOne.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: JSON.stringify({
          newMaxMachines: 5,
          adminUserId: testAdminUserId,
        }),
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to upgrade license');
    });

    it('should handle malformed JSON body', async () => {
      const request = new NextRequest('http://localhost/api/admin/licenses/license-123/upgrade', {
        method: 'POST',
        body: 'invalid-json',
      });

      const response = await POST(request, { params: { id: testLicenseId } });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBeDefined();
    });
  });
});
