/**
 * License Binding Logic
 * Handles binding licenses to specific Machine IDs
 */

import { getMachineIdHash, verifyMachineIdHash } from './machine-id-generator';
import { parseLicFile, LicenseDataV2 } from './lic-file';
import type { AuthorizedMachine } from '../db/schema';

export interface LicenseBindingData {
  licenseKey: string;
  customerId: string;
  machineId: string;
  machineIdHash: string;
  boundAt: Date;
  expiresAt: Date;
  modules: string[];
}

// Multi-PC License Binding Data
export interface MultiPCLicenseBindingData {
  licenseKey: string;
  customerId: string;
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  authorizedMachines: AuthorizedMachine[];
  boundAt: Date;
  expiresAt: Date;
  modules: string[];
}

export interface BindingResult {
  success: boolean;
  binding?: LicenseBindingData;
  error?: string;
}

export interface VerificationResult {
  valid: boolean;
  isBound: boolean;
  machineMatch: boolean;
  notExpired: boolean;
  error?: string;
}

// Multi-PC Verification Result
export interface MultiPCVerificationResult {
  valid: boolean;
  isAuthorized: boolean;
  machineMatch: boolean;
  notExpired: boolean;
  licenseType: 'single-pc' | 'multi-pc';
  currentMachineId: string;
  authorizedMachineCount: number;
  maxMachines: number;
  error?: string;
  errorCode?: string;
}

/**
 * Validate license key format
 * License keys follow pattern: KIRO-XXXX-XXXX-XXXX-XXXX (36 characters)
 */
function validateLicenseKeyFormat(licenseKey: string): boolean {
  const licenseKeyPattern = /^KIRO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return licenseKeyPattern.test(licenseKey);
}

/**
 * Validate Machine ID format
 * Machine IDs follow pattern: MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
 */
export function validateMachineIdFormat(machineId: string): boolean {
  const machineIdPattern = /^MACHINE-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/;
  return machineIdPattern.test(machineId);
}

/**
 * Bind a license to a Machine ID
 * Creates a binding record that ties a license to a specific machine
 */
export function bindLicenseToMachine(
  licenseKey: string,
  customerId: string,
  machineId: string,
  expiresAt: Date,
  modules: string[]
): BindingResult {
  try {
    // Validate license key format
    if (!validateLicenseKeyFormat(licenseKey)) {
      return {
        success: false,
        error: 'Invalid license key format. Expected: KIRO-XXXX-XXXX-XXXX-XXXX',
      };
    }

    // Validate Machine ID format
    if (!validateMachineIdFormat(machineId)) {
      return {
        success: false,
        error: 'Invalid Machine ID format. Expected: MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
      };
    }

    // Validate customer ID (UUID format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(customerId)) {
      return {
        success: false,
        error: 'Invalid customer ID format',
      };
    }

    // Validate expiration date
    if (expiresAt <= new Date()) {
      return {
        success: false,
        error: 'License expiration date must be in the future',
      };
    }

    // Validate modules array
    if (!Array.isArray(modules) || modules.length === 0) {
      return {
        success: false,
        error: 'At least one module must be specified',
      };
    }

    // Generate Machine ID hash for secure storage
    const machineIdHash = getMachineIdHash(machineId);

    // Create binding record
    const binding: LicenseBindingData = {
      licenseKey,
      customerId,
      machineId,
      machineIdHash,
      boundAt: new Date(),
      expiresAt,
      modules,
    };

    return {
      success: true,
      binding,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to bind license',
    };
  }
}

/**
 * Verify license binding
 * Checks if a license is bound to the current Machine ID
 */
export function verifyLicenseBinding(
  binding: LicenseBindingData,
  currentMachineId: string
): VerificationResult {
  try {
    // Validate Machine ID format
    if (!validateMachineIdFormat(currentMachineId)) {
      return {
        valid: false,
        isBound: false,
        machineMatch: false,
        notExpired: false,
        error: 'Invalid current Machine ID format',
      };
    }

    // Check if binding exists
    if (!binding) {
      return {
        valid: false,
        isBound: false,
        machineMatch: false,
        notExpired: false,
        error: 'No binding found',
      };
    }

    // Verify Machine ID hash matches
    const machineMatch = verifyMachineIdHash(currentMachineId, binding.machineIdHash);

    if (!machineMatch) {
      return {
        valid: false,
        isBound: true,
        machineMatch: false,
        notExpired: !isExpired(binding.expiresAt),
        error: 'License is bound to a different Machine ID',
      };
    }

    // Check expiration
    const notExpired = !isExpired(binding.expiresAt);

    if (!notExpired) {
      return {
        valid: false,
        isBound: true,
        machineMatch: true,
        notExpired: false,
        error: 'License has expired',
      };
    }

    return {
      valid: true,
      isBound: true,
      machineMatch: true,
      notExpired: true,
    };
  } catch (error) {
    return {
      valid: false,
      isBound: false,
      machineMatch: false,
      notExpired: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    };
  }
}

/**
 * Check if a machine is already bound to a license
 * Returns true if the machine has an active binding (not expired)
 */
export function isMachineBound(
  binding: LicenseBindingData | null,
  currentMachineId: string
): boolean {
  if (!binding) {
    return false;
  }

  const verification = verifyLicenseBinding(binding, currentMachineId);
  return verification.isBound && verification.machineMatch && verification.notExpired;
}

/**
 * Check if license has expired
 */
function isExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Get remaining days until license expiration
 */
export function getRemainingDays(expiresAt: Date): number {
  const now = new Date();
  const diffTime = expiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Check if license is expiring soon (within 30 days)
 */
export function isExpiringsoon(expiresAt: Date, daysThreshold: number = 30): boolean {
  const remainingDays = getRemainingDays(expiresAt);
  return remainingDays > 0 && remainingDays <= daysThreshold;
}

/**
 * Calculate new expiration date for renewal
 * Preserves remaining days from old license
 */
export function calculateRenewalExpiration(
  oldExpiresAt: Date,
  renewalDays: number
): Date {
  const remainingDays = getRemainingDays(oldExpiresAt);
  const totalDays = remainingDays + renewalDays;
  
  const newExpiration = new Date();
  newExpiration.setDate(newExpiration.getDate() + totalDays);
  
  return newExpiration;
}

/**
 * Verify multi-PC license binding
 * Checks if current Machine ID is in the authorized machines list
 */
export function verifyMultiPCLicenseBinding(
  binding: MultiPCLicenseBindingData,
  currentMachineId: string
): MultiPCVerificationResult {
  try {
    // Validate Machine ID format
    if (!validateMachineIdFormat(currentMachineId)) {
      return {
        valid: false,
        isAuthorized: false,
        machineMatch: false,
        notExpired: false,
        licenseType: binding.licenseType,
        currentMachineId,
        authorizedMachineCount: binding.authorizedMachines.length,
        maxMachines: binding.maxMachines,
        error: 'Invalid current Machine ID format',
        errorCode: 'INVALID_MACHINE_ID_FORMAT',
      };
    }

    // Check if binding exists
    if (!binding || !binding.authorizedMachines) {
      return {
        valid: false,
        isAuthorized: false,
        machineMatch: false,
        notExpired: false,
        licenseType: binding?.licenseType || 'single-pc',
        currentMachineId,
        authorizedMachineCount: 0,
        maxMachines: binding?.maxMachines || 1,
        error: 'No binding found',
        errorCode: 'NO_BINDING',
      };
    }

    // Check if current Machine ID is in authorized list
    const isAuthorized = binding.authorizedMachines.some(
      (machine) => machine.machineId === currentMachineId
    );

    if (!isAuthorized) {
      return {
        valid: false,
        isAuthorized: false,
        machineMatch: false,
        notExpired: !isExpired(binding.expiresAt),
        licenseType: binding.licenseType,
        currentMachineId,
        authorizedMachineCount: binding.authorizedMachines.length,
        maxMachines: binding.maxMachines,
        error: `This PC is not authorized to use this license.\n\nYour Machine ID: ${currentMachineId}\n\nPlease send this Machine ID to your administrator to add it to your license.`,
        errorCode: 'MACHINE_NOT_AUTHORIZED',
      };
    }

    // Verify Machine ID hash matches (additional security check)
    const authorizedMachine = binding.authorizedMachines.find(
      (machine) => machine.machineId === currentMachineId
    );

    if (authorizedMachine) {
      const machineMatch = verifyMachineIdHash(currentMachineId, authorizedMachine.machineIdHash);
      
      if (!machineMatch) {
        return {
          valid: false,
          isAuthorized: true,
          machineMatch: false,
          notExpired: !isExpired(binding.expiresAt),
          licenseType: binding.licenseType,
          currentMachineId,
          authorizedMachineCount: binding.authorizedMachines.length,
          maxMachines: binding.maxMachines,
          error: 'Machine ID hash verification failed',
          errorCode: 'HASH_MISMATCH',
        };
      }
    }

    // Check expiration
    const notExpired = !isExpired(binding.expiresAt);

    if (!notExpired) {
      return {
        valid: false,
        isAuthorized: true,
        machineMatch: true,
        notExpired: false,
        licenseType: binding.licenseType,
        currentMachineId,
        authorizedMachineCount: binding.authorizedMachines.length,
        maxMachines: binding.maxMachines,
        error: 'License has expired',
        errorCode: 'LICENSE_EXPIRED',
      };
    }

    // Validate PC limit not exceeded
    if (binding.authorizedMachines.length > binding.maxMachines) {
      return {
        valid: false,
        isAuthorized: true,
        machineMatch: true,
        notExpired: true,
        licenseType: binding.licenseType,
        currentMachineId,
        authorizedMachineCount: binding.authorizedMachines.length,
        maxMachines: binding.maxMachines,
        error: `Authorized machines (${binding.authorizedMachines.length}) exceeds PC limit (${binding.maxMachines})`,
        errorCode: 'PC_LIMIT_EXCEEDED',
      };
    }

    return {
      valid: true,
      isAuthorized: true,
      machineMatch: true,
      notExpired: true,
      licenseType: binding.licenseType,
      currentMachineId,
      authorizedMachineCount: binding.authorizedMachines.length,
      maxMachines: binding.maxMachines,
    };
  } catch (error) {
    return {
      valid: false,
      isAuthorized: false,
      machineMatch: false,
      notExpired: false,
      licenseType: binding?.licenseType || 'single-pc',
      currentMachineId,
      authorizedMachineCount: binding?.authorizedMachines?.length || 0,
      maxMachines: binding?.maxMachines || 1,
      error: error instanceof Error ? error.message : 'Verification failed',
      errorCode: 'VERIFICATION_ERROR',
    };
  }
}

/**
 * Check if a machine is authorized in multi-PC license
 * Returns true if the machine is in the authorized list and license is not expired
 */
export function isMachineAuthorized(
  binding: MultiPCLicenseBindingData | null,
  currentMachineId: string
): boolean {
  if (!binding) {
    return false;
  }

  const verification = verifyMultiPCLicenseBinding(binding, currentMachineId);
  return verification.isAuthorized && verification.machineMatch && verification.notExpired;
}

/**
 * Unified license validation function
 * Handles both v1.0 (single-PC) and v2.0 (multi-PC) formats
 * Automatically detects format and applies appropriate validation
 */
export function validateLicense(
  licFileBuffer: Buffer,
  currentMachineId: string,
  encryptionKey: Buffer
): MultiPCVerificationResult {
  try {
    // Parse .LIC file (automatically handles v1.0 and v2.0)
    const parseResult = parseLicFile(licFileBuffer, encryptionKey);

    if (!parseResult.data) {
      return {
        valid: false,
        isAuthorized: false,
        machineMatch: false,
        notExpired: false,
        licenseType: 'single-pc',
        currentMachineId,
        authorizedMachineCount: 0,
        maxMachines: 1,
        error: parseResult.error || 'Failed to parse .LIC file',
        errorCode: 'PARSE_ERROR',
      };
    }

    const licenseData = parseResult.data;

    // Convert to MultiPCLicenseBindingData format
    const binding: MultiPCLicenseBindingData = {
      licenseKey: licenseData.licenseKey,
      customerId: licenseData.customerId,
      licenseType: licenseData.licenseType,
      maxMachines: licenseData.maxMachines,
      authorizedMachines: licenseData.authorizedMachines,
      boundAt: licenseData.createdAt,
      expiresAt: licenseData.expiresAt,
      modules: licenseData.modules,
    };

    // Use multi-PC verification (works for both single-PC and multi-PC)
    return verifyMultiPCLicenseBinding(binding, currentMachineId);
  } catch (error) {
    return {
      valid: false,
      isAuthorized: false,
      machineMatch: false,
      notExpired: false,
      licenseType: 'single-pc',
      currentMachineId,
      authorizedMachineCount: 0,
      maxMachines: 1,
      error: error instanceof Error ? error.message : 'Validation failed',
      errorCode: 'VALIDATION_ERROR',
    };
  }
}
