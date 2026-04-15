import { NextRequest, NextResponse } from 'next/server';
import { invalidateOldLicenseFile, validateAdminAuthorization } from '@/lib/machine-binding/admin-license-transfer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { machineId, adminId } = body;

    if (!machineId || !adminId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate admin authorization
    const isAdmin = await validateAdminAuthorization(adminId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }

    // Invalidate the license
    const success = await invalidateOldLicenseFile(machineId);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to invalidate license' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'License invalidated successfully',
    });
  } catch (error) {
    console.error('Error in invalidate license endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
