/**
 * API Endpoint: Generate License
 * POST /api/admin/licenses/generate
 *
 * Creates a new license for a customer
 * Dual-mode: Works in both web (localStorage) and desktop (SQLite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverDb } from '@/lib/db/server-database';
import crypto from 'crypto';

interface GenerateLicenseRequest {
  customerId: string;
  planId: string;
  licenseType: 'single-pc' | 'multi-pc';
  maxMachines: number;
  expiresAt: string;
  initialMachineIds?: string[];
  modules?: string[];
  isLifetime?: boolean;
  maxPatients?: number | null;
  maxPrescriptions?: number | null;
}

interface GenerateLicenseResponse {
  success: boolean;
  licenseId?: string;
  licenseKey?: string;
  error?: string;
}

/**
 * POST /api/admin/licenses/generate
 * Creates a new license
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateLicenseResponse>> {
  try {
    const body: GenerateLicenseRequest = await request.json();

    // Validate required fields
    if (!body.customerId || !body.planId) {
      return NextResponse.json(
        { success: false, error: 'Customer ID and Plan ID are required' },
        { status: 400 }
      );
    }

    // Generate license key (format: LIC-XXXXXXXX-XXXXXXXX-XXXXXXXX)
    const licenseKey = `LIC-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create license object (without id - serverDb.create will generate it)
    const licenseData = {
      licenseKey,
      customerId: body.customerId,
      planId: body.planId,
      licenseType: body.licenseType || 'single-pc',
      maxMachines: body.maxMachines || 1,
      authorizedMachines: body.initialMachineIds
        ? body.initialMachineIds.map((machineId) => ({
            machineId,
            machineIdHash: crypto.createHash('sha256').update(machineId).digest('hex'),
            addedAt: new Date().toISOString(),
            addedBy: 'admin',
          }))
        : [],
      status: 'active',
      expiresAt: body.expiresAt,
      modules: body.modules || [],
      isLifetime: body.isLifetime || false,
      maxPatients: body.maxPatients === null ? -1 : body.maxPatients,
      maxPrescriptions: body.maxPrescriptions === null ? -1 : body.maxPrescriptions,
    };

    // Save to database (dual-mode: works in web and desktop)
    const createdLicense = serverDb.create('licenses', licenseData);

    console.log('[License Generated]', {
      licenseId: createdLicense.id,
      licenseKey,
      customerId: body.customerId,
      planId: body.planId,
      licenseType: body.licenseType,
      maxMachines: body.maxMachines,
      created: createdLicense,
    });

    const response = {
      success: true,
      licenseId: createdLicense.id,
      licenseKey,
    };

    console.log('[License Generation Response]', response);

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[License Generation Error]', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate license',
      },
      { status: 500 }
    );
  }
}
