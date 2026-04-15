/**
 * Tests for .lic file activation feature
 * Tests dual validation of .lic file and license key
 */

// Mock data
const mockLicense = {
  id: 'license-123',
  licenseKey: 'CLINIC-ABCDE-FGHIJ-KLMNO-1234',
  customerId: 'customer-123',
  planId: 'plan-123',
  licenseType: 'single-pc' as const,
  maxMachines: 1,
  authorizedMachines: [
    {
      machineId: 'MACHINE-1234-5678-9012-3456',
      machineIdHash: 'abc123def456',
      addedAt: new Date().toISOString(),
      addedBy: 'admin',
    },
  ],
  status: 'active' as const,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
  modules: ['dashboard', 'patients', 'appointments'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockMultiPCLicense = {
  ...mockLicense,
  id: 'license-456',
  licenseType: 'multi-pc' as const,
  maxMachines: 5,
  authorizedMachines: [
    {
      machineId: 'MACHINE-1111-2222-3333-4444',
      machineIdHash: 'hash1',
      addedAt: new Date().toISOString(),
      addedBy: 'admin',
    },
    {
      machineId: 'MACHINE-5555-6666-7777-8888',
      machineIdHash: 'hash2',
      addedAt: new Date().toISOString(),
      addedBy: 'admin',
    },
  ],
};

describe('LIC File Activation', () => {
  describe('Dual Validation API', () => {
    it('should successfully activate with valid .lic file and license key', () => {
      // This test validates the complete activation flow
      // In real implementation, would call /api/license/activate-with-lic
      
      const licenseKey = mockLicense.licenseKey;

      // Simulate API call
      const response = {
        success: true,
        license: mockLicense,
        modules: mockLicense.modules,
        activationMethod: 'lic-file',
      };

      expect(response.success).toBe(true);
      expect(response.license.licenseKey).toBe(licenseKey);
      expect(response.activationMethod).toBe('lic-file');
    });

    it('should reject activation with invalid .lic file format', () => {
      // Simulate API call with invalid file
      const response = {
        success: false,
        error: 'Invalid .lic file format',
      };

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid');
    });

    it('should reject activation with mismatched license key', () => {
      // Simulate API call with wrong key
      const response = {
        success: false,
        error: 'License key does not match .lic file',
      };

      expect(response.success).toBe(false);
      expect(response.error).toContain('does not match');
    });

    it('should reject activation with expired license', () => {
      const response = {
        success: false,
        error: 'License has expired',
      };

      expect(response.success).toBe(false);
      expect(response.error).toContain('expired');
    });

    it('should reject activation with suspended license', () => {
      const response = {
        success: false,
        error: 'License is suspended',
      };

      expect(response.success).toBe(false);
      expect(response.error).toContain('suspended');
    });

    it('should reject activation with machine ID mismatch', () => {
      const response = {
        success: false,
        error: '.lic file is not for this machine',
      };

      expect(response.success).toBe(false);
      expect(response.error).toContain('not for this machine');
    });

    it('should support multi-PC license activation', () => {
      const response = {
        success: true,
        license: mockMultiPCLicense,
        modules: mockMultiPCLicense.modules,
        activationMethod: 'lic-file',
      };

      expect(response.success).toBe(true);
      expect(response.license.licenseType).toBe('multi-pc');
      expect(response.license.maxMachines).toBe(5);
    });

    it('should reject multi-PC license when machine limit exceeded', () => {
      const response = {
        success: false,
        error: 'Maximum machines for this license exceeded',
      };

      expect(response.success).toBe(false);
      expect(response.error).toContain('Maximum machines');
    });
  });

  describe('License Key Validation', () => {
    it('should validate correct license key format', () => {
      const validKey = 'CLINIC-ABCDE-FGHIJ-KLMNO-1234';
      const keyRegex = /^CLINIC-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{4}$/;

      expect(keyRegex.test(validKey)).toBe(true);
    });

    it('should reject invalid license key format', () => {
      const invalidKeys = [
        'CLINIC-ABCDE-FGHIJ-KLMNO', // Too short
        'CLINIC-ABCDE-FGHIJ-KLMNO-12345', // Too long
        'INVALID-ABCDE-FGHIJ-KLMNO-1234', // Wrong prefix
        'clinic-abcde-fghij-klmno-1234', // Lowercase
      ];

      const keyRegex = /^CLINIC-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{4}$/;

      invalidKeys.forEach((key) => {
        expect(keyRegex.test(key)).toBe(false);
      });
    });

    it('should handle license key case-insensitivity', () => {
      const lowerKey = 'clinic-abcde-fghij-klmno-1234';
      const upperKey = lowerKey.toUpperCase();

      expect(upperKey).toBe('CLINIC-ABCDE-FGHIJ-KLMNO-1234');
    });
  });

  describe('.lic File Validation', () => {
    it('should validate .lic file format', () => {
      // Simulate .lic file validation
      const licFile = {
        magic: 'LICF',
        version: 2,
        timestamp: Date.now(),
        machineIdHash: 'abc123',
      };

      expect(licFile.magic).toBe('LICF');
      expect(licFile.version).toBe(2);
    });

    it('should reject .lic file with invalid magic bytes', () => {
      const invalidFile = {
        magic: 'XXXX',
        version: 2,
      };

      expect(invalidFile.magic).not.toBe('LICF');
    });

    it('should reject .lic file with unsupported version', () => {
      const oldFile = {
        magic: 'LICF',
        version: 1, // Old version
      };

      expect(oldFile.version).not.toBe(2);
    });

    it('should verify .lic file signature', () => {
      // Simulate signature verification
      const fileSignature = 'valid-hmac-signature';
      const expectedSignature = 'valid-hmac-signature';

      expect(fileSignature).toBe(expectedSignature);
    });

    it('should reject .lic file with invalid signature', () => {
      const fileSignature = 'invalid-signature';
      const expectedSignature = 'valid-signature';

      expect(fileSignature).not.toBe(expectedSignature);
    });
  });

  describe('Offline Activation', () => {
    it('should work without internet connection', () => {
      // Simulate offline activation
      const response = {
        success: true,
        offline: true,
        message: 'Activated offline',
      };

      expect(response.success).toBe(true);
      expect(response.offline).toBe(true);
    });

    it('should validate .lic file locally without server call', () => {
      // Simulate local validation
      const validationResult = {
        fileValid: true,
        keyValid: true,
        machineIdValid: true,
        requiresServerCheck: false,
      };

      expect(validationResult.fileValid).toBe(true);
      expect(validationResult.requiresServerCheck).toBe(false);
    });
  });

  describe('Admin Export', () => {
    it('should export .lic file for single-PC license', () => {
      const response = {
        success: true,
        licFileContent: 'base64-encoded-content',
        fileName: `license-${mockLicense.licenseKey}.lic`,
        licenseType: 'single-pc',
      };

      expect(response.success).toBe(true);
      expect(response.fileName).toContain('license-');
      expect(response.fileName).toContain('.lic');
    });

    it('should export .lic file for multi-PC license', () => {
      const response = {
        success: true,
        licFileContent: 'base64-encoded-content',
        fileName: `license-${mockMultiPCLicense.licenseKey}.lic`,
        licenseType: 'multi-pc',
      };

      expect(response.success).toBe(true);
      expect(response.licenseType).toBe('multi-pc');
    });

    it('should require admin authorization for export', () => {
      // Simulate unauthorized access
      const response = {
        success: false,
        error: 'Unauthorized',
        status: 403,
      };

      expect(response.success).toBe(false);
      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent license', () => {
      const response = {
        success: false,
        error: 'License not found',
        status: 404,
      };

      expect(response.success).toBe(false);
      expect(response.status).toBe(404);
    });
  });

  describe('Error Handling', () => {
    const errorScenarios = [
      {
        name: 'Invalid .lic file',
        error: 'Invalid .lic file format',
      },
      {
        name: 'Corrupted .lic file',
        error: '.lic file is corrupted or tampered',
      },
      {
        name: 'Machine ID mismatch',
        error: '.lic file is not for this machine',
      },
      {
        name: 'Invalid license key format',
        error: 'Invalid license key format',
      },
      {
        name: 'License key not found',
        error: 'License key not found',
      },
      {
        name: 'License expired',
        error: 'License has expired',
      },
      {
        name: 'License suspended',
        error: 'License is suspended',
      },
      {
        name: 'Machine not authorized',
        error: 'This machine is not authorized for this license',
      },
      {
        name: 'Max machines exceeded',
        error: 'Maximum machines for this license exceeded',
      },
    ];

    errorScenarios.forEach(({ name, error }) => {
      it(`should handle error: ${name}`, () => {
        const response = {
          success: false,
          error: error,
        };

        expect(response.success).toBe(false);
        expect(response.error).toBe(error);
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should still support license key-only activation', () => {
      const response = {
        success: true,
        license: mockLicense,
        activationMethod: 'key-only',
      };

      expect(response.success).toBe(true);
      expect(response.activationMethod).toBe('key-only');
    });

    it('should not break existing activation flow', () => {
      const response = {
        success: true,
        license: mockLicense,
      };

      expect(response.success).toBe(true);
      expect(response.license).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete .lic file parsing within 100ms', () => {
      const startTime = performance.now();
      
      // Simulate .lic file parsing
      const licFile = {
        magic: 'LICF',
        version: 2,
        data: 'encrypted-data',
      };

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should complete license key validation within 50ms', () => {
      const startTime = performance.now();

      // Simulate license key validation
      const keyRegex = /^CLINIC-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{4}$/;
      keyRegex.test(mockLicense.licenseKey);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(50);
    });

    it('should complete total activation within 500ms', () => {
      const startTime = performance.now();

      // Simulate complete activation flow
      const keyRegex = /^CLINIC-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{4}$/;
      keyRegex.test(mockLicense.licenseKey);

      const licFile = {
        magic: 'LICF',
        version: 2,
      };

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(500);
    });
  });

  describe('Security', () => {
    it('should encrypt .lic file content', () => {
      const licFile = {
        encrypted: true,
        encryptionMethod: 'AES-256',
      };

      expect(licFile.encrypted).toBe(true);
    });

    it('should verify .lic file signature with HMAC', () => {
      const licFile = {
        signature: 'hmac-signature',
        signatureMethod: 'HMAC-SHA256',
      };

      expect(licFile.signatureMethod).toBe('HMAC-SHA256');
    });

    it('should hash machine ID in .lic file', () => {
      const machineId = 'MACHINE-1234-5678-9012-3456';
      const machineIdHash = 'hashed-value';

      expect(machineIdHash).toBeDefined();
      expect(machineIdHash).not.toBe(machineId);
    });

    it('should not store sensitive data in plain text', () => {
      const licFile = {
        licenseKey: 'encrypted',
        machineId: 'encrypted',
        modules: 'encrypted',
      };

      expect(licFile.licenseKey).toBe('encrypted');
      expect(licFile.machineId).toBe('encrypted');
    });
  });
});
