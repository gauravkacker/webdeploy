/**
 * OS Reinstall Detector
 * Detects when OS has been reinstalled by comparing OS hashes
 * Handles OS reinstall scenarios and provides guidance to users
 */

import { generateMachineId } from './machine-id-generator';
import { retrieveLicense } from './local-license-storage';

export interface OsReinstallDetectionResult {
  osReinstallDetected: boolean;
  currentOsHash: string;
  storedOsHash?: string;
  message: string;
}

export interface ReinstallGuidance {
  title: string;
  description: string;
  steps: string[];
  options: Array<{
    title: string;
    description: string;
    action: 'restore-backup' | 'revalidate' | 'contact-admin';
  }>;
}

/**
 * Get current OS hash
 */
export function getCurrentOsHash(): string {
  const result = generateMachineId();
  return result.components.osHash;
}

/**
 * Get stored OS hash from license metadata
 */
export function getStoredOsHash(
  machineId: string,
  encryptionKey: Buffer,
  storageDir?: string
): string | null {
  try {
    const result = retrieveLicense(machineId, encryptionKey, storageDir);

    if (!result.success || !result.license) {
      return null;
    }

    // Get OS hash from license data if available
    const osHash = (result.license.licenseData as any).osHash;
    return osHash || null;
  } catch (error) {
    console.error('Error getting stored OS hash:', error);
    return null;
  }
}

/**
 * Detect OS reinstall by comparing current OS hash with stored OS hash
 */
export function detectOsReinstall(
  machineId: string,
  encryptionKey: Buffer,
  storageDir?: string
): OsReinstallDetectionResult {
  try {
    const currentOsHash = getCurrentOsHash();
    const storedOsHash = getStoredOsHash(machineId, encryptionKey, storageDir);

    // If no stored OS hash, we can't detect reinstall
    if (!storedOsHash) {
      return {
        osReinstallDetected: false,
        currentOsHash,
        message: 'No previous OS hash found. This may be first activation.',
      };
    }

    // Compare OS hashes
    const osReinstallDetected = currentOsHash !== storedOsHash;

    if (osReinstallDetected) {
      return {
        osReinstallDetected: true,
        currentOsHash,
        storedOsHash,
        message: `OS reinstall detected. Previous OS: ${storedOsHash}, Current OS: ${currentOsHash}`,
      };
    }

    return {
      osReinstallDetected: false,
      currentOsHash,
      storedOsHash,
      message: 'OS hash matches. No reinstall detected.',
    };
  } catch (error) {
    console.error('Error detecting OS reinstall:', error);
    return {
      osReinstallDetected: false,
      currentOsHash: getCurrentOsHash(),
      message: `Error detecting OS reinstall: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Handle OS reinstall scenario
 * Returns guidance and next steps for user
 */
export function handleOsReinstall(machineId: string): ReinstallGuidance {
  return {
    title: 'OS Reinstall Detected',
    description:
      'We detected that your operating system has been reinstalled. Your license needs to be revalidated to continue using the software.',
    steps: [
      'Your license file is still valid and can be restored from backup',
      'You can restore your license from a backup file if you have one',
      'Alternatively, you can revalidate your license with the admin',
      'After restoration or revalidation, the software will be fully functional',
    ],
    options: [
      {
        title: 'Restore from Backup',
        description:
          'If you backed up your license file before the OS reinstall, you can restore it now. This is the quickest option.',
        action: 'restore-backup',
      },
      {
        title: 'Revalidate License',
        description:
          'Contact your admin to revalidate your license for the new OS. Your remaining license days will be preserved.',
        action: 'revalidate',
      },
      {
        title: 'Contact Admin',
        description:
          'If you need help with the process, contact your clinic admin for assistance.',
        action: 'contact-admin',
      },
    ],
  };
}

/**
 * Get user guidance for OS reinstall
 */
export function getReinstallGuidance(): ReinstallGuidance {
  return handleOsReinstall('');
}

/**
 * Validate OS reinstall recovery
 * Checks if license can be recovered after OS reinstall
 */
export function validateOsReinstallRecovery(
  machineId: string,
  encryptionKey: Buffer,
  storageDir?: string
): {
  canRecover: boolean;
  reason: string;
} {
  try {
    const result = retrieveLicense(machineId, encryptionKey, storageDir);

    if (!result.success || !result.license) {
      return {
        canRecover: false,
        reason: 'No license found in local storage. Backup may be needed.',
      };
    }

    // Check if license is still valid
    const expiresAt = result.license.licenseData.expiresAt;
    const now = new Date();

    if (expiresAt < now) {
      return {
        canRecover: false,
        reason: 'License has expired. Please renew your license.',
      };
    }

    return {
      canRecover: true,
      reason: 'License can be recovered. Restore from backup to continue.',
    };
  } catch (error) {
    console.error('Error validating OS reinstall recovery:', error);
    return {
      canRecover: false,
      reason: `Error validating recovery: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
