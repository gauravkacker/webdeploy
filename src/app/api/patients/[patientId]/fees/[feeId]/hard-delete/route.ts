import { NextRequest, NextResponse } from 'next/server';
import { HardDeleteService } from '@/lib/hard-delete-service';
import { DeleteValidator } from '@/lib/delete-validator';
import { AuditLogger } from '@/lib/audit-logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { patientId: string; feeId: string } }
) {
  try {
    const { patientId, feeId } = params;
    const body = await request.json();
    const { userId, reason } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Validate deletion
    const validator = new DeleteValidator();
    const validation = validator.validateFeeDeletion(feeId, patientId);

    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.errors,
          warnings: validation.warnings,
        },
        { status: 400 }
      );
    }

    // Perform hard delete
    const hardDeleteService = new HardDeleteService();
    const result = await hardDeleteService.deleteFee({
      userId,
      itemType: 'fee',
      itemId: feeId,
      patientId,
      reason,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Deletion failed' },
        { status: 500 }
      );
    }

    // Log to audit
    const auditLogger = new AuditLogger();
    auditLogger.logHardDelete(
      userId,
      'fee',
      feeId,
      patientId,
      result.deletedRecords.cascaded,
      reason,
      {
        validation: {
          warnings: validation.warnings,
          dependencies: validation.dependencies,
        },
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Fee deleted successfully',
        deletedRecords: result.deletedRecords,
        timestamp: result.timestamp,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Hard delete fee error:', errorMessage);

    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}
