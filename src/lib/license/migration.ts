/**
 * Migration utilities for password-based license activation
 * Handles schema updates and data initialization for existing licenses
 */

import { db } from '@/lib/db/database';
import type { License } from '@/lib/db/schema';

/**
 * Migrate existing licenses to support password-based activation
 * Initializes new fields: activatedMachines, machineCount, passwordHash, passwordGeneratedAt
 * Safe to run multiple times (idempotent)
 */
export function migrateExistingLicenses(): { success: boolean; migratedCount: number; error?: string } {
  try {
    console.log('[Migration] Starting license migration for password-based activation...');
    
    const licenses = db.getAll<License>('licenses');
    let migratedCount = 0;

    licenses.forEach((license) => {
      try {
        // Check if already migrated
        if (license.activatedMachines !== undefined && license.machineCount !== undefined) {
          console.log(`[Migration] License ${license.id} already migrated, skipping`);
          return;
        }

        // Initialize new fields
        const updates: Record<string, unknown> = {
          activatedMachines: JSON.stringify([]), // Empty array initially
          machineCount: 0,
          passwordHash: undefined, // Will be set when password is generated
          passwordGeneratedAt: undefined, // Will be set when password is generated
        };

        // If license has old machineId binding, add it to activatedMachines
        if (license.machineId) {
          const activatedMachines = [license.machineId];
          updates.activatedMachines = JSON.stringify(activatedMachines);
          updates.machineCount = 1;
          console.log(`[Migration] License ${license.id} has existing machine binding, preserving it`);
        }

        db.update('licenses', license.id, updates);
        migratedCount++;
        console.log(`[Migration] Migrated license ${license.id}`);
      } catch (error) {
        console.error(`[Migration] Error migrating license ${license.id}:`, error);
      }
    });

    console.log(`[Migration] Migration complete. Migrated ${migratedCount} licenses`);
    return { success: true, migratedCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Migration] Migration failed:', errorMessage);
    return { success: false, migratedCount: 0, error: errorMessage };
  }
}

/**
 * Check if migration is needed
 * Returns true if any license is missing the new fields
 */
export function isMigrationNeeded(): boolean {
  try {
    const licenses = db.getAll<License>('licenses');
    return licenses.some((license) => license.activatedMachines === undefined || license.machineCount === undefined);
  } catch (error) {
    console.error('[Migration] Error checking migration status:', error);
    return false;
  }
}

/**
 * Get migration status
 * Returns info about which licenses need migration
 */
export function getMigrationStatus(): {
  needed: boolean;
  totalLicenses: number;
  migratedLicenses: number;
  pendingLicenses: number;
} {
  try {
    const licenses = db.getAll<License>('licenses');
    const migratedLicenses = licenses.filter(
      (l) => l.activatedMachines !== undefined && l.machineCount !== undefined
    ).length;
    const pendingLicenses = licenses.length - migratedLicenses;

    return {
      needed: pendingLicenses > 0,
      totalLicenses: licenses.length,
      migratedLicenses,
      pendingLicenses,
    };
  } catch (error) {
    console.error('[Migration] Error getting migration status:', error);
    return {
      needed: false,
      totalLicenses: 0,
      migratedLicenses: 0,
      pendingLicenses: 0,
    };
  }
}
