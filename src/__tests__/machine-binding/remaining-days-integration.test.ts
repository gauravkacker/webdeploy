/**
 * Integration Tests for Remaining Days Calculation
 * Verifies integration with license validator and renewal logic
 */

import { calculateRemainingDays, getRemainingDaysInfo } from '@/lib/machine-binding/remaining-days-calculator';
import { checkExpiration } from '@/lib/license-validator';
import { db } from '@/lib/db/database';

describe('Remaining Days Integration', () => {
  beforeEach(() => {
    // Reset database before each test
    db.reset();
  });

  describe('Integration with License Validator', () => {
    it('should calculate remaining days consistently with checkExpiration', () => {
      // Create a test license
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 45);

      const license = db.create('licenses', {
        licenseKey: 'TEST-KEY-12345',
        customerId: 'customer-1',
        status: 'active',
        expiresAt: futureDate,
        modules: ['appointments', 'billing'],
      });

      // Get expiration status from validator
      const expirationStatus = checkExpiration(license.id);

      // Calculate remaining days directly
      const remainingDays = calculateRemainingDays(futureDate);

      // Both should return the same value
      expect(expirationStatus.daysRemaining).toBe(remainingDays);
      expect(expirationStatus.isExpired).toBe(false);
    });

    it('should detect expired license consistently', () => {
      // Create an expired license
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const license = db.create('licenses', {
        licenseKey: 'TEST-KEY-EXPIRED',
        customerId: 'customer-1',
        status: 'active',
        expiresAt: pastDate,
        modules: ['appointments'],
      });

      // Get expiration status from validator
      const expirationStatus = checkExpiration(license.id);

      // Calculate remaining days directly
      const remainingDays = calculateRemainingDays(pastDate);

      // Both should indicate expiration
      expect(expirationStatus.daysRemaining).toBe(0);
      expect(expirationStatus.isExpired).toBe(true);
      expect(remainingDays).toBe(0);
    });

    it('should detect expiring soon status', () => {
      // Create a license expiring in 15 days
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15);

      const license = db.create('licenses', {
        licenseKey: 'TEST-KEY-SOON',
        customerId: 'customer-1',
        status: 'active',
        expiresAt: soonDate,
        modules: ['appointments'],
      });

      // Get remaining days info
      const info = getRemainingDaysInfo(soonDate);

      // Should detect expiring soon
      expect(info.isExpiringSoon).toBe(true);
      expect(info.isExpired).toBe(false);
      expect(info.remainingDays).toBeGreaterThanOrEqual(14);
      expect(info.remainingDays).toBeLessThanOrEqual(16);
    });
  });

  describe('Edge Cases with Real Dates', () => {
    it('should handle license expiring at midnight', () => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      midnight.setDate(midnight.getDate() + 7);

      const license = db.create('licenses', {
        licenseKey: 'TEST-KEY-MIDNIGHT',
        customerId: 'customer-1',
        status: 'active',
        expiresAt: midnight,
        modules: ['appointments'],
      });

      const expirationStatus = checkExpiration(license.id);
      const remainingDays = calculateRemainingDays(midnight);

      expect(expirationStatus.daysRemaining).toBe(remainingDays);
      expect(remainingDays).toBeGreaterThanOrEqual(6);
      expect(remainingDays).toBeLessThanOrEqual(8);
    });

    it('should handle license expiring at end of day', () => {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      endOfDay.setDate(endOfDay.getDate() + 7);

      const license = db.create('licenses', {
        licenseKey: 'TEST-KEY-EOD',
        customerId: 'customer-1',
        status: 'active',
        expiresAt: endOfDay,
        modules: ['appointments'],
      });

      const expirationStatus = checkExpiration(license.id);
      const remainingDays = calculateRemainingDays(endOfDay);

      expect(expirationStatus.daysRemaining).toBe(remainingDays);
      expect(remainingDays).toBeGreaterThanOrEqual(6);
      expect(remainingDays).toBeLessThanOrEqual(8);
    });

    it('should return 0 for license expiring today', () => {
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const license = db.create('licenses', {
        licenseKey: 'TEST-KEY-TODAY',
        customerId: 'customer-1',
        status: 'active',
        expiresAt: today,
        modules: ['appointments'],
      });

      const expirationStatus = checkExpiration(license.id);
      const remainingDays = calculateRemainingDays(today);

      // Should be 0 or 1 depending on exact time
      expect(expirationStatus.daysRemaining).toBeGreaterThanOrEqual(0);
      expect(expirationStatus.daysRemaining).toBeLessThanOrEqual(1);
      expect(remainingDays).toBeGreaterThanOrEqual(0);
      expect(remainingDays).toBeLessThanOrEqual(1);
    });
  });

  describe('Renewal Scenario Integration', () => {
    it('should calculate correct total days for renewal', () => {
      // Create a license with 15 days remaining
      const currentExpiry = new Date();
      currentExpiry.setDate(currentExpiry.getDate() + 15);

      const remainingDays = calculateRemainingDays(currentExpiry);
      const renewalDays = 365;

      // Calculate new expiration (remaining + renewal)
      const newExpiry = new Date(currentExpiry);
      newExpiry.setDate(newExpiry.getDate() + renewalDays);

      const totalDays = calculateRemainingDays(newExpiry);

      // Total should be approximately remaining + renewal
      expect(totalDays).toBeGreaterThanOrEqual(remainingDays + renewalDays - 1);
      expect(totalDays).toBeLessThanOrEqual(remainingDays + renewalDays + 1);
    });

    it('should handle renewal of expired license', () => {
      // Create an expired license
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const remainingDays = calculateRemainingDays(pastDate);
      expect(remainingDays).toBe(0);

      // Renewal should start from now
      const renewalDays = 365;
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + renewalDays);

      const totalDays = calculateRemainingDays(newExpiry);

      // Should be approximately renewal days (no remaining days to add)
      expect(totalDays).toBeGreaterThanOrEqual(renewalDays - 1);
      expect(totalDays).toBeLessThanOrEqual(renewalDays + 1);
    });
  });
});
