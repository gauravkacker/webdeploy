/**
 * API Endpoint: Generate License Password
 * POST /api/admin/licenses/[id]/generate-password
 *
 * Generates an offline-capable license password for a specific license
 * Dual-mode: Works in both web (localStorage) and desktop (SQLite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { generatePassword, generateExpiryDate, formatDateToYYYYMMDD } from '@/lib/license/password-generator';
import { encryptPassword } from '@/lib/license/password-encryption';
import { serverDb } from '@/lib/db/server-database';
import type { License } from '@/lib/db/schema';
import crypto from 'crypto';

interface GeneratePasswordRequest {
  expiryDate?: string; // Optional: YYYYMMDD format, defaults to 1 year from today
  customExpiryDays?: number; // Optional: days from today
}

interface GeneratePasswordResponse {
  success: boolean;
  password?: string;
  licenseKey?: string;
  plan?: string;
  maxMachines?: number;
  expiryDate?: string;
  error?: string;
}

/**
 * POST /api/admin/licenses/[id]/generate-password
 * Generates a password for the specified license
 * Dual-mode: Works in both web (localStorage) and desktop (SQLite)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<GeneratePasswordResponse>> {
  try {
    const { id: licenseId } = await params;

    if (!licenseId) {
      return NextResponse.json(
        { success: false, error: 'License ID is required' },
        { status: 400 }
      );
    }

    // Parse request body
    const body: GeneratePasswordRequest = await request.json().catch(() => ({}));

    // Use database layer (dual-mode: works in web and desktop)
    const license = serverDb.getById<License>('licenses', licenseId);

    if (!license) {
      return NextResponse.json(
        { success: false, error: 'License not found' },
        { status: 404 }
      );
    }

    // Determine plan type (1=single-pc, 2=multi-pc-5, 3=multi-pc-10, etc.)
    let planType = '1'; // Default: single-pc
    if (license.licenseType === 'multi-pc') {
      const maxMachines = license.maxMachines || 1;
      if (maxMachines <= 5) {
        planType = '2'; // multi-pc-5
      } else if (maxMachines <= 10) {
        planType = '3'; // multi-pc-10
      } else {
        planType = '4'; // multi-pc-unlimited
      }
    }

    // Determine expiry date - ALWAYS use license's original expiresAt date
    // This ensures software expiry matches license creation expiry, not password generation expiry
    let expiryDate: string;
    if (license.expiresAt) {
      // Use license's original expiry date
      expiryDate = formatDateToYYYYMMDD(new Date(license.expiresAt));
    } else {
      // Fallback: use provided date or default to 1 year
      if (body.expiryDate) {
        expiryDate = body.expiryDate;
      } else if (body.customExpiryDays) {
        expiryDate = generateExpiryDate(body.customExpiryDays);
      } else {
        expiryDate = generateExpiryDate(365);
      }
    }

    // Generate password
    const password = generatePassword(
      license.licenseKey,
      planType,
      license.maxMachines || 1,
      expiryDate
    );

    // Generate password hash for audit trail
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    // Encrypt password for storage
    const encryptedPassword = encryptPassword(password);

    // Update license with password generation info
    // Note: We do NOT store passwordExpiryDate - the password contains the license's original expiresAt date
    serverDb.update('licenses', licenseId, {
      passwordHash,
      generatedPassword: encryptedPassword,
      passwordGeneratedAt: new Date(),
      updatedAt: new Date(),
    });

    // Log password generation (for audit trail)
    console.log(
      `[Password Generated] License: ${licenseId}, Key: ${license.licenseKey}, Plan: ${planType}, Machines: ${license.maxMachines}, Expiry: ${expiryDate}`
    );

    return NextResponse.json(
      {
        success: true,
        password,
        licenseKey: license.licenseKey,
        plan: planType,
        maxMachines: license.maxMachines,
        expiryDate,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Password Generation Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate password',
      },
      { status: 500 }
    );
  }
}
