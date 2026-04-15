/**
 * License Password Validator
 * Validates password signatures and expiry dates
 */

import crypto from 'crypto';
import {
  HMAC_SECRET,
  SIGNATURE_ALGORITHM,
  PASSWORD_SEPARATOR,
} from './constants';
import { parseYYYYMMDD } from './password-decoder';

/**
 * Expiry validation result
 */
export interface ExpiryValidation {
  isExpired: boolean;
  daysUntilExpiry: number;
  expiryDate: Date;
}

/**
 * Validates HMAC-SHA256 signature of password data
 * Prevents tampering with license terms
 *
 * @param licenseKey - The license key
 * @param plan - Plan type
 * @param maxMachines - Maximum machines
 * @param expiryDate - Expiry date in YYYYMMDD format
 * @param providedSignature - The signature to verify
 * @returns true if signature is valid, false if tampered
 *
 * @example
 * const isValid = validateSignature('ABC123XYZ', '1', 1, '20261231', 'abc123...');
 * // Returns: true or false
 */
export function validateSignature(
  licenseKey: string,
  plan: string,
  maxMachines: number,
  expiryDate: string,
  providedSignature: string
): boolean {
  try {
    // Regenerate signature with same data
    const data = `${licenseKey}${PASSWORD_SEPARATOR}${plan}${PASSWORD_SEPARATOR}${maxMachines}${PASSWORD_SEPARATOR}${expiryDate}`;
    const hmac = crypto.createHmac(SIGNATURE_ALGORITHM, HMAC_SECRET);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');

    // Compare signatures (constant-time comparison to prevent timing attacks)
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );
  } catch (error) {
    // If comparison fails (e.g., different lengths), signature is invalid
    return false;
  }
}

/**
 * Validates expiry date
 * Checks if license has expired and calculates days until expiry
 *
 * @param expiryDate - Expiry date in YYYYMMDD format
 * @returns Expiry validation result
 *
 * @example
 * const result = validateExpiry('20261231');
 * // Returns: {
 * //   isExpired: false,
 * //   daysUntilExpiry: 278,
 * //   expiryDate: Date object
 * // }
 */
export function validateExpiry(expiryDate: string): ExpiryValidation {
  try {
    const expiry = parseYYYYMMDD(expiryDate);
    const today = new Date();

    // Set time to midnight for accurate day calculation
    today.setHours(0, 0, 0, 0);
    expiry.setHours(0, 0, 0, 0);

    // Calculate days until expiry
    const timeDiff = expiry.getTime() - today.getTime();
    const daysUntilExpiry = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    return {
      isExpired: daysUntilExpiry < 0,
      daysUntilExpiry,
      expiryDate: expiry,
    };
  } catch (error) {
    throw new Error(`Failed to validate expiry date: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if license is expiring soon (within 30 days)
 * @param expiryDate - Expiry date in YYYYMMDD format
 * @returns true if expiring within 30 days
 */
export function isExpiringsoon(expiryDate: string): boolean {
  const validation = validateExpiry(expiryDate);
  return validation.daysUntilExpiry >= 0 && validation.daysUntilExpiry <= 30;
}

/**
 * Gets human-readable expiry status
 * @param expiryDate - Expiry date in YYYYMMDD format
 * @returns Status message
 *
 * @example
 * const status = getExpiryStatus('20261231');
 * // Returns: "Expires in 278 days" or "Expired 5 days ago"
 */
export function getExpiryStatus(expiryDate: string): string {
  const validation = validateExpiry(expiryDate);

  if (validation.isExpired) {
    const daysAgo = Math.abs(validation.daysUntilExpiry);
    return daysAgo === 1 ? 'Expired 1 day ago' : `Expired ${daysAgo} days ago`;
  }

  if (validation.daysUntilExpiry === 0) {
    return 'Expires today';
  }

  if (validation.daysUntilExpiry === 1) {
    return 'Expires tomorrow';
  }

  return `Expires in ${validation.daysUntilExpiry} days`;
}

/**
 * Formats expiry date for display
 * @param expiryDate - Expiry date in YYYYMMDD format
 * @returns Formatted date string (e.g., "Dec 31, 2026")
 */
export function formatExpiryDate(expiryDate: string): string {
  const date = parseYYYYMMDD(expiryDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
