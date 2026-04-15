import { HardDeleteService } from '@/lib/hard-delete-service';
import { DeleteValidator } from '@/lib/delete-validator';
import { AuditLogger } from '@/lib/audit-logger';
import { db } from '@/lib/db/database';

describe('Hard Delete Cascade Feature', () => {
  let hardDeleteService: HardDeleteService;
  let deleteValidator: DeleteValidator;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    hardDeleteService = new HardDeleteService();
    deleteValidator = new DeleteValidator();
    auditLogger = new AuditLogger();
  });

  describe('Property 1: Cascade deletion atomicity', () => {
    it('should delete all related records together or none', async () => {
      // Setup: Create a fee with related records
      const patientId = 'patient-1';
      const feeId = 'fee-1';
      const userId = 'user-1';

      // Create test data
      const fee = db.create('fees', {
        id: feeId,
        patientId,
        amount: 500,
        description: 'Consultation fee',
      });

      const queueItem = db.create('billingQueue', {
        id: 'queue-1',
        feeId,
        patientId,
        status: 'pending',
      });

      // Property: All related records are deleted together
      const result = await hardDeleteService.deleteFee({
        userId,
        itemType: 'fee',
        itemId: feeId,
        patientId,
      });

      expect(result.success).toBe(true);
      expect(result.deletedRecords.primary).toBe(feeId);
      expect(result.deletedRecords.cascaded).toContain('queue-1');

      // Verify primary record is deleted
      const deletedFee = db.getById('fees', feeId);
      expect(deletedFee).toBeUndefined();

      // Verify cascaded records are deleted
      const deletedQueueItem = db.getById('billingQueue', 'queue-1');
      expect(deletedQueueItem).toBeUndefined();
    });
  });

  describe('Property 2: Audit log immutability', () => {
    it('should create immutable audit log entries', () => {
      const entry = auditLogger.logHardDelete(
        'user-1',
        'fee',
        'fee-1',
        'patient-1',
        ['queue-1', 'receipt-1'],
        'Test deletion'
      );

      expect(entry.immutable).toBe(true);

      // Verify immutability
      const isImmutable = auditLogger.verifyImmutability(entry.id);
      expect(isImmutable).toBe(true);
    });
  });

  describe('Property 3: Fee cascade deletion completeness', () => {
    it('should remove all fee references from all modules', async () => {
      const patientId = 'patient-2';
      const feeId = 'fee-2';
      const userId = 'user-1';

      // Create fee with multiple references
      db.create('fees', {
        id: feeId,
        patientId,
        amount: 1000,
      });

      db.create('billingQueue', {
        id: 'queue-2',
        feeId,
        patientId,
      });

      db.create('billingReceipts', {
        id: 'receipt-1',
        patientId,
        items: [{ feeId, amount: 1000 }],
      });

      // Delete fee
      const result = await hardDeleteService.deleteFee({
        userId,
        itemType: 'fee',
        itemId: feeId,
        patientId,
      });

      expect(result.success).toBe(true);

      // Verify fee is removed from all modules
      const fees = db.getAll('fees');
      expect(fees.find((f: unknown) => (f as Record<string, unknown>).id === feeId)).toBeUndefined();

      const queueItems = db.getAll('billingQueue');
      expect(queueItems.find((q: unknown) => (q as Record<string, unknown>).id === 'queue-2')).toBeUndefined();
    });
  });

  describe('Property 4: Prescription cascade deletion completeness', () => {
    it('should remove all prescription references from all modules', async () => {
      const patientId = 'patient-3';
      const prescriptionId = 'rx-1';
      const userId = 'user-1';

      // Create prescription with references
      db.create('prescriptions', {
        id: prescriptionId,
        patientId,
        medicineName: 'Aspirin',
      });

      db.create('pharmacy', {
        id: 'pharmacy-1',
        prescriptionId,
        patientId,
        status: 'pending',
      });

      // Delete prescription
      const result = await hardDeleteService.deletePrescription({
        userId,
        itemType: 'prescription',
        itemId: prescriptionId,
        patientId,
      });

      expect(result.success).toBe(true);

      // Verify prescription is removed
      const prescriptions = db.getAll('prescriptions');
      expect(prescriptions.find((p: unknown) => (p as Record<string, unknown>).id === prescriptionId)).toBeUndefined();

      const pharmacyItems = db.getAll('pharmacy');
      expect(pharmacyItems.find((p: unknown) => (p as Record<string, unknown>).id === 'pharmacy-1')).toBeUndefined();
    });
  });

  describe('Property 5: Bill cascade deletion completeness', () => {
    it('should remove all bill references from all modules', async () => {
      const patientId = 'patient-4';
      const billId = 'bill-1';
      const userId = 'user-1';

      // Create bill with references
      db.create('medicineBills', {
        id: billId,
        patientId,
        totalAmount: 5000,
      });

      db.create('billingReceipts', {
        id: 'receipt-2',
        billId,
        patientId,
      });

      // Delete bill
      const result = await hardDeleteService.deleteBill({
        userId,
        itemType: 'bill',
        itemId: billId,
        patientId,
      });

      expect(result.success).toBe(true);

      // Verify bill is removed
      const bills = db.getAll('medicineBills');
      expect(bills.find((b: unknown) => (b as Record<string, unknown>).id === billId)).toBeUndefined();
    });
  });

  describe('Property 6: Report consistency after deletion', () => {
    it('should ensure reports accurately reflect only active items', async () => {
      const patientId = 'patient-5';
      const feeId = 'fee-3';
      const userId = 'user-1';

      // Create fee
      db.create('fees', {
        id: feeId,
        patientId,
        amount: 2000,
        date: new Date().toISOString(),
      });

      // Delete fee
      await hardDeleteService.deleteFee({
        userId,
        itemType: 'fee',
        itemId: feeId,
        patientId,
      });

      // Verify fee is not in active fees
      const activeFees = db.getAll('fees').filter((f: unknown) => {
        const fee = f as Record<string, unknown>;
        return fee.patientId === patientId;
      });

      expect(activeFees.find((f: unknown) => (f as Record<string, unknown>).id === feeId)).toBeUndefined();
    });
  });

  describe('Property 7: Error recovery completeness', () => {
    it('should fully rollback failed deletions', async () => {
      const patientId = 'patient-6';
      const feeId = 'non-existent-fee';
      const userId = 'user-1';

      // Attempt to delete non-existent fee
      try {
        await hardDeleteService.deleteFee({
          userId,
          itemType: 'fee',
          itemId: feeId,
          patientId,
        });
      } catch (error) {
        // Expected to fail
      }

      // Verify deletion history shows failure
      const history = hardDeleteService.getDeletionHistory();
      const failedDeletion = history.find((h) => h.deletedRecords.primary === feeId);
      expect(failedDeletion?.success).toBe(false);
    });
  });

  describe('DeleteValidator: Pre-deletion checks', () => {
    it('should validate fee deletion', () => {
      const patientId = 'patient-7';
      const feeId = 'fee-4';

      // Create fee
      db.create('fees', {
        id: feeId,
        patientId,
        amount: 500,
      });

      // Validate deletion
      const validation = deleteValidator.validateFeeDeletion(feeId, patientId);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect non-existent fee', () => {
      const validation = deleteValidator.validateFeeDeletion('non-existent', 'patient-8');

      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect external dependencies', () => {
      const patientId = 'patient-9';
      const feeId = 'fee-5';

      // Create fee with active queue item
      db.create('fees', {
        id: feeId,
        patientId,
        amount: 500,
      });

      db.create('billingQueue', {
        id: 'queue-3',
        feeId,
        patientId,
        status: 'pending',
      });

      // Validate deletion
      const validation = deleteValidator.validateFeeDeletion(feeId, patientId);

      expect(validation.dependencies.external.length).toBeGreaterThan(0);
    });
  });

  describe('AuditLogger: Audit trail', () => {
    it('should log all hard delete operations', () => {
      const entry = auditLogger.logHardDelete(
        'user-1',
        'fee',
        'fee-1',
        'patient-1',
        ['queue-1'],
        'Test deletion'
      );

      const allEntries = auditLogger.getAllEntries();
      expect(allEntries.find((e) => e.id === entry.id)).toBeDefined();
    });

    it('should retrieve entries by user', () => {
      auditLogger.logHardDelete('user-1', 'fee', 'fee-1', 'patient-1', []);
      auditLogger.logHardDelete('user-2', 'prescription', 'rx-1', 'patient-2', []);

      const user1Entries = auditLogger.getEntriesByUser('user-1');
      expect(user1Entries.length).toBeGreaterThan(0);
      expect(user1Entries.every((e) => e.userId === 'user-1')).toBe(true);
    });

    it('should retrieve entries by patient', () => {
      auditLogger.logHardDelete('user-1', 'fee', 'fee-1', 'patient-1', []);
      auditLogger.logHardDelete('user-1', 'prescription', 'rx-1', 'patient-2', []);

      const patient1Entries = auditLogger.getEntriesByPatient('patient-1');
      expect(patient1Entries.length).toBeGreaterThan(0);
      expect(patient1Entries.every((e) => e.patientId === 'patient-1')).toBe(true);
    });

    it('should generate audit report', () => {
      auditLogger.logHardDelete('user-1', 'fee', 'fee-1', 'patient-1', ['queue-1']);
      auditLogger.logHardDelete('user-1', 'prescription', 'rx-1', 'patient-2', ['pharmacy-1']);

      const report = auditLogger.generateReport();

      expect(report.summary.totalDeletions).toBeGreaterThan(0);
      expect(report.summary.deletionsByType.fee).toBeGreaterThan(0);
      expect(report.summary.deletionsByType.prescription).toBeGreaterThan(0);
    });

    it('should export audit log as CSV', () => {
      auditLogger.logHardDelete('user-1', 'fee', 'fee-1', 'patient-1', []);

      const csv = auditLogger.exportAsCSV();
      expect(csv).toContain('ID');
      expect(csv).toContain('Timestamp');
      expect(csv).toContain('HARD_DELETE');
    });
  });

  describe('Performance: Cascade deletion speed', () => {
    it('should complete fee deletion within 2 seconds', async () => {
      const patientId = 'patient-10';
      const feeId = 'fee-6';
      const userId = 'user-1';

      // Create fee with multiple related records
      db.create('fees', {
        id: feeId,
        patientId,
        amount: 500,
      });

      for (let i = 0; i < 10; i++) {
        db.create('billingQueue', {
          id: `queue-${i}`,
          feeId,
          patientId,
        });
      }

      const startTime = Date.now();

      await hardDeleteService.deleteFee({
        userId,
        itemType: 'fee',
        itemId: feeId,
        patientId,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000);
    });

    it('should complete prescription deletion within 2 seconds', async () => {
      const patientId = 'patient-11';
      const prescriptionId = 'rx-2';
      const userId = 'user-1';

      // Create prescription with multiple related records
      db.create('prescriptions', {
        id: prescriptionId,
        patientId,
        medicineName: 'Aspirin',
      });

      for (let i = 0; i < 10; i++) {
        db.create('pharmacy', {
          id: `pharmacy-${i}`,
          prescriptionId,
          patientId,
        });
      }

      const startTime = Date.now();

      await hardDeleteService.deletePrescription({
        userId,
        itemType: 'prescription',
        itemId: prescriptionId,
        patientId,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000);
    });

    it('should complete bill deletion within 2 seconds', async () => {
      const patientId = 'patient-12';
      const billId = 'bill-2';
      const userId = 'user-1';

      // Create bill with multiple related records
      db.create('medicineBills', {
        id: billId,
        patientId,
        totalAmount: 5000,
      });

      for (let i = 0; i < 10; i++) {
        db.create('billingReceipts', {
          id: `receipt-${i}`,
          billId,
          patientId,
        });
      }

      const startTime = Date.now();

      await hardDeleteService.deleteBill({
        userId,
        itemType: 'bill',
        itemId: billId,
        patientId,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(2000);
    });
  });
});
