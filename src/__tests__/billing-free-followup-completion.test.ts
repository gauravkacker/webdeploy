/**
 * Billing Free Follow-up Completion Bug Condition Exploration Test
 * 
 * This test demonstrates the bug where patients with Free Follow-up (Fee = ₹0)
 * and Bill Status = "Paid" are NOT being marked as completed.
 * 
 * EXPECTED OUTCOME: Test FAILS on unfixed code (this proves the bug exists)
 * 
 * Validates: Requirements 2.1, 2.2, 2.3
 * Validates: Design Properties 1 (Bug Condition - Free Follow-up Completion)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock database for testing
interface MockBillingQueueItem {
  id: string;
  visitId: string;
  patientId: string;
  status: 'pending' | 'paid' | 'completed';
  feeAmount: number;
  netAmount: number;
  paymentStatus: 'pending' | 'paid' | 'partial' | 'exempt';
  createdAt: Date;
}

interface MockPatient {
  id: string;
  firstName: string;
  lastName: string;
}

class MockBillingDatabase {
  private billingQueue: Map<string, MockBillingQueueItem> = new Map();
  private patients: Map<string, MockPatient> = new Map();
  private itemCounter: number = 0;

  createPatient(id: string, firstName: string, lastName: string): MockPatient {
    const patient: MockPatient = { id, firstName, lastName };
    this.patients.set(id, patient);
    return patient;
  }

  getPatient(id: string): MockPatient | undefined {
    return this.patients.get(id);
  }

  createBillingItem(
    visitId: string,
    patientId: string,
    feeAmount: number,
    paymentStatus: 'pending' | 'paid' | 'partial' | 'exempt'
  ): MockBillingQueueItem {
    this.itemCounter++;
    const item: MockBillingQueueItem = {
      id: `billing-${this.itemCounter}`,
      visitId,
      patientId,
      status: this.determineStatus(feeAmount, paymentStatus),
      feeAmount,
      netAmount: feeAmount,
      paymentStatus,
      createdAt: new Date()
    };
    this.billingQueue.set(item.id, item);
    return item;
  }

  private determineStatus(
    feeAmount: number,
    paymentStatus: 'pending' | 'paid' | 'partial' | 'exempt'
  ): 'pending' | 'paid' | 'completed' {
    // BUG: This condition excludes zero-fee patients
    if (feeAmount > 0 && paymentStatus === 'paid') {
      return 'completed';
    }
    
    if (paymentStatus === 'exempt') {
      return 'completed';
    }
    
    return 'pending';
  }

  getItemsByPatient(patientId: string): MockBillingQueueItem[] {
    return Array.from(this.billingQueue.values()).filter(
      item => item.patientId === patientId
    );
  }

  getAllItemsSorted(): MockBillingQueueItem[] {
    const items = Array.from(this.billingQueue.values());
    const active = items.filter(i => i.status === 'pending' || i.status === 'paid');
    const completed = items.filter(i => i.status === 'completed');
    return [...active, ...completed];
  }

  getQueuePosition(itemId: string): number {
    const sorted = this.getAllItemsSorted();
    const index = sorted.findIndex(i => i.id === itemId);
    return index >= 0 ? index + 1 : -1;
  }

  getUIDisplayState(itemId: string): 'active' | 'grayed-out' {
    const item = this.billingQueue.get(itemId);
    if (!item) return 'active';
    return item.status === 'completed' ? 'grayed-out' : 'active';
  }

  reset(): void {
    this.billingQueue.clear();
    this.patients.clear();
    this.itemCounter = 0;
  }
}

describe('Billing Free Follow-up Completion Bug Condition Exploration', () => {
  let db: MockBillingDatabase;

  beforeEach(() => {
    db = new MockBillingDatabase();
  });

  afterEach(() => {
    db.reset();
  });

  describe('Bug Condition: Fee = ₹0 (Free Follow-up) AND Bill Status = "Paid"', () => {
    it('FAILS on unfixed code: should mark patient as completed when Fee = ₹0 and Bill Status = "Paid"', () => {
      const patientId = 'patient-free-followup-001';
      const visitId = 'visit-free-followup-001';
      
      db.createPatient(patientId, 'John', 'Doe');

      const billingItem = db.createBillingItem(
        visitId,
        patientId,
        0,
        'paid'
      );

      console.log('Counterexample 1: Free Follow-up with Paid Status');
      console.log(`  Patient ID: ${patientId}`);
      console.log(`  Fee Amount: ₹${billingItem.feeAmount}`);
      console.log(`  Payment Status: ${billingItem.paymentStatus}`);
      console.log(`  Billing Status: ${billingItem.status}`);
      console.log(`  Expected Status: completed`);

      expect(billingItem.status).toBe('completed');
    });

    it('FAILS on unfixed code: should move free follow-up patient to bottom of queue when paid', () => {
      const freeFollowupPatientId = 'patient-free-001';
      const paidPatientId = 'patient-paid-001';
      const pendingPatientId = 'patient-pending-001';

      db.createPatient(freeFollowupPatientId, 'Alice', 'Free');
      db.createPatient(paidPatientId, 'Bob', 'Paid');
      db.createPatient(pendingPatientId, 'Charlie', 'Pending');

      const pendingItem = db.createBillingItem('visit-pending-001', pendingPatientId, 500, 'pending');
      const paidItem = db.createBillingItem('visit-paid-001', paidPatientId, 300, 'paid');
      const freeFollowupItem = db.createBillingItem('visit-free-001', freeFollowupPatientId, 0, 'paid');

      const sortedQueue = db.getAllItemsSorted();
      const freeFollowupPosition = db.getQueuePosition(freeFollowupItem.id);

      console.log('Counterexample 2: Queue Position for Free Follow-up');
      console.log(`  Queue order: ${sortedQueue.map(i => `${i.patientId}(${i.status})`).join(' -> ')}`);
      console.log(`  Free follow-up position: ${freeFollowupPosition}`);
      console.log(`  Expected position: 3 (bottom)`);

      expect(freeFollowupPosition).toBe(3);
      expect(sortedQueue[2].id).toBe(freeFollowupItem.id);
    });

    it('FAILS on unfixed code: should show grayed-out UI state for free follow-up patient when paid', () => {
      const patientId = 'patient-ui-test-001';
      const visitId = 'visit-ui-test-001';

      db.createPatient(patientId, 'Diana', 'UI');

      const billingItem = db.createBillingItem(
        visitId,
        patientId,
        0,
        'paid'
      );

      const uiState = db.getUIDisplayState(billingItem.id);

      console.log('Counterexample 3: UI Display State for Free Follow-up');
      console.log(`  Patient ID: ${patientId}`);
      console.log(`  Fee Amount: ₹${billingItem.feeAmount}`);
      console.log(`  Payment Status: ${billingItem.paymentStatus}`);
      console.log(`  UI State: ${uiState}`);
      console.log(`  Expected UI State: grayed-out`);

      expect(uiState).toBe('grayed-out');
    });

    it('FAILS on unfixed code: should handle multiple free follow-up patients with paid status', () => {
      const freeFollowupPatients = [
        { id: 'patient-free-multi-001', name: 'Patient 1' },
        { id: 'patient-free-multi-002', name: 'Patient 2' },
        { id: 'patient-free-multi-003', name: 'Patient 3' }
      ];

      const billingItems = [];

      for (const patient of freeFollowupPatients) {
        db.createPatient(patient.id, patient.name, 'Free');
        const item = db.createBillingItem(
          `visit-${patient.id}`,
          patient.id,
          0,
          'paid'
        );
        billingItems.push(item);
      }

      const completedCount = billingItems.filter(i => i.status === 'completed').length;
      const allCompleted = billingItems.every(i => i.status === 'completed');

      console.log('Counterexample 4: Multiple Free Follow-up Patients');
      console.log(`  Total free follow-up patients: ${freeFollowupPatients.length}`);
      console.log(`  Completed: ${completedCount}`);
      console.log(`  Expected completed: ${freeFollowupPatients.length}`);

      expect(completedCount).toBe(freeFollowupPatients.length);
      expect(allCompleted).toBe(true);
    });
  });

  describe('Property 1: Bug Condition - Free Follow-up Completion', () => {
    it('FAILS on unfixed code: for any patient where Fee = ₹0 AND Bill Status = "Paid", isCompleted should be true', () => {
      const scenarios = [
        { visitId: 'visit-prop-1', patientId: 'patient-prop-1' },
        { visitId: 'visit-prop-2', patientId: 'patient-prop-2' },
        { visitId: 'visit-prop-3', patientId: 'patient-prop-3' },
        { visitId: 'visit-prop-4', patientId: 'patient-prop-4' },
        { visitId: 'visit-prop-5', patientId: 'patient-prop-5' }
      ];

      const counterexamples: Array<{
        visitId: string;
        patientId: string;
        feeAmount: number;
        paymentStatus: string;
        actualStatus: string;
      }> = [];

      for (const scenario of scenarios) {
        db.createPatient(scenario.patientId, 'Test', 'Patient');

        const item = db.createBillingItem(
          scenario.visitId,
          scenario.patientId,
          0,
          'paid'
        );

        if (item.status !== 'completed') {
          counterexamples.push({
            visitId: scenario.visitId,
            patientId: scenario.patientId,
            feeAmount: item.feeAmount,
            paymentStatus: item.paymentStatus,
            actualStatus: item.status
          });
        }
      }

      console.log('Property 1 Counterexamples: Free Follow-up Patients Not Marked as Completed');
      counterexamples.forEach(ce => {
        console.log(`  Visit ${ce.visitId}: Fee=₹${ce.feeAmount}, Status=${ce.paymentStatus}, Result=${ce.actualStatus} (expected: completed)`);
      });

      expect(counterexamples.length).toBe(0);
    });
  });

  describe('Preservation: Non-Bug Conditions Should Work Correctly', () => {
    it('should mark non-zero fee patients as completed when paid', () => {
      const patientId = 'patient-preserve-nonzero';
      const visitId = 'visit-preserve-nonzero';

      db.createPatient(patientId, 'Preserve', 'Test');

      const item = db.createBillingItem(
        visitId,
        patientId,
        300,
        'paid'
      );

      expect(item.status).toBe('completed');
    });

    it('should keep free follow-up patients in active queue when unpaid', () => {
      const patientId = 'patient-preserve-unpaid';
      const visitId = 'visit-preserve-unpaid';

      db.createPatient(patientId, 'Preserve', 'Unpaid');

      const item = db.createBillingItem(
        visitId,
        patientId,
        0,
        'pending'
      );

      expect(item.status).toBe('pending');
    });

    it('should keep non-zero fee patients in active queue when unpaid', () => {
      const patientId = 'patient-preserve-nonzero-unpaid';
      const visitId = 'visit-preserve-nonzero-unpaid';

      db.createPatient(patientId, 'Preserve', 'NonZeroUnpaid');

      const item = db.createBillingItem(
        visitId,
        patientId,
        500,
        'pending'
      );

      expect(item.status).toBe('pending');
    });

    it('should mark exempt fees as completed', () => {
      const patientId = 'patient-preserve-exempt';
      const visitId = 'visit-preserve-exempt';

      db.createPatient(patientId, 'Preserve', 'Exempt');

      const item = db.createBillingItem(
        visitId,
        patientId,
        0,
        'exempt'
      );

      expect(item.status).toBe('completed');
    });
  });
});
