/**
 * Unit tests for password generator, decoder, and validator
 */

import {
  generatePassword,
  generateExpiryDate,
  formatDateToYYYYMMDD,
} from '@/lib/license/password-generator';
import { decodePassword, parseYYYYMMDD } from '@/lib/license/password-decoder';
import {
  validateSignature,
  validateExpiry,
  isExpiringsoon,
  getExpiryStatus,
  formatExpiryDate,
} from '@/lib/license/password-validator';

describe('Password Generator', () => {
  describe('generatePassword', () => {
    it('should generate a valid password', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      expect(password).toBeDefined();
      expect(typeof password).toBe('string');
      expect(password.length).toBeGreaterThan(40);
      expect(password.length).toBeLessThan(150);
    });

    it('should generate URL-safe passwords (no +, /, =)', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      expect(password).not.toMatch(/[+/=]/);
    });

    it('should throw error for invalid license key', () => {
      expect(() => generatePassword('', '1', 1, '20261231')).toThrow('Invalid license key');
      expect(() => generatePassword(null as any, '1', 1, '20261231')).toThrow('Invalid license key');
    });

    it('should throw error for invalid plan', () => {
      expect(() => generatePassword('ABC123XYZ', '', 1, '20261231')).toThrow('Invalid plan type');
    });

    it('should throw error for invalid maxMachines', () => {
      expect(() => generatePassword('ABC123XYZ', '1', 0, '20261231')).toThrow('Invalid maxMachines');
      expect(() => generatePassword('ABC123XYZ', '1', -1, '20261231')).toThrow('Invalid maxMachines');
      expect(() => generatePassword('ABC123XYZ', '1', 1.5, '20261231')).toThrow('Invalid maxMachines');
    });

    it('should throw error for invalid expiry date format', () => {
      expect(() => generatePassword('ABC123XYZ', '1', 1, '2026-12-31')).toThrow('Invalid expiry date');
      expect(() => generatePassword('ABC123XYZ', '1', 1, '202612')).toThrow('Invalid expiry date');
      expect(() => generatePassword('ABC123XYZ', '1', 1, '')).toThrow('Invalid expiry date');
    });

    it('should generate different passwords for different inputs', () => {
      const password1 = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const password2 = generatePassword('ABC123XYZ', '1', 1, '20270101');
      const password3 = generatePassword('ABC123XYZ', '2', 5, '20261231');

      expect(password1).not.toBe(password2);
      expect(password1).not.toBe(password3);
      expect(password2).not.toBe(password3);
    });

    it('should generate same password for same inputs (deterministic)', () => {
      const password1 = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const password2 = generatePassword('ABC123XYZ', '1', 1, '20261231');

      expect(password1).toBe(password2);
    });
  });

  describe('generateExpiryDate', () => {
    it('should generate expiry date 365 days from today', () => {
      const expiry = generateExpiryDate(365);
      expect(expiry).toMatch(/^\d{8}$/);

      const today = new Date();
      const expiryDate = parseYYYYMMDD(expiry);
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() + 365);

      // Allow 1 day difference due to timezone/rounding
      const diff = Math.abs(expiryDate.getTime() - expectedDate.getTime());
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('should generate expiry date with custom days', () => {
      const expiry = generateExpiryDate(30);
      expect(expiry).toMatch(/^\d{8}$/);

      const today = new Date();
      const expiryDate = parseYYYYMMDD(expiry);
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() + 30);

      const diff = Math.abs(expiryDate.getTime() - expectedDate.getTime());
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000);
    });
  });

  describe('formatDateToYYYYMMDD', () => {
    it('should format date correctly', () => {
      const date = new Date('2026-12-31');
      const formatted = formatDateToYYYYMMDD(date);
      expect(formatted).toBe('20261231');
    });

    it('should pad month and day with zeros', () => {
      const date = new Date('2026-01-05');
      const formatted = formatDateToYYYYMMDD(date);
      expect(formatted).toBe('20260105');
    });
  });
});

describe('Password Decoder', () => {
  describe('decodePassword', () => {
    it('should decode a valid password', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const decoded = decodePassword(password);

      expect(decoded.licenseKey).toBe('ABC123XYZ');
      expect(decoded.plan).toBe('1');
      expect(decoded.maxMachines).toBe(1);
      expect(decoded.expiryDate).toBe('20261231');
      expect(decoded.signature).toBeDefined();
      expect(decoded.signature.length).toBeGreaterThan(30);
    });

    it('should throw error for invalid password', () => {
      expect(() => decodePassword('')).toThrow();
      expect(() => decodePassword(null as any)).toThrow();
      expect(() => decodePassword('invalid')).toThrow();
    });

    it('should throw error for tampered password', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const tampered = password.slice(0, -5) + 'xxxxx'; // Change last 5 chars

      expect(() => decodePassword(tampered)).toThrow();
    });

    it('should throw error for password that is too short', () => {
      expect(() => decodePassword('short')).toThrow('Invalid password length');
    });

    it('should throw error for password that is too long', () => {
      const longPassword = 'a'.repeat(200);
      expect(() => decodePassword(longPassword)).toThrow('Invalid password length');
    });
  });

  describe('parseYYYYMMDD', () => {
    it('should parse valid date string', () => {
      const date = parseYYYYMMDD('20261231');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(11); // December (0-indexed)
      expect(date.getDate()).toBe(31);
    });

    it('should throw error for invalid format', () => {
      expect(() => parseYYYYMMDD('2026-12-31')).toThrow();
      expect(() => parseYYYYMMDD('202612')).toThrow();
      expect(() => parseYYYYMMDD('abc')).toThrow();
    });

    it('should throw error for invalid date values', () => {
      expect(() => parseYYYYMMDD('20261331')).toThrow(); // Month 13
      expect(() => parseYYYYMMDD('20260132')).toThrow(); // Day 32
    });
  });
});

describe('Password Validator', () => {
  describe('validateSignature', () => {
    it('should validate correct signature', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const decoded = decodePassword(password);

      const isValid = validateSignature(
        decoded.licenseKey,
        decoded.plan,
        decoded.maxMachines,
        decoded.expiryDate,
        decoded.signature
      );

      expect(isValid).toBe(true);
    });

    it('should reject tampered license key', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const decoded = decodePassword(password);

      const isValid = validateSignature(
        'DIFFERENT_KEY',
        decoded.plan,
        decoded.maxMachines,
        decoded.expiryDate,
        decoded.signature
      );

      expect(isValid).toBe(false);
    });

    it('should reject tampered plan', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const decoded = decodePassword(password);

      const isValid = validateSignature(
        decoded.licenseKey,
        '2',
        decoded.maxMachines,
        decoded.expiryDate,
        decoded.signature
      );

      expect(isValid).toBe(false);
    });

    it('should reject tampered maxMachines', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const decoded = decodePassword(password);

      const isValid = validateSignature(
        decoded.licenseKey,
        decoded.plan,
        5,
        decoded.expiryDate,
        decoded.signature
      );

      expect(isValid).toBe(false);
    });

    it('should reject tampered expiry date', () => {
      const password = generatePassword('ABC123XYZ', '1', 1, '20261231');
      const decoded = decodePassword(password);

      const isValid = validateSignature(
        decoded.licenseKey,
        decoded.plan,
        decoded.maxMachines,
        '20270101',
        decoded.signature
      );

      expect(isValid).toBe(false);
    });

    it('should reject invalid signature', () => {
      const isValid = validateSignature(
        'ABC123XYZ',
        '1',
        1,
        '20261231',
        'invalid_signature_here'
      );

      expect(isValid).toBe(false);
    });
  });

  describe('validateExpiry', () => {
    it('should detect non-expired license', () => {
      const futureDate = generateExpiryDate(365);
      const result = validateExpiry(futureDate);

      expect(result.isExpired).toBe(false);
      expect(result.daysUntilExpiry).toBeGreaterThan(0);
    });

    it('should detect expired license', () => {
      const pastDate = '20200101';
      const result = validateExpiry(pastDate);

      expect(result.isExpired).toBe(true);
      expect(result.daysUntilExpiry).toBeLessThan(0);
    });

    it('should calculate days until expiry correctly', () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const tomorrowStr = formatDateToYYYYMMDD(tomorrow);
      const result = validateExpiry(tomorrowStr);

      expect(result.daysUntilExpiry).toBe(1);
    });
  });

  describe('isExpiringsoon', () => {
    it('should detect license expiring within 30 days', () => {
      const soonDate = generateExpiryDate(15);
      expect(isExpiringsoon(soonDate)).toBe(true);
    });

    it('should not flag license expiring after 30 days', () => {
      const laterDate = generateExpiryDate(60);
      expect(isExpiringsoon(laterDate)).toBe(false);
    });

    it('should not flag expired license as expiring soon', () => {
      const pastDate = '20200101';
      expect(isExpiringsoon(pastDate)).toBe(false);
    });
  });

  describe('getExpiryStatus', () => {
    it('should return correct status for future date', () => {
      const futureDate = generateExpiryDate(100);
      const status = getExpiryStatus(futureDate);

      expect(status).toContain('Expires in');
      expect(status).toContain('days');
    });

    it('should return correct status for expired date', () => {
      const pastDate = '20200101';
      const status = getExpiryStatus(pastDate);

      expect(status).toContain('Expired');
      expect(status).toContain('days ago');
    });
  });

  describe('formatExpiryDate', () => {
    it('should format date for display', () => {
      const formatted = formatExpiryDate('20261231');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('31');
    });
  });
});
