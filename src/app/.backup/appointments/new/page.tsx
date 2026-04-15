"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/layout/SidebarComponent";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { getCurrentUser } from "@/lib/permissions";
import { useDebounce } from "@/hooks/useDebounce";
import { appointmentDb, patientDb, slotDb, feeHistoryDb, feeDb, billingReceiptDb, billingQueueDb, createOrReuseReceipt } from "@/lib/db/database";
import type { Appointment, Patient, Slot, FeeType, FeeHistoryEntry, BillingReceiptItem, BillingReceipt } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { ThermalPrinter, getInvoiceSettings, getBillPrintSettings } from "@/lib/thermal-printer";

export default function NewAppointmentPage() {
  const router = useRouter();
  
  // Check authentication on mount
  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.push('/login');
    }
  }, [router]);
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  // Get current time in HH:MM format
  const getCurrentTime = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    slotId: "",
    time: getCurrentTime(),
    duration: 10,
    type: "follow-up" as const,
    visitMode: "in-person" as const,
    priority: "normal" as const,
    notes: "",
    tokenNumber: 0,
    // Fee handling
    feeTypeId: "",
    feeStatus: "pending" as const,
    feeAmount: 0,
    advancePaid: 0,
    paymentMode: "",
    feeExempt: false,
    feeExemptionReason: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewTokenNumber, setPreviewTokenNumber] = useState<number>(0);
  const [bookedPatientIds, setBookedPatientIds] = useState<Set<string>>(new Set());
  const [lastFeeInfo, setLastFeeInfo] = useState<{
    date: string;
    amount: number;
    daysAgo: number;
  } | null>(null);

  // Receipt popup state
  const [showReceiptPopup, setShowReceiptPopup] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<BillingReceipt | null>(null);
  const [receiptSaved, setReceiptSaved] = useState(false);

  const loadData = useCallback(() => {
    // Optimization: Don't load all patients initially if dataset is large
    const activeSlots = slotDb.getActive() as Slot[];
    setSlots(activeSlots);
    
    const activeFees = feeDb.getActive() as FeeType[];
    setFeeTypes(activeFees);
    
    if (activeSlots.length > 0) {
      setFormData((prev) => ({ ...prev, slotId: activeSlots[0].id }));
    }
  }, []);

  // Fetch recent patients separately
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);
  useEffect(() => {
    // Get last 10 patients added
    const all = patientDb.getAll() as Patient[];
    const recent = all
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 10);
    setRecentPatients(recent);
  }, []);

  // Search results - computed based on debounced query
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      const results = patientDb.search(debouncedSearchQuery, ['registrationNumber', 'firstName', 'lastName', 'fullName', 'mobileNumber']) as Patient[];
      // Limit to 20 results for performance
      setSearchResults(results.filter(p => !bookedPatientIds.has(p.id)).slice(0, 20));
    } else {
      setSearchResults([]);
    }
  }, [debouncedSearchQuery, bookedPatientIds]);

  // Display patients: recent when no search, search results when searching
  const displayPatients = searchQuery.trim() ? searchResults : recentPatients.filter(p => !bookedPatientIds.has(p.id));

  // Calculate preview token number when date or slot changes
  useEffect(() => {
    if (formData.date && formData.slotId) {
      const existingAppointments = appointmentDb.getBySlot(new Date(formData.date), formData.slotId);
      const previewToken = (existingAppointments.length || 0) + 1;
      setPreviewTokenNumber(previewToken);
      // Always update token number when slot or date changes
      setFormData((prev) => ({
        ...prev,
        tokenNumber: previewToken,
      }));
    }
  }, [formData.date, formData.slotId]);

  useEffect(() => {
     
    loadData();
  }, [loadData]);
  
  // Listen for fee types updates
  useEffect(() => {
    const handleFeeTypesUpdate = () => {
      const activeFees = feeDb.getActive() as FeeType[];
      setFeeTypes(activeFees);
      console.log('[Appointments] Fee types refreshed:', activeFees.length);
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('fee-types-updated', handleFeeTypesUpdate);
      return () => window.removeEventListener('fee-types-updated', handleFeeTypesUpdate);
    }
  }, []);

  // Handle URL params for patient auto-selection (from "Register & Book Appointment")
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get('patientId');
    if (patientId) {
      const patient = patientDb.getById(patientId) as Patient | undefined;
      if (patient) {
        setSelectedPatient(patient);
        window.history.replaceState({}, '', '/appointments/new');
      }
    }
   
  }, []);

  // Auto-fill fee when appointment type changes
   
  useEffect(() => {
    if (formData.feeExempt) return;
    
    // Map appointment type to fee type name
    const typeToFeeName: Record<string, string> = {
      'new': 'New Patient',
      'follow-up': 'Follow Up',
      'consultation': 'Follow Up',
      'emergency': 'New Patient',
    };
    
    const targetFeeName = typeToFeeName[formData.type] || 'Follow Up';
    const matchingFee = feeTypes.find(f => (f as FeeType).name === targetFeeName);
    
    if (matchingFee) {
      const fee = matchingFee as FeeType;
      setFormData((prev) => ({
        ...prev,
        feeTypeId: fee.id,
        feeAmount: fee.amount,
      }));
    }
  }, [formData.type, feeTypes, formData.feeExempt]);

  // Handle manual fee type selection
  const handleFeeTypeChange = (feeTypeId: string) => {
    const selectedFee = feeTypes.find(f => (f as FeeType).id === feeTypeId);
    if (selectedFee) {
      const fee = selectedFee as FeeType;
      setFormData((prev) => ({
        ...prev,
        feeTypeId: fee.id,
        feeAmount: fee.amount,
      }));
    }
  };

  // Fetch last fee info when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      const lastFee = feeHistoryDb.getLastByPatient(selectedPatient.id) as FeeHistoryEntry | null;
      if (lastFee) {
        const paidDate = new Date(lastFee.paidDate);
        const today = new Date();
        
        // Check if same day
        const isSameDay = 
          paidDate.getDate() === today.getDate() &&
          paidDate.getMonth() === today.getMonth() &&
          paidDate.getFullYear() === today.getFullYear();
        
        if (isSameDay) {
          setLastFeeInfo({
            date: paidDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            amount: lastFee.amount,
            daysAgo: 0, // 0 means today
          });
        } else {
          const diffTime = Math.abs(today.getTime() - paidDate.getTime());
          const daysAgo = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setLastFeeInfo({
            date: paidDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            amount: lastFee.amount,
            daysAgo: daysAgo,
          });
        }
      } else {
        setLastFeeInfo(null);
      }
    } else {
      setLastFeeInfo(null);
    }
  }, [selectedPatient]);

  const filteredPatients = displayPatients;

  // Handle saving advance payment and generating receipt
  const handleSaveAdvancePaymentReceipt = async () => {
    if (!selectedPatient || formData.advancePaid <= 0) {
      console.log('[Appointments] Cannot save receipt: no patient or advance payment');
      return;
    }

    try {
      console.log('[Appointments] Generating receipt for advance payment:', formData.advancePaid);

      // Create receipt items
      const receiptItems: BillingReceiptItem[] = [
        {
          description: 'Advance Payment',
          quantity: 1,
          unitPrice: formData.advancePaid,
          total: formData.advancePaid
        }
      ];

      // Create a temporary billing queue item for receipt generation
      const tempBillingItem = {
        id: `temp-${Date.now()}`,
        visitId: `apt-${Date.now()}`,
        patientId: selectedPatient.id,
        appointmentId: `apt-${Date.now()}`,
        prescriptionIds: [],
        status: 'paid' as const,
        feeAmount: formData.advancePaid,
        feeType: 'Advance Payment',
        discountPercent: 0,
        discountAmount: 0,
        taxAmount: 0,
        netAmount: formData.advancePaid,
        paymentMethod: (formData.paymentMode || 'cash') as 'cash' | 'card' | 'upi' | 'cheque' | 'insurance' | 'exempt',
        paymentStatus: 'paid' as const,
        notes: formData.notes
      };

      console.log('[Appointments] tempBillingItem:', tempBillingItem);

      // Generate receipt using centralized function
      const receipt = createOrReuseReceipt(tempBillingItem, receiptItems);

      console.log('[Appointments] Receipt result:', receipt);

      if (receipt) {
        setCurrentReceipt(receipt);
        setShowReceiptPopup(true);
        setReceiptSaved(true);
        // Mark fee as PAID since receipt is generated
        setFormData(prev => ({ ...prev, feeStatus: 'paid' as const }));
        console.log('[Appointments] ✅ Receipt generated:', receipt.receiptNumber, 'Fee status changed to PAID');
      } else {
        console.error('[Appointments] ❌ Receipt generation failed - function returned null');
        alert('Failed to generate receipt. Please check the console for details.');
      }
    } catch (error) {
      console.error('[Appointments] Error generating receipt:', error);
      alert('Error generating receipt: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handlePrintReceipt = () => {
    if (!currentReceipt) return;

    try {
      const invoiceSettings = getInvoiceSettings();
      const billPrintSettings = getBillPrintSettings();
      const printer = new ThermalPrinter(invoiceSettings, billPrintSettings);

      const billData = {
        invoiceNumber: currentReceipt.receiptNumber,
        patientName: selectedPatient?.firstName + ' ' + selectedPatient?.lastName || 'Patient',
        registrationNumber: (selectedPatient as any)?.registrationNumber || '',
        mobileNumber: (selectedPatient as any)?.mobileNumber || '',
        items: currentReceipt.items,
        subtotal: currentReceipt.subtotal,
        discountPercent: currentReceipt.discountPercent,
        discountAmount: currentReceipt.discountAmount,
        taxAmount: currentReceipt.taxAmount,
        netAmount: currentReceipt.netAmount,
        paymentMethod: currentReceipt.paymentMethod,
        paymentStatus: currentReceipt.paymentStatus,
        amountPaid: currentReceipt.netAmount,
        amountDue: 0,
        notes: currentReceipt.notes
      };

      const html = printer.generatePrintHTML(billData, 'fee');
      const printWindow = window.open('', '', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }
    } catch (error) {
      console.error('[Appointments] Error printing receipt:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) {
      console.log('[Appointments] Submission already in progress, ignoring duplicate submit');
      return;
    }
    
    if (!selectedPatient) {
      alert("Please select a patient");
      return;
    }

    if (!formData.slotId) {
      alert("Please select a slot");
      return;
    }

    setIsSubmitting(true);

    // Get slot info
    const slot = slotDb.getById(formData.slotId) as Slot | undefined;
    
    // Get current user from localStorage
    let doctorId = "user-doctor";
    let doctorName = "Dr. Homeopathic";
    if (typeof window !== "undefined") {
      const currentUser = localStorage.getItem("currentUser");
      if (currentUser) {
        try {
          const user = JSON.parse(currentUser);
          doctorId = user.id || doctorId;
          doctorName = user.name || doctorName;
        } catch {
          // Use defaults
        }
      }
    }

    // Get existing appointments for this slot to determine token number
    const existingAppointments = appointmentDb.getBySlot(new Date(formData.date), formData.slotId);
    const tokenNumber = (existingAppointments.length || 0) + 1;

    // Determine final fee status
    // If receipt was saved, use PAID status; otherwise use formData.feeStatus
    let finalFeeStatus: 'pending' | 'paid' | 'exempt' = receiptSaved ? 'paid' : 'pending';
    let finalFeeAmount = formData.feeAmount;
    
    // Exemption is explicit via feeExempt only (not for free follow-up)
    if (formData.feeExempt) {
      finalFeeStatus = 'exempt';
      finalFeeAmount = 0;
    } else if (formData.feeAmount === 0) {
      // Free follow-up → keep status as pending (editable later)
      finalFeeStatus = 'pending';
      finalFeeAmount = 0;
    } else if (receiptSaved) {
      // Receipt was saved, so fee is PAID
      finalFeeStatus = 'paid';
    } else {
      // No receipt saved yet, fee remains PENDING
      finalFeeStatus = 'pending';
    }

    // Get selected fee type name
    const selectedFeeType = feeTypes.find(f => (f as FeeType).id === formData.feeTypeId);
    const feeTypeName = selectedFeeType ? (selectedFeeType as FeeType).name : 'Follow Up';

    // Create appointment
    const newAppointment = appointmentDb.create({
      patientId: selectedPatient.id,
      patientName: `${(selectedPatient as { firstName: string }).firstName} ${(selectedPatient as { lastName: string }).lastName}`,
      doctorId,
      appointmentDate: new Date(formData.date),
      appointmentTime: formData.time,
      visitMode: formData.visitMode,
      slotId: formData.slotId,
      slotName: slot?.name || "General",
      tokenNumber,
      duration: formData.duration,
      type: formData.type,
      status: "scheduled",
      priority: formData.priority,
      feeStatus: finalFeeStatus,
      feeAmount: finalFeeAmount,
      feeType: feeTypeName,
      isFreeFollowUp: (feeTypeName === 'Free Follow Up') || (feeTypeName === 'Follow Up' && finalFeeAmount === 0),
      notes: formData.notes,
      isWalkIn: false,
      reminderSent: false,
      feeExempt: formData.feeExempt,
      feeExemptionReason: formData.feeExemptionReason,
    } as unknown as Parameters<typeof appointmentDb.create>[0]);

    const aptId = newAppointment.id;

    // If advance payment made, record in fee history AND create receipt (check for duplicates first)
    if (formData.advancePaid > 0 && !formData.feeExempt) {
      // Check if fee history already exists for this appointment
      const allFeeHistory = feeHistoryDb.getAll() as FeeHistoryEntry[];
      
      console.log('[Appointments] Checking for existing fee history. appointmentId:', aptId, 'amount:', formData.advancePaid, 'paymentMode:', formData.paymentMode);
      
      // Check for duplicate by visitId only
      const existingFeeHistory = allFeeHistory.find((fh) => 
        fh.visitId === aptId
      );
      
      console.log('[Appointments] Found existing fee history?', !!existingFeeHistory, existingFeeHistory?.id);
      
      if (!existingFeeHistory) {
        const newFeeHistoryId = `fh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Use the actual fee type name from fee settings
        let feeTypeForHistory: 'first-visit' | 'follow-up' | 'exempt' | 'consultation' | 'medicine' = 'follow-up';
        
        // Map common fee type names to standard format
        const feeTypeNameLower = feeTypeName.toLowerCase();
        if (feeTypeNameLower.includes('new') || feeTypeNameLower.includes('first')) {
          feeTypeForHistory = 'first-visit';
        } else if (feeTypeNameLower.includes('follow')) {
          feeTypeForHistory = 'follow-up';
        } else if (feeTypeNameLower.includes('exempt')) {
          feeTypeForHistory = 'exempt';
        } else if (feeTypeNameLower.includes('medicine')) {
          feeTypeForHistory = 'medicine';
        } else {
          feeTypeForHistory = 'consultation';
        }
        
        // Create fee history entry
        feeHistoryDb.create({
          id: newFeeHistoryId,
          patientId: selectedPatient.id,
          visitId: aptId,
          amount: formData.advancePaid,
          feeType: feeTypeForHistory,
          paymentMethod: formData.paymentMode || 'cash',
          paymentStatus: finalFeeStatus === 'paid' ? 'paid' : 'pending',
          paidDate: new Date(),
          receiptId: finalFeeStatus === 'paid' ? `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` : undefined,
        });
        
        // Create billing queue item for this appointment
        const billingQueueItem = {
          visitId: aptId,
          patientId: selectedPatient.id,
          appointmentId: aptId,
          prescriptionIds: [],
          status: finalFeeStatus === 'paid' ? 'paid' : 'pending' as const,
          feeAmount: finalFeeAmount,
          feeType: feeTypeName,
          discountPercent: 0,
          discountAmount: 0,
          taxAmount: 0,
          netAmount: finalFeeAmount,
          paymentMethod: (formData.paymentMode || 'cash') as 'cash' | 'card' | 'upi' | 'cheque' | 'insurance' | 'exempt',
          paymentStatus: finalFeeStatus as 'pending' | 'paid' | 'partial' | 'exempt',
          notes: formData.notes
        };
        
        const createdBillingItem = billingQueueDb.create(billingQueueItem);
        
        // CHANGED: Receipt is NO LONGER generated automatically
        // User will click "Save Fee" button in billing module to generate receipt manually
        console.log('[Appointments] ✅ CREATED fee history + billing queue item:', newFeeHistoryId, 'visitId:', aptId, 'amount:', finalFeeAmount, 'paymentStatus:', finalFeeStatus, 'receiptNumber: NOT GENERATED YET');
      } else {
        // Existing fee history entry found - skip creating duplicate
        console.log('[Appointments] ℹ️ Fee history already exists for this appointment:', existingFeeHistory.id);
      }
    }

    // If fee exempt, record exemption
    if (formData.feeExempt) {
      // Log exemption in notes
      appointmentDb.update(aptId, {
        notes: `${formData.notes}\n[Fee Exempt: ${formData.feeExemptionReason}]`.trim(),
      });
    }

    // Send WhatsApp booking confirmation if auto-replies enabled
    try {
      const waSettings = (() => { try { return JSON.parse(localStorage.getItem('onlineAppointmentsSettings') || '{}'); } catch { return {}; } })();
      if (waSettings.autoRepliesEnabled !== false && selectedPatient) {
        const phone = (selectedPatient as any).mobileNumber ?? '';
        if (phone) {
          const DEFAULT_MANUAL_BOOKING = `✅ Hi {{name}}, your appointment is confirmed!\n📅 Date: {{date}}\n⏰ Time: {{time}}\n🏥 Slot: {{slot}}\n🔢 Token: {{token}}\n\nPlease arrive 10 minutes early. Thank you!`;
          let bookingTpl = DEFAULT_MANUAL_BOOKING;
          try {
            const tplRes = await fetch('/api/whatsapp/settings');
            const tplData = await tplRes.json();
            if (tplData.templates?.manualBooking) bookingTpl = tplData.templates.manualBooking;
          } catch { /* use default */ }

          const fmtD = (d: string) => {
            const [y, m, day] = d.split('-').map(Number);
            const dt = new Date(y, m - 1, day);
            const suffix = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
            return `${day}${suffix} ${dt.toLocaleString('en-IN', { month: 'long' })} ${y}`;
          };
          const fmtT = (t: string) => {
            const [h, min] = t.split(':').map(Number);
            return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
          };
          const mobile = phone.replace(/^(\+?91)/, '').slice(-10);
          const patName = `${(selectedPatient as any).firstName} ${(selectedPatient as any).lastName}`.trim();
          const msg = [
            ['name', patName],
            ['date', fmtD(formData.date)],
            ['time', fmtT(formData.time)],
            ['slot', slot?.name || ''],
            ['token', String(tokenNumber)],
            ['mobile', mobile],
            ['regd', (selectedPatient as any).registrationNumber || ''],
          ].reduce((m, [k, v]) => m.replaceAll(`{{${k}}}`, v as string), bookingTpl);

          fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: `91${mobile}`, message: msg }),
          }).catch(() => {});
        }
      }
    } catch { /* non-critical */ }

    router.push("/appointments");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar collapsed={sidebarCollapsed} onCollapse={setSidebarCollapsed} />

      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarCollapsed ? "ml-16" : "ml-64"
        }`}
      >
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/appointments" className="text-gray-500 hover:text-gray-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Book Appointment</h1>
              <p className="text-sm text-gray-500">Schedule a new appointment</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Patient Selection */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Patient</h2>
              
              {!selectedPatient ? (
                <>
                  <Input
                    placeholder="Search by name, registration number, or mobile..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (!searchQuery.trim()) return;
                      const max = filteredPatients.length - 1;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = Math.min(activeIndex + 1, max);
                        setActiveIndex(next);
                        const el = itemRefs.current[next];
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = Math.max(activeIndex - 1, 0);
                        setActiveIndex(prev);
                        const el = itemRefs.current[prev];
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        const indexToUse = activeIndex >= 0 ? activeIndex : 0;
                        const chosen = filteredPatients[indexToUse];
                        if (chosen) {
                          setSelectedPatient(chosen);
                          setSearchQuery("");
                          setActiveIndex(-1);
                        }
                      }
                    }}
                    className="mb-4"
                  />
                  {searchQuery.trim() && (
                    <div ref={listRef} className="max-h-60 overflow-y-auto space-y-1">
                      {filteredPatients.map((patient, index) => {
                        const p = patient as { id: string; firstName: string; lastName: string; registrationNumber: string; mobileNumber: string };
                        return (
                          <button
                            key={p.id}
                            type="button"
                            ref={(el) => { itemRefs.current[index] = el; }}
                            onClick={() => {
                              setSelectedPatient(patient);
                              setSearchQuery("");
                              setActiveIndex(-1);
                            }}
                            className={`w-full text-left p-2 rounded-lg border transition-colors ${
                              activeIndex === index ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
                            }`}
                          >
                            <div className="font-medium text-gray-900">
                              {p.firstName} {p.lastName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {p.registrationNumber} • {p.mobileNumber}
                            </div>
                          </button>
                        );
                      })}
                      {filteredPatients.length === 0 && (
                        <p className="text-gray-500 text-center py-4">No patients found</p>
                      )}
                    </div>
                  )}
                  {!searchQuery.trim() && (
                    <p className="text-gray-500 text-center py-4">Start typing to search for a patient</p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900">
                        {(selectedPatient as { firstName: string }).firstName} {(selectedPatient as { lastName: string }).lastName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {(selectedPatient as { registrationNumber: string }).registrationNumber}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSelectedPatient(null)}
                    >
                      Change
                    </Button>
                  </div>
                  
                  {/* Last Fee Info */}
                  {lastFeeInfo ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="font-medium">
                          {lastFeeInfo.daysAgo === 0 
                            ? `Fee paid today: ${lastFeeInfo.amount} Rs`
                            : `Last fee paid: ${lastFeeInfo.date} - ${lastFeeInfo.amount} Rs - ${lastFeeInfo.daysAgo} day${lastFeeInfo.daysAgo === 1 ? '' : 's'} ago`
                          }
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm">No payment history found</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Form Container with Side-by-Side Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Appointment Details */}
              <div className="space-y-6">
                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Appointment Details</h2>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                      <Input
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        min={new Date().toISOString().split("T")[0]}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
                      <select
                        value={formData.slotId}
                        onChange={(e) => setFormData({ ...formData, slotId: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="">Select slot</option>
                        {slots.map((slot) => {
                          const s = slot as Slot;
                          return (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.startTime} - {s.endTime})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                      <Input
                        type="time"
                        value={formData.time}
                        onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                      <select
                        value={formData.duration}
                        onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={10}>10 minutes</option>
                        <option value={15}>15 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={45}>45 minutes</option>
                        <option value={60}>60 minutes</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value as typeof formData.type })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="new">New Patient</option>
                        <option value="follow-up">Follow-up</option>
                        <option value="consultation">Consultation</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Token Number</label>
                      <div className="flex items-center gap-2">
                        <div className="bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 min-w-[60px] text-center">
                          <span className="text-xs text-blue-600 block">Preview</span>
                          <span className="text-xl font-bold text-blue-700">{previewTokenNumber}</span>
                        </div>
                        <Input
                          type="number"
                          value={formData.tokenNumber || ""}
                          onChange={(e) => setFormData({ ...formData, tokenNumber: parseInt(e.target.value) || 0 })}
                          min={1}
                          placeholder="Use preview or enter"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Visit Mode</label>
                      <select
                        value={formData.visitMode}
                        onChange={(e) => setFormData({ ...formData, visitMode: e.target.value as typeof formData.visitMode })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="in-person">In-Person</option>
                        <option value="tele">Teleconsultation</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <select
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value as typeof formData.priority })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="normal">Normal</option>
                        <option value="vip">VIP</option>
                        <option value="emergency">Emergency</option>
                        <option value="doctor-priority">Doctor Priority</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Any additional notes..."
                    />
                  </div>
                </Card>
              </div>

              {/* Right Column: Fee Payment */}
              <div className="space-y-6">
                <Card className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Fee Payment</h2>
                  
                  {/* Fee Exemption Toggle */}
                  <div className="mb-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.feeExempt}
                        onChange={(e) => setFormData({ ...formData, feeExempt: e.target.checked, advancePaid: 0, feeAmount: 0, feeTypeId: "" })}
                        className="w-5 h-5 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                      />
                      <span className="font-medium text-gray-900">Exempt from Fee (Doctor Approval)</span>
                    </label>
                    <p className="text-sm text-gray-500 mt-1 ml-8">
                      Check this if the doctor has approved fee exemption for this patient
                    </p>
                  </div>

                  {!formData.feeExempt && (
                    <>
                      {/* Fee Type Selection */}
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fee Type</label>
                        <select
                          value={formData.feeTypeId}
                          onChange={(e) => handleFeeTypeChange(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select fee type</option>
                          {feeTypes.map((fee) => {
                            const f = fee as FeeType;
                            return (
                              <option key={f.id} value={f.id}>
                                {f.name} - ₹{f.amount}
                              </option>
                            );
                          })}
                        </select>
                        <p className="text-sm text-gray-500 mt-1">
                          Fee amount auto-fills based on appointment type. You can change it here.
                        </p>
                      </div>

                      {/* Fee Amount and Advance Payment - One Line */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Consultation Fee (₹)</label>
                          <Input
                            type="number"
                            value={formData.feeAmount || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setFormData({ ...formData, feeAmount: 0 });
                              } else {
                                setFormData({ ...formData, feeAmount: parseInt(val) || 0 });
                              }
                            }}
                            min={0}
                            className="w-full"
                            placeholder="Enter or select fee amount"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Advance Payment (₹)</label>
                          <Input
                            type="number"
                            value={formData.advancePaid || ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "") {
                                setFormData({ ...formData, advancePaid: 0 });
                              } else {
                                const advance = parseInt(val) || 0;
                                setFormData({ ...formData, advancePaid: Math.min(advance, formData.feeAmount) });
                              }
                            }}
                            min={0}
                            max={formData.feeAmount}
                            className="w-full"
                            placeholder="Enter advance amount"
                          />
                        </div>
                      </div>

                      {/* Balance and Status */}
                      <div className="mb-6">
                        <p className="text-sm text-gray-500">
                          Balance: ₹{(formData.feeAmount - formData.advancePaid).toFixed(0)} | 
                          {(feeTypes.find(f => (f as FeeType).id === formData.feeTypeId)?.name === 'Free Follow Up' && formData.feeAmount === 0) ? (
                            <span className="text-purple-600 font-medium">Free Follow Up</span>
                          ) : formData.advancePaid >= formData.feeAmount ? (
                            <span className="text-green-600 font-medium">Fully Paid</span>
                          ) : formData.advancePaid > 0 ? (
                            <span className="text-yellow-600 font-medium">Partial Payment</span>
                          ) : (
                            <span className="text-gray-500">Pay Later</span>
                          )}
                        </p>
                      </div>

                      {/* Payment Mode */}
                      {formData.advancePaid > 0 && (
                        <div className="mb-6">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                          <select
                            value={formData.paymentMode}
                            onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select payment mode</option>
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="upi">UPI</option>
                            <option value="netbanking">Net Banking</option>
                            <option value="cheque">Cheque</option>
                          </select>
                        </div>
                      )}

                      {/* Save Fee Button - appears when advance payment > 0 */}
                      {formData.advancePaid > 0 && (
                        <div className="mb-6">
                          {!receiptSaved ? (
                            <div>
                              <Button
                                type="button"
                                variant="primary"
                                onClick={handleSaveAdvancePaymentReceipt}
                                className="w-full"
                              >
                                Save Fee & Generate Receipt
                              </Button>
                              <p className="text-sm text-gray-500 mt-2">
                                Click to generate receipt for advance payment of ₹{formData.advancePaid}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                <div className="flex items-center gap-2 text-green-800">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="font-medium">
                                    Fee Saved & Receipt Generated
                                  </span>
                                </div>
                                <p className="text-sm text-green-700 mt-1 ml-7">
                                  Receipt: {currentReceipt?.receiptNumber} | Amount: ₹{formData.advancePaid}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                  setShowReceiptPopup(true);
                                }}
                                className="w-full"
                              >
                                Reopen Receipt
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Fee Exemption Reason */}
                  {formData.feeExempt && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Exemption Reason</label>
                      <Input
                        value={formData.feeExemptionReason}
                        onChange={(e) => setFormData({ ...formData, feeExemptionReason: e.target.value })}
                        placeholder="Enter reason for fee exemption"
                        className="w-full"
                      />
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* Sticky Submit Button */}
            <div className="sticky bottom-4 left-0 right-0 p-4 bg-white/90 backdrop-blur-sm border-t border-gray-200">
              <div className="flex gap-4">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Booking..." : "Book Appointment"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => router.push("/appointments")}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>

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
                    <span>₹{currentReceipt.subtotal.toFixed(2)}</span>
                  </div>
                  {currentReceipt.discountAmount && currentReceipt.discountAmount > 0 && (
                    <div className="flex justify-between mb-2 text-green-600">
                      <span>Discount ({currentReceipt.discountPercent}%):</span>
                      <span>-₹{currentReceipt.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Net Amount:</span>
                    <span>₹{currentReceipt.netAmount.toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="flex justify-center gap-2 mb-4">
                  <Badge variant="info">{currentReceipt.paymentMethod.toUpperCase()}</Badge>
                  <Badge variant="success">
                    {currentReceipt.paymentStatus.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={handlePrintReceipt}>
                    Print
                  </Button>
                  <Button variant="primary" onClick={() => {
                    setShowReceiptPopup(false);
                    setCurrentReceipt(null);
                  }}>
                    Done
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
