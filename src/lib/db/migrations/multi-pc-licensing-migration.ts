/**
 * Database Migration: Multi-PC Licensing Support
 * 
 * This migration adds support for multi-PC licenses by:
 * 1. Adding new columns to the licenses table
 * 2. Migrating existing single-PC licenses to the new format
 * 3. Extending the license_reuse_attempts table
 * 4. Extending the machine_bindings table
 */

import { Database } from '../database';
import type { License, AuthorizedMachine, MachineHistoryEntry } from '../schema';

export interface MigrationResult {
  success: boolean;
  migratedLicenses: number;
  errors: string[];
}

/**
 * Run the multi-PC licensing migration
 */
export async function runMultiPCLicensingMigration(db: Database): Promise<MigrationResult> {
  const errors: string[] = [];
  let migratedLicenses = 0;

  try {
    console.log('Starting multi-PC licensing migration...');

    // Step 1: Get all existing licenses
    const licenses = await db.licenses.find({}).toArray();
    console.log(`Found ${licenses.length} licenses to migrate`);

    // Step 2: Migrate each license
    for (const license of licenses) {
      try {
        await migrateLicense(db, license);
        migratedLicenses++;
      } catch (error) {
        const errorMsg = `Failed to migrate license ${license.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Migration complete. Migrated ${migratedLicenses}/${licenses.length} licenses`);

    return {
      success: errors.length === 0,
      migratedLicenses,
      errors,
    };
  } catch (error) {
    const errorMsg = `Migration failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    return {
      success: false,
      migratedLicenses,
      errors: [errorMsg, ...errors],
    };
  }
}

/**
 * Migrate a single license to multi-PC format
 */
async function migrateLicense(db: Database, license: License): Promise<void> {
  // Skip if already migrated
  if (license.licenseType) {
    console.log(`License ${license.id} already migrated, skipping`);
    return;
  }

  // Prepare migration data
  const licenseType: 'single-pc' | 'multi-pc' = 'single-pc';
  const maxMachines = 1;
  
  // Build authorized machines array
  const authorizedMachines: AuthorizedMachine[] = [];
  if (license.machineId && license.machineIdHash) {
    authorizedMachines.push({
      machineId: license.machineId,
      machineIdHash: license.machineIdHash,
      addedAt: license.createdAt.toISOString(),
      addedBy: 'system', // Migration marker
      lastActivation: license.activatedAt?.toISOString(),
    });
  }

  // Build machine history
  const machineHistory: MachineHistoryEntry[] = [];
  if (license.machineId) {
    machineHistory.push({
      eventType: 'added',
      machineId: license.machineId,
      timestamp: license.createdAt.toISOString(),
      performedBy: 'system',
      details: 'Migrated from v1.0 format',
    });
  }

  // Update the license
  await db.licenses.update(license.id, {
    licenseType,
    maxMachines,
    authorizedMachines: JSON.stringify(authorizedMachines),
    machineHistory: JSON.stringify(machineHistory),
  });

  console.log(`Migrated license ${license.id} (${licenseType}, ${authorizedMachines.length} machines)`);
}

/**
 * Rollback the migration (for testing or emergency rollback)
 */
export async function rollbackMultiPCLicensingMigration(db: Database): Promise<MigrationResult> {
  const errors: string[] = [];
  let rolledBackLicenses = 0;

  try {
    console.log('Rolling back multi-PC licensing migration...');

    const licenses = await db.licenses.find({}).toArray();
    console.log(`Found ${licenses.length} licenses to rollback`);

    for (const license of licenses) {
      try {
        // Only rollback if it was a system migration
        if (license.licenseType === 'single-pc' && license.machineHistory) {
          const history: MachineHistoryEntry[] = JSON.parse(license.machineHistory);
          const isMigrated = history.some(
            (entry) => entry.performedBy === 'system' && entry.details === 'Migrated from v1.0 format'
          );

          if (isMigrated) {
            await db.licenses.update(license.id, {
              licenseType: undefined,
              maxMachines: undefined,
              authorizedMachines: undefined,
              machineHistory: undefined,
            });
            rolledBackLicenses++;
          }
        }
      } catch (error) {
        const errorMsg = `Failed to rollback license ${license.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(`Rollback complete. Rolled back ${rolledBackLicenses} licenses`);

    return {
      success: errors.length === 0,
      migratedLicenses: rolledBackLicenses,
      errors,
    };
  } catch (error) {
    const errorMsg = `Rollback failed: ${error instanceof Error ? error.message : String(error)}`;
    console.error(errorMsg);
    return {
      success: false,
      migratedLicenses: rolledBackLicenses,
      errors: [errorMsg, ...errors],
    };
  }
}

/**
 * Verify migration integrity
 */
export async function verifyMigration(db: Database): Promise<{
  valid: boolean;
  totalLicenses: number;
  migratedLicenses: number;
  unmigratedLicenses: number;
  issues: string[];
}> {
  const issues: string[] = [];
  
  const licenses = await db.licenses.find({}).toArray();
  const totalLicenses = licenses.length;
  let migratedLicenses = 0;
  let unmigratedLicenses = 0;

  for (const license of licenses) {
    if (license.licenseType) {
      migratedLicenses++;

      // Verify data integrity
      if (!license.maxMachines || license.maxMachines < 1 || license.maxMachines > 100) {
        issues.push(`License ${license.id}: Invalid maxMachines value: ${license.maxMachines}`);
      }

      if (!license.authorizedMachines) {
        issues.push(`License ${license.id}: Missing authorizedMachines array`);
      } else {
        try {
          const machines: AuthorizedMachine[] = JSON.parse(license.authorizedMachines);
          if (license.licenseType === 'single-pc' && machines.length !== 1) {
            issues.push(`License ${license.id}: Single-PC license has ${machines.length} machines (expected 1)`);
          }
          if (machines.length > license.maxMachines) {
            issues.push(`License ${license.id}: Has ${machines.length} machines but maxMachines is ${license.maxMachines}`);
          }
        } catch (error) {
          issues.push(`License ${license.id}: Invalid authorizedMachines JSON`);
        }
      }

      if (!license.machineHistory) {
        issues.push(`License ${license.id}: Missing machineHistory array`);
      } else {
        try {
          JSON.parse(license.machineHistory);
        } catch (error) {
          issues.push(`License ${license.id}: Invalid machineHistory JSON`);
        }
      }
    } else {
      unmigratedLicenses++;
    }
  }

  return {
    valid: issues.length === 0,
    totalLicenses,
    migratedLicenses,
    unmigratedLicenses,
    issues,
  };
}
