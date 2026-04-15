import { LocalDatabase } from './db/database';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  dependencies: {
    external: string[];
    orphaned: string[];
  };
}

/**
 * DeleteValidator performs pre-deletion checks to ensure data integrity
 * Validates external dependencies, orphan records, and referential integrity
 */
export class DeleteValidator {
  private db: LocalDatabase;

  constructor() {
    this.db = LocalDatabase.getInstance();
  }

  /**
   * Validate fee deletion
   */
  validateFeeDeletion(feeId: string, patientId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const externalDependencies: string[] = [];
    const orphanedRecords: string[] = [];

    // Check if fee exists
    const fee = this.db.getById('fees', feeId);
    if (!fee) {
      errors.push(`Fee with ID ${feeId} not found`);
      return {
        isValid: false,
        errors,
        warnings,
        dependencies: { external: externalDependencies, orphaned: orphanedRecords },
      };
    }

    // Check for external references
    const externalRefs = this.checkFeeExternalReferences(feeId, patientId);
    externalDependencies.push(...externalRefs);

    // Check for orphaned records
    const orphans = this.checkFeeOrphanedRecords(feeId, patientId);
    orphanedRecords.push(...orphans);

    // Check referential integrity
    const integrityIssues = this.checkFeeReferentialIntegrity(feeId, patientId);
    if (integrityIssues.length > 0) {
      warnings.push(...integrityIssues);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dependencies: { external: externalDependencies, orphaned: orphanedRecords },
    };
  }

  /**
   * Validate prescription deletion
   */
  validatePrescriptionDeletion(prescriptionId: string, patientId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const externalDependencies: string[] = [];
    const orphanedRecords: string[] = [];

    // Check if prescription exists
    const prescription = this.db.getById('prescriptions', prescriptionId);
    if (!prescription) {
      errors.push(`Prescription with ID ${prescriptionId} not found`);
      return {
        isValid: false,
        errors,
        warnings,
        dependencies: { external: externalDependencies, orphaned: orphanedRecords },
      };
    }

    // Check for external references
    const externalRefs = this.checkPrescriptionExternalReferences(prescriptionId, patientId);
    externalDependencies.push(...externalRefs);

    // Check for orphaned records
    const orphans = this.checkPrescriptionOrphanedRecords(prescriptionId, patientId);
    orphanedRecords.push(...orphans);

    // Check referential integrity
    const integrityIssues = this.checkPrescriptionReferentialIntegrity(prescriptionId, patientId);
    if (integrityIssues.length > 0) {
      warnings.push(...integrityIssues);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dependencies: { external: externalDependencies, orphaned: orphanedRecords },
    };
  }

  /**
   * Validate bill deletion
   */
  validateBillDeletion(billId: string, patientId: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const externalDependencies: string[] = [];
    const orphanedRecords: string[] = [];

    // Check if bill exists
    const bill = this.db.getById('medicineBills', billId);
    if (!bill) {
      errors.push(`Bill with ID ${billId} not found`);
      return {
        isValid: false,
        errors,
        warnings,
        dependencies: { external: externalDependencies, orphaned: orphanedRecords },
      };
    }

    // Check for external references
    const externalRefs = this.checkBillExternalReferences(billId, patientId);
    externalDependencies.push(...externalRefs);

    // Check for orphaned records
    const orphans = this.checkBillOrphanedRecords(billId, patientId);
    orphanedRecords.push(...orphans);

    // Check referential integrity
    const integrityIssues = this.checkBillReferentialIntegrity(billId, patientId);
    if (integrityIssues.length > 0) {
      warnings.push(...integrityIssues);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      dependencies: { external: externalDependencies, orphaned: orphanedRecords },
    };
  }

  /**
   * Check for external references to a fee
   */
  private checkFeeExternalReferences(feeId: string, patientId: string): string[] {
    const externalRefs: string[] = [];

    // Check if fee is referenced in active billing queue
    const queueItems = this.db.getAll('billingQueue');
    const activeQueueRefs = queueItems.filter((item: unknown) => {
      const qi = item as Record<string, unknown>;
      return qi.feeId === feeId && qi.status !== 'completed';
    });

    if (activeQueueRefs.length > 0) {
      externalRefs.push(`Fee is referenced in ${activeQueueRefs.length} active billing queue items`);
    }

    // Check if fee is referenced in pending receipts
    const receipts = this.db.getAll('billingReceipts');
    const pendingReceipts = receipts.filter((item: unknown) => {
      const ri = item as Record<string, unknown>;
      if (ri.status === 'pending' || ri.status === 'draft') {
        const items = ri.items as unknown[];
        if (Array.isArray(items)) {
          return items.some((rItem: unknown) => {
            const rI = rItem as Record<string, unknown>;
            return rI.feeId === feeId;
          });
        }
      }
      return false;
    });

    if (pendingReceipts.length > 0) {
      externalRefs.push(`Fee is referenced in ${pendingReceipts.length} pending receipts`);
    }

    return externalRefs;
  }

  /**
   * Check for external references to a prescription
   */
  private checkPrescriptionExternalReferences(prescriptionId: string, patientId: string): string[] {
    const externalRefs: string[] = [];

    // Check if prescription is in active pharmacy queue
    const pharmacyItems = this.db.getAll('pharmacy');
    const activePharmacyRefs = pharmacyItems.filter((item: unknown) => {
      const pi = item as Record<string, unknown>;
      return pi.prescriptionId === prescriptionId && pi.status !== 'dispensed';
    });

    if (activePharmacyRefs.length > 0) {
      externalRefs.push(`Prescription is in ${activePharmacyRefs.length} active pharmacy queue items`);
    }

    return externalRefs;
  }

  /**
   * Check for external references to a bill
   */
  private checkBillExternalReferences(billId: string, patientId: string): string[] {
    const externalRefs: string[] = [];

    // Check if bill is referenced in pending receipts
    const receipts = this.db.getAll('billingReceipts');
    const pendingReceipts = receipts.filter((item: unknown) => {
      const ri = item as Record<string, unknown>;
      return ri.billId === billId && (ri.status === 'pending' || ri.status === 'draft');
    });

    if (pendingReceipts.length > 0) {
      externalRefs.push(`Bill is referenced in ${pendingReceipts.length} pending receipts`);
    }

    return externalRefs;
  }

  /**
   * Check for orphaned records related to a fee
   */
  private checkFeeOrphanedRecords(feeId: string, patientId: string): string[] {
    const orphans: string[] = [];

    // Check for orphaned refunds
    const refunds = this.db.getAll('refunds');
    const orphanedRefunds = refunds.filter((item: unknown) => {
      const rf = item as Record<string, unknown>;
      return rf.feeId === feeId && !rf.processed;
    });

    if (orphanedRefunds.length > 0) {
      orphans.push(`Found ${orphanedRefunds.length} unprocessed refunds for this fee`);
    }

    return orphans;
  }

  /**
   * Check for orphaned records related to a prescription
   */
  private checkPrescriptionOrphanedRecords(prescriptionId: string, patientId: string): string[] {
    const orphans: string[] = [];

    // Check for orphaned prescription history
    const history = this.db.getAll('prescriptionHistory');
    const orphanedHistory = history.filter((item: unknown) => {
      const hi = item as Record<string, unknown>;
      return hi.prescriptionId === prescriptionId;
    });

    if (orphanedHistory.length > 0) {
      orphans.push(`Found ${orphanedHistory.length} prescription history records`);
    }

    return orphans;
  }

  /**
   * Check for orphaned records related to a bill
   */
  private checkBillOrphanedRecords(billId: string, patientId: string): string[] {
    const orphans: string[] = [];

    // Check for orphaned bill items
    const items = this.db.getAll('medicineBills');
    const orphanedItems = items.filter((item: unknown) => {
      const bi = item as Record<string, unknown>;
      return bi.billId === billId;
    });

    if (orphanedItems.length > 0) {
      orphans.push(`Found ${orphanedItems.length} bill items`);
    }

    return orphans;
  }

  /**
   * Check referential integrity for fee
   */
  private checkFeeReferentialIntegrity(feeId: string, patientId: string): string[] {
    const issues: string[] = [];

    // Check if patient exists
    const patient = this.db.getById('patients', patientId);
    if (!patient) {
      issues.push(`Patient with ID ${patientId} not found`);
    }

    // Check if fee belongs to patient
    const fee = this.db.getById('fees', feeId);
    if (fee && (fee as Record<string, unknown>).patientId !== patientId) {
      issues.push(`Fee does not belong to the specified patient`);
    }

    return issues;
  }

  /**
   * Check referential integrity for prescription
   */
  private checkPrescriptionReferentialIntegrity(prescriptionId: string, patientId: string): string[] {
    const issues: string[] = [];

    // Check if patient exists
    const patient = this.db.getById('patients', patientId);
    if (!patient) {
      issues.push(`Patient with ID ${patientId} not found`);
    }

    // Check if prescription belongs to patient
    const prescription = this.db.getById('prescriptions', prescriptionId);
    if (prescription && (prescription as Record<string, unknown>).patientId !== patientId) {
      issues.push(`Prescription does not belong to the specified patient`);
    }

    return issues;
  }

  /**
   * Check referential integrity for bill
   */
  private checkBillReferentialIntegrity(billId: string, patientId: string): string[] {
    const issues: string[] = [];

    // Check if patient exists
    const patient = this.db.getById('patients', patientId);
    if (!patient) {
      issues.push(`Patient with ID ${patientId} not found`);
    }

    // Check if bill belongs to patient
    const bill = this.db.getById('medicineBills', billId);
    if (bill && (bill as Record<string, unknown>).patientId !== billId) {
      issues.push(`Bill does not belong to the specified patient`);
    }

    return issues;
  }
}
