/**
 * License Renewal
 * Handles license renewal with remaining days preservation
 * 
 * NOTE: This module uses the dual-mode database abstraction (db)
 * which automatically handles both web mode (localStorage) and 
 * Electron mode (SQLite) without any mode-specific code.
 */

import { db } from '@/lib/db/database';
import { generateLicFile } from './lic-file-manager';
import { calculateRenewalExpiration } from './license-binding';
import { getMachineIdHash } from './machine-id-generator';
import { calculateRemainingDays } from './remaining-days-calculator';

export interface RenewalRequest {
  licenseKey: string;
  machineId: string;
  renewalDays: number;
  adminId: string;
}

export interface RenewalResult {
  success: boolean;
  message: string;
  renewalLicFile?: Buffer;
  newExpiresAt?: Date;
  remainingDays?: number;
  totalDays?: number;
}

export interface RenewalInfo {
  licenseKey: string;
  machineId: string;
  currentExpiresAt: Date;
  remainingDays: number;
  modules: string[];
  customerId: string;
}

/**
 * Get current license information for renewal
 */
export async function getRenewalInfo(
  machineId: string
): Promise<{ success: boolean; info?: RenewalInfo; error?: string }> {
  try {
    // Use db abstraction - works in both web and Electron modes
    const licenses = db.getAll<any>('licenses') || [];
    const license = licenses.find((l: any) => l.machineId === machineId && l.status === 'active');

    if (!license) {
      return {
        success: false,
        error: 'No active license found for this Machine ID',
      };
    }

    const expiresAt = new Date(license.expiresAt);
    const remainingDays = calculateRemainingDays(expiresAt);

    return {
      success: true,
      info: {
        licenseKey: license.licenseKey,
        machineId: license.machineId,
        currentExpiresAt: expiresAt,
        remainingDays,
        modules: license.modules || [],
        customerId: license.customerId,
      },
    };
  } catch (error) {
    console.error('Error getting renewal info:', error);
    return {
      success: false,
      error: 'Failed to retrieve license information',
    };
  }
}

/**
 * Calculate new expiration date with remaining days
 */
export function calculateRenewalExpirationDate(
  oldExpiresAt: Date,
  renewalDays: number
): Date {
  return calculateRenewalExpiration(oldExpiresAt, renewalDays);
}

/**
 * Validate renewal request
 */
export async function validateRenewalRequest(
  machineId: string,
  licenseKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check if license exists and matches machine ID
    const licenses = db.getAll<any>('licenses') || [];
    const license = licenses.find((l: any) => l.licenseKey === licenseKey);

    if (!license) {
      return {
        valid: false,
        error: 'License not found',
      };
    }

    if (license.machineId !== machineId) {
      return {
        valid: false,
        error: 'License is not bound to this Machine ID',
      };
    }

    if (license.status !== 'active') {
      return {
        valid: false,
        error: 'License is not active',
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Error validating renewal request:', error);
    return {
      valid: false,
      error: 'Failed to validate renewal request',
    };
  }
}

/**
 * Generate renewal .LIC file
 * Creates a new .LIC file with extended expiration date
 */
export async function generateRenewalLicFile(
  machineId: string,
  licenseKey: string,
  renewalDays: number
): Promise<RenewalResult> {
  try {
    // Validate renewal request
    const validation = await validateRenewalRequest(machineId, licenseKey);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || 'Invalid renewal request',
      };
    }

    // Get current license info
    const infoResult = await getRenewalInfo(machineId);
    if (!infoResult.success || !infoResult.info) {
      return {
        success: false,
        message: infoResult.error || 'Failed to get license information',
      };
    }

    const info = infoResult.info;

    // Calculate new expiration date with remaining days
    const newExpiresAt = calculateRenewalExpirationDate(
      info.currentExpiresAt,
      renewalDays
    );

    const totalDays = info.remainingDays + renewalDays;

    // Generate machine ID hash
    const machineIdHash = getMachineIdHash(machineId);

    // Generate new .LIC file
    const licFileResult = generateLicFile(
      {
        licenseKey,
        customerId: info.customerId,
        machineId,
        machineIdHash,
        expiresAt: newExpiresAt,
        modules: info.modules,
      },
      Buffer.from(process.env.LICENSE_ENCRYPTION_KEY || '', 'hex')
    );

    if (!licFileResult.success || !licFileResult.licFile) {
      return {
        success: false,
        message: 'Failed to generate renewal .LIC file',
      };
    }

    return {
      success: true,
      message: 'Renewal .LIC file generated successfully',
      renewalLicFile: licFileResult.licFile,
      newExpiresAt,
      remainingDays: info.remainingDays,
      totalDays,
    };
  } catch (error) {
    console.error('Error generating renewal .LIC file:', error);
    return {
      success: false,
      message: 'Error generating renewal .LIC file',
    };
  }
}

/**
 * Invalidate old .LIC file
 */
export async function invalidateOldLicense(
  licenseKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const licenses = db.getAll<any>('licenses') || [];
    const license = licenses.find((l: any) => l.licenseKey === licenseKey);

    if (!license) {
      return {
        success: false,
        error: 'License not found',
      };
    }

    // Update license status to 'renewed'
    db.update('licenses', license.id, {
      status: 'renewed',
      updatedAt: new Date(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error invalidating old license:', error);
    return {
      success: false,
      error: 'Failed to invalidate old license',
    };
  }
}

/**
 * Process renewal and update database
 */
export async function processRenewal(
  machineId: string,
  renewalLicFile: Buffer
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    // Get license info from renewal file
    const infoResult = await getRenewalInfo(machineId);
    if (!infoResult.success || !infoResult.info) {
      return {
        success: false,
        message: 'Failed to get license information',
        error: infoResult.error,
      };
    }

    const info = infoResult.info;

    // Invalidate old license
    const invalidationResult = await invalidateOldLicense(info.licenseKey);
    if (!invalidationResult.success) {
      return {
        success: false,
        message: 'Failed to invalidate old license',
        error: invalidationResult.error,
      };
    }

    // Create renewal audit log
    const licenses = db.getAll<any>('licenses') || [];
    const license = licenses.find((l: any) => l.licenseKey === info.licenseKey);
    
    if (license) {
      db.create('license_audit_log', {
        licenseId: license.id,
        customerId: info.customerId,
        action: 'RENEWAL',
        details: JSON.stringify({
          machineId,
          remainingDaysPreserved: info.remainingDays,
          renewedAt: new Date().toISOString(),
        }),
        performedBy: info.customerId,
      });
    }

    return {
      success: true,
      message: 'License renewal processed successfully',
    };
  } catch (error) {
    console.error('Error processing renewal:', error);
    return {
      success: false,
      message: 'Error processing renewal',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Complete renewal workflow
 */
export async function completeRenewalWorkflow(
  request: RenewalRequest
): Promise<RenewalResult> {
  try {
    // Generate renewal .LIC file
    const renewalResult = await generateRenewalLicFile(
      request.machineId,
      request.licenseKey,
      request.renewalDays
    );

    if (!renewalResult.success) {
      return renewalResult;
    }

    // Update license expiration in database
    const licenses = db.getAll<any>('licenses') || [];
    const license = licenses.find((l: any) => l.licenseKey === request.licenseKey);
    
    if (license) {
      db.update('licenses', license.id, {
        expiresAt: renewalResult.newExpiresAt,
        status: 'active',
        updatedAt: new Date(),
      });

      // Create renewal audit log
      db.create('license_audit_log', {
        licenseId: license.id,
        customerId: license.customerId,
        action: 'RENEWAL',
        details: JSON.stringify({
          machineId: request.machineId,
          renewalDays: request.renewalDays,
          remainingDaysPreserved: renewalResult.remainingDays,
          totalDays: renewalResult.totalDays,
          newExpiresAt: renewalResult.newExpiresAt,
        }),
        performedBy: request.adminId,
      });
    }

    return {
      success: true,
      message: 'License renewal completed successfully',
      renewalLicFile: renewalResult.renewalLicFile,
      newExpiresAt: renewalResult.newExpiresAt,
      remainingDays: renewalResult.remainingDays,
      totalDays: renewalResult.totalDays,
    };
  } catch (error) {
    console.error('Error completing renewal workflow:', error);
    return {
      success: false,
      message: 'Error completing renewal workflow',
    };
  }
}
