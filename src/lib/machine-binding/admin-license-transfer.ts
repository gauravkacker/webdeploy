import { db } from '@/lib/db/database';
import { generateLicFile } from './lic-file-manager';
import { getRemainingLicenseDays, preserveRemainingDays } from './pc-change-workflow';
import { validateMachineIdFormat } from './license-binding';

export interface AdminTransferRequest {
  oldMachineId: string;
  newMachineId: string;
  licenseKey: string;
  adminId: string;
}

export interface TransferResult {
  success: boolean;
  message: string;
  newLicFile?: Buffer;
  transferId?: string;
  remainingDays?: number;
}

export interface TransferHistory {
  id: string;
  licenseId: string;
  oldMachineId: string;
  newMachineId: string;
  adminId: string;
  transferredAt: Date;
  remainingDaysPreserved: number;
}

/**
 * Validates that the user is an admin
 */
export async function validateAdminAuthorization(userId: string): Promise<boolean> {
  try {
    // Check if user has admin role in the database
    const result = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return false;
    }
    
    const user = result.rows[0];
    return user.role === 'admin' || user.role === 'superadmin';
  } catch (error) {
    console.error('Error validating admin authorization:', error);
    return false;
  }
}

/**
 * Generates a new .LIC file for a different Machine ID
 */
export async function generateNewLicFileForMachineId(
  oldMachineId: string,
  newMachineId: string,
  licenseKey: string
): Promise<TransferResult> {
  try {
    // Validate Machine ID formats
    if (!validateMachineIdFormat(oldMachineId)) {
      return {
        success: false,
        message: 'Invalid old Machine ID format',
      };
    }

    if (!validateMachineIdFormat(newMachineId)) {
      return {
        success: false,
        message: 'Invalid new Machine ID format',
      };
    }

    // Find the license by license key
    const licenseResult = await db.query(
      `SELECT * FROM licenses WHERE "licenseKey" = $1`,
      [licenseKey]
    );

    if (licenseResult.rows.length === 0) {
      return {
        success: false,
        message: 'License not found',
      };
    }

    const license = licenseResult.rows[0];

    // Verify the old Machine ID matches
    if (license.machineId !== oldMachineId) {
      return {
        success: false,
        message: 'Old Machine ID does not match the license binding',
      };
    }

    // Calculate remaining days
    const remainingDays = getRemainingLicenseDays(new Date(license.expiresAt));

    if (remainingDays <= 0) {
      return {
        success: false,
        message: 'License has already expired',
      };
    }

    // Generate new expiration date preserving remaining days
    const newExpiresAt = preserveRemainingDays(
      { expiresAt: new Date(license.expiresAt) },
      newMachineId
    );

    // Generate new .LIC file
    const licFileResult = await generateLicFile({
      licenseKey,
      machineId: newMachineId,
      expiresAt: newExpiresAt,
      modules: license.modules || [],
    });

    if (!licFileResult.success || !licFileResult.licFile) {
      return {
        success: false,
        message: 'Failed to generate new .LIC file',
      };
    }

    return {
      success: true,
      message: 'New .LIC file generated successfully',
      newLicFile: licFileResult.licFile,
      remainingDays,
    };
  } catch (error) {
    console.error('Error generating new .LIC file:', error);
    return {
      success: false,
      message: 'Error generating new .LIC file',
    };
  }
}

/**
 * Invalidates the old license file
 */
export async function invalidateOldLicenseFile(oldMachineId: string): Promise<boolean> {
  try {
    const result = await db.query(
      `UPDATE licenses SET status = 'inactive', "machineId" = NULL WHERE "machineId" = $1`,
      [oldMachineId]
    );

    return result.rowCount > 0;
  } catch (error) {
    console.error('Error invalidating old license file:', error);
    return false;
  }
}

/**
 * Creates a transfer record for audit trail
 */
export async function createTransferRecord(
  oldMachineId: string,
  newMachineId: string,
  licenseKey: string,
  adminId: string
): Promise<TransferResult> {
  try {
    // Find the license
    const licenseResult = await db.query(
      `SELECT id FROM licenses WHERE "licenseKey" = $1`,
      [licenseKey]
    );

    if (licenseResult.rows.length === 0) {
      return {
        success: false,
        message: 'License not found',
      };
    }

    const licenseId = licenseResult.rows[0].id;

    // Calculate remaining days
    const licenseDetailsResult = await db.query(
      `SELECT "expiresAt" FROM licenses WHERE id = $1`,
      [licenseId]
    );

    const remainingDays = getRemainingLicenseDays(
      new Date(licenseDetailsResult.rows[0].expiresAt)
    );

    // Create transfer record in audit log
    const transferResult = await db.query(
      `INSERT INTO "LicenseAuditLog" (id, "licenseId", "customerId", action, details, "performedBy", "createdAt")
       SELECT gen_random_uuid(), $1, "customerId", 'TRANSFER', $2, $3, NOW()
       FROM licenses WHERE id = $1
       RETURNING id`,
      [
        licenseId,
        JSON.stringify({
          oldMachineId,
          newMachineId,
          remainingDaysPreserved: remainingDays,
        }),
        adminId,
      ]
    );

    if (transferResult.rows.length === 0) {
      return {
        success: false,
        message: 'Failed to create transfer record',
      };
    }

    return {
      success: true,
      message: 'Transfer record created',
      transferId: transferResult.rows[0].id,
      remainingDays,
    };
  } catch (error) {
    console.error('Error creating transfer record:', error);
    return {
      success: false,
      message: 'Error creating transfer record',
    };
  }
}

/**
 * Gets transfer history for a machine ID
 */
export async function getTransferHistory(machineId: string): Promise<TransferHistory[]> {
  try {
    const result = await db.query(
      `SELECT 
        aal.id,
        aal."licenseId",
        aal.details,
        aal."createdAt"
       FROM "LicenseAuditLog" aal
       WHERE aal.action = 'TRANSFER' 
       AND aal.details::jsonb->>'oldMachineId' = $1 
       OR aal.details::jsonb->>'newMachineId' = $1
       ORDER BY aal."createdAt" DESC`,
      [machineId]
    );

    return result.rows.map((row: any) => {
      const details = JSON.parse(row.details);
      return {
        id: row.id,
        licenseId: row.licenseId,
        oldMachineId: details.oldMachineId,
        newMachineId: details.newMachineId,
        adminId: row.performedBy,
        transferredAt: new Date(row.createdAt),
        remainingDaysPreserved: details.remainingDaysPreserved,
      };
    });
  } catch (error) {
    console.error('Error getting transfer history:', error);
    return [];
  }
}

/**
 * Complete license transfer process
 */
export async function completeLicenseTransfer(
  request: AdminTransferRequest
): Promise<TransferResult> {
  try {
    // Validate admin authorization
    const isAdmin = await validateAdminAuthorization(request.adminId);
    if (!isAdmin) {
      return {
        success: false,
        message: 'Unauthorized: Admin access required',
      };
    }

    // Generate new .LIC file
    const licFileResult = await generateNewLicFileForMachineId(
      request.oldMachineId,
      request.newMachineId,
      request.licenseKey
    );

    if (!licFileResult.success) {
      return licFileResult;
    }

    // Invalidate old license
    const invalidated = await invalidateOldLicenseFile(request.oldMachineId);
    if (!invalidated) {
      return {
        success: false,
        message: 'Failed to invalidate old license',
      };
    }

    // Create transfer record
    const transferRecord = await createTransferRecord(
      request.oldMachineId,
      request.newMachineId,
      request.licenseKey,
      request.adminId
    );

    if (!transferRecord.success) {
      return transferRecord;
    }

    // Update license with new Machine ID
    await db.query(
      `UPDATE licenses SET "machineId" = $1, status = 'active' WHERE "licenseKey" = $2`,
      [request.newMachineId, request.licenseKey]
    );

    return {
      success: true,
      message: 'License transfer completed successfully',
      newLicFile: licFileResult.newLicFile,
      transferId: transferRecord.transferId,
      remainingDays: licFileResult.remainingDays,
    };
  } catch (error) {
    console.error('Error completing license transfer:', error);
    return {
      success: false,
      message: 'Error completing license transfer',
    };
  }
}
