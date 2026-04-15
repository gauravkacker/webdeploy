import { LocalDatabase } from './db/database';

/**
 * Cleanup utility to remove orphaned fees, prescriptions, and bills
 * that were deleted before the hard-delete feature was implemented
 */
export class CleanupDeletedItems {
  private db: LocalDatabase;

  constructor() {
    this.db = LocalDatabase.getInstance();
  }

  /**
   * Remove orphaned fees (fees whose patients no longer exist)
   */
  cleanupOrphanedFees(): { removed: number; details: string[] } {
    const fees = this.db.getAll('fees') as Array<any>;
    const patients = this.db.getAll('patients') as Array<any>;
    const patientIds = new Set(patients.map((p) => p.id));

    const removed: string[] = [];
    let count = 0;

    fees.forEach((fee) => {
      if (!patientIds.has(fee.patientId)) {
        this.db.delete('fees', fee.id);
        removed.push(`Fee ${fee.id} (Patient: ${fee.patientId})`);
        count++;
      }
    });

    return { removed: count, details: removed };
  }

  /**
   * Remove orphaned prescriptions (prescriptions whose patients no longer exist)
   */
  cleanupOrphanedPrescriptions(): { removed: number; details: string[] } {
    const prescriptions = this.db.getAll('prescriptions') as Array<any>;
    const patients = this.db.getAll('patients') as Array<any>;
    const patientIds = new Set(patients.map((p) => p.id));

    const removed: string[] = [];
    let count = 0;

    prescriptions.forEach((rx) => {
      if (!patientIds.has(rx.patientId)) {
        this.db.delete('prescriptions', rx.id);
        removed.push(`Prescription ${rx.id} (Patient: ${rx.patientId})`);
        count++;
      }
    });

    return { removed: count, details: removed };
  }

  /**
   * Remove orphaned bills (bills whose patients no longer exist)
   */
  cleanupOrphanedBills(): { removed: number; details: string[] } {
    const bills = this.db.getAll('medicineBills') as Array<any>;
    const patients = this.db.getAll('patients') as Array<any>;
    const patientIds = new Set(patients.map((p) => p.id));

    const removed: string[] = [];
    let count = 0;

    bills.forEach((bill) => {
      if (!patientIds.has(bill.patientId)) {
        this.db.delete('medicineBills', bill.id);
        removed.push(`Bill ${bill.id} (Patient: ${bill.patientId})`);
        count++;
      }
    });

    return { removed: count, details: removed };
  }

  /**
   * Remove orphaned billing queue items
   */
  cleanupOrphanedBillingQueue(): { removed: number; details: string[] } {
    const queueItems = this.db.getAll('billingQueue') as Array<any>;
    const patients = this.db.getAll('patients') as Array<any>;
    const patientIds = new Set(patients.map((p) => p.id));

    const removed: string[] = [];
    let count = 0;

    queueItems.forEach((item) => {
      if (!patientIds.has(item.patientId)) {
        this.db.delete('billingQueue', item.id);
        removed.push(`Billing Queue Item ${item.id} (Patient: ${item.patientId})`);
        count++;
      }
    });

    return { removed: count, details: removed };
  }

  /**
   * Remove orphaned pharmacy queue items
   */
  cleanupOrphanedPharmacyQueue(): { removed: number; details: string[] } {
    const pharmacyItems = this.db.getAll('pharmacy') as Array<any>;
    const patients = this.db.getAll('patients') as Array<any>;
    const patientIds = new Set(patients.map((p) => p.id));

    const removed: string[] = [];
    let count = 0;

    pharmacyItems.forEach((item) => {
      if (!patientIds.has(item.patientId)) {
        this.db.delete('pharmacy', item.id);
        removed.push(`Pharmacy Queue Item ${item.id} (Patient: ${item.patientId})`);
        count++;
      }
    });

    return { removed: count, details: removed };
  }

  /**
   * Remove orphaned billing receipts
   */
  cleanupOrphanedReceipts(): { removed: number; details: string[] } {
    const receipts = this.db.getAll('billingReceipts') as Array<any>;
    const patients = this.db.getAll('patients') as Array<any>;
    const patientIds = new Set(patients.map((p) => p.id));

    const removed: string[] = [];
    let count = 0;

    receipts.forEach((receipt) => {
      if (!patientIds.has(receipt.patientId)) {
        this.db.delete('billingReceipts', receipt.id);
        removed.push(`Receipt ${receipt.id} (Patient: ${receipt.patientId})`);
        count++;
      }
    });

    return { removed: count, details: removed };
  }

  /**
   * Run complete cleanup for all orphaned items
   */
  runCompleteCleanup(): {
    summary: {
      totalRemoved: number;
      fees: number;
      prescriptions: number;
      bills: number;
      billingQueue: number;
      pharmacyQueue: number;
      receipts: number;
    };
    details: {
      fees: string[];
      prescriptions: string[];
      bills: string[];
      billingQueue: string[];
      pharmacyQueue: string[];
      receipts: string[];
    };
  } {
    const feeResult = this.cleanupOrphanedFees();
    const rxResult = this.cleanupOrphanedPrescriptions();
    const billResult = this.cleanupOrphanedBills();
    const queueResult = this.cleanupOrphanedBillingQueue();
    const pharmacyResult = this.cleanupOrphanedPharmacyQueue();
    const receiptResult = this.cleanupOrphanedReceipts();

    const totalRemoved =
      feeResult.removed +
      rxResult.removed +
      billResult.removed +
      queueResult.removed +
      pharmacyResult.removed +
      receiptResult.removed;

    return {
      summary: {
        totalRemoved,
        fees: feeResult.removed,
        prescriptions: rxResult.removed,
        bills: billResult.removed,
        billingQueue: queueResult.removed,
        pharmacyQueue: pharmacyResult.removed,
        receipts: receiptResult.removed,
      },
      details: {
        fees: feeResult.details,
        prescriptions: rxResult.details,
        bills: billResult.details,
        billingQueue: queueResult.details,
        pharmacyQueue: pharmacyResult.details,
        receipts: receiptResult.details,
      },
    };
  }
}
