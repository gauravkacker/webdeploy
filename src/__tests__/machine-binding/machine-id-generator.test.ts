/**
 * Unit Tests for Machine ID Generator
 * Tests machine ID generation, stability, and OS reinstall detection
 */

import {
  generateMachineId,
  verifyMachineId,
  detectOsReinstall,
  getMachineIdHash,
  verifyMachineIdHash,
} from '@/lib/machine-binding/machine-id-generator';

describe('Machine ID Generator', () => {
  describe('generateMachineId', () => {
    it('should generate a valid Machine ID', () => {
      const result = generateMachineId();

      expect(result).toHaveProperty('machineId');
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('timestamp');

      // Machine ID should start with MACHINE-
      expect(result.machineId).toMatch(/^MACHINE-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);
    });

    it('should include all required components', () => {
      const result = generateMachineId();

      expect(result.components).toHaveProperty('cpuSignature');
      expect(result.components).toHaveProperty('diskSerial');
      expect(result.components).toHaveProperty('osHash');

      expect(typeof result.components.cpuSignature).toBe('string');
      expect(typeof result.components.diskSerial).toBe('string');
      expect(typeof result.components.osHash).toBe('string');

      expect(result.components.cpuSignature.length).toBeGreaterThan(0);
      expect(result.components.diskSerial.length).toBeGreaterThan(0);
      expect(result.components.osHash.length).toBeGreaterThan(0);
    });

    it('should return a timestamp', () => {
      const result = generateMachineId();

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
      expect(result.timestamp.getTime()).toBeGreaterThan(Date.now() - 1000); // Within 1 second
    });

    /**
     * Property 1: Machine ID Stability
     * Machine ID remains consistent across multiple generations on same hardware
     */
    it('should generate consistent Machine ID across multiple calls (Property 1)', () => {
      const result1 = generateMachineId();
      const result2 = generateMachineId();
      const result3 = generateMachineId();

      // All Machine IDs should be identical on same hardware
      expect(result1.machineId).toBe(result2.machineId);
      expect(result2.machineId).toBe(result3.machineId);

      // Components should also be identical
      expect(result1.components.cpuSignature).toBe(result2.components.cpuSignature);
      expect(result1.components.diskSerial).toBe(result2.components.diskSerial);
      expect(result1.components.osHash).toBe(result2.components.osHash);
    });

    it('should generate Machine ID in uppercase', () => {
      const result = generateMachineId();

      expect(result.machineId).toBe(result.machineId.toUpperCase());
    });

    it('should generate Machine ID with correct format', () => {
      const result = generateMachineId();

      const parts = result.machineId.split('-');
      expect(parts.length).toBe(5); // MACHINE + 4 hex segments
      expect(parts[0]).toBe('MACHINE');

      // Each segment should be 8 hex characters
      for (let i = 1; i < 5; i++) {
        expect(parts[i]).toMatch(/^[A-F0-9]{8}$/);
      }
    });
  });

  describe('verifyMachineId', () => {
    it('should verify a valid Machine ID', () => {
      const generated = generateMachineId();
      const isValid = verifyMachineId(generated.machineId);

      expect(isValid).toBe(true);
    });

    it('should reject an invalid Machine ID', () => {
      const invalidId = 'MACHINE-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF';
      const isValid = verifyMachineId(invalidId);

      expect(isValid).toBe(false);
    });

    it('should reject malformed Machine ID', () => {
      const malformed = 'INVALID-FORMAT';
      const isValid = verifyMachineId(malformed);

      expect(isValid).toBe(false);
    });

    it('should reject empty string', () => {
      const isValid = verifyMachineId('');

      expect(isValid).toBe(false);
    });

    it('should handle errors gracefully', () => {
      // Test with null-like values
      const isValid = verifyMachineId(null as any);

      expect(isValid).toBe(false);
    });
  });

  describe('detectOsReinstall', () => {
    it('should detect when OS hash has not changed', () => {
      const result1 = generateMachineId();
      const result2 = generateMachineId();

      const osReinstalled = detectOsReinstall(result1.components.osHash);

      // On same OS, should not detect reinstall
      expect(osReinstalled).toBe(false);
    });

    it('should return false for matching OS hash', () => {
      const result = generateMachineId();
      const osReinstalled = detectOsReinstall(result.components.osHash);

      expect(osReinstalled).toBe(false);
    });

    it('should return true for different OS hash', () => {
      const differentOsHash = 'windows-10-x64-20200101';
      const osReinstalled = detectOsReinstall(differentOsHash);

      // Should detect as reinstall if hash is different
      expect(osReinstalled).toBe(true);
    });

    it('should handle empty OS hash', () => {
      const osReinstalled = detectOsReinstall('');

      expect(typeof osReinstalled).toBe('boolean');
    });
  });

  describe('getMachineIdHash', () => {
    it('should generate a valid hash', () => {
      const machineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const hash = getMachineIdHash(machineId);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA256 hex is 64 characters
    });

    it('should generate consistent hash for same Machine ID', () => {
      const machineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const hash1 = getMachineIdHash(machineId);
      const hash2 = getMachineIdHash(machineId);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different Machine ID', () => {
      const machineId1 = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const machineId2 = 'MACHINE-87654321-12345678-CDEFABCD-ABCDEFAB';

      const hash1 = getMachineIdHash(machineId1);
      const hash2 = getMachineIdHash(machineId2);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate hash in lowercase hex', () => {
      const machineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const hash = getMachineIdHash(machineId);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle empty Machine ID', () => {
      const hash = getMachineIdHash('');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });

  describe('verifyMachineIdHash', () => {
    it('should verify a valid hash', () => {
      const machineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const hash = getMachineIdHash(machineId);

      const isValid = verifyMachineIdHash(machineId, hash);

      expect(isValid).toBe(true);
    });

    it('should reject an invalid hash', () => {
      const machineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const invalidHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

      const isValid = verifyMachineIdHash(machineId, invalidHash);

      expect(isValid).toBe(false);
    });

    it('should reject hash for different Machine ID', () => {
      const machineId1 = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const machineId2 = 'MACHINE-87654321-12345678-CDEFABCD-ABCDEFAB';
      const hash1 = getMachineIdHash(machineId1);

      const isValid = verifyMachineIdHash(machineId2, hash1);

      expect(isValid).toBe(false);
    });

    it('should handle empty hash', () => {
      const machineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';

      const isValid = verifyMachineIdHash(machineId, '');

      expect(isValid).toBe(false);
    });

    it('should handle malformed hash', () => {
      const machineId = 'MACHINE-12345678-87654321-ABCDEFAB-CDEFABCD';
      const malformedHash = 'not-a-valid-hash';

      const isValid = verifyMachineIdHash(machineId, malformedHash);

      expect(isValid).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should generate and verify Machine ID in complete flow', () => {
      // Generate
      const generated = generateMachineId();
      expect(generated.machineId).toBeDefined();

      // Verify
      const isValid = verifyMachineId(generated.machineId);
      expect(isValid).toBe(true);

      // Hash
      const hash = getMachineIdHash(generated.machineId);
      expect(hash).toBeDefined();

      // Verify hash
      const hashValid = verifyMachineIdHash(generated.machineId, hash);
      expect(hashValid).toBe(true);
    });

    it('should handle complete machine binding scenario', () => {
      // First generation (initial binding)
      const initial = generateMachineId();
      const initialHash = getMachineIdHash(initial.machineId);

      // Verify on same machine
      const stillValid = verifyMachineId(initial.machineId);
      expect(stillValid).toBe(true);

      // Verify hash matches
      const hashMatches = verifyMachineIdHash(initial.machineId, initialHash);
      expect(hashMatches).toBe(true);

      // Check OS hasn't been reinstalled
      const osReinstalled = detectOsReinstall(initial.components.osHash);
      expect(osReinstalled).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long Machine ID', () => {
      const longId = 'MACHINE-' + 'A'.repeat(100);
      const hash = getMachineIdHash(longId);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should handle special characters in Machine ID', () => {
      const specialId = 'MACHINE-!@#$%^&*()-!@#$%^&*()';
      const hash = getMachineIdHash(specialId);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should handle unicode in Machine ID', () => {
      const unicodeId = 'MACHINE-你好世界-مرحبا-🎉';
      const hash = getMachineIdHash(unicodeId);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });
});
