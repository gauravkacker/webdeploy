/**
 * Password Activation Handler
 * Handles the logic for activating licenses with passwords
 */

import { decodePassword } from './password-decoder';
import { validateSignature, validateExpiry, getExpiryStatus } from './password-validator';

export interface PasswordActivationResult {
  success: boolean;
  licenseKey?: string;
  plan?: string;
  maxMachines?: number;
  expiryDate?: string;
  isExpired?: boolean;
  daysUntilExpiry?: number;
  message?: string;
  error?: string;
}

/**
 * Activates a license using a password
 * Performs all validation and machine binding
 *
 * @param password - The license password
 * @param machineId - The machine ID to bind
 * @returns Activation result
 */
export async function activateWithPassword(
  password: string,
  machineId: string
): Promise<PasswordActivationResult> {
  try {
    // Validate inputs
    if (!password || typeof password !== 'string') {
      return {
        success: false,
        error: 'Password is required',
      };
    }

    if (!machineId || typeof machineId !== 'string') {
      return {
        success: false,
        error: 'Machine ID is required',
      };
    }

    // Call API endpoint
    const response = await fetch('/api/license/activate-with-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, machineId }),
    });

    const data: PasswordActivationResult = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to activate license',
      };
    }

    return data;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to activate license',
    };
  }
}

/**
 * Validates a password locally (without API call)
 * Useful for pre-validation before submission
 *
 * @param password - The license password
 * @returns Validation result
 */
export function validatePasswordLocally(password: string): {
  isValid: boolean;
  error?: string;
  licenseKey?: string;
  plan?: string;
  maxMachines?: number;
  expiryDate?: string;
  expiryStatus?: string;
} {
  try {
    // Decode password
    const decoded = decodePassword(password);

    // Validate signature
    const isSignatureValid = validateSignature(
      decoded.licenseKey,
      decoded.plan,
      decoded.maxMachines,
      decoded.expiryDate,
      decoded.signature
    );

    if (!isSignatureValid) {
      return {
        isValid: false,
        error: 'Password signature verification failed (password may be tampered)',
      };
    }

    // Validate expiry
    const expiryValidation = validateExpiry(decoded.expiryDate);
    const expiryStatus = getExpiryStatus(decoded.expiryDate);

    return {
      isValid: true,
      licenseKey: decoded.licenseKey,
      plan: decoded.plan,
      maxMachines: decoded.maxMachines,
      expiryDate: decoded.expiryDate,
      expiryStatus,
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Invalid password',
    };
  }
}

/**
 * Gets human-readable error message for password activation
 *
 * @param error - Error message from activation
 * @returns User-friendly error message
 */
export function getErrorMessage(error: string): string {
  if (error.includes('signature')) {
    return 'Password appears to be tampered or corrupted. Please check and try again.';
  }
  if (error.includes('already activated')) {
    return 'This license is already activated on another machine. Single-PC licenses can only be used on one machine.';
  }
  if (error.includes('limit reached')) {
    return 'This license has reached its machine limit. Please contact admin for multi-PC upgrade.';
  }
  if (error.includes('expired')) {
    return 'This license has expired. Please contact admin for renewal.';
  }
  return error || 'Failed to activate license. Please try again.';
}
