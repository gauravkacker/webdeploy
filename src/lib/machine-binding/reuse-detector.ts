/**
 * License Reuse Detector
 * Detects and prevents .LIC file usage on different machines
 * Logs reuse attempts and notifies admins
 */

import { parseLicFile, LicenseData } from './lic-file';
import { getMachineIdHash, verifyMachineIdHash } from './machine-id-generator';
import { LocalDatabase } from '../db/database';

export interface ReuseDetectionResult {
  isReuse: boolean;
  machineMatch: boolean;
  originalMachineIdHash: string;
  currentMachineIdHash: string;
  licenseKey: string;
  error?: string;
}

export interface ReuseAttemptLog {
  id: string;
  licenseKey: string;
  originalMachineIdHash: string;
  attemptedMachineId: string;
  attemptedMachineIdHash: string;
  timestamp: Date;
  ipAddress?: string;
  blocked: boolean;
  details?: string;
  // Multi-PC fields
  licenseType?: 'single-pc' | 'multi-pc';
  authorizedMachineIds?: string[];
}

/**
 * Detect if .LIC file is being used on a different machine
 * Returns detection result with machine ID comparison
 */
export function detectReuseAttempt(
  licFileBuffer: Buffer,
  currentMachineId: string,
  encryptionKey: Buffer
): ReuseDetectionResult {
  try {
    // Parse .LIC file to extract license data
    const parseResult = parseLicFile(licFileBuffer, encryptionKey);

    if (!parseResult.data) {
      return {
        isReuse: false,
        machineMatch: false,
        originalMachineIdHash: '',
        currentMachineIdHash: '',
        licenseKey: '',
        error: parseResult.error || 'Failed to parse .LIC file',
      };
    }

    const licenseData = parseResult.data;
    const currentMachineIdHash = getMachineIdHash(currentMachineId);

    // Compare machine ID hashes
    const machineMatch = verifyMachineIdHash(currentMachineId, licenseData.machineIdHash);

    return {
      isReuse: !machineMatch,
      machineMatch,
      originalMachineIdHash: licenseData.machineIdHash,
      currentMachineIdHash,
      licenseKey: licenseData.licenseKey,
    };
  } catch (error) {
    return {
      isReuse: false,
      machineMatch: false,
      originalMachineIdHash: '',
      currentMachineIdHash: '',
      licenseKey: '',
      error: error instanceof Error ? error.message : 'Reuse detection failed',
    };
  }
}

/**
 * Log reuse attempt to database
 * Records all details for audit trail
 * For multi-PC licenses, includes the full authorized machines list
 */
export function logReuseAttempt(
  licenseKey: string,
  originalMachineIdHash: string,
  attemptedMachineId: string,
  ipAddress?: string,
  details?: string,
  licenseType?: 'single-pc' | 'multi-pc',
  authorizedMachineIds?: string[]
): ReuseAttemptLog {
  const db = LocalDatabase.getInstance();
  const attemptedMachineIdHash = getMachineIdHash(attemptedMachineId);

  const log: ReuseAttemptLog = {
    id: generateLogId(),
    licenseKey,
    originalMachineIdHash,
    attemptedMachineId,
    attemptedMachineIdHash,
    timestamp: new Date(),
    ipAddress,
    blocked: true,
    details,
    licenseType,
    authorizedMachineIds,
  };

  // Store in database
  db.create('licenseReuseAttempts', log);

  return log;
}

/**
 * Get all reuse attempts for a specific license
 */
export function getReuseAttempts(licenseKey: string): ReuseAttemptLog[] {
  const db = LocalDatabase.getInstance();
  const allAttempts = db.getAll('licenseReuseAttempts') as ReuseAttemptLog[];

  return allAttempts.filter((attempt) => attempt.licenseKey === licenseKey);
}

/**
 * Get all reuse attempts (admin view)
 */
export function getAllReuseAttempts(): ReuseAttemptLog[] {
  const db = LocalDatabase.getInstance();
  return db.getAll('licenseReuseAttempts') as ReuseAttemptLog[];
}

/**
 * Block activation when reuse is detected
 * Returns error message for user
 */
export function blockActivationOnReuse(
  licenseKey: string,
  currentMachineId: string,
  originalMachineIdHash: string
): {
  blocked: boolean;
  message: string;
  userGuidance: string;
} {
  // Log the reuse attempt
  logReuseAttempt(
    licenseKey,
    originalMachineIdHash,
    currentMachineId,
    undefined,
    'Activation blocked due to machine ID mismatch'
  );

  return {
    blocked: true,
    message: 'License Reuse Detected',
    userGuidance:
      'This license is already bound to a different computer. ' +
      'If you are upgrading your PC or reinstalling your OS, please contact your administrator ' +
      'to generate a new license file for this machine. ' +
      'Your Machine ID: ' + currentMachineId,
  };
}

/**
 * Log multi-PC unauthorized attempt
 * Records unauthorized Machine ID with full authorized list for context
 */
export function logMultiPCUnauthorizedAttempt(
  licenseKey: string,
  attemptedMachineId: string,
  authorizedMachineIds: string[],
  licenseType: 'single-pc' | 'multi-pc',
  ipAddress?: string
): ReuseAttemptLog {
  const details = licenseType === 'multi-pc'
    ? `Multi-PC license unauthorized attempt. Authorized machines: ${authorizedMachineIds.length}`
    : 'Single-PC license reuse attempt';

  return logReuseAttempt(
    licenseKey,
    '', // No single original hash for multi-PC
    attemptedMachineId,
    ipAddress,
    details,
    licenseType,
    authorizedMachineIds
  );
}

/**
 * Block activation for multi-PC unauthorized machine
 * Returns error message with context about authorized machines
 */
export function blockMultiPCUnauthorizedActivation(
  licenseKey: string,
  currentMachineId: string,
  authorizedMachineIds: string[],
  licenseType: 'single-pc' | 'multi-pc',
  maxMachines: number
): {
  blocked: boolean;
  message: string;
  userGuidance: string;
  errorCode: string;
} {
  // Log the unauthorized attempt
  logMultiPCUnauthorizedAttempt(
    licenseKey,
    currentMachineId,
    authorizedMachineIds,
    licenseType
  );

  const guidance = licenseType === 'multi-pc'
    ? `This multi-PC license is authorized for ${maxMachines} machines, but your PC is not in the authorized list. ` +
      `Please contact your administrator to add this Machine ID to your license.\n\n` +
      `Your Machine ID: ${currentMachineId}\n` +
      `Authorized machines: ${authorizedMachineIds.length}/${maxMachines}`
    : `This license is already bound to a different computer. ` +
      `If you are upgrading your PC or reinstalling your OS, please contact your administrator ` +
      `to generate a new license file for this machine.\n\n` +
      `Your Machine ID: ${currentMachineId}`;

  return {
    blocked: true,
    message: 'Machine Not Authorized',
    userGuidance: guidance,
    errorCode: 'MACHINE_NOT_AUTHORIZED',
  };
}

/**
 * Check if license has any reuse attempts
 */
export function hasReuseAttempts(licenseKey: string): boolean {
  const attempts = getReuseAttempts(licenseKey);
  return attempts.length > 0;
}

/**
 * Get reuse attempt statistics
 */
export function getReuseStatistics(): {
  totalAttempts: number;
  uniqueLicenses: number;
  recentAttempts: number; // Last 7 days
  attemptsByLicense: Record<string, number>;
  singlePCAttempts: number;
  multiPCAttempts: number;
} {
  const allAttempts = getAllReuseAttempts();
  const uniqueLicenses = new Set(allAttempts.map((a) => a.licenseKey));
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentAttempts = allAttempts.filter(
    (a) => new Date(a.timestamp) >= sevenDaysAgo
  );

  const attemptsByLicense: Record<string, number> = {};
  allAttempts.forEach((attempt) => {
    attemptsByLicense[attempt.licenseKey] = 
      (attemptsByLicense[attempt.licenseKey] || 0) + 1;
  });

  // Count single-PC vs multi-PC attempts
  const singlePCAttempts = allAttempts.filter(
    (a) => !a.licenseType || a.licenseType === 'single-pc'
  ).length;
  
  const multiPCAttempts = allAttempts.filter(
    (a) => a.licenseType === 'multi-pc'
  ).length;

  return {
    totalAttempts: allAttempts.length,
    uniqueLicenses: uniqueLicenses.size,
    recentAttempts: recentAttempts.length,
    attemptsByLicense,
    singlePCAttempts,
    multiPCAttempts,
  };
}

/**
 * Check if a Machine ID can be added to a license
 * Used for "Add to License" quick action
 */
export function canAddMachineToLicense(
  authorizedMachineIds: string[],
  maxMachines: number
): {
  canAdd: boolean;
  reason?: string;
  remainingSlots: number;
} {
  const remainingSlots = maxMachines - authorizedMachineIds.length;
  
  if (remainingSlots <= 0) {
    return {
      canAdd: false,
      reason: 'PC limit reached',
      remainingSlots: 0,
    };
  }

  return {
    canAdd: true,
    remainingSlots,
  };
}

/**
 * Notify admin of reuse attempt
 * Returns notification details
 */
export function notifyAdminOfReuse(
  licenseKey: string,
  attemptLog: ReuseAttemptLog
): {
  notified: boolean;
  notification: {
    title: string;
    message: string;
    severity: 'warning' | 'error';
    timestamp: Date;
    details: Record<string, string>;
  };
} {
  const notification = {
    title: 'License Reuse Attempt Detected',
    message: `License ${licenseKey} was attempted to be used on a different machine.`,
    severity: 'warning' as const,
    timestamp: new Date(),
    details: {
      licenseKey,
      originalMachineIdHash: attemptLog.originalMachineIdHash,
      attemptedMachineIdHash: attemptLog.attemptedMachineIdHash,
      timestamp: attemptLog.timestamp.toISOString(),
      ipAddress: attemptLog.ipAddress || 'Unknown',
    },
  };

  // Store notification in database
  const db = LocalDatabase.getInstance();
  db.create('adminNotifications', {
    id: generateLogId(),
    ...notification,
    read: false,
    createdAt: new Date(),
  });

  return {
    notified: true,
    notification,
  };
}

/**
 * Get unread admin notifications
 */
export function getUnreadNotifications(): Array<{
  id: string;
  title: string;
  message: string;
  severity: string;
  timestamp: Date;
  details: Record<string, string>;
  read: boolean;
}> {
  const db = LocalDatabase.getInstance();
  const allNotifications = db.getAll('adminNotifications') as Array<{
    id: string;
    title: string;
    message: string;
    severity: string;
    timestamp: Date;
    details: Record<string, string>;
    read: boolean;
  }>;

  return allNotifications.filter((n) => !n.read);
}

/**
 * Mark notification as read
 */
export function markNotificationAsRead(notificationId: string): boolean {
  const db = LocalDatabase.getInstance();
  const notification = db.getById('adminNotifications', notificationId);

  if (!notification) {
    return false;
  }

  db.update('adminNotifications', notificationId, {
    ...notification,
    read: true,
  });

  return true;
}

/**
 * Generate unique log ID
 */
function generateLogId(): string {
  return `reuse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
