import { NextRequest, NextResponse } from 'next/server';
import { CleanupDeletedItems } from '@/lib/cleanup-deleted-fees';

/**
 * POST /api/cleanup/orphaned-items
 * Cleanup orphaned fees, prescriptions, bills, and related records
 * that were deleted before the hard-delete feature was implemented
 */
export async function POST(request: NextRequest) {
  try {
    const cleanup = new CleanupDeletedItems();
    const result = cleanup.runCompleteCleanup();

    return NextResponse.json(
      {
        success: true,
        message: `Cleanup completed. Removed ${result.summary.totalRemoved} orphaned items.`,
        summary: result.summary,
        details: result.details,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cleanup/orphaned-items
 * Get statistics about orphaned items without removing them
 */
export async function GET(request: NextRequest) {
  try {
    const { LocalDatabase } = await import('@/lib/db/database');
    const db = LocalDatabase.getInstance();

    const fees = db.getAll('fees') as Array<any>;
    const prescriptions = db.getAll('prescriptions') as Array<any>;
    const bills = db.getAll('medicineBills') as Array<any>;
    const billingQueue = db.getAll('billingQueue') as Array<any>;
    const pharmacy = db.getAll('pharmacy') as Array<any>;
    const receipts = db.getAll('billingReceipts') as Array<any>;
    const patients = db.getAll('patients') as Array<any>;

    const patientIds = new Set(patients.map((p) => p.id));

    const orphanedFees = fees.filter((f) => !patientIds.has(f.patientId));
    const orphanedRx = prescriptions.filter((r) => !patientIds.has(r.patientId));
    const orphanedBills = bills.filter((b) => !patientIds.has(b.patientId));
    const orphanedQueue = billingQueue.filter((q) => !patientIds.has(q.patientId));
    const orphanedPharmacy = pharmacy.filter((p) => !patientIds.has(p.patientId));
    const orphanedReceipts = receipts.filter((r) => !patientIds.has(r.patientId));

    const totalOrphaned =
      orphanedFees.length +
      orphanedRx.length +
      orphanedBills.length +
      orphanedQueue.length +
      orphanedPharmacy.length +
      orphanedReceipts.length;

    return NextResponse.json(
      {
        success: true,
        totalOrphaned,
        breakdown: {
          fees: orphanedFees.length,
          prescriptions: orphanedRx.length,
          bills: orphanedBills.length,
          billingQueue: orphanedQueue.length,
          pharmacyQueue: orphanedPharmacy.length,
          receipts: orphanedReceipts.length,
        },
        message: `Found ${totalOrphaned} orphaned items. Run POST to cleanup.`,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
