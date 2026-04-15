/**
 * PC Change Workflow
 * Handles license transfer when moving to a new PC
 * Generates new Machine ID, provides guidance, and manages license transitions
 */

import { generateMachineId, getMachineIdHash } from './machine-id-generator';
import { retrieveLicense, storeLicense, deleteLicense } from './local-license-storage';
import { validateLicFileForMachine } from './lic-file-manager';
import { parseLicFile } from './lic-file';
import { LicenseData } from './lic-file';

export interface PcChangeInitiation {
  oldMachineId: string;
  newMachineId: string;
  timestamp: Date;
  status: 'initiated' | 'completed' | 'failed';
}

export interface PcChangeGuidance {
  title: string;
  description: string;
  steps: string[];
  adminSteps: string[];
  options: Array<{
    title: string;
    description: string;
    action: 'upload-new-lic' | 'contact-admin';
  }>;
}

export interface AdminTransferGuidance {
  title: string;
  description: string;
  steps: string[];
  oldMachineId: string;
  newMachineId: string;
  instructions: string[];
}

export interface PcChangeValidation {
  isValid: boolean;
  reason: string;
  canProceed: boolean;
}

export interface LicenseInvalidation {
  success: boolean;
  oldMachineId: string;
  invalidatedAt: Date;
  reason: string;
}

export interface NewLicenseAcceptance {
  success: boolean;
  newMachineId: string;
  licenseData?: LicenseData;
  error?: string;
}

/**
 * Generate new Machine ID on new PC
 * Returns the new Machine ID and its components
 */
export function generateNewMachineId() {
  try {
    const result = generateMachineId();
    return {
      success: true,
      machineId: result.machineId,
      components: result.components,
      timestamp: result.timestamp,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate new Machine ID',
    };
  }
}

/**
 * Get guidance for user on new PC
 * Provides clear instructions on what to do next
 */
export function getPcChangeGuidance(): PcChangeGuidance {
  return {
    title: 'Moving to a New PC',
    description:
      'Your license needs to be transferred to your new computer. This process involves generating a new license file for your new Machine ID.',
    steps: [
      'Your new Machine ID has been generated and is displayed above',
      'Copy your new Machine ID',
      'Send the new Machine ID to your clinic admin',
      'Admin will generate a new license file (.LIC) for your new Machine ID',
      'Download or receive the new .LIC file from your admin',
      'Upload the new .LIC file using the button below',
      'Your license will be activated on the new PC',
    ],
    adminSteps: [
      'Receive the new Machine ID from the user',
      'Log into the admin panel',
      'Navigate to License Management > Transfer License',
      'Enter the old Machine ID and new Machine ID',
      'Click "Generate New License File"',
      'Download the new .LIC file',
      'Send the .LIC file to the user',
    ],
    options: [
      {
        title: 'Upload New .LIC File',
        description:
          'If you have received the new .LIC file from your admin, upload it here to activate your license on the new PC.',
        action: 'upload-new-lic',
      },
      {
        title: 'Contact Admin',
        description:
          'If you need help with the license transfer process, contact your clinic admin for assistance.',
        action: 'contact-admin',
      },
    ],
  };
}

/**
 * Get guidance for admin to transfer license
 * Provides clear instructions for admin to generate new .LIC file
 */
export function getAdminTransferGuidance(
  oldMachineId: string,
  newMachineId: string
): AdminTransferGuidance {
  return {
    title: 'License Transfer - Admin Instructions',
    description:
      'Follow these steps to transfer the license from the old PC to the new PC. The remaining license days will be preserved.',
    oldMachineId,
    newMachineId,
    steps: [
      'Verify the old Machine ID matches the current license',
      'Verify the new Machine ID is valid and from the user',
      'Generate a new .LIC file for the new Machine ID',
      'Preserve the remaining license days from the old license',
      'Invalidate the old .LIC file',
      'Send the new .LIC file to the user',
      'Confirm the user has successfully activated the license on the new PC',
    ],
    instructions: [
      `Old Machine ID: ${oldMachineId}`,
      `New Machine ID: ${newMachineId}`,
      'Use the admin panel to generate the new .LIC file',
      'The system will automatically calculate remaining days',
      'The old license will be marked as invalid after transfer',
      'Keep records of the transfer for audit purposes',
    ],
  };
}

/**
 * Validate PC change is legitimate
 * Checks if the old and new Machine IDs are valid
 */
export function validatePcChange(
  oldMachineId: string,
  newMachineId: string
): PcChangeValidation {
  try {
    // Validate Machine ID format
    if (!oldMachineId || !oldMachineId.startsWith('MACHINE-')) {
      return {
        isValid: false,
        reason: 'Invalid old Machine ID format',
        canProceed: false,
      };
    }

    if (!newMachineId || !newMachineId.startsWith('MACHINE-')) {
      return {
        isValid: false,
        reason: 'Invalid new Machine ID format',
        canProceed: false,
      };
    }

    // Ensure they are different
    if (oldMachineId === newMachineId) {
      return {
        isValid: false,
        reason: 'Old and new Machine IDs must be different',
        canProceed: false,
      };
    }

    return {
      isValid: true,
      reason: 'PC change validation passed',
      canProceed: true,
    };
  } catch (error) {
    return {
      isValid: false,
      reason: error instanceof Error ? error.message : 'Validation error',
      canProceed: false,
    };
  }
}

/**
 * Invalidate old license after transfer
 * Marks the old license as invalid in local storage
 */
export function invalidateOldLicense(
  oldMachineId: string,
  storageDir?: string
): LicenseInvalidation {
  try {
    // Delete the old license from local storage
    const result = deleteLicense(oldMachineId, storageDir);

    if (!result.success) {
      return {
        success: false,
        oldMachineId,
        invalidatedAt: new Date(),
        reason: result.error || 'Failed to invalidate old license',
      };
    }

    return {
      success: true,
      oldMachineId,
      invalidatedAt: new Date(),
      reason: 'Old license has been invalidated',
    };
  } catch (error) {
    return {
      success: false,
      oldMachineId,
      invalidatedAt: new Date(),
      reason: error instanceof Error ? error.message : 'Failed to invalidate old license',
    };
  }
}

/**
 * Accept new .LIC file on new PC
 * Validates and stores the new license file
 */
export function acceptNewLicenseFile(
  newMachineId: string,
  licFileBuffer: Buffer,
  encryptionKey: Buffer,
  storageDir?: string
): NewLicenseAcceptance {
  try {
    // Parse the .LIC file
    const parseResult = parseLicFile(licFileBuffer, encryptionKey);

    if (!parseResult.data) {
      return {
        success: false,
        newMachineId,
        error: parseResult.error || 'Failed to parse .LIC file',
      };
    }

    const licenseData = parseResult.data;

    // Validate the .LIC file matches the new Machine ID
    const validationResult = validateLicFileForMachine(
      licFileBuffer,
      newMachineId,
      encryptionKey
    );

    if (!validationResult.valid) {
      return {
        success: false,
        newMachineId,
        error: validationResult.error || '.LIC file does not match this Machine ID',
      };
    }

    // Store the new license
    const storageResult = storeLicense(
      licenseData,
      licFileBuffer,
      encryptionKey,
      storageDir
    );

    if (!storageResult.success) {
      return {
        success: false,
        newMachineId,
        error: storageResult.error || 'Failed to store new license',
      };
    }

    return {
      success: true,
      newMachineId,
      licenseData,
    };
  } catch (error) {
    return {
      success: false,
      newMachineId,
      error: error instanceof Error ? error.message : 'Failed to accept new license file',
    };
  }
}

/**
 * Complete PC change workflow
 * Orchestrates the entire PC change process
 */
export function completePcChangeWorkflow(
  oldMachineId: string,
  newMachineId: string,
  newLicFileBuffer: Buffer,
  encryptionKey: Buffer,
  storageDir?: string
): {
  success: boolean;
  message: string;
  oldMachineId?: string;
  newMachineId?: string;
  error?: string;
} {
  try {
    // Validate PC change
    const validation = validatePcChange(oldMachineId, newMachineId);
    if (!validation.canProceed) {
      return {
        success: false,
        message: validation.reason,
        error: validation.reason,
      };
    }

    // Accept new license file
    const licenseAcceptance = acceptNewLicenseFile(
      newMachineId,
      newLicFileBuffer,
      encryptionKey,
      storageDir
    );

    if (!licenseAcceptance.success) {
      return {
        success: false,
        message: 'Failed to accept new license file',
        error: licenseAcceptance.error,
      };
    }

    // Invalidate old license
    const invalidation = invalidateOldLicense(oldMachineId, storageDir);

    if (!invalidation.success) {
      return {
        success: false,
        message: 'Failed to invalidate old license',
        error: invalidation.reason,
      };
    }

    return {
      success: true,
      message: 'PC change workflow completed successfully',
      oldMachineId,
      newMachineId,
    };
  } catch (error) {
    return {
      success: false,
      message: 'PC change workflow failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get remaining license days
 * Calculates days remaining on a license
 */
export function getRemainingLicenseDays(expiresAt: Date): number {
  const now = new Date();
  const diffTime = expiresAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Preserve remaining days in new license
 * Calculates new expiration date based on remaining days
 */
export function preserveRemainingDays(
  oldExpiresAt: Date,
  newCreatedAt: Date
): Date {
  const remainingDays = getRemainingLicenseDays(oldExpiresAt);
  const newExpiresAt = new Date(newCreatedAt);
  newExpiresAt.setDate(newExpiresAt.getDate() + remainingDays);
  return newExpiresAt;
}
