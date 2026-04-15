/**
 * Multi-PC License Manager
 * Core service for managing multi-PC licenses
 */

import { Database } from '../db/database';
import type { License, AuthorizedMachine, MachineHistoryEntry } from '../db/schema';
import { getMachineIdHash } from './machine-id-generator';

export interface MultiPCLicenseConfig {
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  authorizedMachines: AuthorizedMachine[];
}

export interface MachineAdditionRequest {
  licenseId: string;
  machineId: string;
  adminUserId: string;
}

export interface MachineAdditionResult {
  success: boolean;
  machineId?: string;
  error?: string;
  errorCode?: 'PC_LIMIT_EXCEEDED' | 'MACHINE_ID_ALREADY_EXISTS' | 'INVALID_FORMAT' | 'LICENSE_NOT_FOUND';
}

export interface MachineRemovalRequest {
  licenseId: string;
  machineId: string;
  adminUserId: string;
}

export interface MachineRemovalResult {
  success: boolean;
  machineId?: string;
  error?: string;
  errorCode?: 'MACHINE_NOT_FOUND' | 'LAST_MACHINE_CANNOT_REMOVE' | 'LICENSE_NOT_FOUND';
}

export interface LicenseUpgradeRequest {
  licenseId: string;
  newMaxMachines: number;
  adminUserId: string;
}

export interface LicenseUpgradeResult {
  success: boolean;
  oldType?: 'single-pc';
  newType?: 'multi-pc';
  newMaxMachines?: number;
  error?: string;
  errorCode?: 'INVALID_PC_LIMIT' | 'ALREADY_MULTI_PC' | 'LICENSE_NOT_FOUND';
}

export interface MultiPCLicenseDetails {
  licenseId: string;
  licenseKey: string;
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  authorizedMachines: AuthorizedMachine[];
  remainingSlots: number;
  customer: {
    id: string;
    name: string;
    email: string;
  };
  expiresAt?: Date;
  status: string;
}

/**
 * Multi-PC License Manager Class
 */
export class MultiPCLicenseManager {
  constructor(private db: Database) {}

  /**
   * Add a Machine ID to a license
   * Validates PC limit and uniqueness
   */
  async addMachineId(request: MachineAdditionRequest): Promise<MachineAdditionResult> {
    try {
      // Get license
      const license = await this.db.licenses.findOne({ id: request.licenseId });
      if (!license) {
        return {
          success: false,
          error: 'License not found',
          errorCode: 'LICENSE_NOT_FOUND',
        };
      }

      // Validate Machine ID format
      if (!this.validateMachineIdFormat(request.machineId)) {
        return {
          success: false,
          error: 'Invalid Machine ID format',
          errorCode: 'INVALID_FORMAT',
        };
      }

      // Parse authorized machines
      const authorizedMachines: AuthorizedMachine[] = license.authorizedMachines
        ? JSON.parse(license.authorizedMachines)
        : [];

      // Check uniqueness
      if (this.isMachineIdDuplicate(request.machineId, authorizedMachines)) {
        return {
          success: false,
          error: 'Machine ID already exists in authorized list',
          errorCode: 'MACHINE_ID_ALREADY_EXISTS',
        };
      }

      // Check PC limit
      const maxMachines = license.maxMachines || 1;
      if (authorizedMachines.length >= maxMachines) {
        return {
          success: false,
          error: `PC limit reached (${maxMachines}/${maxMachines})`,
          errorCode: 'PC_LIMIT_EXCEEDED',
        };
      }

      // Generate Machine ID hash
      const machineIdHash = getMachineIdHash(request.machineId);

      // Add new machine
      const newMachine: AuthorizedMachine = {
        machineId: request.machineId,
        machineIdHash,
        addedAt: new Date().toISOString(),
        addedBy: request.adminUserId,
      };

      authorizedMachines.push(newMachine);

      // Update machine history
      const machineHistory: MachineHistoryEntry[] = license.machineHistory
        ? JSON.parse(license.machineHistory)
        : [];

      machineHistory.push({
        eventType: 'added',
        machineId: request.machineId,
        timestamp: new Date().toISOString(),
        performedBy: request.adminUserId,
        details: `Added Machine ID to license`,
      });

      // Update license
      await this.db.licenses.update(request.licenseId, {
        authorizedMachines: JSON.stringify(authorizedMachines),
        machineHistory: JSON.stringify(machineHistory),
        updatedAt: new Date(),
      });

      return {
        success: true,
        machineId: request.machineId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add Machine ID',
      };
    }
  }

  /**
   * Remove a Machine ID from a license
   * Validates at least one machine remains for multi-PC licenses
   */
  async removeMachineId(request: MachineRemovalRequest): Promise<MachineRemovalResult> {
    try {
      // Get license
      const license = await this.db.licenses.findOne({ id: request.licenseId });
      if (!license) {
        return {
          success: false,
          error: 'License not found',
          errorCode: 'LICENSE_NOT_FOUND',
        };
      }

      // Parse authorized machines
      const authorizedMachines: AuthorizedMachine[] = license.authorizedMachines
        ? JSON.parse(license.authorizedMachines)
        : [];

      // Find machine
      const machineIndex = authorizedMachines.findIndex((m) => m.machineId === request.machineId);
      if (machineIndex === -1) {
        return {
          success: false,
          error: 'Machine ID not found in authorized list',
          errorCode: 'MACHINE_NOT_FOUND',
        };
      }

      // Check if this is the last machine in a multi-PC license
      const licenseType = license.licenseType || 'single-pc';
      if (licenseType === 'multi-pc' && authorizedMachines.length === 1) {
        return {
          success: false,
          error: 'Cannot remove the last Machine ID from a multi-PC license',
          errorCode: 'LAST_MACHINE_CANNOT_REMOVE',
        };
      }

      // Remove machine
      authorizedMachines.splice(machineIndex, 1);

      // Update machine history
      const machineHistory: MachineHistoryEntry[] = license.machineHistory
        ? JSON.parse(license.machineHistory)
        : [];

      machineHistory.push({
        eventType: 'removed',
        machineId: request.machineId,
        timestamp: new Date().toISOString(),
        performedBy: request.adminUserId,
        details: `Removed Machine ID from license`,
      });

      // Update license
      await this.db.licenses.update(request.licenseId, {
        authorizedMachines: JSON.stringify(authorizedMachines),
        machineHistory: JSON.stringify(machineHistory),
        updatedAt: new Date(),
      });

      return {
        success: true,
        machineId: request.machineId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove Machine ID',
      };
    }
  }

  /**
   * Upgrade a single-PC license to multi-PC
   * Preserves existing Machine ID
   */
  async upgradeLicense(request: LicenseUpgradeRequest): Promise<LicenseUpgradeResult> {
    try {
      // Get license
      const license = await this.db.licenses.findOne({ id: request.licenseId });
      if (!license) {
        return {
          success: false,
          error: 'License not found',
          errorCode: 'LICENSE_NOT_FOUND',
        };
      }

      // Check if already multi-PC
      const currentType = license.licenseType || 'single-pc';
      if (currentType === 'multi-pc') {
        return {
          success: false,
          error: 'License is already multi-PC',
          errorCode: 'ALREADY_MULTI_PC',
        };
      }

      // Validate new PC limit
      if (request.newMaxMachines < 2 || request.newMaxMachines > 100) {
        return {
          success: false,
          error: 'PC limit must be between 2 and 100 for multi-PC licenses',
          errorCode: 'INVALID_PC_LIMIT',
        };
      }

      // Update machine history
      const machineHistory: MachineHistoryEntry[] = license.machineHistory
        ? JSON.parse(license.machineHistory)
        : [];

      machineHistory.push({
        eventType: 'upgraded',
        timestamp: new Date().toISOString(),
        performedBy: request.adminUserId,
        details: `Upgraded from single-PC to multi-PC`,
        oldMaxMachines: 1,
        newMaxMachines: request.newMaxMachines,
      });

      // Update license
      await this.db.licenses.update(request.licenseId, {
        licenseType: 'multi-pc',
        maxMachines: request.newMaxMachines,
        machineHistory: JSON.stringify(machineHistory),
        updatedAt: new Date(),
      });

      return {
        success: true,
        oldType: 'single-pc',
        newType: 'multi-pc',
        newMaxMachines: request.newMaxMachines,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upgrade license',
      };
    }
  }

  /**
   * Get detailed license information
   */
  async getLicenseDetails(licenseId: string): Promise<MultiPCLicenseDetails | null> {
    try {
      const license = await this.db.licenses.findOne({ id: licenseId });
      if (!license) {
        return null;
      }

      const customer = await this.db.customers.findOne({ id: license.customerId });
      if (!customer) {
        return null;
      }

      const authorizedMachines: AuthorizedMachine[] = license.authorizedMachines
        ? JSON.parse(license.authorizedMachines)
        : [];

      const licenseType = license.licenseType || 'single-pc';
      const maxMachines = license.maxMachines || 1;
      const remainingSlots = maxMachines - authorizedMachines.length;

      return {
        licenseId: license.id,
        licenseKey: license.licenseKey,
        licenseType,
        maxMachines,
        authorizedMachines,
        remainingSlots,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
        },
        expiresAt: license.expiresAt,
        status: license.status,
      };
    } catch (error) {
      console.error('Failed to get license details:', error);
      return null;
    }
  }

  /**
   * Validate PC limit constraints
   */
  validatePCLimit(authorizedMachines: AuthorizedMachine[], maxMachines: number): {
    valid: boolean;
    error?: string;
  } {
    if (authorizedMachines.length > maxMachines) {
      return {
        valid: false,
        error: `Authorized machines count (${authorizedMachines.length}) exceeds PC limit (${maxMachines})`,
      };
    }

    if (maxMachines < 1 || maxMachines > 100) {
      return {
        valid: false,
        error: `PC limit must be between 1 and 100 (got ${maxMachines})`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate Machine ID uniqueness
   */
  validateMachineIdUniqueness(
    machineId: string,
    authorizedMachines: AuthorizedMachine[]
  ): { valid: boolean; error?: string } {
    if (this.isMachineIdDuplicate(machineId, authorizedMachines)) {
      return {
        valid: false,
        error: 'Machine ID already exists in authorized list',
      };
    }

    return { valid: true };
  }

  /**
   * Check if Machine ID is duplicate (case-sensitive)
   */
  private isMachineIdDuplicate(machineId: string, authorizedMachines: AuthorizedMachine[]): boolean {
    return authorizedMachines.some((m) => m.machineId === machineId);
  }

  /**
   * Validate Machine ID format
   * Expected format: MACHINE-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
   */
  private validateMachineIdFormat(machineId: string): boolean {
    const machineIdRegex = /^MACHINE-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/;
    return machineIdRegex.test(machineId);
  }
}

/**
 * Create a Multi-PC License Manager instance
 */
export function createMultiPCLicenseManager(db: Database): MultiPCLicenseManager {
  return new MultiPCLicenseManager(db);
}
