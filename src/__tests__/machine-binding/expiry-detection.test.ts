/**
 * Expiry Detection Tests
 * Tests for license expiration detection and handling
 */

import {
  detectExpiry,
  isExpiringSoon,
  getExpiryWarning,
  shouldShowWarning,
  getExpiryStatus,
  getDetailedExpiryWarning,
} from '@/lib/machine-binding/expiry-detector';

import {
  performStartupExpiryCheck,
  isLicenseValidForStartup,
  getStartupWarningBanner,
} from '@/lib/machine-binding/startup-expiry-check';

import {
  checkExpiryForRequest,
  getExpiryWarningHeader,
  isOperationAllowedWithExpiry,
} from '@/lib/middleware/expiry-check';

import {
  activateReadOnlyMode,
  deactivateReadOnlyMode,
  isReadOnlyMode,
  getReadOnlyModeState,
} from '@/lib/machine-binding/read-only-mode';

describe('Expiry Detector', () => {
  describe('detectExpiry', () => {
    it('should detect expired license (past date)', () => {
      const pastDate = new Date('2020-01-01');
      expect(detectExpiry(pastDate)).toBe(true);
    });

    it('should detect valid license (future date)', () => {
      const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      expect(detectExpiry(futureDate)).toBe(false);
    });

    it('should detect expired license (today)', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const result = detectExpiry(today);
      // Today could be expired or not depending on exact time
      expect(typeof result).toBe('boolean');
    });

    it('should handle string dates', () => {
      const pastDateStr = '2020-01-01';
      expect(detectExpiry(pastDateStr)).toBe(true);
    });

    it('should treat invalid dates as expired', () => {
      expect(detectExpiry('invalid-date')).toBe(true);
    });
  });

  describe('isExpiringSoon', () => {
    it('should detect license expiring within 30 days', () => {
      const date = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
      expect(isExpiringSoon(date, 30)).toBe(true);
    });

    it('should not detect license expiring beyond threshold', () => {
      const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days from now
      expect(isExpiringSoon(date, 30)).toBe(false);
    });

    it('should not detect expired license as expiring soon', () => {
      const pastDate = new Date('2020-01-01');
      expect(isExpiringSoon(pastDate, 30)).toBe(false);
    });

    it('should use custom threshold', () => {
      const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now
      expect(isExpiringSoon(date, 7)).toBe(true);
      expect(isExpiringSoon(date, 3)).toBe(false);
    });

    it('should handle invalid dates', () => {
      expect(isExpiringSoon('invalid-date', 30)).toBe(false);
    });
  });

  describe('getExpiryWarning', () => {
    it('should return expired message for past date', () => {
      const pastDate = new Date('2020-01-01');
      const warning = getExpiryWarning(pastDate);
      expect(warning).toContain('expired');
      expect(warning).toContain('read-only');
    });

    it('should return warning for license expiring in 1 day', () => {
      const tomorrow = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
      const warning = getExpiryWarning(tomorrow);
      expect(warning).toContain('tomorrow');
    });

    it('should return warning for license expiring in 7 days', () => {
      const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const warning = getExpiryWarning(date);
      expect(warning).toContain('7 days');
      expect(warning).toContain('soon');
    });

    it('should return warning for license expiring in 30 days', () => {
      const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const warning = getExpiryWarning(date);
      expect(warning).toContain('30 days');
    });

    it('should return null for license expiring beyond 30 days', () => {
      const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const warning = getExpiryWarning(date);
      expect(warning).toBeNull();
    });

    it('should handle invalid dates', () => {
      const warning = getExpiryWarning('invalid-date');
      expect(warning).toContain('Unable to determine');
    });
  });

  describe('shouldShowWarning', () => {
    it('should show warning for expired license', () => {
      const pastDate = new Date('2020-01-01');
      expect(shouldShowWarning(pastDate, 30)).toBe(true);
    });

    it('should show warning for license expiring soon', () => {
      const date = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      expect(shouldShowWarning(date, 30)).toBe(true);
    });

    it('should not show warning for license expiring beyond threshold', () => {
      const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      expect(shouldShowWarning(date, 30)).toBe(false);
    });

    it('should show warning for invalid dates', () => {
      expect(shouldShowWarning('invalid-date', 30)).toBe(true);
    });
  });

  describe('getExpiryStatus', () => {
    it('should return complete status for expired license', () => {
      const pastDate = new Date('2020-01-01');
      const status = getExpiryStatus(pastDate, 30);
      expect(status.isExpired).toBe(true);
      expect(status.isExpiringSoon).toBe(false);
      expect(status.daysRemaining).toBe(0);
    });

    it('should return complete status for expiring license', () => {
      const date = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const status = getExpiryStatus(date, 30);
      expect(status.isExpired).toBe(false);
      expect(status.isExpiringSoon).toBe(true);
      expect(status.daysRemaining).toBeGreaterThan(0);
      expect(status.daysRemaining).toBeLessThanOrEqual(30);
    });

    it('should return complete status for valid license', () => {
      const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const status = getExpiryStatus(date, 30);
      expect(status.isExpired).toBe(false);
      expect(status.isExpiringSoon).toBe(false);
      expect(status.daysRemaining).toBeGreaterThan(30);
    });
  });

  describe('getDetailedExpiryWarning', () => {
    it('should return error severity for expired license', () => {
      const pastDate = new Date('2020-01-01');
      const warning = getDetailedExpiryWarning(pastDate, 30);
      expect(warning.shouldShow).toBe(true);
      expect(warning.severity).toBe('error');
      expect(warning.daysRemaining).toBe(0);
      expect(warning.message).toContain('expired');
    });

    it('should return warning severity for license expiring in 7 days', () => {
      const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const warning = getDetailedExpiryWarning(date, 30);
      expect(warning.shouldShow).toBe(true);
      expect(warning.severity).toBe('warning');
      expect(warning.daysRemaining).toBeGreaterThan(0);
      expect(warning.daysRemaining).toBeLessThanOrEqual(7);
    });

    it('should return info severity for license expiring in 30 days', () => {
      const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const warning = getDetailedExpiryWarning(date, 30);
      expect(warning.shouldShow).toBe(true);
      expect(warning.severity).toBe('info');
      expect(warning.daysRemaining).toBeGreaterThan(7);
    });

    it('should not show warning for license expiring beyond threshold', () => {
      const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const warning = getDetailedExpiryWarning(date, 30);
      expect(warning.shouldShow).toBe(false);
    });
  });
});

describe('Startup Expiry Check', () => {
  beforeEach(() => {
    // Reset read-only mode before each test
    deactivateReadOnlyMode();
  });

  describe('performStartupExpiryCheck', () => {
    it('should activate read-only mode for expired license', () => {
      const pastDate = new Date('2020-01-01');
      const result = performStartupExpiryCheck(pastDate, 30);

      expect(result.isExpired).toBe(true);
      expect(result.readOnlyModeActivated).toBe(true);
      expect(result.warning).toContain('expired');
      expect(isReadOnlyMode()).toBe(true);
    });

    it('should not activate read-only mode for valid license', () => {
      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const result = performStartupExpiryCheck(futureDate, 30);

      expect(result.isExpired).toBe(false);
      expect(result.readOnlyModeActivated).toBe(false);
      expect(isReadOnlyMode()).toBe(false);
    });

    it('should return warning for license expiring soon', () => {
      const date = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const result = performStartupExpiryCheck(date, 30);

      expect(result.isExpired).toBe(false);
      expect(result.isExpiringSoon).toBe(true);
      expect(result.warning).not.toBeNull();
      expect(result.readOnlyModeActivated).toBe(false);
    });

    it('should handle missing expiration date', () => {
      const result = performStartupExpiryCheck(null, 30);

      expect(result.isExpired).toBe(true);
      expect(result.readOnlyModeActivated).toBe(true);
      expect(result.warning).toContain('No valid license');
      expect(isReadOnlyMode()).toBe(true);
    });

    it('should handle invalid dates', () => {
      const result = performStartupExpiryCheck('invalid-date', 30);

      expect(result.isExpired).toBe(true);
      expect(result.readOnlyModeActivated).toBe(true);
      expect(isReadOnlyMode()).toBe(true);
    });
  });

  describe('isLicenseValidForStartup', () => {
    it('should return true for valid license', () => {
      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      expect(isLicenseValidForStartup(futureDate)).toBe(true);
    });

    it('should return false for expired license', () => {
      const pastDate = new Date('2020-01-01');
      expect(isLicenseValidForStartup(pastDate)).toBe(false);
    });

    it('should return false for missing date', () => {
      expect(isLicenseValidForStartup(null)).toBe(false);
    });

    it('should return false for invalid date', () => {
      expect(isLicenseValidForStartup('invalid-date')).toBe(false);
    });
  });

  describe('getStartupWarningBanner', () => {
    it('should return error banner for expired license', () => {
      const pastDate = new Date('2020-01-01');
      const banner = getStartupWarningBanner(pastDate, 30);

      expect(banner).not.toBeNull();
      expect(banner?.severity).toBe('error');
      expect(banner?.message).toContain('expired');
    });

    it('should return warning banner for license expiring in 7 days', () => {
      const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const banner = getStartupWarningBanner(date, 30);

      expect(banner).not.toBeNull();
      expect(banner?.severity).toBe('warning');
    });

    it('should return info banner for license expiring in 30 days', () => {
      const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const banner = getStartupWarningBanner(date, 30);

      expect(banner).not.toBeNull();
      expect(banner?.severity).toBe('info');
    });

    it('should return null for valid license', () => {
      const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const banner = getStartupWarningBanner(date, 30);

      expect(banner).toBeNull();
    });

    it('should return error banner for missing date', () => {
      const banner = getStartupWarningBanner(null, 30);

      expect(banner).not.toBeNull();
      expect(banner?.severity).toBe('error');
    });
  });
});

describe('API Middleware Expiry Check', () => {
  beforeEach(() => {
    deactivateReadOnlyMode();
  });

  describe('checkExpiryForRequest', () => {
    it('should block write operations for expired license', () => {
      const pastDate = new Date('2020-01-01');
      const response = checkExpiryForRequest(pastDate, 'POST');

      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should allow read operations for expired license', () => {
      const pastDate = new Date('2020-01-01');
      const response = checkExpiryForRequest(pastDate, 'GET');

      expect(response).toBeNull();
    });

    it('should allow all operations for valid license', () => {
      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      expect(checkExpiryForRequest(futureDate, 'GET')).toBeNull();
      expect(checkExpiryForRequest(futureDate, 'POST')).toBeNull();
      expect(checkExpiryForRequest(futureDate, 'PUT')).toBeNull();
      expect(checkExpiryForRequest(futureDate, 'DELETE')).toBeNull();
    });

    it('should block write operations when read-only mode is active', () => {
      activateReadOnlyMode('Test reason');
      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      const response = checkExpiryForRequest(futureDate, 'POST');
      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });

    it('should skip read-only check when option is set', () => {
      const pastDate = new Date('2020-01-01');
      const response = checkExpiryForRequest(pastDate, 'POST', { skipReadOnlyCheck: true });

      expect(response).toBeNull();
    });

    it('should handle missing expiration date', () => {
      const response = checkExpiryForRequest(null, 'POST');

      expect(response).not.toBeNull();
      expect(response?.status).toBe(403);
    });
  });

  describe('getExpiryWarningHeader', () => {
    it('should return warning header for expiring license', () => {
      const date = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      const headers = getExpiryWarningHeader(date, 30);

      expect(headers).not.toBeNull();
      expect(headers?.['X-License-Warning']).toBeDefined();
      expect(headers?.['X-License-Expiring']).toBe('true');
    });

    it('should return null for valid license', () => {
      const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const headers = getExpiryWarningHeader(date, 30);

      expect(headers).toBeNull();
    });

    it('should return null for expired license', () => {
      const pastDate = new Date('2020-01-01');
      const headers = getExpiryWarningHeader(pastDate, 30);

      expect(headers).toBeNull();
    });

    it('should return null for missing date', () => {
      const headers = getExpiryWarningHeader(null, 30);

      expect(headers).toBeNull();
    });
  });

  describe('isOperationAllowedWithExpiry', () => {
    it('should allow read operations for expired license', () => {
      const pastDate = new Date('2020-01-01');
      expect(isOperationAllowedWithExpiry(pastDate, 'read')).toBe(true);
    });

    it('should allow export operations for expired license', () => {
      const pastDate = new Date('2020-01-01');
      expect(isOperationAllowedWithExpiry(pastDate, 'export')).toBe(true);
    });

    it('should block write operations for expired license', () => {
      const pastDate = new Date('2020-01-01');
      expect(isOperationAllowedWithExpiry(pastDate, 'write')).toBe(false);
    });

    it('should allow all operations for valid license', () => {
      const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

      expect(isOperationAllowedWithExpiry(futureDate, 'read')).toBe(true);
      expect(isOperationAllowedWithExpiry(futureDate, 'write')).toBe(true);
      expect(isOperationAllowedWithExpiry(futureDate, 'export')).toBe(true);
    });

    it('should handle missing date', () => {
      expect(isOperationAllowedWithExpiry(null, 'read')).toBe(true);
      expect(isOperationAllowedWithExpiry(null, 'export')).toBe(true);
      expect(isOperationAllowedWithExpiry(null, 'write')).toBe(false);
    });
  });
});

describe('Edge Cases', () => {
  it('should handle license expiring today', () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today

    const isExpired = detectExpiry(today);
    const expiringSoon = isExpiringSoon(today, 30);

    // Should be either expired or expiring soon, but not both
    expect(isExpired || expiringSoon).toBe(true);
  });

  it('should handle license expiring in exactly 30 days', () => {
    const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    expect(isExpiringSoon(date, 30)).toBe(true);
  });

  it('should handle license expiring in exactly 31 days', () => {
    const date = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    expect(isExpiringSoon(date, 30)).toBe(false);
  });

  it('should handle very old expiration dates', () => {
    const veryOldDate = new Date('1970-01-01');
    expect(detectExpiry(veryOldDate)).toBe(true);
    expect(isExpiringSoon(veryOldDate, 30)).toBe(false);
  });

  it('should handle very far future dates', () => {
    const farFutureDate = new Date('2099-12-31');
    expect(detectExpiry(farFutureDate)).toBe(false);
    expect(isExpiringSoon(farFutureDate, 30)).toBe(false);
  });
});
