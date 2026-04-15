/**
 * License Validation Middleware
 * Checks license validity on app startup and module access
 */

import { validateLicense, checkModuleAccess, isLicenseValid } from '@/lib/license-validator';
import type { LicenseData } from '@/lib/license-validator';

export interface LicenseContext {
  licenseKey?: string;
  licenseData?: LicenseData;
  isValid: boolean;
  modules: string[];
}

/**
 * Check license on app startup
 * @param licenseKey - License key to validate
 * @param currentCustomerId - Optional: current customer ID to verify license ownership
 */
export async function checkLicenseOnStartup(licenseKey?: string, currentCustomerId?: string): Promise<LicenseContext> {
  if (!licenseKey) {
    return {
      isValid: false,
      modules: [],
    };
  }

  try {
    const licenseData = await validateLicense(licenseKey, currentCustomerId);
    return {
      licenseKey,
      licenseData,
      isValid: licenseData.valid,
      modules: licenseData.modules || [],
    };
  } catch (error) {
    console.error('License check failed:', error);
    return {
      licenseKey,
      isValid: false,
      modules: [],
    };
  }
}

/**
 * Check if module is accessible
 */
export function isModuleAccessible(context: LicenseContext, module: string): boolean {
  if (!context.isValid) {
    return false;
  }

  return context.modules.includes(module);
}

/**
 * Get license expiration warning
 */
export function getLicenseExpirationWarning(context: LicenseContext): string | null {
  if (!context.licenseData?.daysRemaining) {
    return null;
  }

  const days = context.licenseData.daysRemaining;

  if (days <= 0) {
    return 'Your license has expired. Please renew to continue using the application.';
  }

  if (days <= 7) {
    return `Your license will expire in ${days} day${days > 1 ? 's' : ''}. Please renew soon.`;
  }

  if (days <= 30) {
    return `Your license will expire in ${days} days.`;
  }

  return null;
}

/**
 * Get usage warning
 */
export function getUsageWarning(context: LicenseContext): string | null {
  if (!context.licenseData?.prescriptionsRemaining) {
    return null;
  }

  const remaining = context.licenseData.prescriptionsRemaining;
  const total = context.licenseData.license?.maxPrescriptions || 0;

  if (remaining <= 0) {
    return 'You have reached your prescription limit. Please upgrade your plan.';
  }

  const percentageUsed = Math.round(((total - remaining) / total) * 100);

  if (percentageUsed >= 90) {
    return `You have used ${percentageUsed}% of your prescription limit (${remaining} remaining).`;
  }

  return null;
}

/**
 * Offline mode support - store license locally
 */
export function storeLicenseLocally(licenseKey: string, licenseData: LicenseData): void {
  if (typeof window === 'undefined') return;

  try {
    const offlineData = {
      licenseKey,
      licenseData,
      storedAt: new Date().toISOString(),
    };
    localStorage.setItem('clinic_license_offline', JSON.stringify(offlineData));
  } catch (error) {
    console.error('Failed to store license locally:', error);
  }
}

/**
 * Get stored license from offline storage
 */
export function getStoredLicenseLocally(): { licenseKey: string; licenseData: LicenseData } | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem('clinic_license_offline');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to retrieve stored license:', error);
  }

  return null;
}

/**
 * Clear stored license
 */
export function clearStoredLicense(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem('clinic_license_offline');
  } catch (error) {
    console.error('Failed to clear stored license:', error);
  }
}
