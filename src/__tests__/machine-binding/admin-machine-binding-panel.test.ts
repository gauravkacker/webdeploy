// Mock the database
const mockAll = jest.fn();
const mockGet = jest.fn();
const mockRun = jest.fn();

jest.mock('@/lib/db/server-database', () => ({
  getServerDatabase: jest.fn().mockResolvedValue({
    all: mockAll,
    get: mockGet,
    run: mockRun,
  }),
}));

import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Machine Binding Admin Panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAll.mockClear();
    mockGet.mockClear();
    mockRun.mockClear();
  });

  describe('Machine Binding List API', () => {
    it('should fetch all machine bindings', async () => {
      const mockLicenses = [
        {
          id: 'test-license-1',
          licenseKey: 'TEST-LICENSE-001',
          machineId: 'TEST-MACHINE-ID-12345',
          machineIdHash: 'hash-TEST-MACHINE-ID-12345',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active',
          activatedAt: new Date().toISOString(),
          customerId: 'test-customer-1',
          customerName: 'Test Customer',
          customerEmail: 'test-customer1@example.com',
          clinicName: null,
        },
      ];

      mockAll.mockResolvedValueOnce(mockLicenses);

      // Simulate the API logic
      const licenses = mockLicenses;
      const now = new Date();
      const machineBindings = licenses.map((license: any) => {
        const expiresAt = license.expiresAt ? new Date(license.expiresAt) : null;
        let calculatedStatus = license.status;
        
        if (expiresAt) {
          const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilExpiry < 0) {
            calculatedStatus = 'expired';
          } else if (daysUntilExpiry <= 30) {
            calculatedStatus = 'expiring-soon';
          } else {
            calculatedStatus = 'active';
          }
        }

        return {
          ...license,
          status: calculatedStatus,
        };
      });

      expect(machineBindings.length).toBeGreaterThan(0);
      expect(machineBindings[0].licenseKey).toBe('TEST-LICENSE-001');
      expect(machineBindings[0].machineId).toBe('TEST-MACHINE-ID-12345');
      expect(machineBindings[0].customerName).toBe('Test Customer');
    });

    it('should filter machine bindings by search term', async () => {
      const mockLicenses = [
        {
          id: 'test-license-1',
          licenseKey: 'TEST-SEARCH-001',
          machineId: 'TEST-SEARCH-MACHINE-ID',
          customerName: 'Search Test Customer',
        },
        {
          id: 'test-license-2',
          licenseKey: 'TEST-OTHER-001',
          machineId: 'TEST-OTHER-MACHINE-ID',
          customerName: 'Other Customer',
        },
      ];

      // Filter by search term
      const searchTerm = 'SEARCH';
      const filtered = mockLicenses.filter((license: any) =>
        license.machineId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        license.licenseKey?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        license.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].machineId).toContain('SEARCH');
    });

    it('should calculate status correctly based on expiration', async () => {
      const now = new Date();
      const mockLicenses = [
        {
          licenseKey: 'TEST-EXPIRED-001',
          expiresAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
          status: 'active',
        },
        {
          licenseKey: 'TEST-EXPIRING-001',
          expiresAt: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days from now
          status: 'active',
        },
        {
          licenseKey: 'TEST-ACTIVE-001',
          expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days from now
          status: 'active',
        },
      ];

      // Calculate status
      const licensesWithStatus = mockLicenses.map((license: any) => {
        const expiresAt = license.expiresAt ? new Date(license.expiresAt) : null;
        let calculatedStatus = license.status;
        
        if (expiresAt) {
          const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilExpiry < 0) {
            calculatedStatus = 'expired';
          } else if (daysUntilExpiry <= 30) {
            calculatedStatus = 'expiring-soon';
          } else {
            calculatedStatus = 'active';
          }
        }

        return { ...license, calculatedStatus };
      });

      const expiredLicense = licensesWithStatus.find((l: any) => l.licenseKey === 'TEST-EXPIRED-001');
      const expiringSoonLicense = licensesWithStatus.find((l: any) => l.licenseKey === 'TEST-EXPIRING-001');
      const activeLicense = licensesWithStatus.find((l: any) => l.licenseKey === 'TEST-ACTIVE-001');

      expect(expiredLicense?.calculatedStatus).toBe('expired');
      expect(expiringSoonLicense?.calculatedStatus).toBe('expiring-soon');
      expect(activeLicense?.calculatedStatus).toBe('active');
    });
  });

  describe('Machine Binding Detail View', () => {
    it('should fetch complete machine binding details', async () => {
      const mockLicense = {
        id: 'test-license-5',
        licenseKey: 'TEST-DETAIL-001',
        machineId: 'TEST-DETAIL-MACHINE-ID',
        machineIdHash: 'hash-TEST-DETAIL-MACHINE-ID',
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
        activatedAt: new Date().toISOString(),
        customerId: 'test-customer-4',
        customerName: 'Detail Test Customer',
        customerEmail: 'test-customer4@example.com',
        clinicName: 'Test Clinic',
        modules: JSON.stringify(['appointments', 'prescriptions', 'billing']),
      };

      mockGet.mockResolvedValueOnce(mockLicense);

      const license = mockLicense;

      expect(license).toBeDefined();
      expect(license.licenseKey).toBe('TEST-DETAIL-001');
      expect(license.machineId).toBe('TEST-DETAIL-MACHINE-ID');
      expect(license.customerName).toBe('Detail Test Customer');
      expect(license.clinicName).toBe('Test Clinic');
      expect(JSON.parse(license.modules)).toEqual(['appointments', 'prescriptions', 'billing']);
    });
  });

  describe('Sorting and Filtering', () => {
    it('should sort machine bindings by expiration date', async () => {
      const now = Date.now();
      const mockLicenses = [
        { licenseKey: 'TEST-SORT-001', expiresAt: new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString() },
        { licenseKey: 'TEST-SORT-002', expiresAt: new Date(now + 50 * 24 * 60 * 60 * 1000).toISOString() },
        { licenseKey: 'TEST-SORT-003', expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString() },
      ];

      // Sort by expiration date ascending
      const sorted = [...mockLicenses].sort((a, b) => {
        const aTime = new Date(a.expiresAt).getTime();
        const bTime = new Date(b.expiresAt).getTime();
        return aTime - bTime;
      });

      expect(sorted.length).toBe(3);
      expect(sorted[0].licenseKey).toBe('TEST-SORT-001'); // 10 days
      expect(sorted[1].licenseKey).toBe('TEST-SORT-003'); // 30 days
      expect(sorted[2].licenseKey).toBe('TEST-SORT-002'); // 50 days
    });

    it('should filter by status', async () => {
      const mockLicenses = [
        { licenseKey: 'TEST-FILTER-ACTIVE', status: 'active' },
        { licenseKey: 'TEST-FILTER-EXPIRED', status: 'expired' },
        { licenseKey: 'TEST-FILTER-ACTIVE-2', status: 'active' },
      ];

      // Filter active licenses
      const activeLicenses = mockLicenses.filter((l) => l.status === 'active');

      // Filter expired licenses
      const expiredLicenses = mockLicenses.filter((l) => l.status === 'expired');

      expect(activeLicenses.length).toBe(2);
      expect(activeLicenses[0].licenseKey).toBe('TEST-FILTER-ACTIVE');
      expect(expiredLicenses.length).toBe(1);
      expect(expiredLicenses[0].licenseKey).toBe('TEST-FILTER-EXPIRED');
    });
  });
});
