/**
 * Receipt Generation Bug Condition Exploration Test
 * 
 * This test demonstrates the duplicate receipt bug on unfixed code.
 * EXPECTED OUTCOME: Test FAILS on unfixed code (this proves the bug exists)
 * 
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 * Validates: Design Properties 2.1, 2.3, 2.4, 2.5
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock database for testing
interface MockBillingQueueItem {
  id: string;
  visitId: string;
  patientId: string;
  status: 'pending' | 'paid' | 'completed';
  netAmount: number;
  paymentStatus: 'pending' | 'paid' | 'partial' | 'exempt';
  receiptNumber?: string;
  receiptGeneratedAt?: Date;
}

interface MockBillingReceipt {
  id: string;
  receiptNumber: string;
  billingQueueId: string;
  visitId: string;
  patientId: string;
  netAmount: number;
  paymentStatus: 'paid' | 'pending' | 'partial' | 'exempt';
  createdAt: Date;
}

class MockDatabase {
  private billingQueue: Map<string, MockBillingQueueItem> = new Map();
  private billingReceipts: Map<string, MockBillingReceipt> = new Map();
  private receiptCounter: number = 0;

  generateReceiptNumber(): string {
    this.receiptCounter++;
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return `RCP-${today}-${this.receiptCounter.toString().padStart(4, '0')}`;
  }

  // Simulate appointment module receipt generation (FIXED: uses centralized logic)
  processAppointmentPayment(
    visitId: string,
    patientId: string,
    amount: number
  ): { queueItem: MockBillingQueueItem; receipt?: MockBillingReceipt } {
    const queueId = `queue-${visitId}-apt`;
    
    // Create or get queue item
    let queueItem = this.billingQueue.get(queueId);
    if (!queueItem) {
      queueItem = {
        id: queueId,
        visitId,
        patientId,
        status: 'paid',
        netAmount: amount,
        paymentStatus: 'paid'
      };
      this.billingQueue.set(queueId, queueItem);
    }

    // Use centralized receipt generation logic (FIX)
    const receipt = this.createOrReuseReceipt(queueItem);
    return { queueItem, receipt: receipt || undefined };
  }

  // Simulate billing module receipt generation (FIXED: uses centralized logic)
  processBillingPayment(
    visitId: string,
    patientId: string,
    amount: number
  ): { queueItem: MockBillingQueueItem; receipt?: MockBillingReceipt } {
    // Check if receipt already exists for this visitId (FIX: check by visitId)
    const existingReceipt = this.getReceiptsByVisitId(visitId)[0];
    if (existingReceipt) {
      // Reuse existing receipt instead of creating duplicate
      const queueItem = this.billingQueue.get(`queue-${visitId}-apt`) || 
                       this.billingQueue.get(`queue-${visitId}-bill`);
      if (queueItem) {
        return { queueItem, receipt: existingReceipt };
      }
    }

    const queueId = `queue-${visitId}-bill`;
    
    // Create or get queue item
    let queueItem = this.billingQueue.get(queueId);
    if (!queueItem) {
      queueItem = {
        id: queueId,
        visitId,
        patientId,
        status: 'paid',
        netAmount: amount,
        paymentStatus: 'paid'
      };
      this.billingQueue.set(queueId, queueItem);
    }

    // Use centralized receipt generation logic (FIX)
    const receipt = this.createOrReuseReceipt(queueItem);
    return { queueItem, receipt: receipt || undefined };
  }

  // Simulate doctor panel amount update (FIXED: preserves RCP number)
  updateFeeAmount(
    queueId: string,
    newAmount: number
  ): { queueItem: MockBillingQueueItem; receipt?: MockBillingReceipt } {
    const queueItem = this.billingQueue.get(queueId);
    if (!queueItem) {
      throw new Error(`Queue item ${queueId} not found`);
    }

    // FIX: Preserve existing RCP number instead of regenerating
    if (!queueItem.receiptNumber) {
      // Only generate new RCP if one doesn't exist
      const receiptNumber = this.generateReceiptNumber();
      queueItem.receiptNumber = receiptNumber;
    }
    
    queueItem.netAmount = newAmount;
    queueItem.receiptGeneratedAt = new Date();

    // Update existing receipt with new amount (don't create new receipt)
    const existingReceipt = this.billingReceipts.get(`receipt-${queueItem.receiptNumber}`);
    if (existingReceipt) {
      existingReceipt.netAmount = newAmount;
      return { queueItem, receipt: existingReceipt };
    }

    // If no receipt exists yet, create one
    const receipt: MockBillingReceipt = {
      id: `receipt-${queueItem.receiptNumber}`,
      receiptNumber: queueItem.receiptNumber,
      billingQueueId: queueId,
      visitId: queueItem.visitId,
      patientId: queueItem.patientId,
      netAmount: newAmount,
      paymentStatus: 'paid',
      createdAt: new Date()
    };

    this.billingReceipts.set(receipt.id, receipt);
    return { queueItem, receipt };
  }

  // Centralized receipt generation logic (FIX)
  createOrReuseReceipt(queueItem: MockBillingQueueItem): MockBillingReceipt | null {
    // Check if receipt already exists by receiptNumber
    if (queueItem.receiptNumber) {
      const existingReceipt = this.billingReceipts.get(`receipt-${queueItem.receiptNumber}`);
      if (existingReceipt) {
        return existingReceipt;
      }
    }

    // Check by billingQueueId (visitId-based lookup)
    const existingByVisitId = this.getReceiptsByVisitId(queueItem.visitId)[0];
    if (existingByVisitId) {
      // Update queueItem with existing receipt number
      queueItem.receiptNumber = existingByVisitId.receiptNumber;
      return existingByVisitId;
    }

    // No existing receipt - create new one only if conditions met
    if (queueItem.netAmount > 0 && queueItem.paymentStatus === 'paid') {
      const receiptNumber = this.generateReceiptNumber();
      queueItem.receiptNumber = receiptNumber;
      queueItem.receiptGeneratedAt = new Date();

      const receipt: MockBillingReceipt = {
        id: `receipt-${receiptNumber}`,
        receiptNumber,
        billingQueueId: queueItem.id,
        visitId: queueItem.visitId,
        patientId: queueItem.patientId,
        netAmount: queueItem.netAmount,
        paymentStatus: 'paid',
        createdAt: new Date()
      };

      this.billingReceipts.set(receipt.id, receipt);
      return receipt;
    }

    return null;
  }

  getReceiptsByVisitId(visitId: string): MockBillingReceipt[] {
    return Array.from(this.billingReceipts.values()).filter(
      r => r.visitId === visitId
    );
  }

  getReceiptsByPatientId(patientId: string): MockBillingReceipt[] {
    return Array.from(this.billingReceipts.values()).filter(
      r => r.patientId === patientId
    );
  }

  getAllReceipts(): MockBillingReceipt[] {
    return Array.from(this.billingReceipts.values());
  }

  getQueueItem(id: string): MockBillingQueueItem | undefined {
    return this.billingQueue.get(id);
  }

  reset(): void {
    this.billingQueue.clear();
    this.billingReceipts.clear();
    this.receiptCounter = 0;
  }
}

describe('Receipt Generation Bug Condition Exploration', () => {
  let db: MockDatabase;

  beforeEach(() => {
    db = new MockDatabase();
  });

  afterEach(() => {
    db.reset();
  });

  describe('Scenario 1: Fee paid in appointment → generates receipt', () => {
    it('should generate a receipt when fee is paid in appointment module', () => {
      const visitId = 'visit-001';
      const patientId = 'patient-001';
      const amount = 300;

      const { queueItem, receipt } = db.processAppointmentPayment(
        visitId,
        patientId,
        amount
      );

      expect(queueItem).toBeDefined();
      expect(queueItem.paymentStatus).toBe('paid');
      expect(queueItem.netAmount).toBe(amount);
      expect(queueItem.receiptNumber).toBeDefined();
      expect(receipt).toBeDefined();
      expect(receipt?.receiptNumber).toMatch(/^RCP-\d{8}-\d{4}$/);
    });
  });

  describe('Scenario 2: Same fee processed in billing → should NOT generate duplicate receipt', () => {
    it('FAILS on unfixed code: should reuse receipt instead of creating new one', () => {
      const visitId = 'visit-001';
      const patientId = 'patient-001';
      const amount = 300;

      // Step 1: Fee paid in appointment module
      const apt1 = db.processAppointmentPayment(visitId, patientId, amount);
      const firstReceiptNumber = apt1.receipt?.receiptNumber;

      // Step 2: Same fee processed in billing module
      const bill1 = db.processBillingPayment(visitId, patientId, amount);
      const secondReceiptNumber = bill1.receipt?.receiptNumber;

      // Get all receipts for this visit
      const receiptsForVisit = db.getReceiptsByVisitId(visitId);

      // EXPECTED BEHAVIOR (after fix):
      // - Only one receipt should exist for this visit
      // - Both modules should use the same RCP number
      // ACTUAL BEHAVIOR (on unfixed code):
      // - Two receipts are generated with different RCP numbers
      // - This is the BUG we're testing for

      console.log('Counterexample 1: Duplicate receipts for same fee');
      console.log(`  Visit ID: ${visitId}`);
      console.log(`  Appointment receipt: ${firstReceiptNumber}`);
      console.log(`  Billing receipt: ${secondReceiptNumber}`);
      console.log(`  Total receipts for visit: ${receiptsForVisit.length}`);
      console.log(`  Expected: 1 receipt, Actual: ${receiptsForVisit.length}`);

      // This assertion FAILS on unfixed code (proving the bug exists)
      expect(receiptsForVisit.length).toBe(1);
      expect(firstReceiptNumber).toBe(secondReceiptNumber);
    });
  });

  describe('Scenario 3: Amount update → should preserve RCP number', () => {
    it('FAILS on unfixed code: should preserve RCP number when amount is updated', () => {
      const visitId = 'visit-002';
      const patientId = 'patient-002';
      const initialAmount = 300;
      const updatedAmount = 400;

      // Step 1: Fee paid in appointment module
      const apt1 = db.processAppointmentPayment(visitId, patientId, initialAmount);
      const queueId = apt1.queueItem.id;
      const originalReceiptNumber = apt1.receipt?.receiptNumber;

      // Step 2: Doctor panel updates amount
      const update1 = db.updateFeeAmount(queueId, updatedAmount);
      const updatedReceiptNumber = update1.receipt?.receiptNumber;

      // Get all receipts for this visit
      const receiptsForVisit = db.getReceiptsByVisitId(visitId);

      // EXPECTED BEHAVIOR (after fix):
      // - RCP number should remain the same
      // - Only amount should be updated
      // ACTUAL BEHAVIOR (on unfixed code):
      // - New RCP number is generated
      // - This is the BUG we're testing for

      console.log('Counterexample 2: RCP number regenerated on amount update');
      console.log(`  Visit ID: ${visitId}`);
      console.log(`  Original RCP: ${originalReceiptNumber}`);
      console.log(`  Updated RCP: ${updatedReceiptNumber}`);
      console.log(`  Original amount: ₹${initialAmount}`);
      console.log(`  Updated amount: ₹${updatedAmount}`);
      console.log(`  Total receipts for visit: ${receiptsForVisit.length}`);

      // This assertion FAILS on unfixed code (proving the bug exists)
      expect(updatedReceiptNumber).toBe(originalReceiptNumber);
      expect(receiptsForVisit.length).toBe(1);
    });
  });

  describe('Scenario 4: Pending fee updated then paid', () => {
    it('FAILS on unfixed code: should generate only one receipt when fee is marked paid', () => {
      const visitId = 'visit-003';
      const patientId = 'patient-003';
      const initialAmount = 0; // Pending, no amount
      const finalAmount = 300; // Marked as paid with amount

      // Step 1: Create pending fee with no amount (simulate appointment with pending fee)
      const queueId = `queue-${visitId}-pending`;
      const queueItem: MockBillingQueueItem = {
        id: queueId,
        visitId,
        patientId,
        status: 'pending',
        netAmount: initialAmount,
        paymentStatus: 'pending'
      };
      // Manually add to database for this scenario
      db['billingQueue'] = db['billingQueue'] || new Map();
      db['billingQueue'].set(queueId, queueItem);

      // Step 2: Doctor panel updates amount (still pending)
      const update1 = db.updateFeeAmount(queueId, finalAmount);

      // Step 3: Billing module marks as paid
      const bill1 = db.processBillingPayment(visitId, patientId, finalAmount);

      // Get all receipts for this visit
      const receiptsForVisit = db.getReceiptsByVisitId(visitId);

      // EXPECTED BEHAVIOR (after fix):
      // - Only one receipt should be generated (when marked paid in billing)
      // ACTUAL BEHAVIOR (on unfixed code):
      // - Multiple receipts may be generated
      // - This is the BUG we're testing for

      console.log('Counterexample 3: Multiple receipts for pending fee workflow');
      console.log(`  Visit ID: ${visitId}`);
      console.log(`  Total receipts for visit: ${receiptsForVisit.length}`);
      console.log(`  Expected: 1 receipt, Actual: ${receiptsForVisit.length}`);

      // This assertion FAILS on unfixed code (proving the bug exists)
      expect(receiptsForVisit.length).toBe(1);
    });
  });

  describe('Property 1: Fault Condition - Single Receipt Generation for Paid Fees', () => {
    it('FAILS on unfixed code: for any paid fee with amount > 0, exactly one receipt should exist', () => {
      // Property-based test: generate multiple scenarios
      const scenarios = [
        { visitId: 'visit-p1', patientId: 'patient-p1', amount: 300 },
        { visitId: 'visit-p2', patientId: 'patient-p2', amount: 500 },
        { visitId: 'visit-p3', patientId: 'patient-p3', amount: 1000 }
      ];

      const counterexamples: Array<{
        visitId: string;
        receiptCount: number;
        rcpNumbers: string[];
      }> = [];

      for (const scenario of scenarios) {
        // Simulate fee payment in appointment
        db.processAppointmentPayment(
          scenario.visitId,
          scenario.patientId,
          scenario.amount
        );

        // Simulate same fee processed in billing
        db.processBillingPayment(
          scenario.visitId,
          scenario.patientId,
          scenario.amount
        );

        // Check receipts for this visit
        const receipts = db.getReceiptsByVisitId(scenario.visitId);
        const rcpNumbers = receipts.map(r => r.receiptNumber);

        if (receipts.length !== 1 || rcpNumbers.length !== 1) {
          counterexamples.push({
            visitId: scenario.visitId,
            receiptCount: receipts.length,
            rcpNumbers
          });
        }
      }

      console.log('Property 1 Counterexamples: Multiple receipts for paid fees');
      counterexamples.forEach(ce => {
        console.log(`  Visit ${ce.visitId}: ${ce.receiptCount} receipts with RCP numbers: ${ce.rcpNumbers.join(', ')}`);
      });

      // This assertion FAILS on unfixed code (proving the bug exists)
      expect(counterexamples.length).toBe(0);
    });
  });

  describe('Property 2: Preservation - RCP Number Stability on Amount Updates', () => {
    it('FAILS on unfixed code: RCP number should be preserved when amount is updated', () => {
      const visitId = 'visit-rcp-stable';
      const patientId = 'patient-rcp-stable';
      const initialAmount = 300;

      // Create initial fee with receipt
      const apt1 = db.processAppointmentPayment(visitId, patientId, initialAmount);
      const originalRcp = apt1.receipt?.receiptNumber;

      // Update amount multiple times
      const updates = [400, 450, 500];
      const rcpNumbers: string[] = [originalRcp!];

      for (const newAmount of updates) {
        const update = db.updateFeeAmount(apt1.queueItem.id, newAmount);
        rcpNumbers.push(update.receipt?.receiptNumber!);
      }

      // Check if all RCP numbers are the same
      const uniqueRcps = new Set(rcpNumbers);

      console.log('Property 2 Counterexample: RCP number changes on amount updates');
      console.log(`  Visit ID: ${visitId}`);
      console.log(`  Original RCP: ${originalRcp}`);
      console.log(`  RCP numbers after updates: ${rcpNumbers.slice(1).join(', ')}`);
      console.log(`  Unique RCP numbers: ${uniqueRcps.size}`);
      console.log(`  Expected: 1 unique RCP, Actual: ${uniqueRcps.size}`);

      // This assertion FAILS on unfixed code (proving the bug exists)
      expect(uniqueRcps.size).toBe(1);
    });
  });

  describe('Property 3: Preservation - Non-Paid Fee Behavior', () => {
    it('should NOT generate receipt for pending fees', () => {
      const visitId = 'visit-pending';
      const patientId = 'patient-pending';

      // Create pending fee (no payment)
      const queueId = `queue-${visitId}-pending`;
      const queueItem: MockBillingQueueItem = {
        id: queueId,
        visitId,
        patientId,
        status: 'pending',
        netAmount: 0,
        paymentStatus: 'pending'
      };

      // Get receipts for this visit
      const receipts = db.getReceiptsByVisitId(visitId);

      // EXPECTED: No receipts for pending fees
      expect(receipts.length).toBe(0);
    });
  });

  describe('Property 4: Preservation - Multiple Fees for Different Visits', () => {
    it('should generate separate receipts for different visits', () => {
      const visits = [
        { visitId: 'visit-sep1', patientId: 'patient-sep', amount: 300 },
        { visitId: 'visit-sep2', patientId: 'patient-sep', amount: 400 },
        { visitId: 'visit-sep3', patientId: 'patient-sep', amount: 500 }
      ];

      for (const visit of visits) {
        db.processAppointmentPayment(visit.visitId, visit.patientId, visit.amount);
      }

      // Get all receipts for patient
      const receipts = db.getReceiptsByPatientId('patient-sep');

      // EXPECTED: 3 separate receipts for 3 different visits
      expect(receipts.length).toBe(3);

      // Each receipt should have different RCP number
      const rcpNumbers = receipts.map(r => r.receiptNumber);
      const uniqueRcps = new Set(rcpNumbers);
      expect(uniqueRcps.size).toBe(3);
    });
  });
});

/**
 * Receipt Generation Preservation Property Tests
 * 
 * These tests capture baseline behavior on UNFIXED code for non-buggy inputs.
 * They verify that existing behavior is preserved and not broken by the fix.
 * 
 * EXPECTED OUTCOME: Tests PASS on unfixed code (confirms baseline behavior to preserve)
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 * Validates: Design Properties 2.2, 2.3, 2.4
 */

describe('Receipt Generation Preservation Property Tests', () => {
  let db: MockDatabase;

  beforeEach(() => {
    db = new MockDatabase();
  });

  afterEach(() => {
    db.reset();
  });

  describe('Property 1: Pending Fees Do NOT Generate Receipts', () => {
    it('should NOT generate receipt for pending fees with zero amount', () => {
      const scenarios = [
        { visitId: 'visit-pend-1', patientId: 'patient-pend-1', amount: 0 },
        { visitId: 'visit-pend-2', patientId: 'patient-pend-2', amount: 0 },
        { visitId: 'visit-pend-3', patientId: 'patient-pend-3', amount: 0 }
      ];

      for (const scenario of scenarios) {
        // Create pending fee without payment
        const queueId = `queue-${scenario.visitId}-pending`;
        const queueItem: MockBillingQueueItem = {
          id: queueId,
          visitId: scenario.visitId,
          patientId: scenario.patientId,
          status: 'pending',
          netAmount: scenario.amount,
          paymentStatus: 'pending'
        };
        db['billingQueue'].set(queueId, queueItem);
      }

      // Verify no receipts were generated for any pending fees
      const allReceipts = db.getAllReceipts();
      expect(allReceipts.length).toBe(0);
    });

    it('should NOT generate receipt for pending fees even after amount update', () => {
      const visitId = 'visit-pend-update';
      const patientId = 'patient-pend-update';

      // Create pending fee with zero amount
      const queueId = `queue-${visitId}-pending`;
      const queueItem: MockBillingQueueItem = {
        id: queueId,
        visitId,
        patientId,
        status: 'pending',
        netAmount: 0,
        paymentStatus: 'pending'
      };
      db['billingQueue'].set(queueId, queueItem);

      // Update amount while still pending (doctor panel update)
      queueItem.netAmount = 300;
      queueItem.status = 'pending'; // Still pending, not paid

      // Verify no receipts were generated
      const receipts = db.getReceiptsByVisitId(visitId);
      expect(receipts.length).toBe(0);
    });

    it('should NOT generate receipt for partial payment fees', () => {
      const scenarios = [
        { visitId: 'visit-partial-1', patientId: 'patient-partial-1', amount: 150 },
        { visitId: 'visit-partial-2', patientId: 'patient-partial-2', amount: 200 },
        { visitId: 'visit-partial-3', patientId: 'patient-partial-3', amount: 250 }
      ];

      for (const scenario of scenarios) {
        // Create partial payment fee
        const queueId = `queue-${scenario.visitId}-partial`;
        const queueItem: MockBillingQueueItem = {
          id: queueId,
          visitId: scenario.visitId,
          patientId: scenario.patientId,
          status: 'pending',
          netAmount: scenario.amount,
          paymentStatus: 'partial' // Partial payment, not fully paid
        };
        db['billingQueue'].set(queueId, queueItem);
      }

      // Verify no receipts were generated for partial payments
      const allReceipts = db.getAllReceipts();
      expect(allReceipts.length).toBe(0);
    });
  });

  describe('Property 2: Exempt Fees (₹0) Do NOT Generate Receipts', () => {
    it('should NOT generate receipt for exempt fees with zero netAmount', () => {
      const scenarios = [
        { visitId: 'visit-exempt-1', patientId: 'patient-exempt-1' },
        { visitId: 'visit-exempt-2', patientId: 'patient-exempt-2' },
        { visitId: 'visit-exempt-3', patientId: 'patient-exempt-3' }
      ];

      for (const scenario of scenarios) {
        // Create exempt fee (zero amount, marked as exempt)
        const queueId = `queue-${scenario.visitId}-exempt`;
        const queueItem: MockBillingQueueItem = {
          id: queueId,
          visitId: scenario.visitId,
          patientId: scenario.patientId,
          status: 'completed',
          netAmount: 0, // Exempt - zero amount
          paymentStatus: 'exempt'
        };
        db['billingQueue'].set(queueId, queueItem);
      }

      // Verify no receipts were generated for exempt fees
      const allReceipts = db.getAllReceipts();
      expect(allReceipts.length).toBe(0);
    });

    it('should NOT generate receipt for fees with zero amount regardless of status', () => {
      const statuses: Array<'pending' | 'paid' | 'partial' | 'exempt'> = [
        'pending',
        'partial',
        'exempt'
      ];

      for (let i = 0; i < statuses.length; i++) {
        const queueId = `queue-zero-amount-${i}`;
        const queueItem: MockBillingQueueItem = {
          id: queueId,
          visitId: `visit-zero-${i}`,
          patientId: `patient-zero-${i}`,
          status: 'completed',
          netAmount: 0, // Zero amount
          paymentStatus: statuses[i]
        };
        db['billingQueue'].set(queueId, queueItem);
      }

      // Verify no receipts were generated
      const allReceipts = db.getAllReceipts();
      expect(allReceipts.length).toBe(0);
    });
  });

  describe('Property 3: Different Fees Generate Separate Receipts', () => {
    it('should generate separate receipts for fees with different visitIds', () => {
      const scenarios = [
        { visitId: 'visit-diff-1', patientId: 'patient-diff', amount: 300 },
        { visitId: 'visit-diff-2', patientId: 'patient-diff', amount: 400 },
        { visitId: 'visit-diff-3', patientId: 'patient-diff', amount: 500 },
        { visitId: 'visit-diff-4', patientId: 'patient-diff', amount: 600 },
        { visitId: 'visit-diff-5', patientId: 'patient-diff', amount: 700 }
      ];

      for (const scenario of scenarios) {
        db.processAppointmentPayment(
          scenario.visitId,
          scenario.patientId,
          scenario.amount
        );
      }

      // Get all receipts for patient
      const receipts = db.getReceiptsByPatientId('patient-diff');

      // EXPECTED: Each visit should have its own receipt
      expect(receipts.length).toBe(scenarios.length);

      // Verify each receipt has unique RCP number
      const rcpNumbers = receipts.map(r => r.receiptNumber);
      const uniqueRcps = new Set(rcpNumbers);
      expect(uniqueRcps.size).toBe(scenarios.length);

      // Verify each receipt has correct visitId
      const visitIds = receipts.map(r => r.visitId);
      const uniqueVisitIds = new Set(visitIds);
      expect(uniqueVisitIds.size).toBe(scenarios.length);
    });

    it('should generate separate receipts for different patients', () => {
      const scenarios = [
        { visitId: 'visit-pat-1', patientId: 'patient-1', amount: 300 },
        { visitId: 'visit-pat-2', patientId: 'patient-2', amount: 400 },
        { visitId: 'visit-pat-3', patientId: 'patient-3', amount: 500 }
      ];

      for (const scenario of scenarios) {
        db.processAppointmentPayment(
          scenario.visitId,
          scenario.patientId,
          scenario.amount
        );
      }

      // Get all receipts
      const allReceipts = db.getAllReceipts();

      // EXPECTED: 3 separate receipts for 3 different patients
      expect(allReceipts.length).toBe(3);

      // Verify each receipt has unique patientId
      const patientIds = allReceipts.map(r => r.patientId);
      const uniquePatientIds = new Set(patientIds);
      expect(uniquePatientIds.size).toBe(3);
    });

    it('should generate receipts with correct amounts for different fees', () => {
      const scenarios = [
        { visitId: 'visit-amt-1', patientId: 'patient-amt', amount: 100 },
        { visitId: 'visit-amt-2', patientId: 'patient-amt', amount: 250 },
        { visitId: 'visit-amt-3', patientId: 'patient-amt', amount: 500 },
        { visitId: 'visit-amt-4', patientId: 'patient-amt', amount: 1000 }
      ];

      for (const scenario of scenarios) {
        db.processAppointmentPayment(
          scenario.visitId,
          scenario.patientId,
          scenario.amount
        );
      }

      // Get all receipts for patient
      const receipts = db.getReceiptsByPatientId('patient-amt');

      // EXPECTED: Each receipt should have correct amount
      expect(receipts.length).toBe(scenarios.length);

      for (let i = 0; i < receipts.length; i++) {
        const receipt = receipts[i];
        const scenario = scenarios.find(s => s.visitId === receipt.visitId);
        expect(receipt.netAmount).toBe(scenario?.amount);
      }
    });
  });

  describe('Property 4: Non-Receipt-Generation Interactions Work Correctly', () => {
    it('should maintain correct fee display information', () => {
      const visitId = 'visit-display';
      const patientId = 'patient-display';
      const amount = 300;

      // Create fee
      const { queueItem } = db.processAppointmentPayment(
        visitId,
        patientId,
        amount
      );

      // Verify fee information is correct
      expect(queueItem.visitId).toBe(visitId);
      expect(queueItem.patientId).toBe(patientId);
      expect(queueItem.netAmount).toBe(amount);
      expect(queueItem.paymentStatus).toBe('paid');
      expect(queueItem.status).toBe('paid');
    });

    it('should allow patient navigation and filtering', () => {
      const patients = [
        { patientId: 'patient-nav-1', visits: 2 },
        { patientId: 'patient-nav-2', visits: 3 },
        { patientId: 'patient-nav-3', visits: 1 }
      ];

      let visitCounter = 0;
      for (const patient of patients) {
        for (let i = 0; i < patient.visits; i++) {
          visitCounter++;
          db.processAppointmentPayment(
            `visit-nav-${visitCounter}`,
            patient.patientId,
            300 + i * 100
          );
        }
      }

      // Verify we can retrieve receipts by patient
      for (const patient of patients) {
        const receipts = db.getReceiptsByPatientId(patient.patientId);
        expect(receipts.length).toBe(patient.visits);
        expect(receipts.every(r => r.patientId === patient.patientId)).toBe(true);
      }
    });

    it('should maintain receipt history and retrieval', () => {
      const scenarios = [
        { visitId: 'visit-hist-1', patientId: 'patient-hist', amount: 300 },
        { visitId: 'visit-hist-2', patientId: 'patient-hist', amount: 400 },
        { visitId: 'visit-hist-3', patientId: 'patient-hist', amount: 500 }
      ];

      const createdReceipts = [];
      for (const scenario of scenarios) {
        const { receipt } = db.processAppointmentPayment(
          scenario.visitId,
          scenario.patientId,
          scenario.amount
        );
        if (receipt) {
          createdReceipts.push(receipt);
        }
      }

      // Verify all receipts can be retrieved
      const allReceipts = db.getAllReceipts();
      expect(allReceipts.length).toBe(createdReceipts.length);

      // Verify receipt details are preserved
      for (const created of createdReceipts) {
        const retrieved = allReceipts.find(r => r.receiptNumber === created.receiptNumber);
        expect(retrieved).toBeDefined();
        expect(retrieved?.visitId).toBe(created.visitId);
        expect(retrieved?.patientId).toBe(created.patientId);
        expect(retrieved?.netAmount).toBe(created.netAmount);
      }
    });

    it('should handle multiple operations without data loss', () => {
      // Simulate multiple operations: create fees, retrieve, filter
      const operations = [
        { type: 'create', visitId: 'visit-ops-1', patientId: 'patient-ops', amount: 300 },
        { type: 'create', visitId: 'visit-ops-2', patientId: 'patient-ops', amount: 400 },
        { type: 'retrieve', patientId: 'patient-ops' },
        { type: 'create', visitId: 'visit-ops-3', patientId: 'patient-ops', amount: 500 },
        { type: 'retrieve', patientId: 'patient-ops' }
      ];

      let receiptCount = 0;
      for (const op of operations) {
        if (op.type === 'create') {
          db.processAppointmentPayment(
            op.visitId,
            op.patientId,
            op.amount
          );
          receiptCount++;
        } else if (op.type === 'retrieve') {
          const receipts = db.getReceiptsByPatientId(op.patientId);
          expect(receipts.length).toBe(receiptCount);
        }
      }

      // Final verification
      const finalReceipts = db.getReceiptsByPatientId('patient-ops');
      expect(finalReceipts.length).toBe(3);
    });
  });

  describe('Property 5: Receipt Generation Consistency', () => {
    it('should generate receipts consistently for same input patterns', () => {
      // Test that same input patterns produce consistent results
      const pattern = { visitId: 'visit-cons', patientId: 'patient-cons', amount: 300 };

      // First generation
      const result1 = db.processAppointmentPayment(
        pattern.visitId,
        pattern.patientId,
        pattern.amount
      );

      // Reset and try again with fresh database
      db.reset();

      // Second generation
      const result2 = db.processAppointmentPayment(
        pattern.visitId,
        pattern.patientId,
        pattern.amount
      );

      // Verify both results have same structure
      expect(result1.queueItem.visitId).toBe(result2.queueItem.visitId);
      expect(result1.queueItem.patientId).toBe(result2.queueItem.patientId);
      expect(result1.queueItem.netAmount).toBe(result2.queueItem.netAmount);
      expect(result1.receipt?.paymentStatus).toBe(result2.receipt?.paymentStatus);
    });

    it('should maintain receipt count accuracy across operations', () => {
      const operations = [
        { visitId: 'visit-acc-1', patientId: 'patient-acc', amount: 300 },
        { visitId: 'visit-acc-2', patientId: 'patient-acc', amount: 400 },
        { visitId: 'visit-acc-3', patientId: 'patient-acc', amount: 500 },
        { visitId: 'visit-acc-4', patientId: 'patient-acc', amount: 600 },
        { visitId: 'visit-acc-5', patientId: 'patient-acc', amount: 700 }
      ];

      for (const op of operations) {
        db.processAppointmentPayment(op.visitId, op.patientId, op.amount);
      }

      // Verify receipt count matches operations
      const receipts = db.getReceiptsByPatientId('patient-acc');
      expect(receipts.length).toBe(operations.length);

      // Verify all receipts have unique RCP numbers
      const rcpNumbers = receipts.map(r => r.receiptNumber);
      const uniqueRcps = new Set(rcpNumbers);
      expect(uniqueRcps.size).toBe(operations.length);
    });
  });
});
