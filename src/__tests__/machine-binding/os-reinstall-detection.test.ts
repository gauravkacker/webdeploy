import {
  getCurrentOsHash,
  getStoredOsHash,
  detectOsReinstall,
  handleOsReinstall,
  getReinstallGuidance,
  validateOsReinstallRecovery,
} from '@/lib/machine-binding/os-reinstall-detector';
import { storeLicense, retrieveLicense } from '@/lib/machine-binding/local-license-storage';
import { generateEncryptionKey } from '@/lib/machine-binding/encryption';
import { LicenseData } from '@/lib/machine-binding/lic-file';
import fs from 'fs';
import path from 'path';

describe('OS Reinstall Detection', () => {
  const testStorageDir = path.join(__dirname, 'test-storage-os-reinstall');
  const encryptionKey = generateEncryptionKey();
  const machineId = 'MACHINE-TEST-OS-REINSTALL-001';

  // Create test license data
  const createTestLicenseData = (osHash: string): LicenseData => ({
    licenseKey: 'TEST-LICENSE-KEY-001',
    machineId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    createdAt: new Date(),
    modules: ['appointments', 'billing', 'prescriptions'],
    osHash,
  });

  beforeEach(() => {
    // Clean up test storage
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test storage
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true });
    }
  });

  describe('getCurrentOsHash', () => {
    it('should return a non-empty OS hash', () => {
      const osHash = getCurrentOsHash();
      expect(osHash).toBeTruthy();
      expect(typeof osHash).toBe('string');
      expect(osHash.length).toBeGreaterThan(0);
    });

    it('should return consistent OS hash on multiple calls', () => {
      const hash1 = getCurrentOsHash();
      const hash2 = getCurrentOsHash();
      expect(hash1).toBe(hash2);
    });

    it('should contain platform information', () => {
      const osHash = getCurrentOsHash();
      // OS hash should contain platform info (win32, darwin, linux)
      expect(osHash).toMatch(/win32|darwin|linux/);
    });
  });

  describe('getStoredOsHash', () => {
    it('should return null when no license is stored', () => {
      const osHash = getStoredOsHash(machineId, encryptionKey, testStorageDir);
      expect(osHash).toBeNull();
    });

    it('should return stored OS hash when license exists', () => {
      const storedOsHash = 'linux-5.10.0-x64-20220101';
      const licenseData = createTestLicenseData(storedOsHash);
      const licFileBuffer = Buffer.from('test-lic-file');

      // Store license
      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir, storedOsHash);

      // Retrieve stored OS hash
      const retrievedOsHash = getStoredOsHash(machineId, encryptionKey, testStorageDir);
      expect(retrievedOsHash).toBe(storedOsHash);
    });

    it('should handle missing OS hash gracefully', () => {
      // Create license data without osHash property
      const licenseData: LicenseData = {
        licenseKey: 'TEST-LICENSE-KEY-NO-HASH',
        machineId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        modules: ['appointments'],
      };
      const licFileBuffer = Buffer.from('test-lic-file');

      // Store license without OS hash parameter
      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir);

      // Should return null since osHash was not stored
      const retrievedOsHash = getStoredOsHash(machineId, encryptionKey, testStorageDir);
      expect(retrievedOsHash).toBeNull();
    });
  });

  describe('detectOsReinstall', () => {
    it('should detect no reinstall when OS hash matches', () => {
      const osHash = getCurrentOsHash();
      const licenseData = createTestLicenseData(osHash);
      const licFileBuffer = Buffer.from('test-lic-file');

      // Store license with current OS hash
      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir, osHash);

      // Detect OS reinstall
      const result = detectOsReinstall(machineId, encryptionKey, testStorageDir);

      expect(result.osReinstallDetected).toBe(false);
      expect(result.currentOsHash).toBe(osHash);
      expect(result.storedOsHash).toBe(osHash);
    });

    it('should detect OS reinstall when OS hash differs', () => {
      const oldOsHash = 'linux-5.10.0-x64-20220101';
      const licenseData = createTestLicenseData(oldOsHash);
      const licFileBuffer = Buffer.from('test-lic-file');

      // Store license with old OS hash
      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir, oldOsHash);

      // Detect OS reinstall (current OS hash will be different)
      const result = detectOsReinstall(machineId, encryptionKey, testStorageDir);

      expect(result.osReinstallDetected).toBe(true);
      expect(result.currentOsHash).not.toBe(oldOsHash);
      expect(result.storedOsHash).toBe(oldOsHash);
    });

    it('should return false when no stored OS hash exists', () => {
      const result = detectOsReinstall(machineId, encryptionKey, testStorageDir);

      expect(result.osReinstallDetected).toBe(false);
      expect(result.currentOsHash).toBeTruthy();
    });

    it('should include descriptive message', () => {
      const result = detectOsReinstall(machineId, encryptionKey, testStorageDir);

      expect(result.message).toBeTruthy();
      expect(typeof result.message).toBe('string');
    });
  });

  describe('handleOsReinstall', () => {
    it('should return guidance object with required fields', () => {
      const guidance = handleOsReinstall(machineId);

      expect(guidance).toHaveProperty('title');
      expect(guidance).toHaveProperty('description');
      expect(guidance).toHaveProperty('steps');
      expect(guidance).toHaveProperty('options');
    });

    it('should have meaningful title', () => {
      const guidance = handleOsReinstall(machineId);

      expect(guidance.title).toContain('OS Reinstall');
    });

    it('should provide at least 3 steps', () => {
      const guidance = handleOsReinstall(machineId);

      expect(Array.isArray(guidance.steps)).toBe(true);
      expect(guidance.steps.length).toBeGreaterThanOrEqual(3);
    });

    it('should provide at least 3 options', () => {
      const guidance = handleOsReinstall(machineId);

      expect(Array.isArray(guidance.options)).toBe(true);
      expect(guidance.options.length).toBeGreaterThanOrEqual(3);
    });

    it('should include restore-backup option', () => {
      const guidance = handleOsReinstall(machineId);
      const hasRestoreOption = guidance.options.some((opt: any) => opt.action === 'restore-backup');

      expect(hasRestoreOption).toBe(true);
    });

    it('should include revalidate option', () => {
      const guidance = handleOsReinstall(machineId);
      const hasRevalidateOption = guidance.options.some((opt: any) => opt.action === 'revalidate');

      expect(hasRevalidateOption).toBe(true);
    });

    it('should include contact-admin option', () => {
      const guidance = handleOsReinstall(machineId);
      const hasContactOption = guidance.options.some((opt: any) => opt.action === 'contact-admin');

      expect(hasContactOption).toBe(true);
    });

    it('should have descriptions for all options', () => {
      const guidance = handleOsReinstall(machineId);

      guidance.options.forEach((option: any) => {
        expect(option.title).toBeTruthy();
        expect(option.description).toBeTruthy();
      });
    });
  });

  describe('getReinstallGuidance', () => {
    it('should return guidance object', () => {
      const guidance = getReinstallGuidance();

      expect(guidance).toHaveProperty('title');
      expect(guidance).toHaveProperty('description');
      expect(guidance).toHaveProperty('steps');
      expect(guidance).toHaveProperty('options');
    });

    it('should be consistent with handleOsReinstall', () => {
      const guidance1 = getReinstallGuidance();
      const guidance2 = handleOsReinstall('');

      expect(guidance1.title).toBe(guidance2.title);
      expect(guidance1.steps.length).toBe(guidance2.steps.length);
      expect(guidance1.options.length).toBe(guidance2.options.length);
    });
  });

  describe('validateOsReinstallRecovery', () => {
    it('should indicate recovery not possible when no license stored', () => {
      const result = validateOsReinstallRecovery(machineId, encryptionKey, testStorageDir);

      expect(result.canRecover).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it('should indicate recovery possible when valid license stored', () => {
      const osHash = getCurrentOsHash();
      const licenseData = createTestLicenseData(osHash);
      const licFileBuffer = Buffer.from('test-lic-file');

      // Store valid license
      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir, osHash);

      const result = validateOsReinstallRecovery(machineId, encryptionKey, testStorageDir);

      expect(result.canRecover).toBe(true);
      expect(result.reason).toBeTruthy();
    });

    it('should indicate recovery not possible when license expired', () => {
      const osHash = getCurrentOsHash();
      const expiredLicenseData: LicenseData = {
        licenseKey: 'TEST-LICENSE-KEY-EXPIRED',
        machineId,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        createdAt: new Date(),
        modules: ['appointments'],
        osHash,
      };
      const licFileBuffer = Buffer.from('test-lic-file');

      // Store expired license
      storeLicense(expiredLicenseData, licFileBuffer, encryptionKey, testStorageDir, osHash);

      const result = validateOsReinstallRecovery(machineId, encryptionKey, testStorageDir);

      expect(result.canRecover).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should include descriptive reason', () => {
      const result = validateOsReinstallRecovery(machineId, encryptionKey, testStorageDir);

      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });
  });

  describe('Integration: OS Reinstall Workflow', () => {
    it('should detect reinstall and provide recovery guidance', () => {
      const oldOsHash = 'linux-5.10.0-x64-20220101';
      const licenseData = createTestLicenseData(oldOsHash);
      const licFileBuffer = Buffer.from('test-lic-file');

      // Store license with old OS hash
      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir, oldOsHash);

      // Detect OS reinstall
      const detectionResult = detectOsReinstall(machineId, encryptionKey, testStorageDir);
      expect(detectionResult.osReinstallDetected).toBe(true);

      // Get guidance
      const guidance = handleOsReinstall(machineId);
      expect(guidance.title).toContain('OS Reinstall');

      // Validate recovery
      const recoveryResult = validateOsReinstallRecovery(machineId, encryptionKey, testStorageDir);
      expect(recoveryResult.canRecover).toBe(true);
    });

    it('should handle complete recovery workflow', () => {
      const osHash = getCurrentOsHash();
      const licenseData = createTestLicenseData(osHash);
      const licFileBuffer = Buffer.from('test-lic-file');

      // Initial storage with current OS hash
      storeLicense(licenseData, licFileBuffer, encryptionKey, testStorageDir, osHash);

      // Verify no reinstall detected
      let result = detectOsReinstall(machineId, encryptionKey, testStorageDir);
      expect(result.osReinstallDetected).toBe(false);

      // Verify recovery is possible
      const recoveryResult = validateOsReinstallRecovery(machineId, encryptionKey, testStorageDir);
      expect(recoveryResult.canRecover).toBe(true);

      // Verify guidance is available
      const guidance = handleOsReinstall(machineId);
      expect(guidance.options.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty machine ID gracefully', () => {
      const result = detectOsReinstall('', encryptionKey, testStorageDir);
      expect(result).toHaveProperty('osReinstallDetected');
      expect(result).toHaveProperty('currentOsHash');
    });

    it('should handle invalid storage directory gracefully', () => {
      const result = detectOsReinstall(machineId, encryptionKey, '/invalid/path/that/does/not/exist');
      expect(result).toHaveProperty('osReinstallDetected');
    });

    it('should handle corrupted metadata gracefully', () => {
      // Create storage directory
      if (!fs.existsSync(testStorageDir)) {
        fs.mkdirSync(testStorageDir, { recursive: true });
      }

      // Write corrupted metadata
      const metadataPath = path.join(testStorageDir, `metadata-${machineId}.json`);
      fs.writeFileSync(metadataPath, 'invalid json {');

      // Should handle gracefully
      const result = detectOsReinstall(machineId, encryptionKey, testStorageDir);
      expect(result).toHaveProperty('osReinstallDetected');
    });
  });
});
