/**
 * .LIC File Manager
 * Handles creation, validation, and management of .LIC files
 */

import { createLicFile, parseLicFile, LicenseData, createLicFileV2, LicenseDataV2 } from './lic-file';
import { verifyMachineIdHash } from './machine-id-generator';
import type { AuthorizedMachine } from '../db/schema';

export interface LicFileGenerationRequest {
  licenseKey: string;
  customerId: string;
  machineId: string;
  machineIdHash: string;
  expiresAt: Date;
  modules: string[];
  maxPrescriptions?: number;
}

export interface LicFileValidationResult {
  valid: boolean;
  machineMatch: boolean;
  notExpired: boolean;
  data?: LicenseData;
  error?: string;
}

export interface LicFileGenerationResult {
  success: boolean;
  licFile?: Buffer;
  error?: string;
}

/**
 * Generate .LIC file from license data
 * Creates an encrypted binary file bound to a specific Machine ID
 */
export function generateLicFile(
  request: LicFileGenerationRequest,
  encryptionKey: Buffer
): LicFileGenerationResult {
  try {
    // Validate encryption key
    if (!encryptionKey || encryptionKey.length !== 32) {
      return {
        success: false,
        error: 'Invalid encryption key (must be 32 bytes)',
      };
    }

    // Validate request data
    if (!request.licenseKey || !request.customerId || !request.machineId) {
      return {
        success: false,
        error: 'Missing required fields: licenseKey, customerId, machineId',
      };
    }

    if (!Array.isArray(request.modules) || request.modules.length === 0) {
      return {
        success: false,
        error: 'At least one module must be specified',
      };
    }

    if (request.expiresAt <= new Date()) {
      return {
        success: false,
        error: 'Expiration date must be in the future',
      };
    }

    // Create license data
    const licenseData: LicenseData = {
      licenseKey: request.licenseKey,
      customerId: request.customerId,
      machineId: request.machineId,
      machineIdHash: request.machineIdHash,
      expiresAt: request.expiresAt,
      modules: request.modules,
      maxPrescriptions: request.maxPrescriptions,
      createdAt: new Date(),
    };

    // Create .LIC file
    const licFile = createLicFile(licenseData, encryptionKey);

    return {
      success: true,
      licFile,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate .LIC file',
    };
  }
}

/**
 * Validate .LIC file for current machine
 * Checks if .LIC file is valid and bound to current Machine ID
 */
export function validateLicFileForMachine(
  licFileBuffer: Buffer,
  currentMachineId: string,
  encryptionKey: Buffer
): LicFileValidationResult {
  try {
    // Validate encryption key
    if (!encryptionKey || encryptionKey.length !== 32) {
      return {
        valid: false,
        machineMatch: false,
        notExpired: false,
        error: 'Invalid encryption key',
      };
    }

    // Parse .LIC file
    const parseResult = parseLicFile(licFileBuffer, encryptionKey);

    if (!parseResult.data) {
      return {
        valid: false,
        machineMatch: false,
        notExpired: false,
        error: parseResult.error || 'Failed to parse .LIC file',
      };
    }

    const licenseData = parseResult.data;

    // Verify Machine ID hash matches
    const machineMatch = verifyMachineIdHash(currentMachineId, licenseData.machineIdHash);

    if (!machineMatch) {
      return {
        valid: false,
        machineMatch: false,
        notExpired: !isExpired(licenseData.expiresAt),
        error: 'License is bound to a different Machine ID',
      };
    }

    // Check expiration
    const notExpired = !isExpired(licenseData.expiresAt);

    if (!notExpired) {
      return {
        valid: false,
        machineMatch: true,
        notExpired: false,
        data: licenseData,
        error: 'License has expired',
      };
    }

    return {
      valid: true,
      machineMatch: true,
      notExpired: true,
      data: licenseData,
    };
  } catch (error) {
    return {
      valid: false,
      machineMatch: false,
      notExpired: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Extract license data from .LIC file without validation
 * Useful for displaying license info before activation
 */
export function extractLicenseData(
  licFileBuffer: Buffer,
  encryptionKey: Buffer
): { data: LicenseData | null; error?: string } {
  try {
    const parseResult = parseLicFile(licFileBuffer, encryptionKey);
    return parseResult;
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Failed to extract license data',
    };
  }
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
 * Check if license is expiring soon
 */
export function isExpiringsSoon(expiresAt: Date, daysThreshold: number = 30): boolean {
  const remainingDays = getRemainingDays(expiresAt);
  return remainingDays > 0 && remainingDays <= daysThreshold;
}

/**
 * Get license status summary
 */
export function getLicenseStatus(licenseData: LicenseData): {
  status: 'active' | 'expiring_soon' | 'expired';
  remainingDays: number;
  message: string;
} {
  const remainingDays = getRemainingDays(licenseData.expiresAt);

  if (remainingDays === 0) {
    return {
      status: 'expired',
      remainingDays: 0,
      message: 'License has expired',
    };
  }

  if (remainingDays <= 30) {
    return {
      status: 'expiring_soon',
      remainingDays,
      message: `License expires in ${remainingDays} day${remainingDays !== 1 ? 's' : ''}`,
    };
  }

  return {
    status: 'active',
    remainingDays,
    message: `License is active (${remainingDays} days remaining)`,
  };
}

/**
 * Regenerate .LIC file with updated Machine IDs
 * Preserves all non-machine data (license key, customer ID, expiration, modules, etc.)
 * Used when authorized Machine IDs are modified (added or removed)
 */
export interface LicFileRegenerationRequest {
  licenseKey: string;
  customerId: string;
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  authorizedMachines: AuthorizedMachine[];
  expiresAt: Date;
  modules: string[];
  maxPrescriptions?: number;
  createdAt: Date;
}

export function regenerateLicFile(
  request: LicFileRegenerationRequest,
  encryptionKey: Buffer
): LicFileGenerationResult {
  const startTime = performance.now();
  
  // Log regeneration start
  console.log('[LIC Regeneration] Starting regeneration', {
    licenseKey: request.licenseKey,
    licenseType: request.licenseType,
    maxMachines: request.maxMachines,
    authorizedMachineCount: request.authorizedMachines.length,
    timestamp: new Date().toISOString(),
  });
  
  try {
    // Validate encryption key
    if (!encryptionKey || encryptionKey.length !== 32) {
      console.error('[LIC Regeneration] Failed - Invalid encryption key', {
        licenseKey: request.licenseKey,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: 'Invalid encryption key (must be 32 bytes)',
      };
    }

    // Validate request data
    if (!request.licenseKey || !request.customerId) {
      console.error('[LIC Regeneration] Failed - Missing required fields', {
        licenseKey: request.licenseKey,
        customerId: request.customerId,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: 'Missing required fields: licenseKey, customerId',
      };
    }

    if (!Array.isArray(request.modules) || request.modules.length === 0) {
      console.error('[LIC Regeneration] Failed - Invalid modules', {
        licenseKey: request.licenseKey,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: 'At least one module must be specified',
      };
    }

    if (!Array.isArray(request.authorizedMachines) || request.authorizedMachines.length === 0) {
      console.error('[LIC Regeneration] Failed - No authorized machines', {
        licenseKey: request.licenseKey,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: 'At least one authorized machine must be specified',
      };
    }

    // Validate license type and machine count consistency
    if (request.licenseType === 'single-pc' && request.maxMachines !== 1) {
      console.error('[LIC Regeneration] Failed - Invalid single-PC configuration', {
        licenseKey: request.licenseKey,
        maxMachines: request.maxMachines,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: 'Single-PC license must have maxMachines = 1',
      };
    }

    if (request.licenseType === 'multi-pc' && request.maxMachines < 2) {
      console.error('[LIC Regeneration] Failed - Invalid multi-PC configuration', {
        licenseKey: request.licenseKey,
        maxMachines: request.maxMachines,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: 'Multi-PC license must have maxMachines >= 2',
      };
    }

    if (request.authorizedMachines.length > request.maxMachines) {
      console.error('[LIC Regeneration] Failed - Too many authorized machines', {
        licenseKey: request.licenseKey,
        authorizedCount: request.authorizedMachines.length,
        maxMachines: request.maxMachines,
        timestamp: new Date().toISOString(),
      });
      return {
        success: false,
        error: `Number of authorized machines (${request.authorizedMachines.length}) exceeds maxMachines (${request.maxMachines})`,
      };
    }

    // Create license data v2.0
    const licenseData: LicenseDataV2 = {
      licenseKey: request.licenseKey,
      customerId: request.customerId,
      licenseType: request.licenseType,
      maxMachines: request.maxMachines,
      authorizedMachines: request.authorizedMachines,
      expiresAt: request.expiresAt,
      modules: request.modules,
      maxPrescriptions: request.maxPrescriptions,
      createdAt: request.createdAt,
      formatVersion: '2.0',
    };

    // Create .LIC file using v2.0 format
    const licFile = createLicFileV2(licenseData, encryptionKey);

    // Validate performance requirement (must complete within 1 second)
    const endTime = performance.now();
    const durationMs = endTime - startTime;
    
    if (durationMs > 1000) {
      console.warn('[LIC Regeneration] Performance warning - Exceeded 1 second', {
        licenseKey: request.licenseKey,
        durationMs: durationMs.toFixed(2),
        timestamp: new Date().toISOString(),
      });
    }

    // Log successful regeneration
    console.log('[LIC Regeneration] Completed successfully', {
      licenseKey: request.licenseKey,
      licenseType: request.licenseType,
      authorizedMachineCount: request.authorizedMachines.length,
      durationMs: durationMs.toFixed(2),
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      licFile,
    };
  } catch (error) {
    const endTime = performance.now();
    const durationMs = endTime - startTime;
    
    console.error('[LIC Regeneration] Failed with exception', {
      licenseKey: request.licenseKey,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: durationMs.toFixed(2),
      timestamp: new Date().toISOString(),
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate .LIC file',
    };
  }
}
