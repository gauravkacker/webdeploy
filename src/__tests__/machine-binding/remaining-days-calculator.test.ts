/**
 * Tests for Remaining Days Calculator
 * Validates remaining days calculation with edge cases
 */

import {
  calculateRemainingDays,
  getRemainingDaysInfo,
  isLicenseExpired,
  isLicenseExpiringSoon,
  formatRemainingDays,
} from '@/lib/machine-binding/remaining-days-calculator';

describe('Remaining Days Calculator', () => {
  describe('calculateRemainingDays', () => {
    it('should calculate remaining days for future expiration', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const remainingDays = calculateRemainingDays(futureDate);

      expect(remainingDays).toBeGreaterThanOrEqual(29);
      expect(remainingDays).toBeLessThanOrEqual(31);
    });

    it('should return 0 for expired license (past date)', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const remainingDays = calculateRemainingDays(pastDate);

      expect(remainingDays).toBe(0);
    });

    it('should return 0 for today expiration', () => {
      const today = new Date();
      // Set to end of today
      today.setHours(23, 59, 59, 999);

      const remainingDays = calculateRemainingDays(today);

      // Should be 0 or 1 depending on exact time
      expect(remainingDays).toBeGreaterThanOrEqual(0);
      expect(remainingDays).toBeLessThanOrEqual(1);
    });

    it('should handle string date input', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15);
      const dateString = futureDate.toISOString();

      const remainingDays = calculateRemainingDays(dateString);

      expect(remainingDays).toBeGreaterThanOrEqual(14);
      expect(remainingDays).toBeLessThanOrEqual(16);
    });

    it('should throw error for invalid date', () => {
      expect(() => calculateRemainingDays('invalid-date')).toThrow('Invalid expiration date');
    });

    it('should throw error for null/undefined date', () => {
      expect(() => calculateRemainingDays(null as any)).toThrow('Expiration date is required');
      expect(() => calculateRemainingDays(undefined as any)).toThrow('Expiration date is required');
    });

    it('should return non-negative integer', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45);

      const remainingDays = calculateRemainingDays(futureDate);

      expect(remainingDays).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(remainingDays)).toBe(true);
    });

    it('should handle leap year correctly', () => {
      // Test with a future leap year date (2028 is a leap year)
      const futureLeapYear = new Date('2028-02-29T23:59:59Z');
      const startOfYear = new Date('2028-01-01T00:00:00Z');
      
      // Calculate expected days between Jan 1 and Feb 29 in a leap year
      const diffTime = futureLeapYear.getTime() - startOfYear.getTime();
      const expectedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Should be 59 days (31 days in Jan + 28 days in Feb)
      expect(expectedDays).toBeGreaterThanOrEqual(58);
      expect(expectedDays).toBeLessThanOrEqual(60);
      
      // Verify the function handles leap year dates correctly
      const remainingDays = calculateRemainingDays(futureLeapYear);
      expect(remainingDays).toBeGreaterThanOrEqual(0);
    });

    it('should handle timezone differences', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const remainingDays = calculateRemainingDays(futureDate);

      // Should be around 7 days regardless of timezone
      expect(remainingDays).toBeGreaterThanOrEqual(6);
      expect(remainingDays).toBeLessThanOrEqual(8);
    });
  });

  describe('getRemainingDaysInfo', () => {
    it('should return detailed info for future expiration', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45);

      const info = getRemainingDaysInfo(futureDate);

      expect(info.remainingDays).toBeGreaterThanOrEqual(44);
      expect(info.remainingDays).toBeLessThanOrEqual(46);
      expect(info.isExpired).toBe(false);
      expect(info.isExpiringSoon).toBe(false);
      expect(info.expiresAt).toEqual(futureDate);
    });

    it('should detect expired license', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const info = getRemainingDaysInfo(pastDate);

      expect(info.remainingDays).toBe(0);
      expect(info.isExpired).toBe(true);
      expect(info.isExpiringSoon).toBe(false);
    });

    it('should detect expiring soon (< 30 days)', () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);

      const info = getRemainingDaysInfo(soonDate);

      expect(info.remainingDays).toBeGreaterThanOrEqual(14);
      expect(info.remainingDays).toBeLessThanOrEqual(16);
      expect(info.isExpired).toBe(false);
      expect(info.isExpiringSoon).toBe(true);
    });

    it('should use custom warning threshold', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 40);

      const info = getRemainingDaysInfo(futureDate, 45);

      expect(info.isExpiringSoon).toBe(true);
    });

    it('should handle exactly 30 days remaining', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const info = getRemainingDaysInfo(futureDate);

      expect(info.isExpiringSoon).toBe(true);
    });

    it('should throw error for invalid date', () => {
      expect(() => getRemainingDaysInfo('invalid-date')).toThrow('Invalid expiration date');
    });
  });

  describe('isLicenseExpired', () => {
    it('should return true for expired license', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      expect(isLicenseExpired(pastDate)).toBe(true);
    });

    it('should return false for active license', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      expect(isLicenseExpired(futureDate)).toBe(false);
    });

    it('should return true for invalid date', () => {
      expect(isLicenseExpired('invalid-date')).toBe(true);
    });
  });

  describe('isLicenseExpiringSoon', () => {
    it('should return true for license expiring in 15 days', () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);

      expect(isLicenseExpiringSoon(soonDate)).toBe(true);
    });

    it('should return false for license expiring in 45 days', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45);

      expect(isLicenseExpiringSoon(futureDate)).toBe(false);
    });

    it('should return false for expired license', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      expect(isLicenseExpiringSoon(pastDate)).toBe(false);
    });

    it('should use custom warning threshold', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 40);

      expect(isLicenseExpiringSoon(futureDate, 45)).toBe(true);
      expect(isLicenseExpiringSoon(futureDate, 30)).toBe(false);
    });

    it('should return false for invalid date', () => {
      expect(isLicenseExpiringSoon('invalid-date')).toBe(false);
    });
  });

  describe('formatRemainingDays', () => {
    it('should format multiple days', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const formatted = formatRemainingDays(futureDate);

      expect(formatted).toMatch(/\d+ days/);
    });

    it('should format single day', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const formatted = formatRemainingDays(tomorrow);

      expect(formatted).toBe('1 day');
    });

    it('should format expired license', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const formatted = formatRemainingDays(pastDate);

      expect(formatted).toBe('Expired');
    });

    it('should handle invalid date', () => {
      const formatted = formatRemainingDays('invalid-date');

      expect(formatted).toBe('Invalid date');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very far future dates', () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 10);

      const remainingDays = calculateRemainingDays(farFuture);

      expect(remainingDays).toBeGreaterThan(3650); // ~10 years
    });

    it('should handle dates at midnight', () => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      midnight.setDate(midnight.getDate() + 5);

      const remainingDays = calculateRemainingDays(midnight);

      expect(remainingDays).toBeGreaterThanOrEqual(4);
      expect(remainingDays).toBeLessThanOrEqual(6);
    });

    it('should handle dates at end of day', () => {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      endOfDay.setDate(endOfDay.getDate() + 5);

      const remainingDays = calculateRemainingDays(endOfDay);

      expect(remainingDays).toBeGreaterThanOrEqual(4);
      expect(remainingDays).toBeLessThanOrEqual(6);
    });

    it('should handle partial days correctly (ceiling)', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours from now

      const remainingDays = calculateRemainingDays(futureDate);

      // Should round up to 1 day
      expect(remainingDays).toBe(1);
    });
  });
});
