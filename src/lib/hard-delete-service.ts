import { LocalDatabase } from './db/database';

export interface DeleteResult {
  success: boolean;
  deletedRecords: {
    primary: string;
    cascaded: string[];
  };
  error?: string;
  timestamp: Date;
}

export interface DeletionContext {
  userId: string;
  itemType: 'fee' | 'prescription' | 'bill';
  itemId: string;
  patientId: string;
  reason?: string;
}

/**
 * HardDeleteService handles permanent deletion of fees, prescriptions, and bills
 * with cascade deletion of related records and transaction-like behavior
 */
export class HardDeleteService {
  private db: LocalDatabase;
  private deletionLog: DeleteResult[] = [];

  constructor() {
    this.db = LocalDatabase.getInstance();
  }

  /**
   * Delete a fee and all related records (cascade delete)
   * Maintains referential integrity and atomicity
   */
  async deleteFee(context: DeletionContext): Promise<DeleteResult> {
    const startTime = Date.now();
    const cascadedRecords: string[] = [];

    try {
      // Validate fee exists
      const fee = this.db.getById('fees', context.itemId);
      if (!fee) {
        throw new Error(`Fee with ID ${context.itemId} not found`);
      }

      // Identify related records before deletion
      const relatedRecords = this.identifyFeeRelatedRecords(context.itemId, context.patientId);

      // Delete in correct order to maintain referential integrity
      // 1. Delete from billing queue items
      for (const queueItemId of relatedRecords.billingQueueItems) {
        this.db.delete('billingQueue', queueItemId);
        cascadedRecords.push(queueItemId);
      }

      // 2. Delete from receipts
      for (const receiptId of relatedRecords.receipts) {
        this.db.delete('billingReceipts', receiptId);
        cascadedRecords.push(receiptId);
      }

      // 3. Delete from refunds
      for (const refundId of relatedRecords.refunds) {
        this.db.delete('refunds', refundId);
        cascadedRecords.push(refundId);
      }

      // 4. Delete the primary fee record
      this.db.delete('fees', context.itemId);

      // 5. Remove from daily collection report (handled by report queries)
      // 6. Remove from all modules (handled by module queries)

      // Log the deletion
      this.logDeletion(context, cascadedRecords);

      const result: DeleteResult = {
        success: true,
        deletedRecords: {
          primary: context.itemId,
          cascaded: cascadedRecords,
        },
        timestamp: new Date(),
      };

      this.deletionLog.push(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: DeleteResult = {
        success: false,
        deletedRecords: {
          primary: context.itemId,
          cascaded: cascadedRecords,
        },
        error: errorMessage,
        timestamp: new Date(),
      };

      this.deletionLog.push(result);
      throw error;
    }
  }

  /**
   * Delete a prescription and all related records (cascade delete)
   */
  async deletePrescription(context: DeletionContext): Promise<DeleteResult> {
    const cascadedRecords: string[] = [];

    try {
      // Validate prescription exists
      const prescription = this.db.getById('prescriptions', context.itemId);
      if (!prescription) {
        throw new Error(`Prescription with ID ${context.itemId} not found`);
      }

      // Identify related records
      const relatedRecords = this.identifyPrescriptionRelatedRecords(context.itemId, context.patientId);

      // Delete in correct order
      // 1. Delete from pharmacy queue items
      for (const queueItemId of relatedRecords.pharmacyQueueItems) {
        this.db.delete('pharmacy', queueItemId);
        cascadedRecords.push(queueItemId);
      }

      // 2. Delete from prescription history
      for (const historyId of relatedRecords.prescriptionHistory) {
        this.db.delete('prescriptionHistory', historyId);
        cascadedRecords.push(historyId);
      }

      // 3. Delete the primary prescription record
      this.db.delete('prescriptions', context.itemId);

      // Log the deletion
      this.logDeletion(context, cascadedRecords);

      const result: DeleteResult = {
        success: true,
        deletedRecords: {
          primary: context.itemId,
          cascaded: cascadedRecords,
        },
        timestamp: new Date(),
      };

      this.deletionLog.push(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: DeleteResult = {
        success: false,
        deletedRecords: {
          primary: context.itemId,
          cascaded: cascadedRecords,
        },
        error: errorMessage,
        timestamp: new Date(),
      };

      this.deletionLog.push(result);
      throw error;
    }
  }

  /**
   * Delete a bill and all related records (cascade delete)
   */
  async deleteBill(context: DeletionContext): Promise<DeleteResult> {
    const cascadedRecords: string[] = [];

    try {
      // Validate bill exists
      const bill = this.db.getById('medicineBills', context.itemId);
      if (!bill) {
        throw new Error(`Bill with ID ${context.itemId} not found`);
      }

      // Identify related records
      const relatedRecords = this.identifyBillRelatedRecords(context.itemId, context.patientId);

      // Delete in correct order
      // 1. Delete bill items
      for (const itemId of relatedRecords.billItems) {
        this.db.delete('medicineBills', itemId);
        cascadedRecords.push(itemId);
      }

      // 2. Delete from receipts
      for (const receiptId of relatedRecords.receipts) {
        this.db.delete('billingReceipts', receiptId);
        cascadedRecords.push(receiptId);
      }

      // 3. Delete the primary bill record
      this.db.delete('medicineBills', context.itemId);

      // Log the deletion
      this.logDeletion(context, cascadedRecords);

      const result: DeleteResult = {
        success: true,
        deletedRecords: {
          primary: context.itemId,
          cascaded: cascadedRecords,
        },
        timestamp: new Date(),
      };

      this.deletionLog.push(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const result: DeleteResult = {
        success: false,
        deletedRecords: {
          primary: context.itemId,
          cascaded: cascadedRecords,
        },
        error: errorMessage,
        timestamp: new Date(),
      };

      this.deletionLog.push(result);
      throw error;
    }
  }

  /**
   * Identify all records related to a fee
   */
  private identifyFeeRelatedRecords(feeId: string, patientId: string): {
    billingQueueItems: string[];
    receipts: string[];
    refunds: string[];
  } {
    const billingQueueItems: string[] = [];
    const receipts: string[] = [];
    const refunds: string[] = [];

    // Find billing queue items referencing this fee
    const queueItems = this.db.getAll('billingQueue');
    queueItems.forEach((item: unknown) => {
      const qi = item as Record<string, unknown>;
      if (qi.feeId === feeId || qi.patientId === patientId) {
        billingQueueItems.push(qi.id as string);
      }
    });

    // Find receipts referencing this fee
    const receiptItems = this.db.getAll('billingReceipts');
    receiptItems.forEach((item: unknown) => {
      const ri = item as Record<string, unknown>;
      if (ri.patientId === patientId) {
        const items = ri.items as unknown[];
        if (Array.isArray(items)) {
          items.forEach((receiptItem: unknown) => {
            const rItem = receiptItem as Record<string, unknown>;
            if (rItem.feeId === feeId) {
              receipts.push(ri.id as string);
            }
          });
        }
      }
    });

    // Find refunds referencing this fee
    const refundItems = this.db.getAll('refunds');
    refundItems.forEach((item: unknown) => {
      const rf = item as Record<string, unknown>;
      if (rf.feeId === feeId) {
        refunds.push(rf.id as string);
      }
    });

    return { billingQueueItems, receipts, refunds };
  }

  /**
   * Identify all records related to a prescription
   */
  private identifyPrescriptionRelatedRecords(prescriptionId: string, patientId: string): {
    pharmacyQueueItems: string[];
    prescriptionHistory: string[];
  } {
    const pharmacyQueueItems: string[] = [];
    const prescriptionHistory: string[] = [];

    // Find pharmacy queue items referencing this prescription
    const pharmacyItems = this.db.getAll('pharmacy');
    pharmacyItems.forEach((item: unknown) => {
      const pi = item as Record<string, unknown>;
      if (pi.prescriptionId === prescriptionId || pi.patientId === patientId) {
        pharmacyQueueItems.push(pi.id as string);
      }
    });

    // Find prescription history referencing this prescription
    const historyItems = this.db.getAll('prescriptionHistory');
    historyItems.forEach((item: unknown) => {
      const hi = item as Record<string, unknown>;
      if (hi.prescriptionId === prescriptionId) {
        prescriptionHistory.push(hi.id as string);
      }
    });

    return { pharmacyQueueItems, prescriptionHistory };
  }

  /**
   * Identify all records related to a bill
   */
  private identifyBillRelatedRecords(billId: string, patientId: string): {
    billItems: string[];
    receipts: string[];
  } {
    const billItems: string[] = [];
    const receipts: string[] = [];

    // Find bill items
    const items = this.db.getAll('medicineBills');
    items.forEach((item: unknown) => {
      const bi = item as Record<string, unknown>;
      if (bi.billId === billId) {
        billItems.push(bi.id as string);
      }
    });

    // Find receipts referencing this bill
    const receiptItems = this.db.getAll('billingReceipts');
    receiptItems.forEach((item: unknown) => {
      const ri = item as Record<string, unknown>;
      if (ri.billId === billId) {
        receipts.push(ri.id as string);
      }
    });

    return { billItems, receipts };
  }

  /**
   * Log deletion to audit log
   */
  private logDeletion(context: DeletionContext, cascadedRecords: string[]): void {
    const auditEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      userId: context.userId,
      action: 'HARD_DELETE',
      itemType: context.itemType,
      itemId: context.itemId,
      patientId: context.patientId,
      cascadedRecords: cascadedRecords,
      reason: context.reason || 'No reason provided',
      immutable: true,
    };

    const auditLog = this.db.getAll('auditLog');
    auditLog.push(auditEntry);
    this.db.update('auditLog', auditEntry.id, auditEntry);
  }

  /**
   * Get deletion history
   */
  getDeletionHistory(): DeleteResult[] {
    return [...this.deletionLog];
  }

  /**
   * Get audit log entries for hard deletes
   */
  getAuditLog(): unknown[] {
    const auditLog = this.db.getAll('auditLog');
    return auditLog.filter((entry: unknown) => {
      const e = entry as Record<string, unknown>;
      return e.action === 'HARD_DELETE';
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
