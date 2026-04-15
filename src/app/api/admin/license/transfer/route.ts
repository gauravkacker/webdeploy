import { NextRequest, NextResponse } from 'next/server';
import { completeLicenseTransfer } from '@/lib/machine-binding/admin-license-transfer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { oldMachineId, newMachineId, licenseKey, adminId } = body;

    // Validate required fields
    if (!oldMachineId || !newMachineId || !licenseKey || !adminId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Complete the license transfer
    const result = await completeLicenseTransfer({
      oldMachineId,
      newMachineId,
      licenseKey,
      adminId,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Return the new .LIC file as base64
    const licFileBase64 = result.newLicFile?.toString('base64');

    return NextResponse.json({
      success: true,
      message: result.message,
      transferId: result.transferId,
      remainingDays: result.remainingDays,
      licFile: licFileBase64,
    });
  } catch (error) {
    console.error('Error in license transfer endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
