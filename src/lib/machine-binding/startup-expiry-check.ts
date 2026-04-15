/**
 * Startup Expiry Check
 * Checks license expiration on application startup
 */

import { detectExpiry, isExpiringSoon, getExpiryWarning } from './expiry-detector';
import { activateReadOnlyMode, deactivateReadOnlyMode } from './read-only-mode';

export interface StartupCheckResult {
  isExpired: boolean;
  isExpiringSoon: boolean;
  warning: string | null;
  readOnlyModeActivated: boolean;
}

/**
 * Perform expiry check on application startup
 * Activates read-only mode if license is expired
 * 
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to show warning (default: 30)
 * @returns Startup check result
 */
export function performStartupExpiryCheck(
  expiresAt: Date | string | null | undefined,
  daysThreshold: number = 30
): StartupCheckResult {
  // Handle missing expiration date
  if (!expiresAt) {
    activateReadOnlyMode('No valid license found');
    return {
      isExpired: true,
      isExpiringSoon: false,
      warning: 'No valid license found. Application is in read-only mode.',
      readOnlyModeActivated: true,
    };
  }

  try {
    const isExpired = detectExpiry(expiresAt);
    const expiringSoon = isExpiringSoon(expiresAt, daysThreshold);
    const warning = getExpiryWarning(expiresAt);

    if (isExpired) {
      activateReadOnlyMode('License has expired');
      return {
        isExpired: true,
        isExpiringSoon: false,
        warning,
        readOnlyModeActivated: true,
      };
    }

    // Deactivate read-only mode if license is valid
    deactivateReadOnlyMode();

    return {
      isExpired: false,
      isExpiringSoon: expiringSoon,
      warning: expiringSoon ? warning : null,
      readOnlyModeActivated: false,
    };
  } catch (error) {
    // On error, activate read-only mode as a safety measure
    activateReadOnlyMode('Unable to validate license expiration');
    return {
      isExpired: true,
      isExpiringSoon: false,
      warning: 'Unable to validate license. Application is in read-only mode.',
      readOnlyModeActivated: true,
    };
  }
}

/**
 * Check if license is valid for startup
 * Returns true if license is not expired
 * 
 * @param expiresAt - License expiration date
 * @returns True if license is valid
 */
export function isLicenseValidForStartup(expiresAt: Date | string | null | undefined): boolean {
  if (!expiresAt) {
    return false;
  }

  try {
    return !detectExpiry(expiresAt);
  } catch {
    return false;
  }
}

/**
 * Get startup warning banner data
 * Returns null if no warning should be displayed
 * 
 * @param expiresAt - License expiration date
 * @param daysThreshold - Days before expiration to show warning (default: 30)
 * @returns Warning banner data or null
 */
export function getStartupWarningBanner(
  expiresAt: Date | string | null | undefined,
  daysThreshold: number = 30
): { message: string; severity: 'info' | 'warning' | 'error' } | null {
  if (!expiresAt) {
    return {
      message: 'No valid license found. Application is in read-only mode.',
      severity: 'error',
    };
  }

  try {
    const isExpired = detectExpiry(expiresAt);
    const expiringSoon = isExpiringSoon(expiresAt, daysThreshold);

    if (isExpired) {
      return {
        message: 'Your license has expired. Application is in read-only mode.',
        severity: 'error',
      };
    }

    if (expiringSoon) {
      const warning = getExpiryWarning(expiresAt);
      const remainingDays = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      if (remainingDays <= 7) {
        return {
          message: warning || 'Your license is expiring soon.',
          severity: 'warning',
        };
      }

      return {
        message: warning || 'Your license will expire soon.',
        severity: 'info',
      };
    }

    return null;
  } catch {
    return {
      message: 'Unable to validate license. Application is in read-only mode.',
      severity: 'error',
    };
  }
}
