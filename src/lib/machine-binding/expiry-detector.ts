/**
 * Expiry Detector
 * Detects license expiration and provides warning messages
 */

import { calculateRemainingDays } from './remaining-days-calculator';

export interface ExpiryStatus {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysRemaining: number;
  expiresAt: Date;
}

export interface ExpiryWarning {
  shouldShow: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
  daysRemaining: number;
}

/**
 * Detect if license has expired
 * 
 * @param expiresAt - License expiration date
 * @returns True if license has expired
 */
export function detectExpiry(expiresAt: Date | string): boolean {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);
    return remainingDays === 0;
  } catch {
    return true; // Treat invalid dates as expired
  }
}

/**
 * Check if license is expiring soon
 * 
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to trigger warning (default: 30)
 * @returns True if license is expiring within threshold
 */
export function isExpiringSoon(
  expiresAt: Date | string,
  daysThreshold: number = 30
): boolean {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);
    return remainingDays > 0 && remainingDays <= daysThreshold;
  } catch {
    return false;
  }
}

/**
 * Get expiry warning message with days remaining
 * 
 * @param expiresAt - License expiration date
 * @returns Warning message or null if no warning needed
 */
export function getExpiryWarning(expiresAt: Date | string): string | null {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);

    if (remainingDays === 0) {
      return 'Your license has expired. The application is now in read-only mode. Please renew your license to continue using all features.';
    }

    if (remainingDays === 1) {
      return 'Your license will expire tomorrow. Please renew your license to avoid interruption.';
    }

    if (remainingDays <= 7) {
      return `Your license will expire in ${remainingDays} days. Please renew your license soon.`;
    }

    if (remainingDays <= 30) {
      return `Your license will expire in ${remainingDays} days. Consider renewing your license.`;
    }

    return null;
  } catch {
    return 'Unable to determine license expiration. Please check your license.';
  }
}

/**
 * Determine if expiry warning should be displayed
 * 
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to show warning (default: 30)
 * @returns True if warning should be displayed
 */
export function shouldShowWarning(
  expiresAt: Date | string,
  daysThreshold: number = 30
): boolean {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);
    return remainingDays <= daysThreshold;
  } catch {
    return true; // Show warning for invalid dates
  }
}

/**
 * Get complete expiry status
 * 
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to trigger warning (default: 30)
 * @returns Complete expiry status information
 */
export function getExpiryStatus(
  expiresAt: Date | string,
  daysThreshold: number = 30
): ExpiryStatus {
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const daysRemaining = calculateRemainingDays(expirationDate);

  return {
    isExpired: daysRemaining === 0,
    isExpiringSoon: daysRemaining > 0 && daysRemaining <= daysThreshold,
    daysRemaining,
    expiresAt: expirationDate,
  };
}

/**
 * Get detailed expiry warning with severity level
 * 
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to show warning (default: 30)
 * @returns Detailed warning information
 */
export function getDetailedExpiryWarning(
  expiresAt: Date | string,
  daysThreshold: number = 30
): ExpiryWarning {
  try {
    const remainingDays = calculateRemainingDays(expiresAt);

    if (remainingDays === 0) {
      return {
        shouldShow: true,
        message: 'Your license has expired. The application is now in read-only mode.',
        severity: 'error',
        daysRemaining: 0,
      };
    }

    if (remainingDays <= 7) {
      return {
        shouldShow: true,
        message: `Your license will expire in ${remainingDays} day${remainingDays > 1 ? 's' : ''}. Please renew soon.`,
        severity: 'warning',
        daysRemaining: remainingDays,
      };
    }

    if (remainingDays <= daysThreshold) {
      return {
        shouldShow: true,
        message: `Your license will expire in ${remainingDays} days.`,
        severity: 'info',
        daysRemaining: remainingDays,
      };
    }

    return {
      shouldShow: false,
      message: '',
      severity: 'info',
      daysRemaining: remainingDays,
    };
  } catch {
    return {
      shouldShow: true,
      message: 'Unable to determine license expiration. Please check your license.',
      severity: 'error',
      daysRemaining: 0,
    };
  }
}
