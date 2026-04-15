"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/layout/SidebarComponent';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TimeDisplay } from '@/components/layout/TimeDisplay';
import { getCurrentUser } from '@/lib/permissions';
import { useDebounce } from '@/hooks/useDebounce';
import { billingQueueDb, billingReceiptDb, patientDb, appointmentDb, feeHistoryDb, db, medicineBillDb, medicineAmountMemoryDb, createOrReuseReceipt } from '@/lib/db/database';
import { pharmacyQueueDb, doctorPrescriptionDb, doctorVisitDb, doctorSettingsDb } from '@/lib/db/doctor-panel';
import type { PharmacyQueueItem, MedicineBill, MedicineBillItem } from '@/lib/db/schema';
import type { BillingQueueItem, BillingReceipt, BillingReceiptItem } from '@/lib/db/schema';
import type { DoctorPrescription, DoctorVisit } from '@/lib/db/schema';
import type { FeeHistoryEntry } from '@/types';
import { generatePrescriptionHTML } from '@/lib/prescription-formatter';
import { ThermalPrinter, generateInvoiceNumber, getInvoiceSettings, getBillPrintSettings } from '@/lib/thermal-printer';

// Types
interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  registrationNumber: string;
  age?: number;
  sex?: string;
}

interface BillingQueueItemWithDetails extends BillingQueueItem {
  patient?: PatientInfo;
  visit?: DoctorVisit;
  prescriptions?: DoctorPrescription[];
}

type TabType = 'pending' | 'completed' | 'history' | 'pendingSearch';

// Generate ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Format currency
function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

// Format date
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [queueItems, setQueueItems] = useState<BillingQueueItemWithDetails[]>([]);
  const [selectedItem, setSelectedItem] = useState<BillingQueueItemWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [showCompleted, setShowCompleted] = useState(true);
  
  // Date filter state - use ref to track current date for interval callback
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const selectedDateRef = useRef<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Fee editing state
  const [showFeePopup, setShowFeePopup] = useState(false);
  const [editingFee, setEditingFee] = useState<{
    feeAmount: number;
    discountPercent: number;
    discountAmount: number;
    netAmount: number;
    paymentMethod: string;
    notes: string;
  }>({
    feeAmount: 0,
    discountPercent: 0,
    discountAmount: 0,
    netAmount: 0,
    paymentMethod: 'cash',
    notes: ''
  });
  
  // Prescription view state
  const [showPrescriptionPopup, setShowPrescriptionPopup] = useState(false);
  const [viewingPrescriptions, setViewingPrescriptions] = useState<DoctorPrescription[]>([]);
  const [viewingPatient, setViewingPatient] = useState<PatientInfo | null>(null);
  const [viewingBillingItem, setViewingBillingItem] = useState<BillingQueueItemWithDetails | null>(null);
  
  // Bill creation state
  const [isBillMode, setIsBillMode] = useState(false);
  const [billItems, setBillItems] = useState<Array<{
    id: string;
    prescriptionId: string;
    medicine: string;
    potency?: string;
    quantityDisplay: string; // Original quantity string like "2dr"
    quantity: number; // Number of bottles for billing
    doseForm?: string;
    dosePattern?: string;
    frequency?: string;
    duration?: string;
    isCombination?: boolean;
    combinationContent?: string;
    amount: number;
  }>>([]);
  const [billDiscount, setBillDiscount] = useState(0);
  const [billTax, setBillTax] = useState(0);
  const [billNotes, setBillNotes] = useState('');
  const [savedMedicineBill, setSavedMedicineBill] = useState<MedicineBill | null>(null);
  const [billPayment, setBillPayment] = useState(0);
  const [billPaymentMethod, setBillPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'cheque' | 'insurance' | 'exempt'>('cash');
  const [additionalCurrentPayment, setAdditionalCurrentPayment] = useState(0);
  const [editableAlreadyPaid, setEditableAlreadyPaid] = useState(0);
  const [prevPendingAmount, setPrevPendingAmount] = useState(0);
  const [payPrevPending, setPayPrevPending] = useState(0);
  const [billHasChanges, setBillHasChanges] = useState(false);
  const [originalBillData, setOriginalBillData] = useState<string>('');
  const [isSavingBill, setIsSavingBill] = useState(false);
  
  // New item state for adding medicines not in prescription
  const [showAddNewItem, setShowAddNewItem] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    medicine: '',
    potency: '',
    quantity: 1,
    doseForm: '',
    size: '',
    amount: 0
  });
  
  // Medicine history for autocomplete
  const [medicineHistory, setMedicineHistory] = useState<string[]>([]);
  const [medicineSuggestions, setMedicineSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  
  // Multiple new items form
  const [newItemsRows, setNewItemsRows] = useState<Array<{
    id: string;
    medicine: string;
    potency: string;
    quantity: number;
    doseForm: string;
    size: string;
    amount: number;
  }>>([]);
  
  // Inline add row state
  const [inlineNewRows, setInlineNewRows] = useState<Array<{
    id: string;
    medicine: string;
    potency: string;
    quantity: number;
    doseForm: string;
    size: string;
    amount: number;
  }>>([]);
  const [inlineMedicineSuggestions, setInlineMedicineSuggestions] = useState<string[]>([]);
  const [inlineSelectedSuggestionIndex, setInlineSelectedSuggestionIndex] = useState(-1);
  
  // View saved bill state
  const [showViewBillPopup, setShowViewBillPopup] = useState(false);
  const [viewingMedicineBill, setViewingMedicineBill] = useState<MedicineBill | null>(null);
  
  // Fee history state
  const [showFeeHistory, setShowFeeHistory] = useState(false);
  const [feeHistoryPatient, setFeeHistoryPatient] = useState<PatientInfo | null>(null);
  const [feeHistoryData, setFeeHistoryData] = useState<any[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const debouncedHistoryQuery = useDebounce(historyQuery, 300);
  const [historyResults, setHistoryResults] = useState<PatientInfo[]>([]);
  const [isHistorySearching, setIsHistorySearching] = useState(false);
  const [selectedHistoryPatient, setSelectedHistoryPatient] = useState<PatientInfo | null>(null);
  const [patientReceipts, setPatientReceipts] = useState<BillingReceipt[]>([]);
  const [patientMedicineBills, setPatientMedicineBills] = useState<MedicineBill[]>([]);
  
  // Pending search state
  const [pendingSearchType, setPendingSearchType] = useState<'fees' | 'bills'>('fees');
  const [pendingSearchQuery, setPendingSearchQuery] = useState('');
  const debouncedPendingSearchQuery = useDebounce(pendingSearchQuery, 300);
  const [pendingSearchResults, setPendingSearchResults] = useState<PatientInfo[]>([]);
  const [isPendingSearching, setIsPendingSearching] = useState(false);
  const [selectedPendingPatient, setSelectedPendingPatient] = useState<PatientInfo | null>(null);
  const [pendingFees, setPendingFees] = useState<BillingQueueItemWithDetails[]>([]);
  const [pendingBills, setPendingBills] = useState<MedicineBill[]>([]);
  const [showAllPending, setShowAllPending] = useState(false);
  const [pendingSearchSelectedIndex, setPendingSearchSelectedIndex] = useState(-1);

  // History Search Logic
  useEffect(() => {
    if (debouncedHistoryQuery.trim().length < 2) {
      setHistoryResults([]);
      setIsHistorySearching(false);
      return;
    }

    setIsHistorySearching(true);
    try {
      const results = (patientDb.search(debouncedHistoryQuery) as any[]).map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        mobileNumber: p.mobileNumber,
        registrationNumber: p.registrationNumber,
        age: p.age,
        sex: p.sex,
      }));
      // Apply deduplication to remove duplicate patient IDs
      const { deduplicatePatients } = require('@/lib/utils/deduplication');
      setHistoryResults(deduplicatePatients(results));
    } catch (error) {
      console.error('History search error:', error);
      setHistoryResults([]);
    } finally {
      setIsHistorySearching(false);
    }
  }, [debouncedHistoryQuery]);

  // Pending Search Logic
  useEffect(() => {
    if (debouncedPendingSearchQuery.trim().length < 2) {
      setPendingSearchResults([]);
      setIsPendingSearching(false);
      return;
    }

    setIsPendingSearching(true);
    try {
      const results = (patientDb.search(debouncedPendingSearchQuery) as any[]).map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        mobileNumber: p.mobileNumber,
        registrationNumber: p.registrationNumber,
        age: p.age,
        sex: p.sex,
      }));
      // Apply deduplication to remove duplicate patient IDs
      const { deduplicatePatients } = require('@/lib/utils/deduplication');
      setPendingSearchResults(deduplicatePatients(results));
    } catch (error) {
      console.error('Pending search error:', error);
      setPendingSearchResults([]);
    } finally {
      setIsPendingSearching(false);
    }
  }, [debouncedPendingSearchQuery]);

  const handleHistorySearchChange = (query: string) => {
    setHistoryQuery(query);
  };

  const handlePendingSearchChange = (query: string) => {
    setPendingSearchQuery(query);
    setPendingSearchSelectedIndex(-1);
  };
  const loadPatientHistory = (patient: PatientInfo) => {
    setSelectedHistoryPatient(patient);
    let receipts = billingReceiptDb.getByPatient(patient.id) as unknown as BillingReceipt[];
    const bills = medicineBillDb.getByPatientId(patient.id) as unknown as MedicineBill[];
    
    // Deduplicate receipts by visitId - keep only the latest receipt per visit
    const visitMap = new Map<string, BillingReceipt>();
    receipts.forEach((r) => {
      if (r.visitId) {
        const existing = visitMap.get(r.visitId);
        if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
          visitMap.set(r.visitId, r);
        }
      } else {
        // No visitId - keep as is (shouldn't happen but handle gracefully)
        visitMap.set(r.id, r);
      }
    });
    receipts = Array.from(visitMap.values());
    
    setPatientReceipts(receipts);
    setPatientMedicineBills(bills);
  };
  
  // Pending search handlers
  const handlePendingSearch = (query: string) => {
    setPendingSearchQuery(query);
    setPendingSearchSelectedIndex(-1);
    if (query.trim().length < 2) {
      setPendingSearchResults([]);
      return;
    }
    const results = (patientDb.search(query) as any[]).map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      mobileNumber: p.mobileNumber,
      registrationNumber: p.registrationNumber,
      age: p.age,
      sex: p.sex,
    }));
    setPendingSearchResults(results);
  };
  
  const handlePendingSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (pendingSearchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPendingSearchSelectedIndex(prev => 
        prev < pendingSearchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPendingSearchSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (pendingSearchSelectedIndex >= 0 && pendingSearchSelectedIndex < pendingSearchResults.length) {
        loadPendingForPatient(pendingSearchResults[pendingSearchSelectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setPendingSearchResults([]);
      setPendingSearchSelectedIndex(-1);
    }
  };
  
  const loadPendingForPatient = (patient: PatientInfo) => {
    setSelectedPendingPatient(patient);
    setShowAllPending(false);
    
    // Clear search results and query to close dropdown
    setPendingSearchResults([]);
    setPendingSearchQuery('');
    setPendingSearchSelectedIndex(-1);
    
    if (pendingSearchType === 'fees') {
      // Get all pending billing queue items for this patient
      const allBilling = billingQueueDb.getAll() as BillingQueueItem[];
      const patientPendingFees = allBilling.filter((item) => 
        item.patientId === patient.id && 
        (item.status === 'pending' || item.paymentStatus === 'pending' || item.paymentStatus === 'partial') &&
        item.netAmount > 0 // Only show items with amount > 0
      );
      
      // Enrich with patient and visit details
      const enriched = patientPendingFees.map((item) => {
        const p = patientDb.getById(item.patientId) as PatientInfo | undefined;
        const visit = doctorVisitDb.getById(item.visitId);
        const prescriptions = doctorPrescriptionDb.getByVisit(item.visitId);
        return {
          ...item,
          patient: p,
          visit,
          prescriptions
        };
      });
      
      setPendingFees(enriched);
      setPendingBills([]);
    } else {
      // Get all pending medicine bills for this patient
      const allBills = medicineBillDb.getByPatientId(patient.id) as unknown as MedicineBill[];
      const patientPendingBills = allBills.filter((bill) => {
        const pendingAmount = bill.grandTotal - (bill.amountPaid || 0);
        return (bill.paymentStatus === 'pending' || bill.paymentStatus === 'partial') && pendingAmount > 0;
      });
      
      setPendingBills(patientPendingBills);
      setPendingFees([]);
    }
  };
  
  const loadAllPending = () => {
    setShowAllPending(true);
    setSelectedPendingPatient(null);
    
    if (pendingSearchType === 'fees') {
      // Get all pending billing queue items
      const allBilling = billingQueueDb.getAll() as BillingQueueItem[];
      const allPendingFees = allBilling.filter((item) => {
        const patient = patientDb.getById(item.patientId);
        return patient && 
               (item.status === 'pending' || item.paymentStatus === 'pending' || item.paymentStatus === 'partial') &&
               item.netAmount > 0; // Only show items with amount > 0
      });
      
      // Enrich with patient and visit details
      const enriched = allPendingFees.map((item) => {
        const p = patientDb.getById(item.patientId) as PatientInfo | undefined;
        const visit = doctorVisitDb.getById(item.visitId);
        const prescriptions = doctorPrescriptionDb.getByVisit(item.visitId);
        return {
          ...item,
          patient: p,
          visit,
          prescriptions
        };
      });
      
      setPendingFees(enriched);
      setPendingBills([]);
    } else {
      // Get all pending medicine bills
      const allBills = medicineBillDb.getAll() as unknown as MedicineBill[];
      const allPendingBills = allBills.filter((bill) => {
        const patient = patientDb.getById(bill.patientId);
        const pendingAmount = bill.grandTotal - (bill.amountPaid || 0);
        return patient && 
               (bill.paymentStatus === 'pending' || bill.paymentStatus === 'partial') &&
               pendingAmount > 0;
      });
      
      setPendingBills(allPendingBills);
      setPendingFees([]);
    }
  };
  const handleViewReceiptHistory = (receipt: BillingReceipt) => {
    setCurrentReceipt(receipt);
    setShowReceiptPopup(true);
  };
  const handlePrintReceiptDirect = (receipt: BillingReceipt) => {
    const patient = patientDb.getById(receipt.patientId) as PatientInfo;
    const invoiceNumber = receipt.receiptNumber;
    const settings = getInvoiceSettings();
    const billPrintSettings = getBillPrintSettings();
    
    const paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt' = receipt.paymentStatus as any;
    
    const billData = {
      invoiceNumber,
      patientName: `${patient?.firstName} ${patient?.lastName}`,
      registrationNumber: patient?.registrationNumber || '',
      mobileNumber: patient?.mobileNumber || '',
      items: receipt.items.map(item => ({
        description: item.description,
        quantity: 1,
        unitPrice: item.total,
        total: item.total,
      })),
      subtotal: receipt.subtotal,
      discountPercent: receipt.discountPercent,
      discountAmount: receipt.discountAmount,
      taxAmount: 0,
      netAmount: receipt.netAmount,
      paymentStatus,
      amountPaid: receipt.netAmount,
      amountDue: 0,
      paymentMethod: receipt.paymentMethod,
      notes: '',
    };
    
    const printer = new ThermalPrinter(settings, billPrintSettings);
    const printHTML = printer.generatePrintHTML(billData, 'fee');
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };
  const handleViewMedicineBillHistory = (bill: MedicineBill) => {
    setViewingMedicineBill(bill);
    setShowViewBillPopup(true);
  };
  const handlePrintMedicineBillDirect = (bill: MedicineBill) => {
    const patient = patientDb.getById(bill.patientId) as PatientInfo;
    const invoiceNumber = generateInvoiceNumber('bill');
    const settings = getInvoiceSettings();
    const billPrintSettings = getBillPrintSettings();
    
    const paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt' = bill.paymentStatus || 'pending';
    const amountPaid = bill.amountPaid || 0;
    const amountDue = Math.max(0, bill.grandTotal - amountPaid);
    
    const billData = {
      invoiceNumber,
      patientName: `${patient?.firstName} ${patient?.lastName}`,
      registrationNumber: patient?.registrationNumber || '',
      mobileNumber: patient?.mobileNumber || '',
      items: bill.items.filter(item => item.amount > 0).map(item => ({
        description: [item.medicine, item.potency, item.quantityDisplay, item.doseForm].filter(Boolean).join(' '),
        quantity: item.quantity,
        unitPrice: item.amount / item.quantity,
        total: item.amount,
      })),
      subtotal: bill.subtotal,
      discountPercent: bill.discountPercent,
      discountAmount: bill.discountAmount,
      taxAmount: bill.taxAmount,
      netAmount: bill.grandTotal,
      paymentStatus,
      amountPaid,
      amountDue,
      paymentMethod: 'cash',
      notes: bill.notes,
    };
    
    const printer = new ThermalPrinter(settings, billPrintSettings);
    const printHTML = printer.generatePrintHTML(billData, 'bill');
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };
  
  // Receipt state
  const [showReceiptPopup, setShowReceiptPopup] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<BillingReceipt | null>(null);

  // Load queue data
  const loadQueue = useCallback(() => {
    setIsLoading(true);
    
    // Clean up old self-repeat items (where visit date is before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const allItemsBeforeCleanup = billingQueueDb.getAll() as BillingQueueItem[];
    
    // Filter out items for deleted patients
    const validItems = allItemsBeforeCleanup.filter((item) => {
      const patient = patientDb.getById(item.patientId);
      return patient !== undefined && patient !== null;
    });
    
    const oldSelfRepeats = validItems.filter((item) => {
      if (item.feeType !== 'Self Repeat by P/T') return false;
      
      // Check the visit date, not the billing item creation date
      const visit = doctorVisitDb.getById(item.visitId);
      if (!visit) return true; // Delete if visit not found
      
      const visitDate = visit.visitDate instanceof Date ? visit.visitDate : new Date(visit.visitDate);
      visitDate.setHours(0, 0, 0, 0);
      
      const isOld = visitDate < today;
      const isCompleted = item.status === 'completed';
      
      // Remove if visit is old OR billing is completed
      return isOld || isCompleted;
    });
    
    if (oldSelfRepeats.length > 0) {
      console.log('[Billing] Cleaning up self-repeat items:', {
        count: oldSelfRepeats.length,
        items: oldSelfRepeats.map(i => {
          const visit = doctorVisitDb.getById(i.visitId);
          return {
            id: i.id,
            billingCreatedAt: i.createdAt,
            visitDate: visit?.visitDate,
            status: i.status,
            feeType: i.feeType
          };
        })
      });
      oldSelfRepeats.forEach((item) => {
        billingQueueDb.delete(item.id);
      });
    }
    
    // Get all items from billing queue AFTER cleanup (and filter deleted patients again)
    const allItems = (billingQueueDb.getAll() as BillingQueueItem[]).filter((item) => {
      const patient = patientDb.getById(item.patientId);
      return patient !== undefined && patient !== null;
    });
    
    // DEDUPLICATION: Remove duplicate billing entries for the same patient/appointment
    const seenPatientAppointments = new Map<string, string>(); // key: patientId-appointmentId, value: billing item ID to keep
    const duplicatesToDelete: string[] = [];
    
    allItems.forEach((item) => {
      if (item.appointmentId && item.patientId) {
        const key = `${item.patientId}-${item.appointmentId}`;
        const existing = seenPatientAppointments.get(key);
        
        if (existing) {
          // Duplicate found - keep the one with more data (has visitId from doctor panel)
          const existingItem = allItems.find(i => i.id === existing);
          if (existingItem) {
            // Keep the item that has a proper visitId (not same as appointmentId)
            if (item.visitId !== item.appointmentId && existingItem.visitId === existingItem.appointmentId) {
              // Current item is from doctor panel (has different visitId), delete the old one
              duplicatesToDelete.push(existing);
              seenPatientAppointments.set(key, item.id);
            } else {
              // Keep existing, delete current
              duplicatesToDelete.push(item.id);
            }
          }
        } else {
          seenPatientAppointments.set(key, item.id);
        }
      }
    });
    
    if (duplicatesToDelete.length > 0) {
      console.log('[Billing] Removing duplicate billing entries:', duplicatesToDelete.length);
      duplicatesToDelete.forEach(id => billingQueueDb.delete(id));
    }
    
    // Re-fetch after deduplication
    const deduplicatedItems = (billingQueueDb.getAll() as BillingQueueItem[]).filter((item) => {
      const patient = patientDb.getById(item.patientId);
      return patient !== undefined && patient !== null;
    });
    
    // Filter by selected date (use ref for current value)
    const currentDate = selectedDateRef.current;
    const selectedDateStr = currentDate.toDateString();
    const filteredByDate = deduplicatedItems.filter((item) => {
      const itemDate = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
      return itemDate.toDateString() === selectedDateStr;
    });
    
    // Re-fetch items after potential updates (still filter by date and deleted patients)
    let updatedItems = (billingQueueDb.getAll() as BillingQueueItem[]).filter((item) => {
      const itemDate = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
      const patient = patientDb.getById(item.patientId);
      return itemDate.toDateString() === selectedDateStr && patient !== undefined && patient !== null;
    });
    
    // Deduplicate by visitId - keep only one billing item per visit (prefer paid over pending)
    const visitMap = new Map<string, BillingQueueItem>();
    const itemsToDelete: string[] = [];
    
    updatedItems.forEach((item) => {
      const existing = visitMap.get(item.visitId);
      if (!existing) {
        visitMap.set(item.visitId, item);
      } else {
        // Keep the paid one if one is paid and one is pending
        if (item.paymentStatus === 'paid' && existing.paymentStatus !== 'paid') {
          visitMap.set(item.visitId, item);
          itemsToDelete.push(existing.id);
          console.log('[Billing] Marked for deletion - duplicate pending billing item:', existing.id, 'keeping paid item:', item.id);
        } else if (existing.paymentStatus === 'paid' && item.paymentStatus !== 'paid') {
          // Keep existing paid one, delete new pending one
          itemsToDelete.push(item.id);
          console.log('[Billing] Marked for deletion - duplicate pending billing item:', item.id, 'keeping paid item:', existing.id);
        } else {
          // Both same status - keep the older one (first created)
          const existingDate = new Date(existing.createdAt).getTime();
          const itemDate = new Date(item.createdAt).getTime();
          if (itemDate < existingDate) {
            visitMap.set(item.visitId, item);
            itemsToDelete.push(existing.id);
            console.log('[Billing] Marked for deletion - duplicate billing item:', existing.id, 'keeping older item:', item.id);
          } else {
            itemsToDelete.push(item.id);
            console.log('[Billing] Marked for deletion - duplicate billing item:', item.id, 'keeping older item:', existing.id);
          }
        }
      }
    });
    
    // Delete all marked duplicates from database
    itemsToDelete.forEach((id) => {
      billingQueueDb.delete(id);
      console.log('[Billing] ✅ Deleted duplicate billing item from database:', id);
    });
    
    // Re-fetch after deduplication
    updatedItems = (billingQueueDb.getAll() as BillingQueueItem[]).filter((item) => {
      const itemDate = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
      const patient = patientDb.getById(item.patientId);
      return itemDate.toDateString() === selectedDateStr && patient !== undefined && patient !== null;
    });
    
    // Retroactively mark free follow-up patients with paid bills as completed
    updatedItems.forEach((item) => {
      if ((item.status === 'pending' || item.status === 'paid') && item.feeAmount === 0) {
        // Check if bill is paid
        const medicineBill = medicineBillDb.getByBillingQueueId(item.id) as any;
        const billPaymentStatus = medicineBill ? (medicineBill.paymentStatus || 'pending') : 'pending';
        
        if (billPaymentStatus === 'paid') {
          // Mark as completed
          billingQueueDb.update(item.id, {
            status: 'completed'
          });
          console.log('[Billing] Retroactively marked free follow-up patient as completed:', item.id, 'Fee:', item.feeAmount, 'Bill Status:', billPaymentStatus);
          
          // Update the item in memory
          item.status = 'completed';
        }
      }
    });
    
    // Separate active (pending/paid) and completed items
    const active = updatedItems.filter(
      (item) => item.status === 'pending' || item.status === 'paid'
    );
    const completed = updatedItems.filter(
      (item) => item.status === 'completed'
    );
    
    console.log('[Billing] Load queue results:', {
      totalItems: updatedItems.length,
      activeCount: active.length,
      completedCount: completed.length,
      selfRepeatItems: updatedItems.filter(i => i.feeType === 'Self Repeat by P/T').map(i => ({
        id: i.id,
        status: i.status,
        feeType: i.feeType
      }))
    });
    
    // Enrich with patient and prescription details
    const enrichItems = (items: BillingQueueItem[]): BillingQueueItemWithDetails[] => {
      return items.map((item) => {
        const patient = patientDb.getById(item.patientId) as PatientInfo | undefined;
        const visit = doctorVisitDb.getById(item.visitId);
        const prescriptions = doctorPrescriptionDb.getByVisit(item.visitId);
        
        return {
          ...item,
          patient,
          visit,
          prescriptions
        };
      });
    };
    
    const enrichedActive = enrichItems(active);
    const enrichedCompleted = enrichItems(completed);
    
    // Sort: active items first (newest first), then completed items at bottom (newest first)
    const sortedItems = [
      ...enrichedActive.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      ...enrichedCompleted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    ];
    
    setQueueItems(sortedItems);
    setIsLoading(false);
  }, []);

  // Check pharmacy queue for prepared items and add to billing
  const checkPharmacyQueue = useCallback(() => {
    const allPharmacyItems = pharmacyQueueDb.getAll() as PharmacyQueueItem[];
    
    // Clean up old self-repeat pharmacy items (created before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const oldSelfRepeatPharmacy = allPharmacyItems.filter(item => {
      if (item.source !== 'self-repeat') return false;
      const itemDate = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
      itemDate.setHours(0, 0, 0, 0);
      return itemDate.getTime() < today.getTime();
    });
    
    if (oldSelfRepeatPharmacy.length > 0) {
      console.log('[Billing] Cleaning up old self-repeat pharmacy items:', {
        count: oldSelfRepeatPharmacy.length,
        items: oldSelfRepeatPharmacy.map(i => ({
          id: i.id,
          createdAt: i.createdAt,
          source: i.source
        }))
      });
      oldSelfRepeatPharmacy.forEach(item => pharmacyQueueDb.delete(item.id));
    }
    
    // Filter prepared items, excluding old self-repeats and deleted patients
    const preparedPharmacyItems = allPharmacyItems.filter(item => {
      if (item.status !== 'prepared') return false;
      
      // Filter out items for deleted patients
      const patient = patientDb.getById(item.patientId);
      if (!patient) return false;
      
      // For self-repeat items, only process if created today
      if (item.source === 'self-repeat') {
        const itemDate = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
        const itemDateOnly = new Date(itemDate);
        itemDateOnly.setHours(0, 0, 0, 0);
        const isToday = itemDateOnly.getTime() >= today.getTime();
        
        console.log('[Billing] Self-repeat pharmacy item date check:', {
          id: item.id,
          createdAt: itemDate,
          itemDateOnly: itemDateOnly,
          today: today,
          isToday: isToday
        });
        
        return isToday;
      }
      
      return true;
    });
    
    console.log('[Billing] Checking pharmacy queue:', {
      totalItems: allPharmacyItems.length,
      preparedItems: preparedPharmacyItems.length,
      selfRepeatPrepared: preparedPharmacyItems.filter(i => i.source === 'self-repeat').length,
      preparedItemsDetails: preparedPharmacyItems.map(i => ({
        id: i.id,
        visitId: i.visitId,
        source: i.source,
        status: i.status,
        createdAt: i.createdAt
      }))
    });
    
    preparedPharmacyItems.forEach((pharmacyItem: PharmacyQueueItem) => {
      const visit = doctorVisitDb.getById(pharmacyItem.visitId);
      let feeAmount = 300;
      let feeType = 'Consultation';
      let paymentStatus: 'pending' | 'paid' | 'partial' | 'exempt' = 'pending';
      
      // Check if visit has fee type stored in remarksToFrontdesk (from prescription module)
      if (visit && visit.remarksToFrontdesk && visit.remarksToFrontdesk.startsWith('FEE_TYPE:')) {
        const storedFeeType = visit.remarksToFrontdesk.replace('FEE_TYPE:', '');
        feeType = storedFeeType;
        
        // Set fee amount based on fee type
        if (storedFeeType === 'Self Repeat by P/T') {
          feeAmount = 0;
          paymentStatus = 'pending';
        } else if (storedFeeType === 'New Patient') {
          feeAmount = 500;
        } else if (storedFeeType === 'Follow Up' || storedFeeType === 'Consultation') {
          feeAmount = 300;
        }
        
        console.log('[Billing] Using fee type from visit remarks:', {
          visitId: pharmacyItem.visitId,
          feeType: storedFeeType,
          feeAmount,
          paymentStatus
        });
      }
      // Check if this is a self-repeat prescription (fallback check)
      else if (pharmacyItem.source === 'self-repeat' || (visit && visit.isSelfRepeat)) {
        feeAmount = 0; // Self-repeat starts with 0 fee
        feeType = 'Self Repeat by P/T';
        paymentStatus = 'pending'; // Pending, can be edited
        console.log('[Billing] Processing self-repeat item (fallback):', {
          visitId: pharmacyItem.visitId,
          pharmacySource: pharmacyItem.source,
          visitIsSelfRepeat: visit?.isSelfRepeat,
          feeAmount,
          feeType,
          paymentStatus
        });
      } else if (pharmacyItem.appointmentId) {
        const appointment = appointmentDb.getById(pharmacyItem.appointmentId);
        if (appointment) {
          const apt = appointment as { feeAmount?: number; feeType?: string; feeStatus?: string };
          if (apt.feeAmount !== undefined && apt.feeAmount !== null) feeAmount = apt.feeAmount;
          if (apt.feeType) feeType = apt.feeType || feeType;
          if (apt.feeStatus) paymentStatus = (apt.feeStatus as typeof paymentStatus) || paymentStatus;
        }
      } else {
        // No appointment and not self-repeat, check fees table
        const allFees = db.getAll('fees') as any[];
        const patientFees = allFees.filter((f) => f.patientId === pharmacyItem.patientId);
        const feeByVisit = patientFees.find((f) => f.visitId === pharmacyItem.visitId);
        if (feeByVisit) {
          feeAmount = typeof feeByVisit.amount === 'number' ? feeByVisit.amount : feeAmount;
          feeType = feeByVisit.feeType || feeType;
          paymentStatus = (feeByVisit.paymentStatus as typeof paymentStatus) || paymentStatus;
        } else if (patientFees.length > 0) {
          const latestFee = patientFees
            .sort((a, b) => new Date(b.updatedAt || b.createdAt || new Date()).getTime() - new Date(a.updatedAt || a.createdAt || new Date()).getTime())[0];
          feeAmount = typeof latestFee.amount === 'number' ? latestFee.amount : feeAmount;
          feeType = latestFee.feeType || feeType;
          paymentStatus = (latestFee.paymentStatus as typeof paymentStatus) || paymentStatus;
        } else if (visit) {
          if (visit.visitNumber === 1) {
            feeAmount = 500;
            feeType = 'New Patient';
          } else {
            feeAmount = 300;
            feeType = 'Follow Up';
          }
        }
      }
      
      const allBilling = billingQueueDb.getAll() as BillingQueueItem[];
      
      // CRITICAL: Check if billing already exists for this visit - check ALL items, not just today's
      // This prevents creating duplicate billing items for the same visit
      let existingBilling = allBilling.find((b) => b.visitId === pharmacyItem.visitId);
      
      console.log('[Billing] Checking existing billing for visitId:', pharmacyItem.visitId, {
        isSelfRepeat: pharmacyItem.source === 'self-repeat',
        existingBilling: existingBilling ? {
          id: existingBilling.id,
          status: existingBilling.status,
          paymentStatus: existingBilling.paymentStatus,
          feeAmount: existingBilling.feeAmount,
          createdAt: existingBilling.createdAt
        } : 'not found',
        willCreate: !existingBilling
      });
      
      if (!existingBilling) {
        const newBillingItem = {
          visitId: pharmacyItem.visitId,
          patientId: pharmacyItem.patientId,
          appointmentId: pharmacyItem.appointmentId,
          prescriptionIds: pharmacyItem.prescriptionIds,
          status: 'pending' as const,
          feeAmount,
          feeType,
          netAmount: feeAmount,
          paymentStatus,
        };
        console.log('[Billing] Creating new billing item:', newBillingItem);
        billingQueueDb.create(newBillingItem);
        
        // CRITICAL: Immediately check for duplicates after creation
        // This prevents duplicate items from accumulating
        const allBillingAfterCreate = billingQueueDb.getAll() as BillingQueueItem[];
        const duplicatesForThisVisit = allBillingAfterCreate.filter(b => b.visitId === pharmacyItem.visitId);
        
        if (duplicatesForThisVisit.length > 1) {
          console.log('[Billing] ⚠️ DUPLICATE DETECTED after creation! Found', duplicatesForThisVisit.length, 'items for visitId:', pharmacyItem.visitId);
          
          // Keep the newest one (just created), delete older ones
          const sorted = duplicatesForThisVisit.sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          
          for (let i = 1; i < sorted.length; i++) {
            billingQueueDb.delete(sorted[i].id);
            console.log('[Billing] ✅ Deleted duplicate:', sorted[i].id, '(keeping newest:', sorted[0].id, ')');
          }
        }
      } else {
        // For self-repeat items, don't update if already exists (allow manual fee editing)
        if (pharmacyItem.source === 'self-repeat') {
          console.log('[Billing] Self-repeat billing item already exists, skipping update to preserve manual edits');
          return;
        }
        
        // For regular items, update as before
        const preparedIds = (pharmacyItem.preparedPrescriptionIds || pharmacyItem.prescriptionIds || []) as string[];
        const existingIds = (existingBilling.prescriptionIds || []) as string[];
        const hasNewMeds = preparedIds.some((id) => !existingIds.includes(id));
        const pharmacyUpdatedAt = (pharmacyItem.updatedAt instanceof Date) ? pharmacyItem.updatedAt : new Date(pharmacyItem.updatedAt || new Date());
        const billingUpdatedAt = (existingBilling.updatedAt instanceof Date) ? existingBilling.updatedAt : new Date(existingBilling.updatedAt || existingBilling.createdAt || new Date());
        const shouldReopen = (existingBilling.status === 'completed') && hasNewMeds && (pharmacyUpdatedAt.getTime() > billingUpdatedAt.getTime());
        
        billingQueueDb.update(existingBilling.id, {
          feeAmount,
          feeType,
          netAmount: feeAmount - (existingBilling.discountAmount || 0),
          paymentStatus,
          updatedAt: new Date(),
          prescriptionIds: preparedIds,
          status: shouldReopen ? 'pending' : existingBilling.status,
        });
      }
      
      // Keep pharmacy status unchanged (prepared stays visible under Pharmacy's Prepared tab)
    });
    
    loadQueue();
  }, [loadQueue]);

  // Initial load and interval for pharmacy queue check
  useEffect(() => {
    console.log('[Billing] Setting up pharmacy queue check interval');
    
    // Set up interval to check for new items from pharmacy
    const interval = setInterval(() => {
      console.log('[Billing] Running pharmacy queue check...');
      checkPharmacyQueue();
    }, 3000);
    
    return () => {
      console.log('[Billing] Cleaning up pharmacy queue check interval');
      clearInterval(interval);
    };
  }, [checkPharmacyQueue]);

  // Initial load on mount
  useEffect(() => {
    // Clean up old self-repeat items (where visit date is before today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const allBilling = billingQueueDb.getAll() as BillingQueueItem[];
    const oldSelfRepeats = allBilling.filter((item) => {
      if (item.feeType !== 'Self Repeat by P/T') return false;
      
      // Check the visit date, not the billing item creation date
      const visit = doctorVisitDb.getById(item.visitId);
      if (!visit) return true; // Delete if visit not found
      
      const visitDate = visit.visitDate instanceof Date ? visit.visitDate : new Date(visit.visitDate);
      visitDate.setHours(0, 0, 0, 0);
      
      const isOld = visitDate < today;
      const isCompleted = item.status === 'completed';
      
      // Remove if visit is old OR billing is completed
      return isOld || isCompleted;
    });
    
    if (oldSelfRepeats.length > 0) {
      console.log('[Billing] Initial cleanup of self-repeat items:', {
        count: oldSelfRepeats.length,
        items: oldSelfRepeats.map(i => {
          const visit = doctorVisitDb.getById(i.visitId);
          return {
            id: i.id,
            billingCreatedAt: i.createdAt,
            visitDate: visit?.visitDate,
            status: i.status,
            feeType: i.feeType
          };
        })
      });
      oldSelfRepeats.forEach((item) => {
        billingQueueDb.delete(item.id);
      });
    }
    
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  useEffect(() => {
    const handler = () => {
      loadQueue();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('fees-updated', handler as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('fees-updated', handler as EventListener);
      }
    };
  }, [loadQueue]);
  
  // Track changes in bill data
  useEffect(() => {
    if (!savedMedicineBill) {
      // New bill, always allow saving
      setBillHasChanges(true);
      return;
    }
    
    // Create current bill data snapshot
    const currentData = JSON.stringify({
      items: billItems.map(item => ({
        prescriptionId: item.prescriptionId,
        medicine: item.medicine,
        potency: item.potency,
        quantity: item.quantity,
        amount: item.amount
      })),
      discount: billDiscount,
      tax: billTax,
      notes: billNotes,
      payment: billPayment,
      additionalPayment: additionalCurrentPayment,
      payPrevPending: payPrevPending,
      paymentMethod: billPaymentMethod,
      editableAlreadyPaid: editableAlreadyPaid
    });
    
    // Compare with original
    if (originalBillData && currentData !== originalBillData) {
      setBillHasChanges(true);
    } else if (originalBillData) {
      setBillHasChanges(false);
    }
  }, [billItems, billDiscount, billTax, billNotes, billPayment, additionalCurrentPayment, payPrevPending, savedMedicineBill, originalBillData, billPaymentMethod, editableAlreadyPaid]);

  // Handle fee edit
  const handleEditFee = (item: BillingQueueItemWithDetails) => {
    setSelectedItem(item);
    setEditingFee({
      feeAmount: item.feeAmount,
      discountPercent: item.discountPercent || 0,
      discountAmount: item.discountAmount || 0,
      netAmount: item.netAmount,
      paymentMethod: item.paymentMethod || 'cash',
      notes: item.notes || ''
    });
    setShowFeePopup(true);
  };

  // Calculate net amount
  const calculateNetAmount = (feeAmount: number, discountPercent: number) => {
    const discountAmount = (feeAmount * discountPercent) / 100;
    return feeAmount - discountAmount;
  };

  // Handle fee amount change
  const handleFeeAmountChange = (value: number) => {
    const netAmount = calculateNetAmount(value, editingFee.discountPercent);
    setEditingFee(prev => ({
      ...prev,
      feeAmount: value,
      discountAmount: (value * prev.discountPercent) / 100,
      netAmount
    }));
  };

  // Handle discount change
  const handleDiscountChange = (value: number) => {
    const discountAmount = (editingFee.feeAmount * value) / 100;
    const netAmount = editingFee.feeAmount - discountAmount;
    setEditingFee(prev => ({
      ...prev,
      discountPercent: value,
      discountAmount,
      netAmount
    }));
  };

  // Save fee and generate receipt manually - REMOVED (receipts generated in appointments module only)

  // Save fee changes
  const handleSaveFee = () => {
    if (!selectedItem) return;

    let newPaymentStatus: 'pending' | 'paid' | 'partial' | 'exempt';

    // If the fee type is 'Free Follow Up' or amount is 0, it should be considered paid/exempt.
    if (editingFee.feeAmount === 0 || selectedItem.feeType === 'Free Follow Up') {
      newPaymentStatus = 'paid'; // Mark as paid to prevent it from showing as pending.
    } else if (editingFee.paymentMethod === 'exempt') {
      newPaymentStatus = 'exempt';
    } else {
      newPaymentStatus = 'paid'; // Default to paid when any payment is made.
    }

    // Update billing queue item
    billingQueueDb.update(selectedItem.id, {
      feeAmount: editingFee.feeAmount,
      discountPercent: editingFee.discountPercent,
      discountAmount: editingFee.discountAmount,
      netAmount: editingFee.netAmount,
      paymentMethod: editingFee.paymentMethod,
      notes: editingFee.notes,
      paymentStatus: newPaymentStatus,
      status: newPaymentStatus === 'paid' ? 'paid' : 'pending',
      paidAt: newPaymentStatus === 'paid' ? new Date() : undefined
    });

    // Create fee history entry so it appears in reports, dashboard, and patient profile
    const receiptNumber = `FEE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    feeHistoryDb.create({
      id: generateId(),
      patientId: selectedItem.patientId,
      visitId: selectedItem.visitId,
      appointmentId: selectedItem.appointmentId,
      amount: editingFee.netAmount,
      feeType: selectedItem.feeType,
      paymentMethod: editingFee.paymentMethod as any,
      paymentStatus: newPaymentStatus,
      receiptId: receiptNumber,
      paidDate: new Date(),
      notes: editingFee.notes,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Sync fee changes back to appointment if it exists
    if (selectedItem.appointmentId) {
      appointmentDb.update(selectedItem.appointmentId, {
        feeAmount: editingFee.feeAmount,
        feeType: selectedItem.feeType,
        feeStatus: newPaymentStatus,
      });
    }

    // Create or reuse receipt so it appears in reports
    // This is the key step - reports read from billingReceiptDb, not feeHistoryDb
    if (editingFee.netAmount > 0 && newPaymentStatus === 'paid') {
      createOrReuseReceipt(selectedItem, []);
    }

    // Persist all changes to localStorage so they appear in reports, dashboard, and patient profile
    db.flushToLocalStorage();

    setShowFeePopup(false);
    loadQueue();
  };

  // View prescription
  const handleViewPrescription = (item: BillingQueueItemWithDetails) => {
    setViewingPrescriptions(item.prescriptions || []);
    setViewingPatient(item.patient || null);
    setViewingBillingItem(item);
    setIsBillMode(false);
    
    // Check for existing saved medicine bill
    const existingBill = medicineBillDb.getByBillingQueueId(item.id) as MedicineBill | undefined;
    
    if (existingBill) {
      const billedIds = (existingBill.items || []).map(it => it.prescriptionId);
      const currentPrescriptions = item.prescriptions || [];
      const newRxs = currentPrescriptions.filter(rx => rx.id && !billedIds.includes(rx.id));
      
      if ((existingBill.paymentStatus || 'pending') === 'paid') {
        // Previous prescription billed: start new bill with only new medicines
        setSavedMedicineBill(null);
        setBillItems(newRxs.map(rx => {
          const memory = medicineAmountMemoryDb.getByMedicine(rx.medicine, rx.potency);
          const lastAmount = memory ? (memory as { amount: number }).amount : 0;
          return {
            id: generateId(),
            prescriptionId: rx.id || generateId(),
            medicine: rx.medicine,
            potency: rx.potency,
            quantityDisplay: rx.quantity || '',
            quantity: rx.bottles || 1,
            doseForm: rx.doseForm,
            dosePattern: rx.dosePattern,
            frequency: rx.frequency,
            duration: rx.duration,
            isCombination: rx.isCombination,
            combinationContent: rx.combinationContent,
            amount: lastAmount
          };
        }));
        setBillDiscount(0);
        setBillTax(0);
        setBillNotes('');
        setBillPayment(0);
        setAdditionalCurrentPayment(0);
        setPrevPendingAmount(0);
        setPayPrevPending(0);
      } else {
        // Previous prescription not billed: show old + new together
        setSavedMedicineBill(existingBill);
        const existingItems = existingBill.items.map(billItem => ({
          id: generateId(),
          prescriptionId: billItem.prescriptionId,
          medicine: billItem.medicine,
          potency: billItem.potency,
          quantityDisplay: billItem.quantityDisplay || '',
          quantity: billItem.quantity,
          doseForm: undefined,
          dosePattern: billItem.dosePattern,
          frequency: billItem.frequency,
          duration: billItem.duration,
          isCombination: billItem.isCombination,
          combinationContent: billItem.combinationContent,
          amount: billItem.amount
        }));
        const newItems = newRxs.map(rx => {
          const memory = medicineAmountMemoryDb.getByMedicine(rx.medicine, rx.potency);
          const lastAmount = memory ? (memory as { amount: number }).amount : 0;
          return {
            id: generateId(),
            prescriptionId: rx.id || generateId(),
            medicine: rx.medicine,
            potency: rx.potency,
            quantityDisplay: rx.quantity || '',
            quantity: rx.bottles || 1,
            doseForm: rx.doseForm,
            dosePattern: rx.dosePattern,
            frequency: rx.frequency,
            duration: rx.duration,
            isCombination: rx.isCombination,
            combinationContent: rx.combinationContent,
            amount: lastAmount
          };
        });
        setBillItems([...existingItems, ...newItems]);
        setBillDiscount(existingBill.discountPercent);
        setBillTax(existingBill.taxPercent);
        setBillNotes(existingBill.notes || '');
        setBillPayment(0);
        setAdditionalCurrentPayment(0);
        const previousBills = medicineBillDb.getByPatientId(item.patientId) as MedicineBill[];
        const prevPending = previousBills
          .filter(b => b.id !== existingBill.id)
          .find(b => (b.pendingAmount || 0) > 0);
        setPrevPendingAmount(prevPending ? (prevPending.pendingAmount || 0) : 0);
        setPayPrevPending(0);
      }
    } else {
      // Initialize with prescriptions and load amounts from memory
      setSavedMedicineBill(null);
      setBillItems((item.prescriptions || []).map(rx => {
        // Try to get last used amount from memory
        const memory = medicineAmountMemoryDb.getByMedicine(rx.medicine, rx.potency);
        const lastAmount = memory ? (memory as { amount: number }).amount : 0;
        
        return {
          id: generateId(),
          prescriptionId: rx.id || generateId(),
          medicine: rx.medicine,
          potency: rx.potency,
          quantityDisplay: rx.quantity || '', // Original quantity string like "2dr"
          quantity: rx.bottles || 1, // Number of bottles for billing
          doseForm: rx.doseForm,
          dosePattern: rx.dosePattern,
          frequency: rx.frequency,
          duration: rx.duration,
          isCombination: rx.isCombination,
          combinationContent: rx.combinationContent,
          amount: lastAmount
        };
      }));
      setBillDiscount(0);
      setBillTax(0);
      setBillNotes('');
      // Load previous pending for this patient
      const previousBills = medicineBillDb.getByPatientId(item.patientId) as MedicineBill[];
      const prevPending = previousBills.find(b => (b.pendingAmount || 0) > 0);
      setPrevPendingAmount(prevPending ? (prevPending.pendingAmount || 0) : 0);
      setBillPayment(0);
      setAdditionalCurrentPayment(0);
      setPayPrevPending(0);
    }
    
    setShowPrescriptionPopup(true);
  };
  
  // Enter bill creation mode
  const handleCreateBill = () => {
    setIsBillMode(true);
  };
  
  // Update bill item amount
  const handleBillItemAmountChange = (index: number, amount: number) => {
    setBillItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], amount };
      return updated;
    });
  };
  
  // Update bill item quantity
  const handleBillItemQuantityChange = (index: number, quantity: number) => {
    setBillItems(prev => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = Math.max(1, quantity);
      
      // Only update quantity, don't change the price
      updated[index] = { ...item, quantity: newQty };
      
      return updated;
    });
  };
  
  // Delete bill item
  const handleDeleteBillItem = (index: number) => {
    setBillItems(prev => prev.filter((_, i) => i !== index));
  };
  
  // Add new item to bill (not from prescription)
  const handleAddNewItem = () => {
    // Validate all rows
    const validRows = newItemsRows.filter(row => row.medicine.trim() && row.amount > 0);
    
    if (validRows.length === 0 && newItemForm.medicine.trim() && newItemForm.amount > 0) {
      // If no rows but main form has data, use main form
      const newItem = {
        id: generateId(),
        prescriptionId: '',
        medicine: newItemForm.medicine,
        potency: newItemForm.potency || undefined,
        quantityDisplay: newItemForm.quantity.toString(),
        quantity: newItemForm.quantity,
        doseForm: newItemForm.doseForm || undefined,
        size: newItemForm.size || undefined,
        dosePattern: undefined,
        frequency: undefined,
        duration: undefined,
        isCombination: false,
        combinationContent: undefined,
        amount: newItemForm.amount
      };
      
      // Add to history
      if (newItemForm.medicine.trim() && !medicineHistory.includes(newItemForm.medicine)) {
        setMedicineHistory(prev => [newItemForm.medicine, ...prev].slice(0, 50));
      }
      
      // Debug: Log the medicine name being saved
      console.log('[Billing] Saving new item - Medicine:', newItemForm.medicine, 'Quantity:', newItemForm.quantity, 'QuantityDisplay:', newItemForm.quantity.toString());
      
      setBillItems(prev => [...prev, newItem]);
      setNewItemForm({
        medicine: '',
        potency: '',
        quantity: 1,
        doseForm: '',
        size: '',
        amount: 0
      });
      setShowAddNewItem(false);
      return;
    }
    
    if (validRows.length === 0) {
      alert('Please add at least one item with medicine name and amount');
      return;
    }
    
    // Add all valid rows to bill
    const newItems = validRows.map(row => ({
      id: generateId(),
      prescriptionId: '',
      medicine: row.medicine,
      potency: row.potency || undefined,
      quantityDisplay: row.quantity.toString(),
      quantity: row.quantity,
      doseForm: row.doseForm || undefined,
      size: row.size || undefined,
      dosePattern: undefined,
      frequency: undefined,
      duration: undefined,
      isCombination: false,
      combinationContent: undefined,
      amount: row.amount
    }));
    
    // Add medicines to history for autocomplete
    validRows.forEach(row => {
      if (row.medicine.trim() && !medicineHistory.includes(row.medicine)) {
        setMedicineHistory(prev => [row.medicine, ...prev].slice(0, 50)); // Keep last 50
      }
    });
    
    setBillItems(prev => [...prev, ...newItems]);
    
    // Reset form
    setNewItemsRows([]);
    setNewItemForm({
      medicine: '',
      potency: '',
      quantity: 1,
      doseForm: '',
      size: '',
      amount: 0
    });
    setShowAddNewItem(false);
  };
  
  // Add empty row for new item
  const handleAddEmptyRow = () => {
    setNewItemsRows(prev => [...prev, {
      id: generateId(),
      medicine: '',
      potency: '',
      quantity: 1,
      doseForm: '',
      size: '',
      amount: 0
    }]);
  };
  
  // Handle medicine autocomplete
  const handleMedicineChange = (value: string) => {
    // Just use the value as-is, don't remove spaces
    console.log('[Billing] Medicine input changed - Raw:', value);
    setNewItemForm({...newItemForm, medicine: value});
    
    if (value.trim().length > 0) {
      const filtered = medicineHistory.filter(m => 
        m.toLowerCase().includes(value.toLowerCase())
      );
      setMedicineSuggestions(filtered);
      setSelectedSuggestionIndex(-1);
    } else {
      setMedicineSuggestions([]);
      setSelectedSuggestionIndex(-1);
    }
  };
  
  // Handle medicine autocomplete for row
  const handleRowMedicineChange = (rowId: string, value: string) => {
    setNewItemsRows(prev => prev.map(row => 
      row.id === rowId ? {...row, medicine: value} : row
    ));
    
    if (value.trim().length > 0) {
      const filtered = medicineHistory.filter(m => 
        m.toLowerCase().includes(value.toLowerCase())
      );
      setMedicineSuggestions(filtered);
      setSelectedSuggestionIndex(-1);
    } else {
      setMedicineSuggestions([]);
      setSelectedSuggestionIndex(-1);
    }
  };
  
  // Handle keyboard navigation for autocomplete
  const handleMedicineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (medicineSuggestions.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < medicineSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0) {
        setNewItemForm({...newItemForm, medicine: medicineSuggestions[selectedSuggestionIndex]});
        setMedicineSuggestions([]);
        setSelectedSuggestionIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setMedicineSuggestions([]);
      setSelectedSuggestionIndex(-1);
    }
  };
  
  // Handle keyboard navigation for row autocomplete
  const handleRowMedicineKeyDown = (rowId: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (medicineSuggestions.length === 0) return;
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => 
        prev < medicineSuggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0) {
        setNewItemsRows(prev => prev.map(row => 
          row.id === rowId ? {...row, medicine: medicineSuggestions[selectedSuggestionIndex]} : row
        ));
        setMedicineSuggestions([]);
        setSelectedSuggestionIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setMedicineSuggestions([]);
      setSelectedSuggestionIndex(-1);
    }
  };
  
  // Add inline row to bill
  const handleAddInlineRow = () => {
    setInlineNewRows(prev => [...prev, {
      id: generateId(),
      medicine: '',
      potency: '',
      quantity: 1,
      doseForm: '',
      size: '',
      amount: 0
    }]);
  };
  
  // Save inline rows to bill items
  const handleSaveInlineRowsToBill = () => {
    const validRows = inlineNewRows.filter(r => r.medicine.trim() && r.amount > 0);
    
    if (validRows.length === 0) {
      alert('Please fill in medicine name and amount for at least one row');
      return;
    }
    
    // Debug: Log the row objects before saving
    console.log('[Billing] Valid rows before saving:', validRows.map(r => ({
      medicine: r.medicine,
      quantity: r.quantity,
      amount: r.amount
    })));
    
    // Add medicines to history (with cleaned names - remove trailing numbers)
    validRows.forEach(row => {
      const cleanedMedicine = row.medicine.trim();
      if (cleanedMedicine && !medicineHistory.includes(cleanedMedicine)) {
        setMedicineHistory(prev => [cleanedMedicine, ...prev].slice(0, 50));
      }
    });
    
    // Add to bill items
    const newItems = validRows.map(row => {
      // Ensure medicine name doesn't include quantity
      const cleanedMedicine = row.medicine.trim();
      console.log('[Billing] Saving inline row - Original:', row.medicine, 'Cleaned:', cleanedMedicine, 'Qty:', row.quantity);
      return {
        id: generateId(),
        prescriptionId: '',
        medicine: cleanedMedicine,
        potency: row.potency || undefined,
        quantityDisplay: row.quantity.toString(),
        quantity: row.quantity,
        doseForm: row.doseForm || undefined,
        dosePattern: undefined,
        frequency: undefined,
        duration: undefined,
        isCombination: false,
        combinationContent: undefined,
        amount: row.amount
      };
    });
    
    setBillItems(prev => [...prev, ...newItems]);
    setInlineNewRows([]);
  };
  
  // Calculate bill totals
  const getBillSubtotal = () => {
    return billItems.reduce((sum, item) => sum + ((item.amount || 0) * item.quantity), 0);
  };
  
  const getBillDiscountAmount = () => {
    return (getBillSubtotal() * billDiscount) / 100;
  };
  
  const getBillTaxAmount = () => {
    return ((getBillSubtotal() - getBillDiscountAmount()) * billTax) / 100;
  };
  
  const getBillTotal = () => {
    return getBillSubtotal() - getBillDiscountAmount() + getBillTaxAmount();
  };
  
  // Print bill using thermal printer format
  const handlePrintBill = () => {
    if (!viewingPatient) return;
    
    const invoiceNumber = generateInvoiceNumber('bill');
    const settings = getInvoiceSettings();
    const billPrintSettings = getBillPrintSettings();
    
    const paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt' = 
      (billPayment >= getBillTotal()) ? 'paid' : (billPayment > 0) ? 'partial' : 'pending';
    
    const billData = {
      invoiceNumber,
      patientName: `${viewingPatient.firstName} ${viewingPatient.lastName}`,
      registrationNumber: viewingPatient.registrationNumber,
      mobileNumber: viewingPatient.mobileNumber,
      items: billItems.filter(item => item.amount > 0).map(item => ({
        description: [item.medicine, item.potency, item.quantityDisplay, item.doseForm].filter(Boolean).join(' '),
        quantity: item.quantity,
        unitPrice: item.amount / item.quantity,
        total: item.amount,
      })),
      subtotal: getBillSubtotal(),
      discountPercent: billDiscount,
      discountAmount: getBillDiscountAmount(),
      taxAmount: getBillTaxAmount(),
      netAmount: getBillTotal(),
      paymentStatus,
      amountPaid: billPayment,
      amountDue: Math.max(0, getBillTotal() - billPayment),
      paymentMethod: billPaymentMethod,
      notes: billNotes,
    };
    
    const printer = new ThermalPrinter(settings, billPrintSettings);
    const printHTML = printer.generatePrintHTML(billData, 'bill');
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };
  
  // Send bill via WhatsApp
  const handleWhatsAppBill = () => {
    if (!viewingPatient) return;
    
    const phone = viewingPatient.mobileNumber?.replace(/[^0-9]/g, '');
    
    const itemsText = billItems
      .filter(item => item.amount > 0)
      .map(item => `• ${item.medicine}${item.potency ? ` (${item.potency})` : ''} - Qty: ${item.quantityDisplay || item.quantity} - ${formatCurrency(item.amount)}`)
      .join('\n');
    
    const message = `
*HomeoPMS Clinic - Medicine Bill*
----------------------------------
Date: ${formatDate(new Date())}

*Patient:* ${viewingPatient.firstName} ${viewingPatient.lastName}
*Regd No:* ${viewingPatient.registrationNumber}

*Items:*
${itemsText}

*Subtotal:* ${formatCurrency(getBillSubtotal())}
${billDiscount > 0 ? `*Discount (${billDiscount}%):* -${formatCurrency(getBillDiscountAmount())}\n` : ''}${billTax > 0 ? `*Tax (${billTax}%):* +${formatCurrency(getBillTaxAmount())}\n` : ''}
*Grand Total:* ${formatCurrency(getBillTotal())}
${billNotes ? `\n*Notes:* ${billNotes}` : ''}

Thank you for your visit!
Get well soon.
    `.trim();
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };
  
  // Save medicine bill
  const handleSaveBill = () => {
    if (!viewingBillingItem || !viewingPatient) return;
    
    // Set loading state to disable button
    setIsSavingBill(true);
    
    const billItemsData: MedicineBillItem[] = billItems.map(item => ({
      prescriptionId: item.prescriptionId,
      medicine: item.medicine,
      potency: item.potency,
      quantityDisplay: item.quantityDisplay, // Original quantity string like "2dr"
      quantity: item.quantity, // Number of bottles
      doseForm: item.doseForm, // Dose form like Pills, Drops, etc.
      dosePattern: item.dosePattern,
      frequency: item.frequency,
      duration: item.duration,
      isCombination: item.isCombination,
      combinationContent: item.combinationContent,
      amount: item.amount
    }));
    
    // Debug: Log what's being saved
    console.log('[Billing] Saving bill with items:', billItemsData.map(item => ({
      medicine: item.medicine,
      quantityDisplay: item.quantityDisplay,
      quantity: item.quantity
    })));
    
    const totalCurrent = getBillTotal();
    let newAmountPaid = 0;
    let newPending = 0;
    let paymentStatus: 'paid' | 'partial' | 'pending' = 'pending';
    let paidToCurrent = 0;
    // For existing bill, use editableAlreadyPaid + additional payment; for new bill, use billPayment
    if (savedMedicineBill) {
      const editedAlreadyPaid = editableAlreadyPaid || 0;
      paidToCurrent = Math.max(0, additionalCurrentPayment);
      newAmountPaid = editedAlreadyPaid + paidToCurrent;
      newPending = Math.max(0, totalCurrent - newAmountPaid);
    } else {
      paidToCurrent = Math.max(0, billPayment);
      newAmountPaid = paidToCurrent;
      newPending = Math.max(0, totalCurrent - newAmountPaid);
    }
    paymentStatus = newPending === 0 ? 'paid' : (paidToCurrent > 0 ? 'partial' : 'pending');
    
    const billData = {
      billingQueueId: viewingBillingItem.id,
      patientId: viewingPatient.id,
      visitId: viewingBillingItem.visitId,
      items: billItemsData,
      subtotal: getBillSubtotal(),
      discountPercent: billDiscount,
      discountAmount: getBillDiscountAmount(),
      taxPercent: billTax,
      taxAmount: getBillTaxAmount(),
      grandTotal: getBillTotal(),
      amountPaid: newAmountPaid,
      pendingAmount: newPending,
      paymentStatus,
      paymentMethod: billPaymentMethod,
      notes: billNotes,
      status: 'saved' as const
    };
    
    if (savedMedicineBill) {
      // Update existing bill
      medicineBillDb.update(savedMedicineBill.id, billData);
    } else {
      // Create new bill
      const newBill = medicineBillDb.create(billData) as unknown as MedicineBill;
      setSavedMedicineBill(newBill);
    }
    
    // Update billing queue status to 'paid' if bill is paid
    if (paymentStatus === 'paid') {
      // Check if fee is also paid or if it's a free follow-up (fee = 0)
      const feePaymentStatus = viewingBillingItem.paymentStatus || 'pending';
      const feeAmount = viewingBillingItem.feeAmount || 0;
      
      // Auto-complete if:
      // 1. Fee is paid, OR
      // 2. Fee is 0 (free follow-up)
      const shouldAutoComplete = feePaymentStatus === 'paid' || feeAmount === 0;
      
      billingQueueDb.update(viewingBillingItem.id, {
        status: shouldAutoComplete ? 'completed' : 'paid',
        paymentStatus: 'paid',
        paymentMethod: billPaymentMethod,
        feeAmount: getBillTotal() // Update with the actual bill total
      });
      
      // CRITICAL: Update fee history with the correct payment method
      // This ensures that when bill is saved with a specific payment method,
      // the fee history is updated to match
      const allFeeHistory = feeHistoryDb.getAll() as any[];
      const todayFeeHistory = allFeeHistory.find((fh) => {
        if (fh.patientId !== viewingBillingItem.patientId) return false;
        
        const fhDate = new Date(fh.paidDate);
        fhDate.setHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Match if same patient AND same day
        return fhDate.getTime() === today.getTime();
      });
      
      if (todayFeeHistory && todayFeeHistory.paymentMethod !== billPaymentMethod) {
        feeHistoryDb.update(todayFeeHistory.id, {
          paymentMethod: billPaymentMethod,
          updatedAt: new Date(),
        });
        console.log('[Billing] ✅ Updated fee history payment method:', {
          feeHistoryId: todayFeeHistory.id,
          oldMethod: todayFeeHistory.paymentMethod,
          newMethod: billPaymentMethod
        });
      }
      
      // Dispatch event if auto-completed
      if (shouldAutoComplete && viewingBillingItem.appointmentId) {
        // Update appointment status to completed
        appointmentDb.update(viewingBillingItem.appointmentId, { status: 'completed' });
        
        // Dispatch event to notify other modules
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('billing-completed', { 
            detail: { appointmentId: viewingBillingItem.appointmentId, billingItemId: viewingBillingItem.id } 
          }));
        }
      }
      
      console.log('[Billing] Updated billing queue item after bill payment:', {
        itemId: viewingBillingItem.id,
        feePaymentStatus,
        billPaymentStatus: paymentStatus,
        newStatus: shouldAutoComplete ? 'completed' : 'paid',
        autoCompleted: shouldAutoComplete,
        updatedFeeAmount: getBillTotal()
      });
      
      // CRITICAL: Check for duplicates after bill payment
      const allBillingAfterBillPayment = billingQueueDb.getAll() as BillingQueueItem[];
      const duplicatesForThisVisit = allBillingAfterBillPayment.filter(b => b.visitId === viewingBillingItem.visitId);
      
      if (duplicatesForThisVisit.length > 1) {
        console.log('[Billing] ⚠️ DUPLICATE DETECTED after bill payment! Found', duplicatesForThisVisit.length, 'items for visitId:', viewingBillingItem.visitId);
        
        // Keep the one we just updated, delete others
        const sorted = duplicatesForThisVisit.sort((a, b) => 
          new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
        );
        
        for (let i = 1; i < sorted.length; i++) {
          billingQueueDb.delete(sorted[i].id);
          console.log('[Billing] ✅ Deleted duplicate:', sorted[i].id, '(keeping updated:', sorted[0].id, ')');
        }
      }
    } else {
      // Even if not paid, update the billing queue with the new bill total and payment method
      billingQueueDb.update(viewingBillingItem.id, {
        paymentMethod: billPaymentMethod,
        feeAmount: getBillTotal() // Update with the actual bill total
      });
      
      // Also update fee history with payment method even if bill is not paid yet
      // This ensures fee history has the correct payment method for reporting
      const allFeeHistory = feeHistoryDb.getAll() as any[];
      const todayFeeHistory = allFeeHistory.find((fh) => {
        if (fh.patientId !== viewingBillingItem.patientId) return false;
        
        const fhDate = new Date(fh.paidDate);
        fhDate.setHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Match if same patient AND same day
        return fhDate.getTime() === today.getTime();
      });
      
      if (todayFeeHistory && todayFeeHistory.paymentMethod !== billPaymentMethod) {
        feeHistoryDb.update(todayFeeHistory.id, {
          paymentMethod: billPaymentMethod,
          updatedAt: new Date(),
        });
        console.log('[Billing] ✅ Updated fee history payment method (pending bill):', {
          feeHistoryId: todayFeeHistory.id,
          oldMethod: todayFeeHistory.paymentMethod,
          newMethod: billPaymentMethod
        });
      }
      

    }
    
    // Update previous bill pending if any payment entered
    const paidToPrev = Math.min(Math.max(0, payPrevPending), prevPendingAmount);
    if (prevPendingAmount > 0 && paidToPrev > 0) {
      const previousBills = medicineBillDb.getByPatientId(viewingPatient.id) as MedicineBill[];
      const prevBill = previousBills.find(b => (b.pendingAmount || 0) > 0 && (!savedMedicineBill || b.id !== savedMedicineBill.id));
      if (prevBill) {
        const newPrevPending = Math.max(0, (prevBill.pendingAmount || 0) - paidToPrev);
        const newPrevPaid = (prevBill.amountPaid || 0) + paidToPrev;
        const prevPaymentStatus = newPrevPending === 0 ? 'paid' : 'partial';
        medicineBillDb.update(prevBill.id, {
          pendingAmount: newPrevPending,
          amountPaid: newPrevPaid,
          paymentStatus: prevPaymentStatus
        });
      }
    }
    
    // Save amounts to memory for each medicine
    billItems.forEach(item => {
      if (item.amount > 0) {
        medicineAmountMemoryDb.upsert(item.medicine, item.potency, item.amount);
      }
    });
    
    // Update original bill data after save to reset change tracking
    const newOriginalData = JSON.stringify({
      items: billItems.map(item => ({
        prescriptionId: item.prescriptionId,
        medicine: item.medicine,
        potency: item.potency,
        quantity: item.quantity,
        amount: item.amount
      })),
      discount: billDiscount,
      tax: billTax,
      notes: billNotes,
      payment: billPayment,
      additionalPayment: additionalCurrentPayment,
      payPrevPending: payPrevPending
    });
    setOriginalBillData(newOriginalData);
    setBillHasChanges(false); // Reset change flag after save
    
    // CRITICAL: Update editableAlreadyPaid to reflect the new total amount paid
    // This ensures the "Current Pending" display updates correctly after save
    setEditableAlreadyPaid(newAmountPaid);
    
    // Reset additional payment input since it's been applied
    setAdditionalCurrentPayment(0);
    
    alert('Bill saved successfully!');
    setIsSavingBill(false); // Reset loading state
    loadQueue();
    
    // Note: Do NOT auto-complete when both fee and bill are paid
    // User must click "Done" button to manually move from pending to completed
    // This allows user to verify everything before final completion
    
    // Refresh pending lists if in pending search tab
    if (activeTab === 'pendingSearch') {
      if (selectedPendingPatient) {
        loadPendingForPatient(selectedPendingPatient);
      } else if (showAllPending) {
        loadAllPending();
      }
    }
  };
  
  // View saved medicine bill
  const handleViewSavedBill = (item: BillingQueueItemWithDetails) => {
    const bill = medicineBillDb.getByBillingQueueId(item.id) as MedicineBill | undefined;
    if (bill) {
      setViewingMedicineBill(bill);
      setViewingBillingItem(item); // Store for edit functionality
      setViewingPatient(item.patient || null); // Store patient info
      setShowViewBillPopup(true);
    }
  };
  
  // Edit saved medicine bill
  const handleEditSavedBill = () => {
    if (!viewingMedicineBill || !viewingBillingItem) return;
    
    // Load the bill data into edit mode
    const billItemsData = viewingMedicineBill.items.map(billItem => ({
      id: generateId(),
      prescriptionId: billItem.prescriptionId,
      medicine: billItem.medicine,
      potency: billItem.potency,
      quantityDisplay: billItem.quantityDisplay || '',
      quantity: billItem.quantity,
      doseForm: undefined,
      dosePattern: billItem.dosePattern,
      frequency: billItem.frequency,
      duration: billItem.duration,
      isCombination: billItem.isCombination,
      combinationContent: billItem.combinationContent,
      amount: billItem.amount
    }));
    
    setBillItems(billItemsData);
    setBillDiscount(viewingMedicineBill.discountPercent);
    setBillTax(viewingMedicineBill.taxPercent);
    setBillNotes(viewingMedicineBill.notes || '');
    setSavedMedicineBill(viewingMedicineBill);
    
    // Load payment info
    const alreadyPaid = viewingMedicineBill.amountPaid || 0;
    const currentPending = viewingMedicineBill.pendingAmount || 0;
    setBillPayment(0);
    setAdditionalCurrentPayment(0);
    setEditableAlreadyPaid(alreadyPaid);
    setBillPaymentMethod((viewingMedicineBill.paymentMethod as any) || 'cash');
    
    // Load previous pending
    const previousBills = medicineBillDb.getByPatientId(viewingBillingItem.patientId) as MedicineBill[];
    const prevPending = previousBills
      .filter(b => b.id !== viewingMedicineBill.id)
      .find(b => (b.pendingAmount || 0) > 0);
    setPrevPendingAmount(prevPending ? (prevPending.pendingAmount || 0) : 0);
    setPayPrevPending(0);
    
    // Store original bill data for change detection
    const originalData = JSON.stringify({
      items: billItemsData.map(item => ({
        prescriptionId: item.prescriptionId,
        medicine: item.medicine,
        potency: item.potency,
        quantity: item.quantity,
        amount: item.amount
      })),
      discount: viewingMedicineBill.discountPercent,
      tax: viewingMedicineBill.taxPercent,
      notes: viewingMedicineBill.notes || '',
      payment: 0,
      additionalPayment: 0,
      payPrevPending: 0,
      paymentMethod: (viewingMedicineBill.paymentMethod as any) || 'cash',
      editableAlreadyPaid: alreadyPaid
    });
    setOriginalBillData(originalData);
    setBillHasChanges(false); // No changes initially
    
    // Load prescriptions for viewing
    setViewingPrescriptions(viewingBillingItem.prescriptions || []);
    
    // Close view popup and open edit mode
    setShowViewBillPopup(false);
    setShowPrescriptionPopup(true);
    setIsBillMode(true);
  };

  // View fee history
  const handleViewFeeHistory = (item: BillingQueueItemWithDetails) => {
    if (!item.patient) return;
    
    setFeeHistoryPatient(item.patient);
    const history = feeHistoryDb.getByPatient(item.patient.id);
    
    console.log('[Fee History] Raw history entries:', history.length);
    
    // Deduplicate by matching: same day + same amount + same feeType + within 5 minutes
    // Keep the latest entry (most recent payment method is the correct one)
    const deduplicatedHistory: any[] = [];
    const processedIndices = new Set<number>();
    
    history.forEach((entry: any, index: number) => {
      if (processedIndices.has(index)) return;
      
      const entryDate = new Date(entry.paidDate);
      const entryDay = entryDate.toDateString();
      
      // Find potential duplicates: same day, same amount, same feeType, within 5 minutes
      const potentialDuplicates = history.filter((other: any, otherIndex: number) => {
        if (otherIndex === index || processedIndices.has(otherIndex)) return false;
        
        const otherDate = new Date(other.paidDate);
        const otherDay = otherDate.toDateString();
        const timeDiffMinutes = Math.abs(entryDate.getTime() - otherDate.getTime()) / (1000 * 60);
        
        return (
          entryDay === otherDay &&
          entry.amount === other.amount &&
          entry.feeType === other.feeType &&
          timeDiffMinutes <= 5
        );
      });
      
      if (potentialDuplicates.length > 0) {
        // Found potential duplicates - keep the latest one (most recent is correct)
        const allEntries = [entry, ...potentialDuplicates];
        const latest = allEntries.reduce((prev, curr) => {
          return new Date(curr.paidDate) > new Date(prev.paidDate) ? curr : prev;
        });
        
        deduplicatedHistory.push(latest);
        
        // Mark all as processed
        processedIndices.add(index);
        potentialDuplicates.forEach((dup: any) => {
          const dupIndex = history.indexOf(dup);
          if (dupIndex >= 0) processedIndices.add(dupIndex);
        });
        
        console.log('[Fee History] Found', potentialDuplicates.length + 1, 'potential duplicates within 5 min, keeping latest:', latest.receiptId, 'payment:', latest.paymentMethod);
      } else {
        // No duplicates found - keep this entry
        deduplicatedHistory.push(entry);
        processedIndices.add(index);
      }
    });
    
    console.log('[Fee History] After deduplication:', deduplicatedHistory.length, 'entries (removed', history.length - deduplicatedHistory.length, 'duplicates)');
    
    setFeeHistoryData(deduplicatedHistory);
    setShowFeeHistory(true);
  };

  // Print fee receipt from history
  const handlePrintFeeHistoryReceipt = (entry: any) => {
    if (!feeHistoryPatient) return;
    
    const invoiceNumber = generateInvoiceNumber('fee');
    const settings = getInvoiceSettings();
    const billPrintSettings = getBillPrintSettings();
    
    const paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt' = 
      entry.paymentStatus === 'exempt' ? 'exempt' : 'paid';
    
    const billData = {
      invoiceNumber,
      patientName: `${feeHistoryPatient.firstName} ${feeHistoryPatient.lastName}`,
      registrationNumber: feeHistoryPatient.registrationNumber,
      mobileNumber: feeHistoryPatient.mobileNumber,
      items: [{
        description: entry.feeType.replace(/-/g, ' ').toUpperCase(),
        quantity: 1,
        unitPrice: entry.amount,
        total: entry.amount,
      }],
      subtotal: entry.amount,
      discountPercent: 0,
      discountAmount: 0,
      taxAmount: 0,
      netAmount: entry.amount,
      paymentStatus,
      amountPaid: entry.amount,
      amountDue: 0,
      paymentMethod: entry.paymentMethod,
      notes: '',
    };
    
    const printer = new ThermalPrinter(settings, billPrintSettings);
    const printHTML = printer.generatePrintHTML(billData, 'fee');
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
  };

  // Generate and show receipt
  const [showReceiptConfirm, setShowReceiptConfirm] = useState(false);
  const [receiptItemToGenerate, setReceiptItemToGenerate] = useState<BillingQueueItemWithDetails | null>(null);
  
  const handleGenerateReceipt = (item: BillingQueueItemWithDetails) => {
    setReceiptItemToGenerate(item);
    setShowReceiptConfirm(true);
  };
  
  const confirmGenerateReceipt = () => {
    if (!receiptItemToGenerate) return;
    
    const item = receiptItemToGenerate;
    
    // Check if receipt already exists - try multiple methods
    let existingReceipt: BillingReceipt | undefined;
    let existingReceiptId: string | undefined;
    
    // Method 1: Check by receiptNumber on billing queue item
    if (item.receiptNumber) {
      existingReceipt = billingReceiptDb.getByReceiptNumber(item.receiptNumber) as BillingReceipt | undefined;
      if (existingReceipt) {
        existingReceiptId = item.receiptNumber;
      }
    }
    
    // Method 2: Check by billing queue ID
    if (!existingReceipt) {
      existingReceipt = billingReceiptDb.getByBillingQueueId(item.id) as BillingReceipt | undefined;
      if (existingReceipt) {
        existingReceiptId = existingReceipt.receiptNumber;
      }
    }
    
    // Method 3: Check fee history for existing receipt ID (from appointments module)
    if (!existingReceipt && !existingReceiptId) {
      const allFeeHistory = db.getAll('feeHistory') as FeeHistoryEntry[];
      const feeHistoryEntry = allFeeHistory.find((fh) => 
        fh.visitId === item.visitId && fh.patientId === item.patientId
      );
      if (feeHistoryEntry && feeHistoryEntry.receiptId) {
        existingReceiptId = feeHistoryEntry.receiptId;
        // Try to find receipt by this ID
        existingReceipt = billingReceiptDb.getByReceiptNumber(existingReceiptId) as BillingReceipt | undefined;
        console.log('[Billing] Found existing receipt ID from fee history:', existingReceiptId, 'Receipt exists:', !!existingReceipt);
      }
    }
    
    // Method 4: Check by visitId directly in billingReceiptDb
    if (!existingReceipt && item.visitId) {
      const allReceipts = billingReceiptDb.getAll() as BillingReceipt[];
      existingReceipt = allReceipts.find(r => r.visitId === item.visitId);
      if (existingReceipt) {
        existingReceiptId = existingReceipt.receiptNumber;
        console.log('[Billing] Found receipt by visitId:', item.visitId, 'Receipt:', existingReceipt.receiptNumber);
      }
    }
    
    // If receipt already exists (either in billingReceiptDb or fee history), use it
    if (existingReceipt) {
      console.log('[Billing] Receipt already exists in billingReceiptDb:', existingReceipt.receiptNumber, '- showing existing receipt');
      setCurrentReceipt(existingReceipt);
      setShowReceiptConfirm(false);
      setReceiptItemToGenerate(null);
      setShowReceiptPopup(true);
      return;
    }
    
    if (existingReceiptId) {
      console.log('[Billing] Receipt ID already exists in fee history:', existingReceiptId, '- using existing ID');
      // Update billing queue item with existing receipt ID
      billingQueueDb.update(item.id, {
        status: 'paid',
        paymentStatus: 'paid',
        receiptNumber: existingReceiptId,
        paidAt: new Date()
      });
      
      // Sync fee status back to appointment
      if (item.appointmentId) {
        appointmentDb.update(item.appointmentId, {
          feeStatus: 'paid',
          feeAmount: item.feeAmount,
          feeType: item.feeType,
          status: 'billed'
        });
      }
      
      setShowReceiptConfirm(false);
      setReceiptItemToGenerate(null);
      loadQueue();
      return;
    }
    
    // No existing receipt - create a new one using centralized function
    const receiptItems: BillingReceiptItem[] = [
      {
        description: item.feeType,
        quantity: 1,
        unitPrice: item.feeAmount,
        total: item.feeAmount
      }
    ];
    
    // Determine payment method and status based on exempt status
    let paymentMethod: 'cash' | 'card' | 'upi' | 'cheque' | 'insurance' | 'exempt' = 'cash';
    let paymentStatus: 'paid' | 'pending' | 'partial' | 'refunded' | 'exempt' = 'paid';
    
    if (item.paymentStatus === 'exempt' || item.feeAmount === 0) {
      paymentMethod = 'exempt';
      paymentStatus = 'exempt';
    } else {
      paymentMethod = (item.paymentMethod || 'cash') as typeof paymentMethod;
      paymentStatus = 'paid';
    }
    
    // Update item with payment status before calling centralized function
    const itemToProcess = {
      ...item,
      paymentMethod,
      paymentStatus
    };
    
    // Use centralized receipt generation function
    const receipt = createOrReuseReceipt(itemToProcess, receiptItems);
    const receiptNumber = receipt?.receiptNumber;
    
    if (receipt) {
      setCurrentReceipt(receipt);
      console.log('[Billing] Created new receipt using centralized function:', receiptNumber);
    }
    
    // Update billing queue item
    if (paymentStatus === 'exempt') {
      billingQueueDb.update(item.id, {
        status: 'completed',
        paymentStatus: 'exempt',
        receiptNumber,
        paidAt: new Date(), // Add payment timestamp
        completedAt: new Date() // Add completion timestamp
      });
    } else {
      billingQueueDb.update(item.id, {
        status: 'paid',
        paymentStatus: 'paid',
        paymentMethod,
        receiptNumber,
        paidAt: new Date() // Add payment timestamp
      });
    }
    
    // Sync fee status back to appointment
    if (item.appointmentId) {
      appointmentDb.update(item.appointmentId, {
        feeStatus: paymentStatus === 'exempt' ? 'exempt' : 'paid',
        feeAmount: item.feeAmount,
        feeType: item.feeType,
        status: paymentStatus === 'exempt' ? 'completed' : 'billed'
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fees-updated', { detail: { patientId: item.patientId, visitId: item.visitId } }));
    }
    
    setShowReceiptConfirm(false);
    setReceiptItemToGenerate(null);
    setShowReceiptPopup(true);
    loadQueue();
  };

  // Print receipt
  const handlePrintFeeReceipt = () => {
    if (!currentReceipt) return;
    
    const patient = patientDb.getById(currentReceipt.patientId) as PatientInfo;
    const invoiceNumber = currentReceipt.receiptNumber;
    const settings = getInvoiceSettings();
    const billPrintSettings = getBillPrintSettings();
    
    const paymentStatus: 'paid' | 'partial' | 'pending' | 'exempt' = currentReceipt.paymentStatus as any;
    
    const billData = {
      invoiceNumber,
      patientName: `${patient?.firstName} ${patient?.lastName}`,
      registrationNumber: patient?.registrationNumber || '',
      mobileNumber: patient?.mobileNumber || '',
      items: currentReceipt.items.map(item => ({
        description: item.description,
        quantity: 1,
        unitPrice: item.total,
        total: item.total,
      })),
      subtotal: currentReceipt.subtotal,
      discountPercent: currentReceipt.discountPercent,
      discountAmount: currentReceipt.discountAmount,
      taxAmount: 0,
      netAmount: currentReceipt.netAmount,
      paymentStatus,
      amountPaid: currentReceipt.netAmount,
      amountDue: 0,
      paymentMethod: currentReceipt.paymentMethod,
      notes: '',
    };
    
    const printer = new ThermalPrinter(settings, billPrintSettings);
    const printHTML = printer.generatePrintHTML(billData, 'fee');
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
    }
    
    billingReceiptDb.markPrinted(currentReceipt.id);
  };

  // Load specific receipt by query param
  useEffect(() => {
    const receiptId = searchParams.get('receiptId');
    if (receiptId) {
      const rec = billingReceiptDb.getById(receiptId);
      if (rec) {
        setCurrentReceipt(rec as unknown as BillingReceipt);
        setShowReceiptPopup(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Send Fee Receipt via WhatsApp
  const handleWhatsAppReceipt = () => {
    if (!currentReceipt) {
      alert('No receipt data available');
      return;
    }

    const patient = patientDb.getById(currentReceipt.patientId) as PatientInfo;
    const phone = patient?.mobileNumber?.replace(/[^0-9]/g, '');
    
    let message = `*Fee Receipt*\n\n`;
    message += `*Receipt No:* ${currentReceipt.receiptNumber}\n`;
    message += `*Patient:* ${patient?.firstName} ${patient?.lastName}\n`;
    message += `*Regd No:* ${patient?.registrationNumber}\n`;
    message += `*Date:* ${formatDate(currentReceipt.createdAt)}\n\n`;
    
    message += `*Items:*\n`;
    currentReceipt.items.forEach((item) => {
      message += `${item.description}: ${formatCurrency(item.total)}\n`;
    });
    
    message += `\n*Subtotal:* ${formatCurrency(currentReceipt.subtotal)}\n`;
    if (currentReceipt.discountAmount && currentReceipt.discountAmount > 0) {
      message += `*Discount (${currentReceipt.discountPercent}%):* -${formatCurrency(currentReceipt.discountAmount)}\n`;
    }
    message += `*Net Amount:* ${formatCurrency(currentReceipt.netAmount)}\n`;
    message += `*Payment:* ${currentReceipt.paymentMethod.toUpperCase()}\n`;
    message += `*Status:* ${currentReceipt.paymentStatus === 'exempt' ? 'EXEMPT' : 'PAID'}\n`;
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Send Prescription via WhatsApp
  const handleWhatsAppPrescription = () => {
    if (!viewingPatient || !viewingPrescriptions || viewingPrescriptions.length === 0) {
      alert('No prescription data available');
      return;
    }

    const phone = viewingPatient.mobileNumber?.replace(/[^0-9]/g, '');
    const visit = viewingBillingItem?.visit;
    
    let message = `*Prescription*\n\n`;
    message += `*Patient:* ${viewingPatient.firstName} ${viewingPatient.lastName}\n`;
    message += `*Regd No:* ${viewingPatient.registrationNumber}\n`;
    message += `*Date:* ${new Date().toLocaleDateString('en-IN')}\n\n`;
    
    if (visit?.chiefComplaint) {
      message += `*Chief Complaint:* ${visit.chiefComplaint}\n\n`;
    }
    
    message += `*Rx:*\n`;
    viewingPrescriptions.forEach((rx, index) => {
      message += `${index + 1}. ${rx.medicine}`;
      if (rx.potency) message += ` ${rx.potency}`;
      if (rx.dosePattern) message += ` - ${rx.dosePattern}`;
      if (rx.frequency) message += ` - ${rx.frequency}`;
      if (rx.duration) message += ` - ${rx.duration}`;
      message += `\n`;
    });
    
    if (visit?.advice) {
      message += `\n*Advice:* ${visit.advice}`;
    }
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Download as PDF (Print Prescription)
  const handleDownloadPDF = () => {
    if (!viewingPatient || !viewingPrescriptions || viewingPrescriptions.length === 0) {
      alert('No prescription data available');
      return;
    }

    const visit = viewingBillingItem?.visit;
    const doctorName = 'Dr. [Doctor Name]'; // You can fetch this from settings

    const prescriptionHTML = generatePrescriptionHTML(
      viewingPatient,
      viewingPrescriptions,
      visit,
      doctorName
    );

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(prescriptionHTML);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  // Print Fee Receipt
  const handlePrintReceipt = () => {
    if (!currentReceipt) {
      alert('No receipt data available');
      return;
    }
    
    handlePrintFeeReceipt();
  };

  // Print Prescription
  const handlePrintPrescription = () => {
    if (!viewingPatient || !viewingPrescriptions || viewingPrescriptions.length === 0) {
      alert('No prescription data available');
      return;
    }

    const visit = viewingBillingItem?.visit;
    const doctorName = 'Dr. [Doctor Name]'; // You can fetch this from settings

    const prescriptionHTML = generatePrescriptionHTML(
      viewingPatient,
      viewingPrescriptions,
      visit,
      doctorName
    );

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(prescriptionHTML);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  // Complete billing - mark as completed and move to bottom
  const handleComplete = (item: BillingQueueItemWithDetails) => {
    // Update billing queue with completion timestamp
    billingQueueDb.update(item.id, {
      status: 'completed',
      completedAt: new Date()
    });
    
    // Update appointment status
    if (item.appointmentId) {
      appointmentDb.update(item.appointmentId, { status: 'completed' });
    }
    
    // Dispatch event to notify other modules (appointments, dashboard, etc.)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('billing-completed', { 
        detail: { appointmentId: item.appointmentId, billingItemId: item.id } 
      }));
    }
    
    // Refresh the queue - item will move to bottom
    loadQueue();
    
    console.log('[Billing] ✅ Billing completed for item:', item.id);
  };

  // Check if both fee and bill are paid
  const areBothPaid = (item: BillingQueueItemWithDetails): boolean => {
    const feePaymentStatus = item.paymentStatus || 'pending';
    if (feePaymentStatus !== 'paid') return false;
    
    // Check if there's a medicine bill for this item
    const bill = medicineBillDb.getByBillingQueueId(item.id) as MedicineBill | undefined;
    if (!bill) {
      // No bill exists, so only fee is needed
      return true;
    }
    
    // Check if the bill is paid
    return (bill.paymentStatus || 'pending') === 'paid';
  };

  // Reopen completed billing - move back to top
  const handleReopen = (item: BillingQueueItemWithDetails) => {
    // Update billing queue - set status back to pending so it appears at top again
    billingQueueDb.update(item.id, {
      status: 'pending'
    });
    
    loadQueue();
    
    console.log('[Billing] ✅ Billing reopened for item:', item.id);
  };

  // Handle date change
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    selectedDateRef.current = newDate; // Update ref first
    setSelectedDate(newDate);
    setShowDatePicker(false);
    setSelectedItem(null);
    loadQueue(); // Immediately load data for new date
  };

  // Check if date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Format date for input
  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  // Get status badge color
  const getStatusColor = (status: string): "success" | "warning" | "danger" | "info" | "default" => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'paid':
        return 'info';
      case 'completed':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      
      <main className="flex-1 transition-all duration-300 ml-64">
        <Header title="Billing" subtitle="Manage patient billing and receipts" />
        <div className="p-6">
          {/* Tabs and Controls */}
          <div className="flex gap-4 mb-6 border-b border-gray-200 items-center justify-between">
            <div className="flex gap-4">
              {/* Date Selector */}
              <div className="flex items-center gap-2">
                {isToday(selectedDate) ? (
                  <span className="text-sm font-medium text-gray-700">Today</span>
                ) : (
                  <span className="text-sm font-medium text-gray-700">
                    {selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                )}
                <button
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                  title="Select date"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                {!isToday(selectedDate) && (
                  <button
                    onClick={() => {
                      const today = new Date();
                      selectedDateRef.current = today;
                      setSelectedDate(today);
                      setSelectedItem(null);
                      loadQueue();
                    }}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Go to Today
                  </button>
                )}
              </div>
              {showDatePicker && (
                <div className="absolute right-24 top-20 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10">
                  <input
                    type="date"
                    value={formatDateForInput(selectedDate)}
                    onChange={handleDateChange}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}
              <Badge variant="info">{queueItems.filter(i => i.status === 'pending' || i.status === 'paid').length} Pending</Badge>
              <Button onClick={loadQueue} variant="outline">
                Refresh
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mb-6 border-b border-gray-200 items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 font-medium ${
                  activeTab === 'pending'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Billing Queue ({queueItems.filter(i => i.status === 'pending' || i.status === 'paid').length} active, {queueItems.filter(i => i.status === 'completed').length} completed)
              </button>
              <button
                onClick={() => setActiveTab('pendingSearch')}
                className={`px-4 py-2 font-medium ${
                  activeTab === 'pendingSearch'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pending Fee/Bill
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 font-medium ${
                  activeTab === 'history'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Fee/Bill History
              </button>
            </div>
            {activeTab === 'pending' && (
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                  showCompleted
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={showCompleted ? 'Hide completed patients' : 'Show completed patients'}
              >
                {showCompleted ? '✓ Show Completed' : '✗ Hide Completed'}
              </button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500">Loading...</div>
            </div>
          ) : activeTab === 'pendingSearch' ? (
            <Card className="p-6 space-y-4">
              {/* Search Type Toggle */}
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => {
                    setPendingSearchType('fees');
                    setSelectedPendingPatient(null);
                    setShowAllPending(false);
                    setPendingFees([]);
                    setPendingBills([]);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    pendingSearchType === 'fees'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pending Fees
                </button>
                <button
                  onClick={() => {
                    setPendingSearchType('bills');
                    setSelectedPendingPatient(null);
                    setShowAllPending(false);
                    setPendingFees([]);
                    setPendingBills([]);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    pendingSearchType === 'bills'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Pending Bills
                </button>
              </div>

              {/* Search and Show All */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={pendingSearchQuery}
                    onChange={(e) => handlePendingSearchChange(e.target.value)}
                    onKeyDown={handlePendingSearchKeyDown}
                    placeholder="Search patient by name, mobile, registration number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {isPendingSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                  {/* Compact Dropdown */}
                  {pendingSearchQuery && pendingSearchResults.length > 0 && !showAllPending && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {pendingSearchResults.map((p, index) => (
                        <div
                          key={p.id}
                          className={`px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                            index === pendingSearchSelectedIndex ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => loadPendingForPatient(p)}
                        >
                          <div className="text-sm font-medium text-gray-900">
                            {p.firstName} {p.lastName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {p.registrationNumber} • {p.mobileNumber}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={loadAllPending} variant="primary">
                  Show All Pending
                </Button>
              </div>

              {/* Remove old search results table - now using compact dropdown */}

              {/* Pending Fees Display */}
              {pendingSearchType === 'fees' && (selectedPendingPatient || showAllPending) && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                      {showAllPending ? 'All Pending Fees' : `Pending Fees for ${selectedPendingPatient?.firstName} ${selectedPendingPatient?.lastName}`}
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => {
                      setSelectedPendingPatient(null);
                      setShowAllPending(false);
                      setPendingFees([]);
                      setPendingSearchQuery('');
                      setPendingSearchResults([]);
                    }}>
                      Clear
                    </Button>
                  </div>

                  {pendingFees.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No pending fees found
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingFees.map((item) => (
                        <Card key={item.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                  <span className="text-blue-600 font-semibold text-lg">
                                    {item.patient?.firstName?.charAt(0)}{item.patient?.lastName?.charAt(0)}
                                  </span>
                                </div>
                                <div>
                                  <h3 className="font-semibold text-gray-900">
                                    {item.patient?.firstName} {item.patient?.lastName}
                                  </h3>
                                  <p className="text-sm text-gray-500">
                                    {item.patient?.registrationNumber} • {item.patient?.mobileNumber}
                                  </p>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <span className="text-gray-500">Fee Type:</span>
                                  <span className="ml-2 font-medium">{item.feeType}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Amount:</span>
                                  <span className="ml-2 font-medium">{formatCurrency(item.netAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Created:</span>
                                  <span className="ml-2">{formatDate(item.createdAt)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Status:</span>
                                  <Badge variant="warning" size="sm" className="ml-2">
                                    {item.paymentStatus}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setEditingFee({
                                    feeAmount: item.feeAmount,
                                    discountPercent: 0,
                                    discountAmount: item.discountAmount || 0,
                                    netAmount: item.netAmount,
                                    paymentMethod: 'cash',
                                    notes: ''
                                  });
                                  setShowFeePopup(true);
                                }}
                              >
                                Process Payment
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Pending Bills Display */}
              {pendingSearchType === 'bills' && (selectedPendingPatient || showAllPending) && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">
                      {showAllPending ? 'All Pending Bills' : `Pending Bills for ${selectedPendingPatient?.firstName} ${selectedPendingPatient?.lastName}`}
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => {
                      setSelectedPendingPatient(null);
                      setShowAllPending(false);
                      setPendingBills([]);
                      setPendingSearchQuery('');
                      setPendingSearchResults([]);
                    }}>
                      Clear
                    </Button>
                  </div>

                  {pendingBills.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No pending bills found
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {pendingBills.map((bill) => {
                        const patient = patientDb.getById(bill.patientId) as PatientInfo | undefined;
                        const pendingAmount = bill.grandTotal - (bill.amountPaid || 0);
                        
                        return (
                          <Card key={bill.id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                    <span className="text-green-600 font-semibold text-lg">
                                      {patient?.firstName?.charAt(0)}{patient?.lastName?.charAt(0)}
                                    </span>
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-gray-900">
                                      {patient?.firstName} {patient?.lastName}
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                      {patient?.registrationNumber} • {patient?.mobileNumber}
                                    </p>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-gray-500">Bill ID:</span>
                                    <span className="ml-2 font-medium">{bill.id.substring(0, 12)}...</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Total:</span>
                                    <span className="ml-2 font-medium">{formatCurrency(bill.grandTotal)}</span>
                                  </div>
                                  {bill.paymentStatus === 'partial' && (
                                    <>
                                      <div>
                                        <span className="text-gray-500">Paid:</span>
                                        <span className="ml-2 text-green-600 font-medium">{formatCurrency(bill.amountPaid || 0)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Remaining:</span>
                                        <span className="ml-2 font-medium text-red-600">{formatCurrency(pendingAmount)}</span>
                                      </div>
                                    </>
                                  )}
                                  {bill.paymentStatus === 'pending' && (
                                    <div>
                                      <span className="text-gray-500">Amount Due:</span>
                                      <span className="ml-2 font-medium text-red-600">{formatCurrency(pendingAmount)}</span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-gray-500">Created:</span>
                                    <span className="ml-2">{formatDate(bill.createdAt)}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Status:</span>
                                    <Badge 
                                      variant={bill.paymentStatus === 'partial' ? 'warning' : 'danger'} 
                                      size="sm" 
                                      className="ml-2"
                                    >
                                      {bill.paymentStatus === 'partial' ? 'Partial Payment' : 'Pending'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    // Set both viewingMedicineBill and create a billing item for edit functionality
                                    setViewingMedicineBill(bill);
                                    
                                    // Create a billing item from the bill data
                                    const billingItem: BillingQueueItemWithDetails = {
                                      id: bill.billingQueueId,
                                      visitId: bill.visitId,
                                      patientId: bill.patientId,
                                      appointmentId: '',
                                      prescriptionIds: bill.items.map(i => i.prescriptionId),
                                      status: 'pending',
                                      feeAmount: 0,
                                      feeType: 'Consultation',
                                      netAmount: 0,
                                      paymentStatus: bill.paymentStatus || 'pending',
                                      createdAt: bill.createdAt,
                                      updatedAt: bill.updatedAt,
                                      patient,
                                      visit: doctorVisitDb.getById(bill.visitId),
                                      prescriptions: bill.items.map(i => i.prescriptionId).map(id => 
                                        doctorPrescriptionDb.getById(id)
                                      ).filter(Boolean) as any[]
                                    };
                                    
                                    setViewingBillingItem(billingItem);
                                    setViewingPatient(patient || null);
                                    setShowViewBillPopup(true);
                                  }}
                                >
                                  View & Pay
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ) : activeTab === 'history' ? (
            <Card className="p-6 space-y-4">
              <div className="flex items-center gap-2 relative">
                <input
                  type="text"
                  value={historyQuery}
                  onChange={(e) => handleHistorySearchChange(e.target.value)}
                  placeholder="Search patient by name, mobile, registration number"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {isHistorySearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  </div>
                )}
              </div>
              {historyQuery && historyResults.length > 0 && (
                <div className="border border-gray-200 rounded-md">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Patient</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Regd No</th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Mobile</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {historyResults.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2">{p.firstName} {p.lastName}</td>
                          <td className="px-4 py-2">{p.registrationNumber}</td>
                          <td className="px-4 py-2">{p.mobileNumber}</td>
                          <td className="px-4 py-2 text-right">
                            <Button variant="outline" size="sm" onClick={() => loadPatientHistory(p)}>
                              View History
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {selectedHistoryPatient && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-600">
                      {selectedHistoryPatient.firstName} {selectedHistoryPatient.lastName} • {selectedHistoryPatient.registrationNumber} • {selectedHistoryPatient.mobileNumber}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => {
                      setSelectedHistoryPatient(null);
                      setHistoryQuery('');
                      setHistoryResults([]);
                      setPatientReceipts([]);
                      setPatientMedicineBills([]);
                    }}>
                      Clear
                    </Button>
                  </div>
                  
                  <div>
                    <h3 className="text-md font-semibold mb-2">Fees</h3>
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Receipt</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Type</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Amount</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Payment</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {patientReceipts.length === 0 ? (
                          <tr>
                            <td className="px-4 py-4 text-center text-gray-500" colSpan={7}>No receipts found</td>
                          </tr>
                        ) : patientReceipts.map((r) => (
                          <tr key={r.id}>
                            <td className="px-4 py-2">{formatDate(r.createdAt)}</td>
                            <td className="px-4 py-2">{r.receiptNumber}</td>
                            <td className="px-4 py-2 capitalize">{r.items[0]?.description || 'consultation'}</td>
                            <td className="px-4 py-2 font-medium">{formatCurrency(r.netAmount)}</td>
                            <td className="px-4 py-2 capitalize">{r.paymentMethod}</td>
                            <td className="px-4 py-2">
                              <Badge variant={
                                r.paymentStatus === 'exempt' && r.netAmount === 0 && r.items[0]?.description.toLowerCase().includes('follow')
                                  ? 'purple'
                                  : r.paymentStatus === 'exempt'
                                  ? 'purple'
                                  : r.paymentStatus === 'paid'
                                  ? 'success'
                                  : 'warning'
                              }>
                                {r.paymentStatus === 'exempt' && r.netAmount === 0 && r.items[0]?.description.toLowerCase().includes('follow')
                                  ? 'Free Follow Up'
                                  : r.paymentStatus === 'exempt'
                                  ? 'Exempt'
                                  : r.paymentStatus}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleViewReceiptHistory(r)}>View</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePrintReceiptDirect(r)}>Print</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div>
                    <h3 className="text-md font-semibold mb-2">Medicine Bills</h3>
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Items</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Subtotal</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Discount</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Tax</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Grand Total</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Payment</th>
                          <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                          <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {patientMedicineBills.length === 0 ? (
                          <tr>
                            <td className="px-4 py-4 text-center text-gray-500" colSpan={9}>No medicine bills found</td>
                          </tr>
                        ) : patientMedicineBills.map((b) => (
                          <tr key={b.id}>
                            <td className="px-4 py-2">{formatDate(b.createdAt)}</td>
                            <td className="px-4 py-2">{b.items.length}</td>
                            <td className="px-4 py-2">{formatCurrency(b.subtotal)}</td>
                            <td className="px-4 py-2">{b.discountPercent ? `${b.discountPercent}%` : '-'}</td>
                            <td className="px-4 py-2">{b.taxPercent ? `${b.taxPercent}%` : '-'}</td>
                            <td className="px-4 py-2 font-medium">{formatCurrency(b.grandTotal)}</td>
                            <td className="px-4 py-2">
                              Paid: {formatCurrency(b.amountPaid || 0)}<br />
                              Pending: {formatCurrency(b.pendingAmount || 0)}
                            </td>
                            <td className="px-4 py-2">
                              <Badge variant={(b.paymentStatus || 'pending') === 'paid' ? 'success' : (b.paymentStatus === 'partial' ? 'warning' : 'danger')}>
                                {b.paymentStatus || 'pending'}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleViewMedicineBillHistory(b)}>View</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePrintMedicineBillDirect(b)}>Print</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          ) : activeTab === 'pending' ? (
            <div className="space-y-2">
              {queueItems.length === 0 ? (
                <Card className="p-4">
                  <p className="text-gray-500 text-center py-6">
                    No items in the billing queue.
                  </p>
                </Card>
              ) : (
                (() => {
                  // Group items by patientId - show only one row per patient
                  let itemsToDisplay = queueItems;
                  
                  // Filter out completed items if toggle is off
                  if (!showCompleted) {
                    itemsToDisplay = itemsToDisplay.filter(item => item.status !== 'completed');
                  }
                  
                  const patientMap = new Map<string, BillingQueueItemWithDetails>();
                  
                  itemsToDisplay.forEach((item) => {
                    const existing = patientMap.get(item.patientId);
                    if (!existing) {
                      patientMap.set(item.patientId, item);
                    } else {
                      // Keep the item with higher fee amount or most recent
                      const existingAmount = existing.netAmount || existing.feeAmount || 0;
                      const currentAmount = item.netAmount || item.feeAmount || 0;
                      const existingDate = new Date(existing.createdAt).getTime();
                      const currentDate = new Date(item.createdAt).getTime();
                      
                      // Prefer higher amount, or if same amount, prefer more recent
                      if (currentAmount > existingAmount || (currentAmount === existingAmount && currentDate > existingDate)) {
                        patientMap.set(item.patientId, item);
                      }
                    }
                  });
                  
                  const consolidatedItems = Array.from(patientMap.values());
                  
                  return consolidatedItems.map((item) => {
                  // Calculate time spent in billing
                  const createdAt = item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt);
                  const now = new Date();
                  const timeSpentMs = item.status === 'completed' 
                    ? (item.updatedAt ? (new Date(item.updatedAt).getTime() - createdAt.getTime()) : 0)
                    : (now.getTime() - createdAt.getTime());
                  const timeSpentMinutes = Math.floor(timeSpentMs / 60000);
                  const timeSpentHours = Math.floor(timeSpentMinutes / 60);
                  const remainingMinutes = timeSpentMinutes % 60;
                  
                  const timeSpentText = timeSpentHours > 0 
                    ? `${timeSpentHours}h ${remainingMinutes}m`
                    : `${timeSpentMinutes}m`;
                  
                  return (
                  <Card key={item.id} className={`p-3 ${item.status === 'completed' ? 'bg-gray-50 opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      {/* Patient Info */}
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-600 font-semibold text-sm">
                            {item.patient?.firstName?.charAt(0)}{item.patient?.lastName?.charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <h3 className="font-semibold text-sm text-gray-900 truncate">
                              {item.patient?.firstName} {item.patient?.lastName}
                            </h3>
                            {/* Show tag icon based on source */}
                            {(() => {
                              const pharmacyItem = (pharmacyQueueDb.getAll() as PharmacyQueueItem[]).find(
                                (p) => p.visitId === item.visitId
                              );
                              if (pharmacyItem?.source === 'self-repeat') {
                                return (
                                  <span className="text-lg flex-shrink-0" title="Self Repeat by Patient">
                                    🔄
                                  </span>
                                );
                              } else if (pharmacyItem?.source === 'emergency') {
                                return (
                                  <span className="text-lg flex-shrink-0" title="Emergency">
                                    🚨
                                  </span>
                                );
                              } else if (pharmacyItem?.source === 'follow-up') {
                                return (
                                  <span className="text-lg flex-shrink-0" title="Follow Up">
                                    👤
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>Regd: {item.patient?.registrationNumber}</span>
                            <span>Mobile: {item.patient?.mobileNumber}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <span title="Created at">📅 {formatDate(createdAt)}</span>
                            {item.status !== 'completed' && (
                              <span title="Time in billing" className="text-orange-600 font-medium">
                                ⏱️ {timeSpentText}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Fee Info */}
                      <div className="flex items-center gap-4 flex-1 justify-center">
                        <div className="text-center">
                          <div className="font-semibold text-base flex items-center gap-2 justify-center flex-wrap">
                            <span>
                              Fee: {formatCurrency(item.netAmount)}
                              {item.discountAmount && item.discountAmount > 0 && (
                                <span className="text-sm text-gray-500 line-through ml-1">
                                  {formatCurrency(item.feeAmount)}
                                </span>
                              )}
                            </span>
                            <Badge variant="default" size="sm">{item.feeType}</Badge>
                            {item.feeType === 'Self Repeat by P/T' ? (
                              <Badge variant="warning" size="sm">Self Repeat by P/T</Badge>
                            ) : item.paymentStatus === 'exempt' && item.feeAmount === 0 && item.feeType.toLowerCase().includes('follow') ? (
                              <Badge variant="purple" size="sm">Free Follow Up</Badge>
                            ) : item.paymentStatus === 'exempt' ? (
                              <Badge variant="purple" size="sm">Exempt</Badge>
                            ) : item.paymentStatus === 'paid' ? (
                              <Badge variant="success" size="sm">Paid</Badge>
                            ) : item.paymentStatus === 'partial' ? (
                              <Badge variant="warning" size="sm">Partial</Badge>
                            ) : (
                              <Badge variant="warning" size="sm">Pending</Badge>
                            )}
                            {(() => {
                              const medicineBill = medicineBillDb.getByBillingQueueId(item.id) as MedicineBill | undefined;
                              if (medicineBill) {
                                const isPaid = (medicineBill.paymentStatus || 'pending') === 'paid';
                                const isPartial = (medicineBill.paymentStatus || 'pending') === 'partial';
                                return (
                                  <>
                                    <span className="text-gray-400">|</span>
                                    <span className="text-sm text-gray-600">
                                      Bill: {formatCurrency(medicineBill.grandTotal)}
                                      <span className={`ml-1 ${isPaid ? 'text-green-600' : isPartial ? 'text-orange-600' : 'text-red-600'}`}>
                                        ({isPaid ? 'Paid' : isPartial ? 'Partial' : 'Pending'})
                                      </span>
                                    </span>
                                  </>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-0.5">
                          <Badge variant={getStatusColor(item.status)} size="sm">
                            {item.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewPrescription(item)}
                        >
                          View Prescription
                        </Button>
                        {(medicineBillDb.getByBillingQueueId(item.id) as MedicineBill | undefined) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewSavedBill(item)}
                          >
                            View Bill
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewFeeHistory(item)}
                        >
                          Fee History
                        </Button>
                        {item.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditFee(item)}
                            >
                              Edit Fee
                            </Button>
                          </>
                        )}
                        {item.status === 'paid' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditFee(item)}
                            >
                              Edit Fee
                            </Button>
                            {areBothPaid(item) && (
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => handleComplete(item)}
                              >
                                Done
                              </Button>
                            )}
                          </>
                        )}
                        {item.status === 'completed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReopen(item)}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                  );
                });
                })()
              )}
            </div>
          ) : null}
        </div>
      </main>

      {/* Fee Edit Popup */}
      {showFeePopup && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">Edit Fee Details</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Amount (₹)
                </label>
                <input
                  type="number"
                  value={editingFee.feeAmount}
                  onChange={(e) => handleFeeAmountChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editingFee.discountPercent}
                  onChange={(e) => handleDiscountChange(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Amount (₹)
                </label>
                <input
                  type="number"
                  value={editingFee.discountAmount}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Net Amount (₹)
                </label>
                <input
                  type="number"
                  value={editingFee.netAmount}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 font-semibold text-lg"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={editingFee.paymentMethod}
                  onChange={(e) => setEditingFee(prev => ({ ...prev, paymentMethod: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="cheque">Cheque</option>
                  <option value="insurance">Insurance</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={editingFee.notes}
                  onChange={(e) => setEditingFee(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowFeePopup(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveFee}>
                Save Changes
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Prescription View Popup */}
      {showPrescriptionPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">{isBillMode ? 'Create Bill' : 'Prescription'}</h2>
                {viewingPatient && (
                  <p className="text-sm text-gray-500">
                    {viewingPatient.firstName} {viewingPatient.lastName} - {viewingPatient.registrationNumber}
                  </p>
                )}
              </div>
              <Button variant="outline" onClick={() => {
                setShowPrescriptionPopup(false);
                setIsBillMode(false);
              }}>
                Close
              </Button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              {viewingPrescriptions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No prescriptions found.</p>
              ) : isBillMode ? (
                /* Bill Creation Mode */
                <div className="space-y-4">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Medicine</th>
                        <th className="px-4 py-2 text-center text-sm font-medium text-gray-500">Qty</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Price (₹)</th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Total Amount (₹)</th>
                        <th className="px-4 py-2 text-center text-sm font-medium text-gray-500">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {billItems.map((item, index) => (
                        <tr key={item.id || index}>
                          <td className="px-4 py-2">
                            <div className="font-medium">
                              {[item.medicine, item.potency, item.quantityDisplay, item.doseForm]
                                .filter(Boolean)
                                .join(' ')}
                            </div>
                            {item.isCombination && (
                              <div className="text-xs text-gray-500">{item.combinationContent}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                handleBillItemQuantityChange(index, parseInt(val) || 1);
                              }}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.amount || ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                handleBillItemAmountChange(index, parseFloat(val) || 0);
                              }}
                              placeholder="0.00"
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="font-medium">{formatCurrency((item.amount || 0) * item.quantity)}</div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => handleDeleteBillItem(index)}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Delete item"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                      {inlineNewRows.length > 0 && inlineNewRows.map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-2 relative">
                            <input
                              type="text"
                              ref={(el) => {
                                if (el && !el.dataset.medicineRef) {
                                  el.dataset.medicineRef = row.id;
                                }
                              }}
                              value={row.medicine || ''}
                              onChange={(e) => {
                                const inputValue = e.target.value;
                                setInlineNewRows(prev => prev.map(r => 
                                  r.id === row.id ? {...r, medicine: inputValue} : r
                                ));
                                if (inputValue.trim().length > 0) {
                                  const filtered = medicineHistory.filter(m => 
                                    m.toLowerCase().includes(inputValue.toLowerCase())
                                  );
                                  setInlineMedicineSuggestions(filtered);
                                  setInlineSelectedSuggestionIndex(-1);
                                } else {
                                  setInlineMedicineSuggestions([]);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  // If a suggestion is highlighted, select it
                                  if (inlineSelectedSuggestionIndex >= 0 && inlineSelectedSuggestionIndex < inlineMedicineSuggestions.length) {
                                    const selectedSuggestion = inlineMedicineSuggestions[inlineSelectedSuggestionIndex];
                                    setInlineNewRows(prev => prev.map(r => 
                                      r.id === row.id ? {...r, medicine: selectedSuggestion} : r
                                    ));
                                    setInlineMedicineSuggestions([]);
                                    setInlineSelectedSuggestionIndex(-1);
                                    // Move focus to quantity field
                                    setTimeout(() => {
                                      const qtyInput = document.querySelector(`input[data-qty-ref="${row.id}"]`);
                                      if (qtyInput) {
                                        (qtyInput as HTMLInputElement).focus();
                                        (qtyInput as HTMLInputElement).select();
                                      }
                                    }, 0);
                                  } else {
                                    // No suggestion selected, just move to quantity field
                                    setInlineMedicineSuggestions([]);
                                    const qtyInput = document.querySelector(`input[data-qty-ref="${row.id}"]`);
                                    if (qtyInput) {
                                      (qtyInput as HTMLInputElement).focus();
                                      (qtyInput as HTMLInputElement).select();
                                    }
                                  }
                                } else if (inlineMedicineSuggestions.length > 0) {
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setInlineSelectedSuggestionIndex(prev => 
                                      prev < inlineMedicineSuggestions.length - 1 ? prev + 1 : 0
                                    );
                                  } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setInlineSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : inlineMedicineSuggestions.length - 1);
                                  } else if (e.key === 'Escape') {
                                    setInlineMedicineSuggestions([]);
                                    setInlineSelectedSuggestionIndex(-1);
                                  }
                                }
                              }}
                              placeholder="Medicine name (press Enter to save)"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {inlineMedicineSuggestions.length > 0 && (
                              <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded mt-1 z-10 max-h-32 overflow-y-auto">
                                {inlineMedicineSuggestions.map((suggestion, i) => (
                                  <div
                                    key={i}
                                    onClick={() => {
                                      setInlineNewRows(prev => prev.map(r => 
                                        r.id === row.id ? {...r, medicine: suggestion} : r
                                      ));
                                      setInlineMedicineSuggestions([]);
                                      setInlineSelectedSuggestionIndex(-1);
                                      // Move focus to quantity field
                                      setTimeout(() => {
                                        const qtyInput = document.querySelector(`input[data-qty-ref="${row.id}"]`);
                                        if (qtyInput) {
                                          (qtyInput as HTMLInputElement).focus();
                                          (qtyInput as HTMLInputElement).select();
                                        }
                                      }, 0);
                                    }}
                                    className={`px-2 py-1 text-sm cursor-pointer ${
                                      i === inlineSelectedSuggestionIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
                                    }`}
                                  >
                                    {suggestion}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="text"
                              data-qty-ref={row.id}
                              inputMode="numeric"
                              value={row.quantity}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setInlineNewRows(prev => prev.map(r => 
                                  r.id === row.id ? {...r, quantity: parseInt(val) || 1} : r
                                ));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  // Move focus to amount field
                                  const amountInput = document.querySelector(`input[data-amount-ref="${row.id}"]`);
                                  if (amountInput) {
                                    (amountInput as HTMLInputElement).focus();
                                  }
                                }
                              }}
                              placeholder="Qty"
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="text"
                              data-amount-ref={row.id}
                              inputMode="decimal"
                              value={row.amount || ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                setInlineNewRows(prev => prev.map(r => 
                                  r.id === row.id ? {...r, amount: parseFloat(val) || 0} : r
                                ));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  // Auto-save this row to bill
                                  if (row.medicine.trim() && row.quantity > 0 && row.amount > 0) {
                                    if (row.medicine.trim() && !medicineHistory.includes(row.medicine)) {
                                      setMedicineHistory(prev => [row.medicine, ...prev].slice(0, 50));
                                    }
                                    const newItem = {
                                      id: generateId(),
                                      prescriptionId: '',
                                      medicine: row.medicine.trim(),
                                      potency: row.potency || undefined,
                                      quantityDisplay: '',
                                      quantity: row.quantity,
                                      doseForm: row.doseForm || undefined,
                                      dosePattern: undefined,
                                      frequency: undefined,
                                      duration: undefined,
                                      isCombination: false,
                                      combinationContent: undefined,
                                      amount: row.amount
                                    };
                                    setBillItems(prev => [...prev, newItem]);
                                    setInlineNewRows(prev => prev.filter(r => r.id !== row.id));
                                  }
                                }
                              }}
                              placeholder="Price"
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="font-medium">{formatCurrency((row.amount || 0) * row.quantity)}</div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => {
                                // Add medicine to history before deleting
                                if (row.medicine.trim() && !medicineHistory.includes(row.medicine)) {
                                  setMedicineHistory(prev => [row.medicine, ...prev].slice(0, 50));
                                }
                                setInlineNewRows(prev => prev.filter(r => r.id !== row.id));
                              }}
                              className="text-red-600 hover:text-red-800 p-1"
                              title="Delete item"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  

                  
                  {/* Add Row Button */}
                  {inlineNewRows.length === 0 && (
                    <div className="mt-2 flex justify-start">
                      <button
                        onClick={handleAddInlineRow}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-bold"
                        title="Add new row"
                      >
                        +
                      </button>
                    </div>
                  )}
                  
                  {/* Bill Summary */}
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <div className="flex justify-end">
                      <div className="w-64 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="font-medium">{formatCurrency(getBillSubtotal())}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Discount (%):</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={billDiscount}
                            onChange={(e) => setBillDiscount(parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {billDiscount > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Discount Amount:</span>
                            <span>-{formatCurrency(getBillDiscountAmount())}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Tax (%):</span>
                          <input
                            type="number"
                            min="0"
                            value={billTax}
                            onChange={(e) => setBillTax(parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        {billTax > 0 && (
                          <div className="flex justify-between">
                            <span>Tax Amount:</span>
                            <span>+{formatCurrency(getBillTaxAmount())}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between font-bold text-lg border-t pt-2">
                          <span>Grand Total:</span>
                          <span>{formatCurrency(getBillTotal())}</span>
                        </div>
                        {prevPendingAmount > 0 && (
                          <div className="space-y-2 border-t pt-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Previous Pending:</span>
                              <span className="font-medium">{formatCurrency(prevPendingAmount)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Pay Previous Pending (₹):</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={payPrevPending}
                                onChange={(e) => setPayPrevPending(parseFloat(e.target.value) || 0)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        )}
                        {!savedMedicineBill ? (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Amount Paid (₹):</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={billPayment}
                                onChange={(e) => setBillPayment(parseFloat(e.target.value) || 0)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Payment Method:</span>
                              <select
                                value={billPaymentMethod}
                                onChange={(e) => setBillPaymentMethod(e.target.value as any)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="upi">UPI</option>
                                <option value="cheque">Cheque</option>
                                <option value="insurance">Insurance</option>
                              </select>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Pending:</span>
                              <span className="font-medium">
                                {formatCurrency(Math.max(0, getBillTotal() - billPayment))}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Already Paid (₹):</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editableAlreadyPaid}
                                onChange={(e) => setEditableAlreadyPaid(parseFloat(e.target.value) || 0)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Current Pending:</span>
                              <span className="font-medium">{formatCurrency(Math.max(0, getBillTotal() - editableAlreadyPaid))}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Pay Pending (₹):</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={additionalCurrentPayment}
                                onChange={(e) => setAdditionalCurrentPayment(parseFloat(e.target.value) || 0)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Payment Method:</span>
                              <select
                                value={billPaymentMethod}
                                onChange={(e) => setBillPaymentMethod(e.target.value as any)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="cash">Cash</option>
                                <option value="card">Card</option>
                                <option value="upi">UPI</option>
                                <option value="cheque">Cheque</option>
                                <option value="insurance">Insurance</option>
                              </select>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Pending After Payment:</span>
                              <span className="font-medium">
                                {formatCurrency(Math.max(0, (savedMedicineBill.pendingAmount || Math.max(0, getBillTotal() - (savedMedicineBill.amountPaid || 0))) - additionalCurrentPayment))}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Notes */}
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={billNotes}
                        onChange={(e) => setBillNotes(e.target.value)}
                        rows={2}
                        placeholder="Add any notes..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* View Prescription Mode */
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Medicine</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Potency</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Qty</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Dose Form</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Dose</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {viewingPrescriptions.map((rx, index) => (
                      <tr key={rx.id || index}>
                        <td className="px-4 py-2">
                          <div className="font-medium">{rx.medicine}</div>
                          {rx.isCombination && (
                            <div className="text-xs text-gray-500">{rx.combinationContent}</div>
                          )}
                        </td>
                        <td className="px-4 py-2">{rx.potency || '-'}</td>
                        <td className="px-4 py-2">{rx.quantity || rx.bottles || '-'}</td>
                        <td className="px-4 py-2">{rx.doseForm || '-'}</td>
                        <td className="px-4 py-2">
                          {rx.dosePattern || '-'}
                          {rx.frequency && <span className="text-xs text-gray-500"> ({rx.frequency})</span>}
                        </td>
                        <td className="px-4 py-2">{rx.duration || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              {isBillMode ? (
                <>
                  <Button variant="outline" onClick={() => setIsBillMode(false)}>
                    Back to Prescription
                  </Button>
                  <Button 
                    variant="primary" 
                    onClick={handleSaveBill}
                    disabled={!!(savedMedicineBill && !billHasChanges) || isSavingBill}
                  >
                    {isSavingBill ? 'Updating...' : (savedMedicineBill ? 'Update Bill' : 'Save Bill')}
                  </Button>
                  <Button variant="outline" onClick={handlePrintBill}>
                    Print Bill
                  </Button>
                  <Button variant="outline" onClick={handleWhatsAppBill}>
                    WhatsApp
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="primary" onClick={handleCreateBill}>
                    Create Bill
                  </Button>
                  <Button variant="outline" onClick={handleWhatsAppPrescription}>
                    WhatsApp
                  </Button>
                  <Button variant="outline" onClick={handlePrintPrescription}>
                    Print
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPDF}>
                    Download PDF
                  </Button>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Fee History Popup */}
      {showFeeHistory && feeHistoryPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Fee History</h2>
                <p className="text-sm text-gray-500">
                  {feeHistoryPatient.firstName} {feeHistoryPatient.lastName} - {feeHistoryPatient.registrationNumber}
                </p>
              </div>
              <Button variant="outline" onClick={() => setShowFeeHistory(false)}>
                Close
              </Button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              {feeHistoryData.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No fee history found.</p>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Date</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Receipt</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Amount</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Payment</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {feeHistoryData.map((entry, index) => (
                      <tr key={entry.id || index}>
                        <td className="px-4 py-2">{formatDate(entry.paidDate)}</td>
                        <td className="px-4 py-2">{entry.receiptId}</td>
                        <td className="px-4 py-2 capitalize">{entry.feeType}</td>
                        <td className="px-4 py-2 font-medium">{formatCurrency(entry.amount)}</td>
                        <td className="px-4 py-2 capitalize">{entry.paymentMethod}</td>
                        <td className="px-4 py-2">
                          <Badge variant={
                            entry.paymentStatus === 'exempt' && entry.amount === 0 && entry.feeType === 'free-follow-up' 
                              ? 'purple' 
                              : entry.paymentStatus === 'exempt' 
                              ? 'purple' 
                              : entry.paymentStatus === 'paid' 
                              ? 'success' 
                              : 'warning'
                          }>
                            {entry.paymentStatus === 'exempt' && entry.amount === 0 && entry.feeType === 'free-follow-up' 
                              ? 'Free Follow Up' 
                              : entry.paymentStatus === 'exempt' 
                              ? 'Exempt' 
                              : entry.paymentStatus}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handlePrintFeeHistoryReceipt(entry)}
                          >
                            Print
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <Button variant="outline" onClick={() => setShowFeeHistory(false)}>
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Receipt Popup */}
      {showReceiptPopup && currentReceipt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold">Receipt Generated</h2>
              <p className="text-sm text-gray-500">{currentReceipt.receiptNumber}</p>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Subtotal:</span>
                <span>{formatCurrency(currentReceipt.subtotal)}</span>
              </div>
              {currentReceipt.discountAmount && currentReceipt.discountAmount > 0 && (
                <div className="flex justify-between mb-2 text-green-600">
                  <span>Discount ({currentReceipt.discountPercent}%):</span>
                  <span>-{formatCurrency(currentReceipt.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Net Amount:</span>
                <span>{formatCurrency(currentReceipt.netAmount)}</span>
              </div>
            </div>
            
            <div className="flex justify-center gap-2 mb-4">
              <Badge variant="info">{currentReceipt.paymentMethod.toUpperCase()}</Badge>
              <Badge variant={
                currentReceipt.paymentStatus === 'exempt' && currentReceipt.netAmount === 0 && currentReceipt.items[0]?.description.toLowerCase().includes('follow')
                  ? 'purple'
                  : currentReceipt.paymentStatus === 'exempt'
                  ? 'purple'
                  : 'success'
              }>
                {currentReceipt.paymentStatus === 'exempt' && currentReceipt.netAmount === 0 && currentReceipt.items[0]?.description.toLowerCase().includes('follow') 
                  ? 'Free Follow Up' 
                  : currentReceipt.paymentStatus === 'exempt' 
                  ? 'Exempt' 
                  : currentReceipt.paymentStatus.toUpperCase()}
              </Badge>
            </div>
            
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={handlePrintReceipt}>
                Print
              </Button>
              <Button variant="outline" onClick={handleWhatsAppReceipt}>
                WhatsApp
              </Button>
              <Button variant="primary" onClick={() => {
                setShowReceiptPopup(false);
                loadQueue();
              }}>
                Done
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* View Saved Medicine Bill Popup */}
      {showViewBillPopup && viewingMedicineBill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold">Medicine Bill</h2>
                <p className="text-sm text-gray-500">
                  Created: {formatDate(viewingMedicineBill.createdAt)}
                </p>
              </div>
              <Button variant="outline" onClick={() => setShowViewBillPopup(false)}>
                Close
              </Button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Medicine</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Potency</th>
                    <th className="px-4 py-2 text-center text-sm font-medium text-gray-500">Qty</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {viewingMedicineBill.items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{item.medicine}</div>
                        {item.isCombination && (
                          <div className="text-xs text-gray-500">{item.combinationContent}</div>
                        )}
                      </td>
                      <td className="px-4 py-2">{item.potency || '-'}</td>
                      <td className="px-4 py-2 text-center">{item.quantityDisplay || item.quantity}</td>
                      <td className="px-4 py-2 text-right">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Bill Summary */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(viewingMedicineBill.subtotal)}</span>
                    </div>
                    {viewingMedicineBill.discountPercent > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount ({viewingMedicineBill.discountPercent}%):</span>
                        <span>-{formatCurrency(viewingMedicineBill.discountAmount)}</span>
                      </div>
                    )}
                    {viewingMedicineBill.taxPercent > 0 && (
                      <div className="flex justify-between">
                        <span>Tax ({viewingMedicineBill.taxPercent}%):</span>
                        <span>+{formatCurrency(viewingMedicineBill.taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Grand Total:</span>
                      <span>{formatCurrency(viewingMedicineBill.grandTotal)}</span>
                    </div>
                  </div>
                </div>
                {viewingMedicineBill.notes && (
                  <div className="mt-4 text-sm text-gray-600">
                    <strong>Notes:</strong> {viewingMedicineBill.notes}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowViewBillPopup(false)}>
                Close
              </Button>
              <Button variant="primary" onClick={handleEditSavedBill}>
                Edit Bill
              </Button>
              <Button variant="outline" onClick={() => {
                // Print the saved bill with updated format
                handlePrintMedicineBillDirect(viewingMedicineBill);
              }}>
                Print
              </Button>
            </div>
          </Card>
        </div>
      )}
      
      {/* Receipt Generation Confirmation Modal */}
      {showReceiptConfirm && receiptItemToGenerate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Generate Receipt</h3>
              <p className="text-gray-600 mb-6">
                {receiptItemToGenerate.paymentStatus === 'exempt' || receiptItemToGenerate.feeAmount === 0
                  ? `Generate exempt receipt for ${receiptItemToGenerate.patient?.firstName} ${receiptItemToGenerate.patient?.lastName}?`
                  : `Generate receipt for ${formatCurrency(receiptItemToGenerate.netAmount)} payment from ${receiptItemToGenerate.patient?.firstName} ${receiptItemToGenerate.patient?.lastName}?`
                }
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowReceiptConfirm(false);
                    setReceiptItemToGenerate(null);
                  }}
                >
                  Go Back
                </Button>
                <Button
                  variant="primary"
                  onClick={confirmGenerateReceipt}
                >
                  Generate Receipt
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <React.Suspense fallback={null}>
      <BillingPageInner />
    </React.Suspense>
  );
}
